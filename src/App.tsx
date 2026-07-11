import { useEffect, useState, lazy, Suspense } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ToastProvider } from './lib/toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import PWAInstallBanner from './components/PWAInstallBanner';

const PublicSite = lazy(() => import('./components/PublicSite'));
const UnifiedLogin = lazy(() => import('./components/UnifiedLogin'));
const SuperAdminDashboard = lazy(() => import('./components/portal/SuperAdminDashboard'));
const StaffPortal = lazy(() => import('./components/portal/StaffPortal'));

function PageLoader() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
    </div>
  );
}

function AppContent() {
  const { user, loading, hasPermission } = useAuth();
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

  if (loading) return <PageLoader />;

  if (isLoginRoute) {
    if (!user) return <Suspense fallback={<PageLoader />}><UnifiedLogin /></Suspense>;
    // Anyone with an admin-capable permission gets the admin console (its own
    // tabs are further filtered to exactly what that person is allowed to do) —
    // not just the literal super_admin account. Otherwise, the self-service portal.
    const hasAdminAccess = user.role === 'super_admin' || [
      'manage_staff', 'manage_content', 'manage_payroll', 'manage_careers',
      'view_reports', 'manage_tickets', 'assign_tickets', 'manage_leads',
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
