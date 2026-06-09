import { useState, useContext, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import apiClient from '../../contexts/apiClient';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Alert from '../../components/ui/Alert';
import RoleSelector from '../../components/RoleSelector/RoleSelector';
import { FaChartLine, FaCheckCircle, FaArrowRight, FaEnvelope } from 'react-icons/fa';
import Layout from '../../components/Layout/Layout';

export default function Login() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const redirectPath = searchParams.get('redirect');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  // Set only when the player arrived at /login from a club-invite "Login to
  // Join Club" button. Drives the contextual banner above the login form
  // and is cleared the moment login succeeds.
  const [pendingClubJoin, setPendingClubJoin] = useState(null);

  // ✅ Role selector state
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [roleSelectionToken, setRoleSelectionToken] = useState(null);  // ✅ Use token instead of credentials

  const { login, setUserAfterRoleSelection } = useContext(AuthContext);

  // If redirect exists in URL, save it to localStorage for AuthContext to pick up
  useEffect(() => {
    if (redirectPath) {
      localStorage.setItem('redirectAfterLogin', redirectPath);
    }
  }, [redirectPath]);

  // Read the optional pendingClubJoin entry once on mount. Set by the club
  // invitation page ("Login to Join Club" button). Absent on every other
  // login flow, so the banner is invisible by default.
  useEffect(() => {
    const raw = localStorage.getItem('pendingClubJoin');
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.clubName) setPendingClubJoin(parsed);
    } catch {
      // Stale/corrupted entry — drop it so we don't show a broken banner.
      localStorage.removeItem('pendingClubJoin');
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Basic email validation
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }

    setRequiresVerification(false);
    setLoading(true);

    const result = await login(email, password, null, rememberMe);

    console.log('[handleSubmit] Login result:', result);

    if (result.success) {
      // ✅ Check if role selection is required
      if (result.requiresRoleSelection && result.availableRoles && result.roleSelectionToken) {
        console.log('[handleSubmit] Multiple roles detected, showing selector');
        // ✅ Store ONLY the token (NOT credentials)
        setRoleSelectionToken(result.roleSelectionToken);
        setAvailableRoles(result.availableRoles);
        setShowRoleSelector(true);
        setLoading(false);
        return;
      }

      // ✅ Single role - Normal login flow (AuthContext already navigated)
      console.log('[handleSubmit] Single role, redirecting to dashboard');
      // Invite banner has served its purpose — drop the stash before the
      // redirect-after-login takes the player back to /club/join/<token>.
      localStorage.removeItem('pendingClubJoin');
      setLoading(false);
    } else {
      console.log('[handleSubmit] Login failed:', result.error);
      setError(result.error);

      // ✅ Handle pending account verification
      if (result.requiresVerification) {
        setRequiresVerification(true);
        setPendingEmail(result.email || email);
      }

      setLoading(false);
    }
  };

  // ✅ Handle role selection from modal
  const handleRoleSelection = async (selectedRole) => {
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      // ✅ Call NEW endpoint with ONLY token + role (NO password)
      const { data } = await apiClient.post('/auth/confirm-role-selection', {
        roleSelectionToken,  // ← Backend-generated temporary token
        role: selectedRole   // ← User's selected role
      });

      if (data.success && data.data.accessToken) {
        // ✅ Store tokens based on Remember Me
        if (rememberMe) {
          localStorage.setItem('accessToken', data.data.accessToken);
          localStorage.setItem('refreshToken', data.data.refreshToken);
          localStorage.setItem('user', JSON.stringify(data.data.user));
          localStorage.setItem('email', email);
          sessionStorage.removeItem('accessToken');
          sessionStorage.removeItem('refreshToken');
          sessionStorage.removeItem('user');
          sessionStorage.removeItem('email');
        } else {
          sessionStorage.setItem('accessToken', data.data.accessToken);
          sessionStorage.setItem('refreshToken', data.data.refreshToken);
          sessionStorage.setItem('user', JSON.stringify(data.data.user));
          sessionStorage.setItem('email', email);
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('user');
          localStorage.removeItem('email');
        }

        // ✅ Redirect to dashboard
        const activeRole = data.data.user.role;
        const roleRoutes = {
          player: '/player/dashboard',
          organization: '/organization/dashboard',
          venue_owner: '/venue-owner/dashboard',
          super_admin: '/admin/dashboard',
        };

        // ✅ Update AuthContext with user data BEFORE navigating
        setUserAfterRoleSelection(data.data.user);

        // Invite banner has served its purpose — clear before navigating.
        localStorage.removeItem('pendingClubJoin');

        setShowRoleSelector(false);
        navigate(roleRoutes[activeRole] || '/');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to confirm role selection. Please try again.');
      console.error('[handleRoleSelection] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data } = await apiClient.post('/auth/resend-verification', { email: pendingEmail });
      setSuccess(data.message || 'Verification email sent! Please check your inbox.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to resend verification email.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-[80vh] bg-gradient-to-br from-[#FFFBF4] to-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Limited Content */}
            <div className="space-y-8">
              {/*   */}



              <h1 className="text-3xl md:text-4xl font-bold text-[#132F45] leading-tight">
                Welcome Back to Professional League Management
              </h1>

              <p className="text-lg text-[#132F45] opacity-90">
                Access your dashboard to manage leagues, tournaments, and player statistics with our comprehensive platform.
              </p>

              {/* Simple Key Points */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="shrink-0">
                    <FaCheckCircle className="h-5 w-5 text-[#132F45]" />
                  </div>
                  <span className="text-[#132F45]">Secure enterprise-grade platform</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="shrink-0">
                    <FaCheckCircle className="h-5 w-5 text-[#132F45]" />
                  </div>
                  <span className="text-[#132F45]">Multi-role access for all users</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="shrink-0">
                    <FaCheckCircle className="h-5 w-5 text-[#132F45]" />
                  </div>
                  <span className="text-[#132F45]">Real-time statistics and analytics</span>
                </div>
              </div>

              {/* Simple Stats */}
              {/* <div className="grid grid-cols-2 gap-4 mt-8">
                <div className="bg-white border border-[#D1D5DB] rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-[#132F45]">500+</div>
                  <div className="text-sm text-[#132F45] opacity-80">Active Leagues</div>
                </div>
                <div className="bg-white border border-[#D1D5DB] rounded-lg p-4 text-center">
                  <div className="text-xl font-bold text-[#132F45]">10K+</div>
                  <div className="text-sm text-[#132F45] opacity-80">Players</div>
                </div>
              </div> */}

              <div className="pt-8 border-t border-[#D1D5DB]">
                <Link
                  to="/register/player"
                  className="inline-flex items-center text-[#132F45] font-medium hover:text-[#1A3F5C] transition-colors"
                >
                  Don't have an account?
                  <FaArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Right Column - Login Form */}
            <div className="bg-white rounded-xl shadow-xl p-8 border border-[#D1D5DB]">
              {pendingClubJoin && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-2">
                  <span className="text-blue-600">🏆</span>
                  <p className="text-blue-800 text-sm font-medium">
                    You've been invited to join <strong>{pendingClubJoin.clubName}</strong> — login to accept your invitation
                  </p>
                </div>
              )}
              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-[#132F45]">Login to Your Account</h2>
                <p className="text-[#132F45] opacity-80 mt-2">Enter your credentials to continue</p>
              </div>

              <Alert type="error" message={error} onClose={() => setError('')} />
              <Alert type="success" message={success} onClose={() => setSuccess('')} />

              {/* ✅ Resend Verification Button */}
              {requiresVerification && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-4">
                  <div className="flex items-start space-x-3">
                    <FaEnvelope className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-medium text-amber-800">
                        Email Verification Required
                      </h3>
                      <p className="text-sm text-amber-700 mt-1">
                        Please verify your email address before logging in.
                      </p>
                      <Button
                        onClick={handleResendVerification}
                        loading={resendLoading}
                        variant="outline"
                        className="mt-3 w-full"
                      >
                        Resend Verification Email
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                <Input
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                />

                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />

                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <input
                      id="remember-me"
                      name="remember-me"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 text-[#132F45] focus:ring-[#132F45] border-[#D1D5DB] rounded"
                    />
                    <label htmlFor="remember-me" className="ml-2 block text-sm text-[#132F45]">
                      Remember me
                    </label>
                  </div>

                  <Link
                    to="/forgot-password"
                    className="text-sm font-medium text-[#132F45] hover:text-[#1A3F5C] transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>

                <Button
                  type="submit"
                  loading={loading}
                  className="w-full"
                  variant="primary"
                >
                  Sign In
                </Button>
              </form>

              <div className="mt-8">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[#D1D5DB]"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-4 bg-white text-[#132F45]">New to Cuemetrics?</span>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <Link
                    to="/register/player"
                    className="px-4 py-3 bg-[#FFFBF4] border border-[#D1D5DB] text-[#132F45] rounded-lg hover:bg-[#132F45] hover:text-[#FFFBF4] transition-colors text-center font-medium hover:shadow-md"
                  >
                    Register as Player
                  </Link>
                  <Link
                    to="/register/organization"
                    className="px-4 py-3 bg-[#FFFBF4] border border-[#D1D5DB] text-[#132F45] rounded-lg hover:bg-[#132F45] hover:text-[#FFFBF4] transition-colors text-center font-medium hover:shadow-md"
                  >
                    Register as Organization
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ Role Selector Modal */}
      <RoleSelector
        isOpen={showRoleSelector}
        onClose={() => setShowRoleSelector(false)}
        availableRoles={availableRoles}
        email={email}
        onSelectRole={handleRoleSelection}
      />
    </Layout>
  );
}