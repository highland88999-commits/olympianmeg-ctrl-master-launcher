'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { GOOGLE_PROVIDER, mapGoogleSignInError } from '@/lib/auth/google-errors';

// Auth.jsx — Simplified for beginners (2026-10-19).
// Design rule: a 7-year-old must be able to register.
// - Google sign-in is the hero: one tap, no password, no email verification.
// - Plain language everywhere. No jargon ("node", "encryption key", "matrix").
// - Email is the fallback, kept simple.
// - No TikTok prompt, no extra steps. Get them inside first.

export default function Auth({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [videoOk, setVideoOk] = useState(true);

  // Modes: 'login', 'signup', 'reset'
  const [mode, setMode] = useState('signup');
  const [resending, setResending] = useState(false);
  const [showResend, setShowResend] = useState(false);

  // Sends a stashed ?ref=CODE to the server for binding.
  const bindPendingReferral = async (accessToken) => {
    let code = '';
    try {
      code = localStorage.getItem('pending_aff_ref') || '';
    } catch { return; }
    if (!code || !accessToken) return;
    try {
      const r = await fetch('/api/affiliates/bind', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ code }),
      });
      const d = await r.json().catch(() => ({}));
      if (d && (d.ok || d.already)) {
        try { localStorage.removeItem('pending_aff_ref'); } catch { /* ignore */ }
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = (params.get('ref') || '').trim();
      if (ref) localStorage.setItem('pending_aff_ref', ref);
    } catch { /* ignore */ }

    try {
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN' && session?.access_token) {
          bindPendingReferral(session.access_token);
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
        setMessage('Almost done! Check your email for a confirmation link (look in spam too).');
        setShowResend(true);
      }
      else if (mode === 'login') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (onLogin && data.user) {
          const callsign =
            data.user.user_metadata?.username ||
            data.user.user_metadata?.callsign ||
            data.user.email.split('@')[0];
          onLogin(callsign);
        }
      }
      else if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (error) throw error;
        setMessage('Password reset link sent. Check your email.');
      }
    } catch (err) {
      const msg = (err && err.message) || 'Something went wrong. Please try again.';
      // Friendly translations of common Supabase errors
      let friendly = msg;
      if (/invalid login credentials/i.test(msg)) friendly = 'Wrong email or password. Try again.';
      else if (/email not confirmed/i.test(msg)) { friendly = 'Please confirm your email first — check your inbox.'; setShowResend(true); }
      else if (/user already registered/i.test(msg)) friendly = 'This email is already registered. Try logging in instead.';
      else if (/password should be at least/i.test(msg)) friendly = 'Password must be at least 6 characters.';
      setError(friendly);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      setError('Enter your email first.');
      return;
    }
    setResending(true);
    setError('');
    setMessage('');
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email });
      if (error) throw error;
      setMessage('Confirmation email re-sent. Check your inbox and spam folder.');
    } catch (err) {
      setError('Could not resend. Please try again later.');
    } finally {
      setResending(false);
    }
  };

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
    } catch (err) {
      setError(mapGoogleSignInError((err && err.message) || err));
      setGoogleLoading(false);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setError('');
    setMessage('');
    setShowResend(false);
  };

  return (
    <div className="fixed inset-0 z-[50000] flex justify-center items-center overflow-hidden">
      {/* Background */}
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
      </div>

      <div className="p-8 w-[90%] max-w-[400px] flex flex-col relative">
        <h2 className="font-['Orbitron'] text-[#00f2ff] text-xl text-center tracking-[0.1em] mb-1">
          {mode === 'login' && 'Welcome back'}
          {mode === 'signup' && 'Join Olympus'}
          {mode === 'reset' && 'Reset password'}
        </h2>
        <p className="text-zinc-400 text-xs text-center mb-6">
          One account for everything
        </p>

        {/* GOOGLE FIRST — the 7-year-old path: one tap, no typing */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={googleLoading || loading}
          className="w-full p-4 bg-[#00f2ff] text-black font-['Orbitron'] font-bold text-sm tracking-widest uppercase rounded-lg hover:bg-[#00d4e0] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-[0_0_25px_rgba(0,242,255,0.3)]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
          </svg>
          {googleLoading ? 'Connecting...' : 'Continue with Google'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 my-5" aria-hidden="true">
          <div className="h-px flex-1 bg-zinc-800" />
          <span className="text-[11px] text-zinc-500">or use email</span>
          <div className="h-px flex-1 bg-zinc-800" />
        </div>

        {/* Email fallback — plain language */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full p-3 bg-black/60 border border-zinc-700 text-white rounded-lg outline-none text-center focus:border-[#00f2ff] transition-all placeholder:text-zinc-500"
          />
          {mode !== 'reset' && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="w-full p-3 bg-black/60 border border-zinc-700 text-white rounded-lg outline-none text-center focus:border-[#00f2ff] transition-all placeholder:text-zinc-500"
            />
          )}

          {error && <div className="text-[#ff6b6b] text-xs text-center min-h-[20px]">{error}</div>}
          {message && <div className="text-[#00ff88] text-xs text-center min-h-[20px]">{message}</div>}

          {showResend && (
            <button
              type="button"
              onClick={handleResendVerification}
              disabled={resending}
              className="text-[#00f2ff] text-xs underline disabled:opacity-50"
            >
              {resending ? 'Sending...' : "Didn't get the email? Send it again"}
            </button>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full p-3 bg-transparent border border-zinc-500 text-zinc-200 font-['Orbitron'] font-bold text-sm tracking-widest uppercase rounded-lg hover:border-[#00f2ff] hover:text-[#00f2ff] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait...' : (
              mode === 'login' ? 'Log in' :
              mode === 'signup' ? 'Create account' :
              'Send reset link'
            )}
          </button>
        </form>

        {/* Simple mode switcher */}
        <div className="flex flex-col items-center gap-2 mt-5 text-xs">
          {mode === 'signup' && (
            <button onClick={() => switchMode('login')} className="text-zinc-400 hover:text-[#00f2ff] transition-colors">
              Already have an account? <span className="underline">Log in</span>
            </button>
          )}
          {mode === 'login' && (
            <>
              <button onClick={() => switchMode('signup')} className="text-zinc-400 hover:text-[#00f2ff] transition-colors">
                New here? <span className="underline">Create an account</span>
              </button>
              <button onClick={() => switchMode('reset')} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                Forgot your password?
              </button>
            </>
          )}
          {mode === 'reset' && (
            <button onClick={() => switchMode('login')} className="text-zinc-400 hover:text-[#00f2ff] transition-colors">
              <span className="underline">Back to log in</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
