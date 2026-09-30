'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { GOOGLE_PROVIDER, mapGoogleSignInError } from '@/lib/auth/google-errors';

export default function Auth({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  // Entrance video: true until the <video> element reports the file missing.
  // Merlin drops his video at public/media/entrance.mp4 (served as
  // /media/entrance.mp4); until then an animated gradient shows — honest,
  // never a fake video.
  const [videoOk, setVideoOk] = useState(true);
  
  // Modes: 'login', 'signup', 'reset', 'update'
  const [mode, setMode] = useState('login');
  // Resend-verification affordance: shown after a fresh signup, or when a
  // login fails because the email was never confirmed. Supabase's built-in
  // mailer is throttled to a few sends per hour and lands in spam often, so
  // users need a way to trigger a fresh send without re-registering.
  const [resending, setResending] = useState(false);
  const [showResend, setShowResend] = useState(false);

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
    setShowResend(false);

    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage('VERIFICATION MATRIX SENT. CHECK INBOX AND SPAM FOLDER.');
        setShowResend(true);
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
      const msg = (err && err.message) || 'UNKNOWN ERROR';
      setError(msg.toUpperCase());
      // Unconfirmed email on login: offer a resend instead of a dead end.
      if (/email not confirmed/i.test(msg)) setShowResend(true);
    } finally {
      setLoading(false);
    }
  };

  // Re-sends the signup confirmation email. Counts against the same
  // provider throttle as the original send, so the UI copy tells the user
  // to check the spam folder too — that's where the shared Supabase sender
  // lands most often.
  const handleResendVerification = async () => {
    if (!email) {
      setError('ENTER YOUR SECURE EMAIL FIRST.');
      return;
    }
    setResending(true);
    setError('');
    setMessage('');
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      setMessage('VERIFICATION MATRIX RE-SENT. CHECK INBOX AND SPAM FOLDER.');
    } catch (err) {
      setError(((err && err.message) || 'RESEND FAILED').toUpperCase());
    } finally {
      setResending(false);
    }
  };

  // Google sign-in goes through SUPABASE OAuth (signInWithOAuth), not
  // Firebase. Reason: this launcher's entire identity system — sessions,
  // RLS, gold ledger, profiles, vault — is keyed on the Supabase user.
  // There is no Firebase Auth SDK in the app (Firebase here is Storage-only
  // via REST). A Supabase OAuth sign-in returns a real Supabase session, so
  // a Google user lands in the exact same session/bootstrap flow as an
  // email user — one system, not two. The Google provider must be enabled
  // in the Supabase dashboard (Authentication -> Providers -> Google) with
  // the site's origin in the redirect URLs; until then this fails with a
  // plain message, never a crash.
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError('');
    setMessage('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: GOOGLE_PROVIDER,
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      // Success: supabase-js hands the browser to Google; Google returns
      // the user to window.location.origin where the session is picked up
      // by the onAuthStateChange listener in app/page.jsx. No popup, so
      // mobile Safari's popup blocker is never in the way.
    } catch (err) {
      setError(mapGoogleSignInError((err && err.message) || err));
      setGoogleLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[50000] flex justify-center items-center overflow-hidden">
      {/* Entrance background — Merlin's one house ad slot. His video plays
          behind the auth text when public/media/entrance.mp4 exists; an
          elegant animated gradient shows until then. The dim overlay keeps
          the auth text readable over either. */}
      <div className="absolute inset-0 bg-[#050508]" aria-hidden="true">
        <style>{`@keyframes auth-bg-drift { 0% { transform: scale(1) translate(0, 0); } 100% { transform: scale(1.18) translate(-2%, 3%); } }
@media (prefers-reduced-motion: reduce) { .auth-bg-layer { animation: none !important; } }`}</style>
        <div
          className="absolute inset-0 auth-bg-layer"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% 28%, #0e323b 0%, #050508 70%),' +
              'radial-gradient(ellipse 55% 45% at 82% 82%, #33103a 0%, transparent 70%),' +
              'radial-gradient(ellipse 50% 40% at 15% 75%, #0b2b1a 0%, transparent 70%)',
            animation: 'auth-bg-drift 26s ease-in-out infinite alternate',
          }}
        />
        {videoOk && (
          <video
            src="/media/entrance.mp4"
            autoPlay
            loop
            muted
            playsInline
            onError={() => setVideoOk(false)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-black/30" />{/* light veil only — video stays normal and clear (Merlin 2026-09-30) */}
      </div>
      <div className="bg-[#0c0c12]/90 p-10 border border-[#00f2ff] rounded-xl w-[90%] max-w-[420px] shadow-[0_0_40px_rgba(8,247,254,0.15)] flex flex-col relative">
        
        <h2 className="font-['Orbitron'] text-[#00f2ff] text-xl text-center tracking-[0.15em] mb-2 uppercase">
          {mode === 'login' && 'IDENTITY VERIFICATION'}
          {mode === 'signup' && 'REGISTER NEW NODE'}
          {mode === 'reset' && 'NETWORK RECOVERY'}
          {mode === 'update' && 'SECURE NEW KEY'}
        </h2>
        {/* One Supabase Auth session spans every pocket universe on this
            origin (single shared client in lib/supabase.ts) — say so plainly
            so nobody thinks each universe needs its own account. */}
        <p className="text-zinc-500 text-[10px] text-center font-mono tracking-[0.2em] uppercase mb-6">
          One account for every universe
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          
          {/* Email field hidden only during 'update' mode */}
          {mode !== 'update' && (
            <input
              type="email"
              placeholder="Secure Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full p-3 bg-black border border-zinc-800 text-[#00f2ff] rounded outline-none font-mono text-center focus:border-[#00f2ff] focus:shadow-[0_0_15px_rgba(8,247,254,0.2)] transition-all"
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
              className="w-full p-3 bg-black border border-zinc-800 text-[#00f2ff] rounded outline-none font-mono text-center focus:border-[#00f2ff] focus:shadow-[0_0_15px_rgba(8,247,254,0.2)] transition-all"
            />
          )}

          {error && <div className="text-[#ff3366] text-xs text-center font-mono min-h-[20px]">{error}</div>}
          {message && <div className="text-[#00ff88] text-xs text-center font-mono min-h-[20px]">{message}</div>}

          {/* Resend-verification affordance: appears after signup, or when a
              login fails on an unconfirmed email. Hidden in reset/update modes. */}
          {showResend && (mode === 'login' || mode === 'signup') && (
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resending}
              className="w-full p-2 bg-transparent border border-[#00ff88] text-[#00ff88] font-['Orbitron'] text-[10px] tracking-widest uppercase rounded hover:bg-[#00ff88] hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resending ? 'RETRANSMITTING...' : "DIDN'T GET IT? RESEND VERIFICATION"}
            </button>
          )}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full p-3 mt-2 bg-transparent border border-[#00f2ff] text-[#00f2ff] font-['Orbitron'] font-bold tracking-widest uppercase rounded hover:bg-[#00f2ff] hover:text-black hover:shadow-[0_0_20px_rgba(8,247,254,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'PROCESSING...' : (
              mode === 'login' ? 'INITIALIZE LOGIN' :
              mode === 'signup' ? 'ESTABLISH NODE' :
              mode === 'reset' ? 'TRANSMIT LINK' : 'SET NEW KEY'
            )}
          </button>
        </form>

        {/* Google sign-in: shown on the login/signup screens only. Same
            identity system as email (Supabase session) — see handleGoogleSignIn. */}
        {(mode === 'login' || mode === 'signup') && (
          <div className="flex flex-col gap-2 mt-4">
            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="h-px flex-1 bg-zinc-800" />
              <span className="font-['Orbitron'] text-[10px] tracking-[0.2em] text-zinc-600">OR</span>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={googleLoading || loading}
              className="w-full p-3 bg-transparent border border-zinc-500 text-zinc-200 font-['Orbitron'] font-bold text-sm tracking-widest uppercase rounded hover:border-[#00f2ff] hover:text-[#00f2ff] hover:shadow-[0_0_20px_rgba(8,247,254,0.25)] transition-all motion-reduce:transition-none disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
              </svg>
              {googleLoading ? 'CONTACTING GOOGLE...' : 'CONTINUE WITH GOOGLE'}
            </button>
            <p className="text-zinc-600 text-[10px] text-center font-mono leading-relaxed">
              NEW HERE? GOOGLE SIGN-IN CREATES YOUR NODE AUTOMATICALLY.
            </p>
          </div>
        )}

        {/* Dynamic State Toggles */}
        <div className="flex flex-col gap-2 mt-4">
          {mode === 'login' && (
            <>
              <button 
                onClick={() => { setMode('reset'); setError(''); setMessage(''); setShowResend(false); }}
                className="w-full p-2 bg-transparent border border-zinc-600 text-zinc-400 font-['Orbitron'] text-[10px] tracking-widest uppercase rounded hover:border-amber-400 hover:text-amber-400 transition-all"
              >
                FORGOT ENCRYPTION KEY?
              </button>
              <button 
                onClick={() => { setMode('signup'); setError(''); setMessage(''); setShowResend(false); }}
                className="w-full p-2 bg-transparent border border-zinc-600 text-zinc-400 font-['Orbitron'] text-[10px] tracking-widest uppercase rounded hover:border-[#fe53bb] hover:text-[#fe53bb] transition-all"
              >
                REGISTER NEW NODE
              </button>
            </>
          )}

          {(mode === 'signup' || mode === 'reset') && (
            <button 
              onClick={() => { setMode('login'); setError(''); setMessage(''); setShowResend(false); }}
              className="w-full p-2 mt-2 bg-transparent border border-zinc-600 text-zinc-400 font-['Orbitron'] text-[10px] tracking-widest uppercase rounded hover:border-[#00f2ff] hover:text-[#00f2ff] transition-all"
            >
              RETURN TO LOGIN
            </button>
          )}
        </div>

      </div>
    </div>
  );
}


