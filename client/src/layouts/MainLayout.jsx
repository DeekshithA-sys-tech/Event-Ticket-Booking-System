import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Toaster } from 'react-hot-toast';
import { Navbar } from '../components/Navbar.jsx';
import { Footer } from '../components/Footer.jsx';
import { AIChatWidget } from '../components/AIChatWidget.jsx';
import { clearCredentials, fetchCurrentUser } from '../store/authSlice.js';

export const MainLayout = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      dispatch(fetchCurrentUser()).unwrap().catch(() => {});
    }
  }, [dispatch]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handleAuthLogout = () => {
      dispatch(clearCredentials());
      if (location.pathname !== '/login' && location.pathname !== '/register') {
        navigate('/login', { replace: true, state: { from: location } });
      }
    };

    window.addEventListener('auth:logout', handleAuthLogout);
    return () => window.removeEventListener('auth:logout', handleAuthLogout);
  }, [dispatch, navigate, location]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: '#ffffff',
            color: '#0f172a',
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.08)',
            fontSize: '13px',
          },
        }}
      />
      <Navbar />
      <main className="flex-1 flex flex-col">
        <Outlet />
      </main>
      <AIChatWidget />
      <Footer />
    </div>
  );
};
