import React from 'react';

export default function FormField({ label, children }) {
  return (
    <div className="mb-3">
      {label && <label className="block text-sm text-gray-700 mb-1">{label}</label>}
      {children}
    </div>
  );
}
