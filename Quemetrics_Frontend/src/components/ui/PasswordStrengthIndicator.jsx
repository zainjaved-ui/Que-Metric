import { useMemo } from 'react';
import { FaCheck, FaTimes } from 'react-icons/fa';

const rules = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'One number', test: (p) => /\d/.test(p) },
  { label: 'One special character (@$!%*?&#)', test: (p) => /[@$!%*?&#]/.test(p) },
];

export default function PasswordStrengthIndicator({ password = '', confirmPassword }) {
  const results = useMemo(() => rules.map((r) => ({ ...r, passed: r.test(password) })), [password]);
  const passedCount = results.filter((r) => r.passed).length;

  const strength = passedCount <= 2 ? 'Weak' : passedCount <= 4 ? 'Medium' : 'Strong';
  const strengthColor =
    strength === 'Weak' ? 'bg-red-500' : strength === 'Medium' ? 'bg-amber-500' : 'bg-green-500';
  const strengthTextColor =
    strength === 'Weak' ? 'text-red-600' : strength === 'Medium' ? 'text-amber-600' : 'text-green-600';

  if (!password) return null;

  const passwordsMatch = confirmPassword !== undefined && confirmPassword === password && password.length > 0;
  const showMismatch = confirmPassword !== undefined && confirmPassword.length > 0 && confirmPassword !== password;

  return (
    <div className="space-y-2 mt-1">
      {/* Strength bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${strengthColor}`}
            style={{ width: `${(passedCount / rules.length) * 100}%` }}
          />
        </div>
        <span className={`text-xs font-medium ${strengthTextColor}`}>{strength}</span>
      </div>

      {/* Checklist */}
      <ul className="space-y-1">
        {results.map((r, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            {r.passed ? (
              <FaCheck className="h-3 w-3 text-green-500 shrink-0" />
            ) : (
              <FaTimes className="h-3 w-3 text-red-400 shrink-0" />
            )}
            <span className={r.passed ? 'text-green-700' : 'text-gray-500'}>{r.label}</span>
          </li>
        ))}
        {confirmPassword !== undefined && (
          <li className="flex items-center gap-2 text-xs">
            {passwordsMatch ? (
              <FaCheck className="h-3 w-3 text-green-500 shrink-0" />
            ) : (
              <FaTimes className="h-3 w-3 text-red-400 shrink-0" />
            )}
            <span className={passwordsMatch ? 'text-green-700' : showMismatch ? 'text-red-600' : 'text-gray-500'}>
              {showMismatch ? 'Passwords do not match' : 'Passwords match'}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
