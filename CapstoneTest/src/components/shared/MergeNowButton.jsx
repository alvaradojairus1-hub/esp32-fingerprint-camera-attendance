import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { RefreshCcw, CheckCircle } from 'lucide-react';

export default function MergeNowButton({
  className = '',
  children = 'Sync Now',
  onClick,
  disabled = false
}) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const handleClick = async () => {
    if (loading || disabled) return;
    setLoading(true);
    setMessage('');
    setSuccess(false);

    try {
      // If parent passed a custom onClick, use it
      if (onClick) {
        await onClick();
      }
      setMessage('Sync triggered successfully');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      console.error('Manual sync failed:', e);
      setMessage(e.message || 'Sync failed');
      setSuccess(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`sync-now-button ${className}`}>
      <motion.button
        aria-label="Trigger manual sync"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleClick}
        disabled={loading || disabled}
        className={`flex items-center gap-2 p-3 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition shadow-sm ${
          loading || disabled ? 'opacity-60 pointer-events-none' : 'hover:shadow-md'
        } ${success ? 'ring-2 ring-green-200' : ''}`}
      >
        <motion.span
          animate={loading ? { rotate: 360 } : { rotate: 0 }}
          transition={loading ? { repeat: Infinity, duration: 0.9, ease: 'linear' } : { duration: 0.3 }}
          className="inline-flex"
        >
          {!loading && !success && <RefreshCcw className="w-4 h-4" />}
          {loading && <RefreshCcw className="w-4 h-4" />}
          {success && <CheckCircle className="w-4 h-4 text-green-500" />}
        </motion.span>

        <span className="font-medium">{loading ? 'Syncing...' : children}</span>
      </motion.button>

      {message ? (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className={`mt-2 text-sm ${success ? 'text-green-600' : 'text-gray-700'}`}
        >
          {message}
        </motion.div>
      ) : null}
    </div>
  );
}
