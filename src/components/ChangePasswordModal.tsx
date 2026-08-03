import { useState } from 'react';
import { X, Lock, Key } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../lib/toast';

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const { user } = useAuth();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPw.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }
    if (newPw !== confirmPw) {
      toast.error('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;

      if (user?.id) {
        await supabase.from('app_users').update({ must_change_password: false }).eq('id', user.id);
      }

      toast.success('Your password has been changed successfully!');
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password');
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
              <p className="text-stone-700 text-xs font-semibold">Update your login password securely</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-stone-700 hover:text-stone-900 hover:bg-stone-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-bold text-stone-700 mb-1">New Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-stone-700 absolute left-3 top-3" />
              <input
                type="password"
                required
                minLength={6}
                placeholder="At least 6 characters"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
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
                minLength={6}
                placeholder="Re-enter new password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
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
