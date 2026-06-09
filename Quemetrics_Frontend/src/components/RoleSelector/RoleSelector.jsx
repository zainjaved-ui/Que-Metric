import { useState, useEffect, useCallback } from 'react';
import { FaUser, FaBuilding, FaTimes } from 'react-icons/fa';
import Button from '../ui/Button';

export default function RoleSelector({ isOpen, onClose, availableRoles, email, onSelectRole }) {
  const [selectedRole, setSelectedRole] = useState(null);
  const [loading, setLoading] = useState(false);

  // Memoize handleSelectRole to keep it stable for the effect dependency
  const handleSelectRole = useCallback(async () => {
    if (!selectedRole) return;

    setLoading(true);
    await onSelectRole(selectedRole);
    setLoading(false);
  }, [selectedRole, onSelectRole]);

  // Handle Enter key to continue
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if inside an input/textarea (though none exist, but safe)
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
      }
      if (e.key === 'Enter' && selectedRole && !loading) {
        handleSelectRole();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, selectedRole, loading, handleSelectRole]);

  if (!isOpen) return null;

  const getRoleInfo = (role) => {
    const roleConfig = {
      player: {
        title: 'Player Profile',
        description: 'Access your player dashboard, stats, bookings, and match results',
        icon: FaUser,
        color: 'bg-blue-500',
        hoverColor: 'hover:bg-blue-50',
        borderColor: 'border-blue-500',
      },
      organization: {
        title: 'Organization Profile',
        description: 'Manage leagues, tournaments, players, and venue owners',
        icon: FaBuilding,
        color: 'bg-green-500',
        hoverColor: 'hover:bg-green-50',
        borderColor: 'border-green-500',
      },
      venue_owner: {
        title: 'Venue Owner Profile',
        description: 'Manage your venues, approve league requests, and view bookings',
        icon: FaBuilding,
        color: 'bg-purple-500',
        hoverColor: 'hover:bg-purple-50',
        borderColor: 'border-purple-500',
      },
    };

    return roleConfig[role] || roleConfig.player;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Select Your Profile</h2>
            <p className="text-sm text-gray-600 mt-1">
              You have multiple accounts with <span className="font-semibold">{email}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <FaTimes className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-gray-700 mb-6">
            Which profile would you like to access?
          </p>

          <div className="grid gap-4">
            {availableRoles.map((roleData) => {
              const roleInfo = getRoleInfo(roleData.role);
              const Icon = roleInfo.icon;
              const isSelected = selectedRole === roleData.role;

              return (
                <button
                  key={roleData.role}
                  onClick={() => setSelectedRole(roleData.role)}
                  className={`
                    relative p-6 rounded-lg border-2 transition-all text-left
                    ${isSelected
                      ? `${roleInfo.borderColor} bg-gray-50`
                      : 'border-gray-200 hover:border-gray-300'
                    }
                    ${roleInfo.hoverColor}
                  `}
                >
                  <div className="flex items-start space-x-4">
                    <div className={`${roleInfo.color} text-white p-3 rounded-lg shrink-0`}>
                      <Icon className="h-6 w-6" />
                    </div>

                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-800 mb-1">
                        {roleInfo.title}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {roleInfo.description}
                      </p>

                      {roleData.status === 'Pending' && (
                        <span className="inline-block mt-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
                          Pending Verification
                        </span>
                      )}
                    </div>

                    {isSelected && (
                      <div className="shrink-0">
                        <div className={`${roleInfo.color} text-white rounded-full p-1`}>
                          <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </div>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end space-x-3">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSelectRole}
            disabled={!selectedRole || loading}
            loading={loading}
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}