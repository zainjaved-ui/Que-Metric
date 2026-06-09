import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import apiClient from '../../contexts/apiClient';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { FaCheckCircle, FaTimesCircle, FaSpinner } from 'react-icons/fa';
import Layout from '../../components/Layout/Layout';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const verifyEmail = async () => {
    try {
      const { data } = await apiClient.get('/auth/verify-email', { params: { token } });
      if (data.success) {
        setStatus('success');
        setMessage(data.message);
      } else {
        setStatus('error');
        setMessage(data.error);
      }
    } catch (error) {
      setStatus('error');
      setMessage(error.response?.data?.error || error.message || 'Email verification failed. The link may be expired or invalid.');
    }
  };

  useEffect(() => {
    if (token) {
      verifyEmail();
    } else {
      setStatus('error');
      setMessage('Invalid verification link. No token provided.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleResendVerification = async () => {
    const email = prompt('Please enter your email address:');
    if (!email) return;

    setLoading(true);
    try {
      const { data } = await apiClient.post('/auth/resend-verification', { email });
      alert(data.message || 'Verification email sent! Please check your inbox.');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to resend verification email.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-[80vh] bg-gradient-to-br from-[#FFFBF4] to-white flex items-center justify-center">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-md mx-auto bg-white rounded-xl shadow-xl p-8 border border-[#D1D5DB]">

            {/* Verifying State */}
            {status === 'verifying' && (
              <div className="text-center space-y-6">
                <FaSpinner className="h-16 w-16 text-[#132F45] mx-auto animate-spin" />
                <h2 className="text-2xl font-bold text-[#132F45]">
                  Verifying Your Email
                </h2>
                <p className="text-[#132F45] opacity-80">
                  Please wait while we verify your account...
                </p>
              </div>
            )}

            {/* Success State */}
            {status === 'success' && (
              <div className="text-center space-y-6">
                <div className="bg-green-100 rounded-full p-6 w-24 h-24 mx-auto flex items-center justify-center">
                  <FaCheckCircle className="h-12 w-12 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-[#132F45]">
                  Email Verified!
                </h2>
                <Alert type="success" message={message} />
                <p className="text-[#132F45] opacity-80">
                  Redirecting to login page...
                </p>
                <a href="/login">
                  <Button variant="primary" className="w-full">
                    Go to Login
                  </Button>
                </a>
              </div>
            )}

            {/* Error State */}
            {status === 'error' && (
              <div className="text-center space-y-6">
                <div className="bg-red-100 rounded-full p-6 w-24 h-24 mx-auto flex items-center justify-center">
                  <FaTimesCircle className="h-12 w-12 text-red-600" />
                </div>
                <h2 className="text-2xl font-bold text-[#132F45]">
                  Verification Failed
                </h2>
                <Alert type="error" message={message} />

                <div className="space-y-4 pt-4">
                  <Button
                    onClick={handleResendVerification}
                    loading={loading}
                    variant="primary"
                    className="w-full"
                  >
                    Resend Verification Email
                  </Button>

                  <Link to="/login">
                    <Button variant="outline" className="w-full">
                      Back to Login
                    </Button>
                  </Link>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </Layout>
  );
}
