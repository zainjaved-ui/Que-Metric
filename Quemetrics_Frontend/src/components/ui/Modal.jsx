// components/ui/Modal/index.jsx
import React, { useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';

const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  showCloseButton = true,
  closeOnOutsideClick = true,
  className = '',
  footer,
  loading = false
}) => {
  // Prevent scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  // Handle Escape key press
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Handle outside click
  const handleOutsideClick = (e) => {
    if (closeOnOutsideClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    '2xl': 'max-w-6xl',
    full: 'max-w-full mx-4'
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity"

        onClick={handleOutsideClick}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div className="flex min-h-full items-center justify-center p-4 text-center sm:p-0">
        <div 
          className={`
            relative transform overflow-hidden rounded-2xl bg-white text-left shadow-2xl transition-all
            w-full
            ${sizeClasses[size]}
            ${className}
          `}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          {/* Loading Overlay */}
          {loading && (
            <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center z-10">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#132F45]"></div>
            </div>
          )}

          {/* Header */}
          {(title || showCloseButton) && (
            <div className="sticky top-0 z-10 bg-white px-5 pt-5 pb-3 border-b border-[#D1D5DB]">
              <div className="flex items-center justify-between">
                {title && (
                  <h3 
                    id="modal-title"
                    className="text-base font-bold leading-6 text-[#132F45]"
                  >
                    {title}
                  </h3>
                )}
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-full p-1.5 text-[#132F45] opacity-70 hover:opacity-100 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#132F45] transition-colors"
                    aria-label="Close"
                  >
                    <FaTimes className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Content */}
          <div className="px-5 py-3 max-h-[70vh] overflow-y-auto">
            {children}
          </div>

          {/* Footer */}
          {footer && (
            <div className="sticky bottom-0 bg-white px-5 py-3 border-t border-[#D1D5DB]">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Modal Header Component
export const ModalHeader = ({ children, className = '' }) => (
  <div className={`mb-4 ${className}`}>
    {children}
  </div>
);

// Modal Body Component
export const ModalBody = ({ children, className = '' }) => (
  <div className={`mb-4 ${className}`}>
    {children}
  </div>
);

// Modal Footer Component
export const ModalFooter = ({ children, className = '' }) => (
  <div className={`flex justify-end space-x-2 pt-3 border-t border-[#D1D5DB] ${className}`}>
    {children}
  </div>
);

// Modal Section Component
export const ModalSection = ({ title, children, className = '' }) => (
  <div className={`mb-4 ${className}`}>
    {title && (
      <h4 className="text-base font-semibold text-[#132F45] mb-2">
        {title}
      </h4>
    )}
    <div className="text-[#132F45]">
      {children}
    </div>
  </div>
);

export default Modal;