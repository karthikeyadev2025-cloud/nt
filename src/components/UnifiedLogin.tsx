import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Lock, Mail, AlertCircle, Users, Phone, Briefcase, HeartHandshake, Clock, CheckCircle2 } from 'lucide-react';
import { KiteTailLogo } from './KiteTailLogo';

export default function UnifiedLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const [showReset, setShowReset] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);
  const [passwordSetDone, setPasswordSetDone] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function setNewPasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== newPasswordConfirm) { setError('Passwords do not match'); return; }
    setSettingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSettingPassword(false);
    if (error) { setError(error.message); return; }
    setPasswordSetDone(true);
  }

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await signIn(cleanEmail, password);
      if (error) {
        setError(error);
        return;
      }
      // AuthContext has updated `user` synchronously via setUser; App.tsx will
      // route to the right dashboard based on the actual role + permissions
      // as soon as the hash flips to a login route. Prefer #portal — the app
      // itself upgrades to #admin if the role warrants it.
      if (!window.location.hash || window.location.hash === '#login') {
        window.location.hash = '#portal';
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed. Please try again.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function sendResetEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail || resetLoading) return;
    setResetLoading(true);
    try {
      // Hard timeout so a broken network never leaves the button spinning forever.
      await Promise.race([
        supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo: `${window.location.origin}/login` }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000)),
      ]);
    } catch {
      // Swallow — we always show a generic success so we don't leak which emails are registered.
    } finally {
      setResetLoading(false);
      setResetSent(true);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <KiteTailLogo className="w-20 h-20 drop-shadow-md" />
          </div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mb-1">Nikki Technologies</h1>
          <p className="text-slate-600 text-sm font-semibold">Enterprise Staff Portal — Sign in to continue</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 px-5 py-3 mb-4 flex items-center justify-between gap-4 shadow-sm">
          <span className="text-xs text-slate-600 truncate font-semibold">
            {now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <div className="flex items-center gap-1.5 text-slate-700 shrink-0">
            <Clock className="w-3.5 h-3.5 text-blue-700" />
            <span className="text-xs font-mono font-bold tabular-nums">
              {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-8 shadow-xl">
          {!isSupabaseConfigured && (
            <div className="mb-5 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3" data-testid="config-warning">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-amber-800 text-sm font-semibold">
                Sign-in isn't configured yet. Ask your administrator to set the Supabase credentials.
              </p>
            </div>
          )}
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3" data-testid="login-error">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="text-red-700 text-sm font-semibold">{error}</p>
            </div>
          )}

          {recoveryMode ? (
            passwordSetDone ? (
              <div className="text-center py-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
                <p className="text-slate-900 font-bold mb-1">Password updated</p>
                <p className="text-slate-600 text-sm mb-4">You're signed in — continue to your portal.</p>
                <button onClick={() => { setRecoveryMode(false); window.location.href = '/login'; }} className="w-full py-3 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl text-sm shadow-md">
                  Continue
                </button>
              </div>
            ) : (
              <form onSubmit={setNewPasswordSubmit} className="space-y-5">
                <div>
                  <h3 className="text-slate-900 font-bold mb-1">Set a new password</h3>
                  <p className="text-slate-600 text-sm">Choose a new password for your account.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6}
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 shadow-sm" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm Password</label>
                  <input type="password" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)} required minLength={6}
                    className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 shadow-sm" />
                </div>
                <button type="submit" disabled={settingPassword} className="w-full py-3.5 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl disabled:opacity-60 transition-all text-base shadow-md shadow-blue-700/20">
                  {settingPassword ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            )
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 transition-colors shadow-sm"
                  required
                  autoComplete="email"
                  data-testid="login-email-input"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-700 focus:ring-2 focus:ring-blue-700/20 transition-colors shadow-sm"
                  required
                  autoComplete="current-password"
                  data-testid="login-password-input"
                />
              </div>
              <button type="button" onClick={() => { setShowReset(true); setResetSent(false); setResetEmail(email); }} className="text-blue-700 text-xs mt-2 hover:text-blue-800 font-semibold">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="w-full py-3.5 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-md shadow-blue-700/25 text-base border border-blue-600/20"
              data-testid="login-submit-button"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In to Portal'}
            </button>
          </form>
          )}

          {showReset && (
            <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowReset(false)}>
              <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                {resetSent ? (
                  <div className="text-center py-4">
                    <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-3" />
                    <p className="text-slate-900 font-bold mb-1">Check your email</p>
                    <p className="text-slate-600 text-sm">If an account exists for {resetEmail}, a reset link has been sent.</p>
                    <button className="text-blue-700 font-semibold text-sm mt-4" onClick={() => setShowReset(false)}>Close</button>
                  </div>
                ) : (
                  <form onSubmit={sendResetEmail}>
                    <h3 className="text-slate-900 font-bold mb-1">Reset your password</h3>
                    <p className="text-slate-600 text-sm mb-4">Enter your account email and we'll send a reset link.</p>
                    <input
                      type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} required
                      placeholder="you@nikkitechnologies.com"
                      className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-500 focus:outline-none focus:border-blue-700 mb-4 shadow-sm"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowReset(false)} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-sm hover:bg-slate-50">Cancel</button>
                      <button type="submit" disabled={resetLoading} className="flex-1 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-60 text-white font-bold text-sm shadow-md">
                        {resetLoading ? 'Sending…' : 'Send Link'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-slate-200">
            <p className="text-xs text-slate-500 text-center font-medium mb-3">Login is available for:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                { label: 'Admin', icon: Lock },
                { label: 'Manager', icon: Briefcase },
                { label: 'HR', icon: HeartHandshake },
                { label: 'Executive', icon: Users },
                { label: 'Telecaller', icon: Phone },
              ].map(({ label, icon: Icon }) => (
                <span key={label} className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs text-slate-700 font-semibold shadow-xs">
                  <Icon className="w-3.5 h-3.5 text-blue-700" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <a href="/" className="text-sm text-slate-600 hover:text-blue-700 font-semibold transition-colors">
            ← Back to website
          </a>
        </div>
      </div>
    </div>
  );
}
