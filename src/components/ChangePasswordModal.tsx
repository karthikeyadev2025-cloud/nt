import { useState } from 'react';
import { X, Lock, Key } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../lib/toast';

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { user } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentPw) {
      toast.error('Please enter your current password');
      return;
    }
    if (newPw.length < 8) {
      toast.error('New password must be at least 8 characters long');
      return;
    }
    if (newPw === currentPw) {
      toast.error('New password must be different from current password');
      return;
    }
    if (newPw !== confirmPw) {
      toast.error('New passwords do not match');
      return;
    }
    if (!user?.email) {
      toast.error('Session error — please sign in again');
      return;
    }
    setBusy(true);
    try {
      // Step 1: verify the current password by attempting a fresh sign-in.
      // Without this, anyone with access to your logged-in tab could
      // change your password without knowing the current one — the old
      // modal skipped this check entirely.
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPw,
      });
      if (verifyErr) {
        toast.error('Current password is incorrect');
        setBusy(false);
        return;
      }

      // Step 2: change the password. This updates encrypted_password in
      // auth.users, so future sign-ins with the old password will fail.
      const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
      if (updateErr) throw updateErr;

      // Step 3: clear the "must change" flag if it was set.
      if (user.id) {
        await supabase.from('app_users').update({ must_change_password: false } as never).eq('id', user.id);
      }

      // Step 4: invalidate all OTHER sessions. Supabase does NOT do this
      // automatically on password change — existing JWTs and refresh
      // tokens on other devices remain valid until they expire naturally.
      // Users interpret this as "the old password still works" because
      // browsers stay signed in via cached tokens even after the
      // password on the account has been changed. scope: 'others' keeps
      // the current tab signed in but boots every other session
      // (mobile app, other browser, other device).
      await supabase.auth.signOut({ scope: 'others' }).catch(() => {
        // Non-fatal: password change still succeeded even if we
        // couldn't reach the endpoint to invalidate other sessions.
      });

      toast.success('Password changed. All other devices have been signed out.');
      onClose();
    } catch (err) {
      toast.error((err instanceof Error ? err.message : String(err)) || 'Failed to update password');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-stone-200 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center text-orange-700">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-stone-900 font-extrabold text-base leading-tight">Change Password</h3>
              <p className="text-stone-700 text-xs font-semibold">Verify current, set a new one, sign out other devices</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-stone-700 hover:text-stone-900 hover:bg-stone-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Current Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-stone-700 absolute left-3 top-3" />
              <input
                type="password"
                required
                placeholder="Your current password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                autoComplete="current-password"
                className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-600 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">New Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-stone-700 absolute left-3 top-3" />
              <input
                type="password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                autoComplete="new-password"
                className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-600 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">Confirm New Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-stone-700 absolute left-3 top-3" />
              <input
                type="password"
                required
                minLength={8}
                placeholder="Re-enter new password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                autoComplete="new-password"
                className="w-full pl-9 pr-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-600 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-stone-700 hover:bg-stone-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-orange-700 hover:bg-orange-600 disabled:opacity-50 shadow-md shadow-orange-700/20"
            >
              {busy ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
