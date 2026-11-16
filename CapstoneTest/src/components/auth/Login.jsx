// src/components/login.jsx
import React, { useState, useEffect } from 'react';
import { addThemeChangeListener, isDarkMode } from '../../utils/themeUtils';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import useAuth from '../../contexts/authcontext';
import { useSystemSettings } from '../../contexts/SystemSettingsContext';
import DarkModeToggle from '../DarkModeToggle';
import { firebaseService } from '../../services/firebaseService';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state && location.state.from && location.state.from.pathname) || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // system settings for branding/colors
  const { companyBranding } = useSystemSettings();
  const APP_NAME = (companyBranding && companyBranding.name) || import.meta.env.VITE_APP_NAME || 'FasTap';
  const APP_TAGLINE = (companyBranding && companyBranding.tagline) || 'Fingerprint Attendance System for Tracking Attendance and Payroll';
  const logoUrl = companyBranding && companyBranding.logo;

  // If already signed in, navigate away after hooks run (avoid early return)
  useEffect(() => {
    if (user) {
      navigate('/', { replace: true });
    }
  }, [user, navigate]);

  // Compute a readable text color based on the sidebar color CSS variable.
  const [computedTextColor, setComputedTextColor] = useState(null);
  const [computedBgColor, setComputedBgColor] = useState(null);
  const [isDark, setIsDark] = useState(() => (typeof window !== 'undefined' ? isDarkMode() : false));

  useEffect(() => {
    // Listen for theme changes dispatched by DarkModeToggle
    const off = addThemeChangeListener((val) => setIsDark(val));
    return off;
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const root = getComputedStyle(document.documentElement);
    const sidebar = (root.getPropertyValue('--color-sidebar') || '').trim();
    const sidebarText = (root.getPropertyValue('--color-sidebar-text') || '').trim() || '#ffffff';

    const parseColor = (c) => {
      if (!c) return null;
      c = c.replace(/\s+/g, '');
      if (c.startsWith('rgb')) {
        const nums = c.replace(/rgba?\(|\)/g, '').split(',').map(n => parseFloat(n));
        return { r: nums[0], g: nums[1], b: nums[2] };
      }
      if (c.startsWith('#')) {
        let hex = c.slice(1);
        if (hex.length === 3) hex = hex.split('').map(h => h + h).join('');
        const int = parseInt(hex, 16);
        return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
      }
      return null;
    };

    const rgb = parseColor(sidebar) || parseColor(sidebarText) || { r: 0, g: 0, b: 0 };
    const luminance = (0.2126 * (rgb.r/255) + 0.7152 * (rgb.g/255) + 0.0722 * (rgb.b/255));
    // If sidebar is light (high luminance), prefer a dark text color for contrast.
    const chosen = luminance > 0.65 ? '#111827' : sidebarText;
    setComputedTextColor(chosen);
    // Choose a contrasting background for the logo circle when sidebar is light
    const chosenBg = luminance > 0.65 ? '#111827' : (sidebar || 'var(--color-sidebar)');
    setComputedBgColor(chosenBg);
  }, [companyBranding, isDark]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email.trim(), password, remember);
      // Sign-in successful

      // Fetch user role via service which returns normalized users array
      const users = await firebaseService.getUsers();
      if (Array.isArray(users) && users.length) {
        const found = users.find(u => u && u.email === email);
        if (found) {
          localStorage.setItem('role', found.role || 'employee');
          localStorage.setItem('employeeType', found.employeeType || '');
        }
      }

      // navigate to original destination if present
      navigate(from, { replace: true });
    } catch (err) {
      setError(err?.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const pageBgStyle = isDark
    ? { background: 'linear-gradient(to bottom, #071021, #0b1220)' }
    : { background: 'linear-gradient(to bottom, #f3f4f6, #ffffff)' };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={pageBgStyle}>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-white/90 backdrop-blur-sm shadow-lg rounded-xl overflow-hidden hover:shadow-xl transition-shadow duration-300 border border-white/20"
      >
        <div className="p-8">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
            {(() => {
              const logoContainerStyle = logoUrl
                ? { backgroundColor: 'transparent' }
                : { backgroundColor: computedBgColor || 'var(--color-sidebar)', color: computedTextColor || 'var(--color-sidebar-text)' };
              return (
                <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-md overflow-hidden" style={logoContainerStyle}>
                  {logoUrl ? (
                    <img src={logoUrl} alt="logo" className="w-full h-full object-contain p-1" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9.5L12 3l9 6.5v8.5a1 1 0 0 1-1 1h-16a1 1 0 0 1-1-1v-8.5z"></path>
                      <path d="M9 22V12h6v10"></path>
                    </svg>
                  )}
                </div>
              );
            })()}
            <div>
              {
                (() => {
                  const headerColor = (typeof window !== 'undefined' && document.documentElement.classList.contains('dark')) ? '#ffffff' : '#111827';
                  return (
                    <>
                      <h1 className="font-bold" style={{fontSize: `${companyBranding?.nameSize || 20}px`, color: headerColor}}>{APP_NAME}</h1>
                      <p className="text-sm" style={{fontSize: `${companyBranding?.taglineSize || 12}px`, color: headerColor}}>{APP_TAGLINE}</p>
                    </>
                  );
                })()
              }
            </div>
            <div className="pt-1">
              <DarkModeToggle />
            </div>
          </div>
          </div>

          {error && (
            <div className="bg-red-100 text-red-800 px-4 py-3 rounded mb-5 text-sm font-medium shadow-sm">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent transition"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent transition"
                placeholder="••••••••"
              />
            </div>

            <div className="flex items-center justify-between text-sm text-gray-600">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="form-checkbox h-5 w-5 text-red-800 transition" />
                Remember me
              </label>
              <button type="button" className="text-red-800 hover:underline font-medium" onClick={() => navigate('/forgot-password')}>
                Forgot?
              </button>
            </div>

            <div>
              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                className="w-full text-white py-3 rounded-lg transition disabled:opacity-60 font-semibold text-lg"
                style={{ backgroundColor: 'var(--color-sidebar)', color: computedTextColor || 'var(--color-sidebar-text)' }}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </motion.button>
            </div>
          </form>
        </div>

        <div className="bg-gray-50 px-6 py-4 text-xs text-gray-500 text-center select-none">
          By signing in you agree to the project terms.
        </div>
      </motion.div>
    </div>
  );
}
