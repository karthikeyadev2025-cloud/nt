import { useEffect, useState, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './lib/toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import PWAInstallBanner from './components/PWAInstallBanner';

const PublicSite = lazy(() => import('./components/PublicSite'));
const UnifiedLogin = lazy(() => import('./components/UnifiedLogin'));
import { KiteTailLogo } from './components/KiteTailLogo';

const SuperAdminDashboard = lazy(() => import('./components/portal/SuperAdminDashboard'));
const StaffPortal = lazy(() => import('./components/portal/StaffPortal'));
const ForcePasswordChange = lazy(() => import('./components/ForcePasswordChange'));

function PageLoader() {
  return (
    <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center select-none">
      <KiteTailLogo className="w-12 h-12 mb-3 drop-shadow-md" />
      <p className="text-stone-900 font-extrabold text-sm tracking-tight">Nikki Technologies</p>
      <div className="w-28 h-1 bg-stone-200 rounded-full mt-4 overflow-hidden">
        <div className="w-full h-full bg-orange-700 rounded-full animate-pulse" />
      </div>
    </div>
  );
}

function AppContent() {
  const { user, loading, sessionReady, hasPermission } = useAuth();
  const [isLoginRoute, setIsLoginRoute] = useState(false);

  useEffect(() => {
    const checkRoute = () => {
      const path = window.location.pathname;
      const hash = window.location.hash;
      setIsLoginRoute(
        path === '/login' || hash === '#login' ||
        path === '/admin' || hash === '#admin' ||
        path === '/portal' || hash === '#portal'
      );
    };
    checkRoute();
    window.addEventListener('popstate', checkRoute);
    window.addEventListener('hashchange', checkRoute);
    return () => {
      window.removeEventListener('popstate', checkRoute);
      window.removeEventListener('hashchange', checkRoute);
    };
  }, []);

  // AuthContext's own `loading` already has a real, correct safety net (a
  // fast localStorage-hydration path for returning sessions, and a 15s hard
  // cap for a genuinely broken connection). This used to be overridden by a
  // second, much more aggressive 400ms timer here that forced the app past
  // `loading` before the real session check could realistically finish on
  // any live network — which meant `user` was still null at that moment,
  // so a signed-in person got shown the login screen for a moment before
  // flipping back to their portal. Trusting AuthContext's own loading state
  // directly removes that race entirely.
  if (loading) return <PageLoader />;

  // The cache fast-path above can set `user` from localStorage before the
  // REAL Supabase client has confirmed and attached its session token — see
  // the sessionReady comment in AuthContext. If every dashboard component
  // were left to fire its own data queries at that instant, RLS-protected
  // tables come back empty (not an error), which is exactly "signed in, but
  // no data anywhere" on what looks like a random fraction of page loads.
  // Holding the neutral loader for this one extra beat — never the login
  // screen, since `user` is already known — closes that race at a single
  // point instead of touching every component that fetches data.
  if (user && !sessionReady) return <PageLoader />;

  if (isLoginRoute) {
    if (!user) return <Suspense fallback={<PageLoader />}><UnifiedLogin /></Suspense>;
    // A temp password (set by an admin) must be replaced before anything else.
    if (user.must_change_password) return <Suspense fallback={<PageLoader />}><ForcePasswordChange /></Suspense>;
    // Only genuinely administrative permissions route to the admin console.
    // manage_leads / manage_tickets are deliberately NOT here: telecallers,
    // field executives and support agents hold them, and their real workflows
    // (call queue, field visits, ticket queue) live in the staff portal. Sending
    // them to the console would hide the very screens built for their job.
    const hasAdminAccess = user.role === 'super_admin' || [
      'manage_staff', 'manage_content', 'manage_payroll', 'manage_careers',
      'view_reports', 'assign_tickets',
      'bulk_assign_leads', 'approve_transfers', 'approve_advances',
    ].some(p => hasPermission(p));
    if (hasAdminAccess) return <Suspense fallback={<PageLoader />}><SuperAdminDashboard /></Suspense>;
    return <Suspense fallback={<PageLoader />}><StaffPortal /></Suspense>;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <PublicSite />
      <PWAInstallBanner />
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
