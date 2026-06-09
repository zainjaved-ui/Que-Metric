import React, { useState, useContext } from 'react';
import { FaTimes, FaKey } from 'react-icons/fa';
import { TournamentContext } from '../../contexts/TournamentContext';
import Button from '../ui/Button';

export default function JoinCodeModal({ isOpen, onClose, onSuccess }) {
  const context = useContext(TournamentContext);
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleJoinWithCode = async () => {
    if (!joinCode.trim()) {
      setError('Please enter a join code');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (context?.registerWithJoinCode) {
        const result = await context.registerWithJoinCode({
          joinCode: joinCode.toUpperCase().trim(),
        });

        if (result.success) {
          setSuccess(true);
          setJoinCode('');
          setTimeout(() => {
            onSuccess?.();
            onClose();
          }, 2000);
        } else {
          setError(result.error || 'Failed to register with join code');
        }
      } else {
        setError('Tournament context not available');
      }
    } catch (err) {
      setError(err.message || 'Failed to register with join code');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FaKey className="text-blue-600" />
            Join with Code
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            <FaTimes />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {success ? (
            <div className="text-center space-y-3">
              <div className="text-green-600 text-4xl">✓</div>
              <p className="text-lg font-semibold text-gray-900">Success!</p>
              <p className="text-gray-600">You've been registered for the tournament.</p>
            </div>
          ) : (
            <>
              <p className="text-gray-600 text-sm">
                Enter the join code provided by the tournament organizer to register.
              </p>

              {/* Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Join Code
                </label>
                <input
                  type="text"
                  placeholder="e.g., ABC12345"
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  disabled={loading}
                  maxLength="20"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg font-mono text-lg text-center tracking-widest focus:outline-none focus:border-blue-500 disabled:bg-gray-100"
                />
                <p className="text-xs text-gray-500 mt-1">Leave blank spaces (accept only letters and numbers)</p>
              </div>

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {/* Info Box */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                <p className="font-semibold mb-1">Tips:</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li>Code is case-insensitive</li>
                  <li>Codes typically expire after a set date</li>
                  <li>Some codes have usage limits</li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex gap-3 p-6 border-t border-gray-200">
            <Button
              onClick={onClose}
              variant="secondary"
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleJoinWithCode}
              variant="primary"
              className="flex-1"
              disabled={loading || !joinCode.trim()}
              isLoading={loading}
            >
              {loading ? 'Registering...' : 'Register'}
            </Button>
          </div>
        )}

        {success && (
          <div className="flex gap-3 p-6 border-t border-gray-200">
            <Button
              onClick={() => {
                onClose();
                onSuccess?.();
              }}
              variant="primary"
              className="w-full"
            >
              Done
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
