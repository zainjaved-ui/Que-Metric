import { AuthContext } from '../../../../contexts/AuthContext';
import { useState, useEffect , useContext } from 'react';
import { useNavigate } from 'react-router-dom';

import apiClient from '../../../../contexts/apiClient';
import Button from '../../../ui/Button';
import Input from '../../../ui/Input';
import Card from '../../../ui/Card';
import Alert from '../../../ui/Alert';
import Loader from '../../../ui/Loader';

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [notificationPrefs, setNotificationPrefs] = useState({
    tournamentInvites: true,
    systemNotifications: true,
  });

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Notification preferences state
  const [savingNotifications, setSavingNotifications] = useState(false);
  const [notificationError, setNotificationError] = useState('');
  const [notificationSuccess, setNotificationSuccess] = useState('');

  // Delete account state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    fetchNotificationPreferences();
  }, []);

  const fetchNotificationPreferences = async () => {
    try {
      const { data } = await apiClient.get('/auth/preferences/notifications');
      setEmail(data.data.email);
      setNotificationPrefs(data.data.notificationPreferences);
    } catch (error) {
      console.error('Failed to fetch notification preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }

    setChangingPassword(true);

    try {
      await apiClient.post('/auth/change-password', { currentPassword: passwordData.currentPassword, newPassword: passwordData.newPassword });
      setPasswordSuccess('Password changed successfully');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (error) {
      setPasswordError(error.response?.data?.error || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleNotificationToggle = async (e) => {
    const newValue = e.target.checked;
    setSavingNotifications(true);
    setNotificationError('');
    setNotificationSuccess('');

    try {
      await apiClient.put('/auth/preferences/notifications', newValue);
      setNotificationPrefs((prev) => ({ ...prev, tournamentInvites: newValue }));
      setNotificationSuccess('Notification preferences updated');
    } catch (error) {
      setNotificationError(error.response?.data?.error || 'Failed to update preferences');
    } finally {
      setSavingNotifications(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Please enter your password to confirm');
      return;
    }

    setDeleteError('');
    setDeletingAccount(true);

    try {
      await apiClient.delete('/auth/account', { data: { password: deletePassword } });
      logout();
      navigate('/login');
    } catch (error) {
      setDeleteError(error.response?.data?.error || 'Failed to delete account');
      setDeletingAccount(false);
    }
  };

  const getDashboardPath = () => {
    switch (user?.role) {
      case 'player':
        return '/player/dashboard';
      case 'organization':
        return '/organization/dashboard';
      case 'venue_owner':
        return '/venue-owner/dashboard';
      case 'super_admin':
        return '/admin/dashboard';
      default:
        return '/';
    }
  };

  if (loading) return <Loader />;

  return (
    <div className="min-h-screen bg-[#FFFBF4]">
      {/* Header Section - Full width with responsive text */}
      <div className="w-full px-4 py-6 border-b border-[#D1D5DB]">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-lg font-bold text-[#132F45] sm:text-3xl">Account Settings</h1>
          <Button 
            variant="secondary" 
            onClick={() => navigate(getDashboardPath())}
            className="w-full text-xs py-2 border border-[#D1D5DB] text-[#132F45] hover:bg-[#132F45] hover:text-white sm:w-auto sm:text-sm sm:py-2"
          >
            Back to Dashboard
          </Button>
        </div>
      </div>

      {/* Main Content - Single column for mobile, 2 columns for desktop */}
      <div className="w-full px-4 py-6">
        <div className="space-y-6 lg:grid lg:grid-cols-2 lg:gap-6 lg:space-y-0">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Email Display - Small on mobile */}
            <Card className="w-full border border-[#D1D5DB] bg-white">
              <div className="p-4">
                <h2 className="text-sm font-semibold mb-2 text-[#132F45] sm:text-xl">Email Address</h2>
                <p className="text-xs text-[#132F45] opacity-80 break-all sm:text-base">{email}</p>
                <p className="text-xs text-[#132F45] opacity-60 mt-1 sm:text-sm">
                  Contact support to change your email address.
                </p>
              </div>
            </Card>

            {/* Change Password - Small on mobile */}
            <Card className="w-full border border-[#D1D5DB] bg-white">
              <div className="p-4">
                <h2 className="text-sm font-semibold mb-3 text-[#132F45] sm:text-xl">Change Password</h2>
                <Alert type="error" message={passwordError} className="text-xs sm:text-sm" />
                <Alert type="success" message={passwordSuccess} className="text-xs sm:text-sm" />

                <form onSubmit={handlePasswordChange} className="space-y-3">
                  <Input
                    label="Current Password"
                    type="password"
                    value={passwordData.currentPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({ ...prev, currentPassword: e.target.value }))
                    }
                    required
                    className="text-xs sm:text-sm border-[#D1D5DB] focus:border-[#132F45] focus:ring-[#132F45]"
                    inputClassName="py-2 sm:py-2"
                  />
                  <Input
                    label="New Password"
                    type="password"
                    value={passwordData.newPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({ ...prev, newPassword: e.target.value }))
                    }
                    required
                    className="text-xs sm:text-sm border-[#D1D5DB] focus:border-[#132F45] focus:ring-[#132F45]"
                    inputClassName="py-2 sm:py-2"
                  />
                  <Input
                    label="Confirm New Password"
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) =>
                      setPasswordData((prev) => ({ ...prev, confirmPassword: e.target.value }))
                    }
                    required
                    className="text-xs sm:text-sm border-[#D1D5DB] focus:border-[#132F45] focus:ring-[#132F45]"
                    inputClassName="py-2 sm:py-2"
                  />
                  <Button 
                    type="submit" 
                    loading={changingPassword}
                    className="w-full text-xs py-2 bg-gradient-to-r from-[#132F45] to-[#1A3F5C] text-white hover:from-[#1A3F5C] hover:to-[#132F45] sm:text-sm sm:py-2"
                  >
                    Change Password
                  </Button>
                </form>
              </div>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Notification Preferences - Small on mobile */}
            <Card className="w-full border border-[#D1D5DB] bg-white">
              <div className="p-4">
                <h2 className="text-sm font-semibold mb-3 text-[#132F45] sm:text-xl">Notification Preferences</h2>
                <Alert type="error" message={notificationError} className="text-xs sm:text-sm" />
                <Alert type="success" message={notificationSuccess} className="text-xs sm:text-sm" />

                <div className="space-y-3">
                  <label className="flex items-center justify-between p-3 bg-[#FFFBF4] border border-[#D1D5DB] rounded-lg hover:border-[#132F45] transition-colors">
                    <div className="flex-1">
                      <span className="block text-xs font-medium text-[#132F45] mb-1 sm:text-sm">Tournament Invites</span>
                      <p className="text-xs text-[#132F45] opacity-70 sm:text-sm">
                        Receive notifications when invited to tournaments
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={notificationPrefs.tournamentInvites}
                      onChange={handleNotificationToggle}
                      disabled={savingNotifications}
                      className="h-4 w-4 text-[#132F45] border-[#D1D5DB] rounded focus:ring-[#132F45] focus:ring-2 sm:h-5 sm:w-5"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 bg-[#F5F5F5] border border-[#D1D5DB] rounded-lg opacity-70">
                    <div className="flex-1">
                      <span className="block text-xs font-medium text-[#132F45] mb-1 sm:text-sm">System Notifications</span>
                      <p className="text-xs text-[#132F45] opacity-70 sm:text-sm">
                        Important system updates and announcements
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={true}
                      disabled
                      className="h-4 w-4 text-gray-400 border-[#D1D5DB] rounded sm:h-5 sm:w-5"
                    />
                  </label>
                  <p className="text-xs text-[#132F45] opacity-60 sm:text-xs">
                    System notifications cannot be disabled as they contain important account
                    information.
                  </p>
                </div>
              </div>
            </Card>

            {/* Delete Account - Small on mobile */}
            <Card className="w-full border-2 border-red-200 bg-white">
              <div className="p-4">
                <h2 className="text-sm font-semibold mb-3 text-red-600 sm:text-xl">Danger Zone</h2>
                <p className="text-xs text-[#132F45] opacity-80 mb-3 sm:text-sm">
                  Once you delete your account, there is no going back. Please be certain.
                </p>
                <Button 
                  variant="danger" 
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full text-xs py-2 bg-red-600 hover:bg-red-700 text-white sm:text-sm sm:py-2"
                >
                  Delete Account
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal - Small on mobile */}
      {showDeleteModal && (
<div className="fixed inset-0 backdrop-blur-sm bg-white/10 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-4 max-w-md w-full mx-auto border border-[#D1D5DB]">
            <h3 className="text-sm font-bold mb-3 text-red-600 sm:text-xl">Delete Account</h3>
            <p className="text-xs text-[#132F45] opacity-80 mb-3 sm:text-sm">
              Are you sure you want to delete your account? This action is permanent and
              cannot be undone. All your data will be lost.
            </p>

            <Alert type="error" message={deleteError} className="text-xs sm:text-sm" />

            <Input
              label="Enter your password to confirm"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Your password"
              className="text-xs sm:text-sm border-[#D1D5DB] focus:border-[#132F45] focus:ring-[#132F45]"
              inputClassName="py-2 sm:py-2"
            />

            <div className="flex flex-col sm:flex-row gap-3 mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeletePassword('');
                  setDeleteError('');
                }}
                className="w-full text-xs py-2 border border-[#D1D5DB] text-[#132F45] hover:bg-[#132F45] hover:text-white sm:text-sm sm:py-2"
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteAccount}
                loading={deletingAccount}
                className="w-full text-xs py-2 bg-red-600 hover:bg-red-700 text-white sm:text-sm sm:py-2"
              >
                Delete Account
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}