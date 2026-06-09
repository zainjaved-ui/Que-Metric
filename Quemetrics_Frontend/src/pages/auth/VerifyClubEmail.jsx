import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { FaCheckCircle, FaTimesCircle, FaSpinner } from 'react-icons/fa';
import Layout from '../../components/Layout/Layout';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function VerifyClubEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token');
  const clubId = searchParams.get('clubId');

  const [status, setStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('');
  const [clubName, setClubName] = useState('');
  const [loading, setLoading] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [errorDetails, setErrorDetails] = useState(null);

  const verifyClubEmail = async () => {
    try {

      // Use axios directly without authentication interceptors
      const response = await axios.post(
        `${API_URL}/clubs/${clubId}/verify-email`,
        { token },
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const { data } = response;

      setStatus('success');
      setMessage(data.message || 'Club email verified successfully! Your club is now active.');
      setClubName(data.data?.name || '');

      // Redirect to club management after 4 seconds
      setTimeout(() => {
        navigate('/organization/clubmanagement');
      }, 4000);

    } catch (error) {
      const errorData = error.response?.data;

      setStatus('error');
      setMessage(
        errorData?.error ||
        error.message ||
        'Club email verification failed. The link may be expired or invalid.'
      );

      // Check if we should suggest resending email
      if (errorData?.suggestResend) {
        setCanResend(true);
      }

      // Store additional error details for debugging
      setErrorDetails(errorData);

      console.error('Verification error:', {
        error: errorData?.error,
        suggestResend: errorData?.suggestResend,
        details: errorData
      });
    }
  };

  useEffect(() => {
    if (token && clubId) {
      verifyClubEmail();
    } else {
      setStatus('error');
      setMessage('Invalid verification link. Missing token or club ID.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, clubId]);

  const handleResendVerification = async () => {
    setLoading(true);
    try {
      const response = await axios.post(
        `${API_URL}/clubs/${clubId}/resend-verification`,
        {},
        { timeout: 30000 }
      );

      alert('✓ Verification email sent! Please check your email and click the verification link.');
      setStatus('verifying');
    } catch (error) {
      const errorMsg = error.response?.data?.error || error.message || 'Failed to resend verification email.';
      console.error('Resend error:', errorMsg);
      alert('Error: ' + errorMsg);
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
                  Verifying Your Club
                </h2>
                <p className="text-[#132F45] opacity-80">
                  Please wait while we verify your club email...
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
                  Verification Successful!
                </h2>
                <div className="space-y-4">
                  <p className="text-gray-700">
                    {clubName && <span className="font-semibold">{clubName}</span>} has been verified and is now active.
                  </p>
                  <p className="text-sm text-gray-600">
                    {message}
                  </p>
                  <p className="text-sm text-gray-500">
                    You will be redirected to the club management page in a few seconds...
                  </p>
                </div>
                <Button
                  onClick={() => navigate('/organization/clubmanagement')}
                  className="w-full mt-4"
                >
                  Go to Club Management
                </Button>
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
                <Alert variant="error" className="text-left">
                  {message}
                </Alert>
                <div className="space-y-3">
                  <p className="text-sm text-gray-600">
                    The verification link may be expired or invalid. Please try one of the following:
                  </p>
                  <ul className="text-sm text-gray-600 text-left space-y-2 list-disc list-inside">
                    <li>Check that you clicked the correct link from your email</li>
                    <li>Request a new verification email</li>
                    <li>Contact support if the problem persists</li>
                  </ul>
                </div>
                <div className="space-y-2 pt-4">
                  <Button
                    onClick={handleResendVerification}
                    disabled={loading}
                    className="w-full"
                  >
                    {loading ? 'Sending...' : 'Request New Verification Email'}
                  </Button>
                  <Link to="/organization/clubmanagement" className="block">
                    <Button variant="outline" className="w-full">
                      Go to Club Management
                    </Button>
                  </Link>
                  <Link to="/" className="block">
                    <Button variant="outline" className="w-full">
                      Back to Home
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-xs text-gray-500 text-center">
                Having trouble? Contact our{' '}
                <a href="mailto:support@cuemetrics.com" className="text-blue-600 hover:underline">
                  support team
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
