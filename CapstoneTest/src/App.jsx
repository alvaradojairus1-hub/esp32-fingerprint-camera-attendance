import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/shared/ErrorBoundary';
import useAuth from './contexts/authcontext';
import { usePendingAttendance } from './hooks/usePendingAttendance'; // ✅ keep this import
import { SystemSettingsProvider } from './contexts/SystemSettingsContext';

// Dynamic imports for route-level code splitting
import { routes } from './routes';
import Sidebar from './components/shared/Sidebar';
import DarkModeToggle from './components/DarkModeToggle';

function Layout({ children }) {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(() => {
    return window.innerWidth >= 1024;
  });

  React.useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors flex">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <div
        className={`transition-all duration-200 ease-in-out flex-1 min-w-0 ${
          isSidebarOpen ? 'lg:ml-80 ml-0' : 'ml-0'
        }`}
      >
        <header className="flex items-center justify-between h-16 bg-white dark:bg-gray-800 shadow-sm px-4 sticky top-0 z-20 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-lg transition duration-200 mr-3 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              aria-expanded={isSidebarOpen}
            >
              <svg
                className="w-6 h-6 text-gray-600 dark:text-gray-300"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                viewBox="0 0 24 24"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-semibold text-gray-900 dark:text-white">
              Dashboard
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            <DarkModeToggle />
          </div>
        </header>
        <main className="p-3 sm:p-4 lg:p-6 space-y-4 sm:space-y-6 lg:space-y-8 min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="h-32 flex items-center justify-center">
      <div className="text-gray-600">Loading…</div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleProtectedRoute({ children, allowedRoles = [] }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="h-32 flex items-center justify-center">
      <div className="text-gray-600">Loading…</div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;

  const userRole = (user.role || '').toString().toLowerCase();
  
  // Check if user has access to the route
  const hasAccess = allowedRoles.some(role => {
    if (role === '*') return true; // Allow all roles
    if (role === '*-hr') return userRole !== 'hr'; // Allow all except HR
    return role === userRole; // Exact role match
  });

  if (!hasAccess) {
    if (userRole === 'hr') return <Navigate to="/" replace />;
    return <Navigate to="/my-attendance" replace />; // Default redirect for non-HR roles
  }
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-gray-600">Loading…</div>
      </div>
    );
  }

  return (
    <Routes>
      {routes.map((route) => (
        <Route
          key={route.path}
          path={route.path}
          element={
            route.public ? (
              route.element
            ) : route.roles ? (
              <RoleProtectedRoute allowedRoles={route.roles}>
                <Layout>
                  <ErrorBoundary>
                    <React.Suspense fallback={<div className="h-32 flex items-center justify-center"><div className="text-gray-600">Loading…</div></div>}>
                      {route.element}
                    </React.Suspense>
                  </ErrorBoundary>
                </Layout>
              </RoleProtectedRoute>
            ) : (
              <ProtectedRoute>
                <Layout>
                  <ErrorBoundary>
                    <React.Suspense fallback={<div className="h-32 flex items-center justify-center"><div className="text-gray-600">Loading…</div></div>}>
                      {route.element}
                    </React.Suspense>
                  </ErrorBoundary>
                </Layout>
              </ProtectedRoute>
            )
          }
        />
      ))}

      {/* Backwards-compatible redirects */}
      <Route path="/dtr-summaries" element={<Navigate to="/dtr" replace />} />
      <Route path="/dtr-analytics" element={<Navigate to="/dtr" replace />} />
      <Route path="*" element={<Navigate to={user ? '/' : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  const { user } = useAuth();
  const isHR = user && user.role && user.role.toLowerCase() === 'hr';

  // ✅ Always call the hook unconditionally (it internally checks if HR)
  usePendingAttendance();

  React.useEffect(() => {
    if (isHR) console.log('[AutoSync] HR logged in, starting background merge polling...');
  }, [isHR]);

  return (
    <ErrorBoundary>
      <SystemSettingsProvider>
        <Router>
          <AppRoutes />
        </Router>
      </SystemSettingsProvider>
    </ErrorBoundary>
  );
}
