import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

// Shown (instead of any portal) when app_users.must_change_password is set —
// i.e. the account was created with, or reset to, a password an admin knows.
// The employee must pick their own before proceeding.
export default function ForcePasswordChange() {
  const { user, refreshUser, signOut } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (pw.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (pw !== pw2) { setError('Passwords do not match'); return; }
    setBusy(true);
    const { error: authErr } = await supabase.auth.updateUser({ password: pw });
    if (authErr) { setError(authErr.message); setBusy(false); return; }
    if (user) {
      const { error: flagErr } = await supabase.from('app_users')
        .update({ must_change_password: false }).eq('id', user.id);
      if (flagErr) { setError(`Password changed, but couldn't update your account: ${flagErr.message}`); setBusy(false); return; }
    }
    await refreshUser();
    setBusy(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur rounded-2xl border border-slate-700 p-8 shadow-2xl">
        <div className="text-center mb-6">
          <ShieldCheck className="w-10 h-10 text-sky-400 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-white mb-1">Set your own password</h1>
          <p className="text-slate-400 text-sm">
            Your account was set up with a temporary password. Choose a new one only you know before continuing.
          </p>
        </div>
        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
        <form onSubmit={submit} className="space-y-4">
          <input type="password" required minLength={6} placeholder="New password" value={pw} onChange={e => setPw(e.target.value)}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" />
          <input type="password" required minLength={6} placeholder="Confirm new password" value={pw2} onChange={e => setPw2(e.target.value)}
            className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-sky-500" />
          <button type="submit" disabled={busy}
            className="w-full py-3.5 bg-gradient-to-r from-sky-500 to-cyan-400 text-white font-semibold rounded-xl hover:from-sky-400 hover:to-cyan-300 disabled:opacity-60 transition-all">
            {busy ? 'Saving…' : 'Save & Continue'}
          </button>
        </form>
        <button onClick={signOut} className="w-full text-center text-slate-700 hover:text-slate-300 text-sm mt-4">
          Sign out
        </button>
      </div>
    </div>
  );
}
