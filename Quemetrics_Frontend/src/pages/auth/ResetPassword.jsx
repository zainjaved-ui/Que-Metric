import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import apiClient from '../../contexts/apiClient';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Alert from '../../components/ui/Alert';
import PasswordStrengthIndicator from '../../components/ui/PasswordStrengthIndicator';
import { FaLock, FaCheckCircle } from 'react-icons/fa';
import Layout from '../../components/Layout/Layout';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Invalid reset link. No token provided.');
    }
  }, [token]);

  const validate = () => {
    if (!password) return 'New password is required.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/.test(password))
      return 'Password must contain uppercase, lowercase, number, and special character (@$!%*?&#).';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      await apiClient.post('/auth/reset-password', { resetToken: token, newPassword: password });
      setSuccess('Password reset successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-[80vh] bg-gradient-to-br from-[#FFFBF4] to-white flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full">
          <div className="grid lg:grid-cols-1 gap-8">
            {/* Card */}
            <div className="bg-white rounded-xl shadow-xl p-8 border border-[#D1D5DB]">
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-[#132F45]">Reset Your Password</h1>
                <p className="text-[#132F45] opacity-70 mt-2">Enter and confirm your new password below.</p>
              </div>

              <Alert type="error" message={error} />

              {success ? (
                <div className="text-center space-y-4">
                  <FaCheckCircle className="h-12 w-12 text-green-500 mx-auto" />
                  <Alert type="success" message={success} />
                  <p className="text-sm text-[#132F45] opacity-70">You will be redirected to the login page shortly.</p>
                </div>
              ) : token ? (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    label="New Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min 8 chars, uppercase, number, special char"
                    icon={<FaLock className="h-4 w-4 text-[#132F45] opacity-50" />}
                    required
                  />

                  <Input
                    label="Confirm New Password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your new password"
                    icon={<FaLock className="h-4 w-4 text-[#132F45] opacity-50" />}
                    required
                  />

                  <PasswordStrengthIndicator password={password} confirmPassword={confirmPassword} />

                  <Button type="submit" loading={loading} className="w-full mt-2" variant="primary">
                    Set New Password
                  </Button>
                </form>
              ) : null}

              <div className="mt-6 text-center text-sm">
                <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
                  ← Back to Login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
