import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function ErrorFallback({ error, resetError, componentName = 'Component' }) {
  const handleRetry = () => {
    resetError();
  };

  const handleGoHome = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <div className="flex justify-center mb-4">
          <AlertTriangle className="w-12 h-12 text-red-500" />
        </div>

        <h2 className="text-lg font-semibold text-red-800 mb-2">
          Something went wrong
        </h2>

        <p className="text-sm text-red-600 mb-4">
          {componentName} encountered an error and couldn't load properly.
        </p>

        <div className="bg-red-100 rounded p-3 mb-4">
          <p className="text-xs text-red-700 font-mono break-all">
            {error?.message || 'Unknown error occurred'}
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>

          <button
            onClick={handleGoHome}
            className="flex items-center gap-2 px-4 py-2 border border-red-600 text-red-600 rounded hover:bg-red-50 transition"
          >
            <Home className="w-4 h-4" />
            Go Home
          </button>
        </div>
      </div>
    </div>
  );
}
