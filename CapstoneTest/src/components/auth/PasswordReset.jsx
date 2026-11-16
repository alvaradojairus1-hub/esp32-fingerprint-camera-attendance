import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import useAuth from '../../contexts/authcontext';

export default function PasswordReset() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMessage('');

    try {
      await resetPassword(email.trim());
      setSuccessMessage('Password reset instructions have been sent to your email.');
      setEmail('');
    } catch (err) {
      setError(err?.message || 'Failed to send reset instructions');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-gray-100 to-white p-6">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-white/90 backdrop-blur-sm shadow-lg rounded-xl overflow-hidden hover:shadow-xl transition-shadow duration-300 border border-white/20"
      >
        <div className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center text-white shadow-md">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8V7a4 4 0 00-8 0v4"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800">Reset Password</h1>
              <p className="text-gray-600">Enter your email to receive instructions</p>
            </div>
          </div>

          {error && (
            <div className="bg-red-100 text-red-800 px-4 py-3 rounded mb-5 text-sm font-medium shadow-sm">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="bg-green-100 text-green-800 px-4 py-3 rounded mb-5 text-sm font-medium shadow-sm">
              {successMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
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

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 transition disabled:opacity-60 font-semibold"
            >
              {loading ? 'Sending...' : 'Send Reset Instructions'}
            </motion.button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-500">
            <button onClick={() => navigate('/login')} className="text-red-600 hover:underline font-medium">
              Back to Login
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}