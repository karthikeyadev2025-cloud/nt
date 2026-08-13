import type { ToastContextType } from './toast';

// Wraps a supabase mutation result and reports success/error consistently.
export function reportResult(
  toast: ToastContextType,
  error: { message: string } | null,
  successMsg: string,
  errorPrefix = 'Failed'
) {
  if (error) {
    toast.error(`${errorPrefix}: ${error.message}`);
    return false;
  }
  toast.success(successMsg);
  return true;
}
