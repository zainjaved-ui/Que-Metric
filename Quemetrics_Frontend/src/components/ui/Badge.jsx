// components/ui/Badge/index.jsx
import React from 'react';

const Badge = ({ 
  variant = 'default', 
  text, 
  icon, 
  size = 'md', 
  rounded = 'md',
  className = '',
  ...props 
}) => {
  const variants = {
    default: 'bg-gray-100 text-gray-800 border-gray-300',
    primary: 'bg-blue-100 text-blue-800 border-blue-300',
    secondary: 'bg-gray-100 text-gray-800 border-gray-300',
    success: 'bg-green-100 text-green-800 border-green-300',
    danger: 'bg-red-100 text-red-800 border-red-300',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    info: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    purple: 'bg-purple-100 text-purple-800 border-purple-300',
    pink: 'bg-pink-100 text-pink-800 border-pink-300',
  };

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
    lg: 'px-3 py-1.5 text-base',
  };

  const roundedStyles = {
    none: 'rounded-none',
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    full: 'rounded-full',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        font-medium
        border
        ${sizes[size]}
        ${roundedStyles[rounded]}
        ${variants[variant]}
        ${className}
      `}
      {...props}
    >
      {icon && <span className="flex items-center">{icon}</span>}
      {text}
    </span>
  );
};

export default Badge;