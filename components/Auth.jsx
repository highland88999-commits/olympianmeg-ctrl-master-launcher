'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function Auth({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  
  // Modes: 'login', 'signup', 'reset', 'update'
  const [mode, setMode] = useState('login'); 

  useEffect(() => {
    // Listens for the user returning from a password reset email link.
    // Guarded: lib/supabase throws synchronously when env vars are absent.
    // The launcher's offline gate keeps this panel unmounted while the cloud
    // is down, so this is a last-resort guard only.
    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setMode('update');
          setMessage('SECURE LINK VERIFIED. ENTER NEW ENCRYPTION KEY.');
          setError('');
        }
      });
      return () => subscription.unsubscribe();
    } catch (e) {
      return undefined;
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('VERIFICATION MATRIX SENT. CHECK SECURE COMMS.');
      } 
      else if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (onLogin && data.user) {
          const callsign = 
            data.user.user_metadata?.username || 
            data.user.user_metadata?.callsign || 
            data.user.email.split('@')[0].toUpperCase();
          onLogin(callsign);
        }
      } 
      else if (mode === 'reset') {
        // Triggers the Supabase Reset Password Email
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin, 
        });
        if (error) throw error;
        setMessage('RESET PROTOCOL INITIATED. CHECK COMMS FOR LINK.');
      } 
      else if (mode === 'update') {
        // Updates the user's password using the active recovery session
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setMessage('ENCRYPTION KEY UPDATED SUCCESSFULLY.');
        setTimeout(() => setMode('login'), 3000);
      }
    } catch (err) {
      setError(err.message.toUpperCase());
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#050508]/95 z-[50000] flex justify-center items-center backdrop-blur-md">
      <div className="bg-[#0c0c12]/90 p-10 border border-[#08f7fe] rounded-xl w-[90%] max-w-[420px] shadow-[0_0_40px_rgba(8,247,254,0.15)] flex flex-col relative">
        
        <h2 className="font-['Orbitron'] text-[#08f7fe] text-xl text-center tracking-[0.15em] mb-6 uppercase">
          {mode === 'login' && 'IDENTITY VERIFICATION'}
          {mode === 'signup' && 'REGISTER NEW NODE'}
          {mode === 'reset' && 'NETWORK RECOVERY'}
          {mode === 'update' && 'SECURE NEW KEY'}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          
          {/* Email field hidden only during 'update' mode */}
          {mode !== 'update' && (
            <input
              type="email"
              placeholder="Secure Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-3 bg-black border border-zinc-800 text-[#08f7fe] rounded outline-none font-mono text-center focus:border-[#08f7fe] focus:shadow-[0_0_15px_rgba(8,247,254,0.2)] transition-all"
            />
          )}

          {/* Password field hidden during 'reset' mode */}
          {mode !== 'reset' && (
            <input
              type="password"
              placeholder={mode === 'update' ? "New Encryption Key" : "Encryption Key"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-3 bg-black border border-zinc-800 text-[#08f7fe] rounded outline-none font-mono text-center focus:border-[#08f7fe] focus:shadow-[0_0_15px_rgba(8,247,254,0.2)] transition-all"
            />
          )}

          {error && <div className="text-[#ff3366] text-xs text-center font-mono min-h-[20px]">{error}</div>}
          {message && <div className="text-[#00ff88] text-xs text-center font-mono min-h-[20px]">{message}</div>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full p-3 mt-2 bg-transparent border border-[#08f7fe] text-[#08f7fe] font-['Orbitron'] font-bold tracking-widest uppercase rounded hover:bg-[#08f7fe] hover:text-black hover:shadow-[0_0_20px_rgba(8,247,254,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'PROCESSING...' : (
              mode === 'login' ? 'INITIALIZE LOGIN' :
              mode === 'signup' ? 'ESTABLISH NODE' :
              mode === 'reset' ? 'TRANSMIT LINK' : 'SET NEW KEY'
            )}
          </button>
        </form>

        {/* Dynamic State Toggles */}
        <div className="flex flex-col gap-2 mt-4">
          {mode === 'login' && (
            <>
              <button 
                onClick={() => { setMode('reset'); setError(''); setMessage(''); }}
                className="w-full p-2 bg-transparent border border-zinc-600 text-zinc-400 font-['Orbitron'] text-[10px] tracking-widest uppercase rounded hover:border-amber-400 hover:text-amber-400 transition-all"
              >
                FORGOT ENCRYPTION KEY?
              </button>
              <button 
                onClick={() => { setMode('signup'); setError(''); setMessage(''); }}
                className="w-full p-2 bg-transparent border border-zinc-600 text-zinc-400 font-['Orbitron'] text-[10px] tracking-widest uppercase rounded hover:border-[#fe53bb] hover:text-[#fe53bb] transition-all"
              >
                REGISTER NEW NODE
              </button>
            </>
          )}

          {(mode === 'signup' || mode === 'reset') && (
            <button 
              onClick={() => { setMode('login'); setError(''); setMessage(''); }}
              className="w-full p-2 mt-2 bg-transparent border border-zinc-600 text-zinc-400 font-['Orbitron'] text-[10px] tracking-widest uppercase rounded hover:border-[#08f7fe] hover:text-[#08f7fe] transition-all"
            >
              RETURN TO LOGIN
            </button>
          )}
        </div>

      </div>
    </div>
  );
}


