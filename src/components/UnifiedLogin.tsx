import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Lock, Mail, AlertCircle, Zap, Users, Phone, Briefcase, HeartHandshake, MapPin, Clock, CheckCircle2 } from 'lucide-react';

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
  const [location, setLocation] = useState('Detecting location...');

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
          const data = await res.json();
          const addr = data.address;
          const parts = [addr?.suburb || addr?.neighbourhood, addr?.city || addr?.town || addr?.village, addr?.state].filter(Boolean);
          setLocation(parts.slice(0, 2).join(', ') || data.display_name?.split(',').slice(0, 2).join(',') || `${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        } catch {
          setLocation(`${lat.toFixed(4)}, ${lng.toFixed(4)}`);
        }
      },
      () => setLocation('Location unavailable'),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setLoading(false);
  }

  async function sendResetEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail) return;
    setResetLoading(true);
    await supabase.auth.resetPasswordForEmail(resetEmail, { redirectTo: `${window.location.origin}/login` });
    setResetLoading(false);
    setResetSent(true); // always show success, regardless of whether the email exists — avoids leaking which emails are registered
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-sky-500/8 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500/8 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-sky-500 to-cyan-400 rounded-2xl mb-4 shadow-lg shadow-sky-500/25">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">Nikki Technologies</h1>
          <p className="text-slate-400 text-sm">Staff Portal — Sign in to continue</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur rounded-2xl border border-slate-700/60 px-5 py-3 mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-400 min-w-0">
            <MapPin className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="text-xs truncate">{location}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300 shrink-0">
            <Clock className="w-3.5 h-3.5 text-sky-400" />
            <span className="text-xs font-mono font-semibold tabular-nums">
              {now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
            </span>
          </div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-700 p-8 shadow-2xl">
          {error && (
            <div className="mb-5 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          {recoveryMode ? (
            passwordSetDone ? (
              <div className="text-center py-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                <p className="text-white font-semibold mb-1">Password updated</p>
                <p className="text-slate-400 text-sm mb-4">You're signed in — continue to your portal.</p>
                <button onClick={() => { setRecoveryMode(false); window.location.href = '/login'; }} className="w-full py-3 bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold rounded-xl text-sm">
                  Continue
                </button>
              </div>
            ) : (
              <form onSubmit={setNewPasswordSubmit} className="space-y-5">
                <div>
                  <h3 className="text-white font-semibold mb-1">Set a new password</h3>
                  <p className="text-slate-500 text-sm">Choose a new password for your account.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">New Password</label>
                  <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Confirm Password</label>
                  <input type="password" value={newPasswordConfirm} onChange={e => setNewPasswordConfirm(e.target.value)} required minLength={6}
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" />
                </div>
                <button type="submit" disabled={settingPassword} className="w-full py-3.5 bg-gradient-to-r from-sky-500 to-cyan-400 text-white font-semibold rounded-xl hover:from-sky-400 hover:to-cyan-300 disabled:opacity-60 transition-all text-base">
                  {settingPassword ? 'Updating…' : 'Update Password'}
                </button>
              </form>
            )
          ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                  required
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
                  required
                  autoComplete="current-password"
                />
              </div>
              <button type="button" onClick={() => { setShowReset(true); setResetSent(false); setResetEmail(email); }} className="text-sky-400 text-xs mt-2 hover:text-sky-300">
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-gradient-to-r from-sky-500 to-cyan-400 text-white font-semibold rounded-xl hover:from-sky-400 hover:to-cyan-300 disabled:opacity-60 disabled:cursor-not-allowed transition-all shadow-lg shadow-sky-500/20 text-base"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : 'Sign In'}
            </button>
          </form>
          )}

          {showReset && (
            <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowReset(false)}>
              <div className="bg-slate-950 border border-slate-700 rounded-2xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
                {resetSent ? (
                  <div className="text-center py-4">
                    <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
                    <p className="text-white font-semibold mb-1">Check your email</p>
                    <p className="text-slate-400 text-sm">If an account exists for {resetEmail}, a reset link has been sent.</p>
                    <button className="text-sky-400 text-sm mt-4" onClick={() => setShowReset(false)}>Close</button>
                  </div>
                ) : (
                  <form onSubmit={sendResetEmail}>
                    <h3 className="text-white font-semibold mb-1">Reset your password</h3>
                    <p className="text-slate-500 text-sm mb-4">Enter your account email and we'll send a reset link.</p>
                    <input
                      type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} required
                      placeholder="you@nikkitechnologies.com"
                      className="w-full px-4 py-2.5 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 mb-4"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setShowReset(false)} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-slate-300 text-sm">Cancel</button>
                      <button type="submit" disabled={resetLoading} className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-semibold text-sm">
                        {resetLoading ? 'Sending…' : 'Send Link'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-slate-700">
            <p className="text-xs text-slate-500 text-center mb-3">Login is available for:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {[
                { label: 'Admin', icon: Lock },
                { label: 'Manager', icon: Briefcase },
                { label: 'HR', icon: HeartHandshake },
                { label: 'Executive', icon: Users },
                { label: 'Telecaller', icon: Phone },
              ].map(({ label, icon: Icon }) => (
                <span key={label} className="flex items-center gap-1 px-2.5 py-1 bg-slate-700/60 rounded-lg text-xs text-slate-400">
                  <Icon className="w-3 h-3" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="text-center mt-6">
          <a href="/" className="text-sm text-slate-500 hover:text-sky-400 transition-colors">
            ← Back to website
          </a>
        </div>
      </div>
    </div>
  );
}
