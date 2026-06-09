import { FaTimes } from 'react-icons/fa';

export default function Alert({ type, variant, message, children, onClose, className = '' }) {
  // Use either type or variant
  const alertType = type || variant || 'error';
  
  // Map aliases
  const normalizedType = alertType === 'danger' ? 'error' : alertType;

  const styles = {
    error: 'bg-red-50 border-l-4 border-red-500 text-red-700 p-4',
    success: 'bg-green-50 border-l-4 border-green-500 text-green-700 p-4',
    warning: 'bg-yellow-50 border-l-4 border-yellow-500 text-yellow-700 p-4',
    info: 'bg-blue-50 border-l-4 border-blue-500 text-blue-700 p-4',
  };

  const icons = {
    error: '❌',
    success: '✅',
    warning: '⚠️',
    info: 'ℹ️',
  };

  const content = message || children;
  if (!content) return null;

  return (
    <div className={`rounded-lg mb-6 relative group ${styles[normalizedType] || styles.error} ${className}`}>
      <div className="flex items-start space-x-3">
        <span className="text-lg leading-none mt-0.5">{icons[normalizedType] || icons.error}</span>
        <div className="font-medium flex-1">{content}</div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 -mr-1 -mt-1 hover:bg-black/5 rounded-full transition-colors shrink-0"
            aria-label="Dismiss alert"
          >
            <FaTimes className="w-3.5 h-3.5 opacity-50 hover:opacity-100" />
          </button>
        )}
      </div>
    </div>
  );
}