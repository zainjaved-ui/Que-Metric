import React, { useEffect, useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';

const ToastProvider = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Listen for toast events from NotificationContext
    const handleShowToast = (event) => {
      const { message, type } = event.detail;
      
      const toastOptions = {
        duration: 4000,
        position: 'top-right',
        style: {
          borderRadius: '8px',
          background: type === 'success' ? '#10B981' : 
                     type === 'error' ? '#EF4444' : 
                     type === 'warning' ? '#F59E0B' : 
                     '#3B82F6',
          color: '#FFFFFF',
          padding: '12px 16px',
          fontSize: '14px',
          fontWeight: 500,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        },
        iconTheme: {
          primary: '#FFFFFF',
          secondary: type === 'success' ? '#10B981' : 
                    type === 'error' ? '#EF4444' : 
                    type === 'warning' ? '#F59E0B' : 
                    '#3B82F6',
        }
      };

      switch (type) {
        case 'success':
          toast.success(message, toastOptions);
          break;
        case 'error':
          toast.error(message, toastOptions);
          break;
        case 'warning':
          toast(message, { 
            ...toastOptions, 
            icon: '⚠️',
            style: {
              ...toastOptions.style,
              background: '#F59E0B'
            }
          });
          break;
        default:
          toast(message, toastOptions);
      }
    };

    window.addEventListener('show-toast', handleShowToast);

    return () => {
      window.removeEventListener('show-toast', handleShowToast);
    };
  }, []);

  if (!mounted) return null;

  return (
    <Toaster
      position="top-right"
      // Keep toasts above modal overlays/backdrop-blur (modals use z-50/z-[60]).
      containerStyle={{ zIndex: 99999 }}
      toastOptions={{
        duration: 4000,
        style: {
          borderRadius: '8px',
          background: '#363636',
          color: '#fff',
          fontSize: '14px',
          padding: '12px 16px',
        },
        success: {
          duration: 3000,
          iconTheme: {
            primary: '#10B981',
            secondary: '#FFFFFF',
          },
          style: {
            background: '#10B981',
          },
        },
        error: {
          duration: 4000,
          iconTheme: {
            primary: '#EF4444',
            secondary: '#FFFFFF',
          },
          style: {
            background: '#EF4444',
          },
        },
        loading: {
          duration: Infinity,
        },
      }}
    />
  );
};

export default ToastProvider;