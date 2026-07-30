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
  const { user, loading, hasPermission } = useAuth();
  const [isLoginRoute, setIsLoginRoute] = useState(false);
  const [forceReady, setForceReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setForceReady(true), 400);
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
      clearTimeout(timer);
      window.removeEventListener('popstate', checkRoute);
      window.removeEventListener('hashchange', checkRoute);
    };
  }, []);

  if (loading && !forceReady) return <PageLoader />;

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
