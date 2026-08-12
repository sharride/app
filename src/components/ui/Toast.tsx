import React from 'react';

interface ToastProps {
  id: string;
  message: string;
}

export const ToastItem: React.FC<ToastProps> = ({ message }) => {
  return (
    <div className="bg-gray-900 text-white text-sm px-4 py-2 rounded-xl shadow-md">
      {message}
    </div>
  );
};

export const ToastContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div aria-live="polite" className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 space-y-2">
      {children}
    </div>
  );
};
