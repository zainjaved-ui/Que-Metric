import { useState, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Alert from '../../components/ui/Alert';
import PasswordStrengthIndicator from '../../components/ui/PasswordStrengthIndicator';
import {
  FaChartLine,
  FaUser,
  FaEnvelope,
  FaLock,
  FaCheckCircle,
  FaArrowRight,
  FaPhone,
  FaMapMarkerAlt,
  FaCalendar,
  FaInfoCircle,
  FaLightbulb
} from 'react-icons/fa';
import Layout from '../../components/Layout/Layout';
import { DEFAULT_DIAL, getPhoneRule } from '../../utils/countryCodes';
import CountrySelect from '../../components/ui/CountrySelect';

export default function RegisterPlayer() {
  const { registerPlayer } = useContext(AuthContext);
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    dateOfBirth: '',
    experienceLevel: '',
    address: '',
    countryDial: DEFAULT_DIAL,
    mobileNumber: '',
    bio: '',
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Country selector: switch dial code and re-truncate any existing number
    // to the newly-selected country's max length.
    if (name === 'countryDial') {
      const { max } = getPhoneRule(value);
      setFormData((prev) => ({
        ...prev,
        countryDial: value,
        mobileNumber: prev.mobileNumber.slice(0, max),
      }));
      return;
    }

    // Prevent non-numeric characters and limit digits to the selected
    // country's max national-number length.
    if (name === 'mobileNumber') {
      const { max } = getPhoneRule(formData.countryDial);
      const numericValue = value.replace(/\D/g, '').slice(0, max);
      setFormData((prev) => ({
        ...prev,
        [name]: numericValue,
      }));
      return;
    }

    // Only alphabets and spaces for name, max 50 chars
    if (name === 'name') {
      const filteredValue = value.replace(/[^A-Za-z\s]/g, '').slice(0, 50);
      setFormData((prev) => ({
        ...prev,
        [name]: filteredValue,
      }));
      return;
    }

    // Truncate year in dateOfBirth if it exceeds 4 digits
    if (name === 'dateOfBirth') {
      const parts = value.split('-');
      if (parts[0] && parts[0].length > 4) {
        parts[0] = parts[0].slice(0, 4);
        const correctedValue = parts.join('-');
        setFormData((prev) => ({ ...prev, [name]: correctedValue }));
        return;
      }
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateForm = () => {
    if (!formData.name.trim()) return 'Full name is required.';
    if (!/^[A-Za-z\s]+$/.test(formData.name))
      return 'Name must only contain alphabets and spaces.';
    if (formData.name.length > 50)
      return 'Name must not exceed 50 characters.';
    if (!formData.email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email))
      return 'Please provide a valid email address.';
    if (!formData.password || formData.password.length < 8)
      return 'Password must be at least 8 characters.';
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/.test(formData.password))
      return 'Password must contain uppercase, lowercase, number, and special character (@$!%*?&#).';
    if (formData.password !== formData.confirmPassword)
      return 'Passwords do not match.';
    if (!formData.dateOfBirth) return 'Date of birth is required.';
    
    // Check if date is in the future
    if (new Date(formData.dateOfBirth) > new Date())
      return 'Date of birth cannot be in the future.';

    if (!formData.experienceLevel.trim()) return 'Experience level is required.';
    if (!formData.address.trim()) return 'Full address is required.';
    if (!formData.mobileNumber.trim()) return 'Mobile number is required.';
    {
      const { min, max } = getPhoneRule(formData.countryDial);
      const digits = formData.mobileNumber.replace(/\D/g, '');
      if (!/^\d+$/.test(digits))
        return 'Mobile number must contain digits only.';
      if (digits.length < min || digits.length > max)
        return min === max
          ? `Mobile number must be exactly ${min} digits for the selected country.`
          : `Mobile number must be ${min}–${max} digits for the selected country.`;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    const fullPhone = `${formData.countryDial}${formData.mobileNumber}`.replace(/\D/g, '');
    const { countryDial: _cd, ...rest } = formData;
    const result = await registerPlayer({
      ...rest,
      mobileNumber: fullPhone,
      experienceYears: Number(formData.experienceYears),
    });

    if (!result.success) {
      setError(result.error || 'Registration failed.');
      setLoading(false);
    } else {
      // ✅ FIXED: Show verification sent message and redirect to login
      if (result.requiresVerification) {
        setSuccess(
          result.message || 'Registration successful! Check your email to verify your account before logging in.'
        );
        setVerificationSent(true);

        // Redirect to login page after 3 seconds
        setTimeout(() => {
          navigate('/login');
        }, 3000);
      }
      setLoading(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <Layout>
      <div className="min-h-[80vh] bg-gradient-to-br from-[#FFFBF4] to-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 pt-20 sm:pt-24 pb-12">
          <div className="grid lg:grid-cols-2 gap-12 items-start">

            {/* LEFT COLUMN */}
            <div className="space-y-8 self-start lg:sticky lg:top-24">


              <h1 className="text-3xl md:text-4xl font-bold text-[#132F45]">
                Join the Cue Sports Community
              </h1>

              <div className="space-y-4 text-[#132F45]">
                <div className="flex items-center space-x-3">
                  <FaCheckCircle />
                  <span>Track your statistics</span>
                </div>
                <div className="flex items-center space-x-3">
                  <FaCheckCircle />
                  <span>Compete in leagues & tournaments</span>
                </div>
                <div className="flex items-center space-x-3">
                  <FaCheckCircle />
                  <span>Build your verified player profile</span>
                </div>
              </div>

              <div className="pt-8 border-t border-[#D1D5DB]">
                <Link
                  to="/login"
                  className="inline-flex items-center text-[#132F45] font-medium"
                >
                  Already have an account?
                  <FaArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* RIGHT COLUMN - FORM */}
            <div className="bg-white rounded-xl shadow-xl p-8 border border-[#D1D5DB]">
              {verificationSent ? (
                // ✅ Verification sent message
                <>
                  <div className="text-center mb-6">
                    <div className="text-5xl mb-4">✉️</div>
                    <h2 className="text-2xl font-bold text-[#132F45]">Check Your Email!</h2>
                  </div>

                  <Alert type="success" message={success} onClose={() => setSuccess('')} />

                  <div className="space-y-4 text-center text-[#132F45]">
                    <p className="font-medium">We've sent a verification link to your email.</p>
                    <p className="text-sm opacity-80">Click the link in the email to verify your account and activate your player profile.</p>
                    <p className="text-xs opacity-60">The link expires in 24 hours. If you don't see the email, check your spam folder.</p>
                  </div>

                  <div className="mt-8 pt-6 border-t border-[#D1D5DB] space-y-2 text-center">
                    <p className="text-sm text-[#132F45]">
                      After verification, you can{' '}
                      <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
                        log in here
                      </Link>
                    </p>
                    <p className="text-sm text-[#132F45]">
                      Want to register as an organization instead?{' '}
                      <Link to="/register/organization" className="text-indigo-600 hover:text-indigo-700 font-medium">
                        Register as Organizer
                      </Link>
                    </p>
                  </div>
                </>
              ) : (
                // ✅ Registration form
                <>
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-[#132F45]">
                      Register as Player
                    </h2>
                    <p className="text-[#132F45] opacity-80 mt-2">
                      Fill in your details to get started
                    </p>
                  </div>

                  <Alert type="error" message={error} onClose={() => setError('')} />
                  <Alert type="success" message={success} onClose={() => setSuccess('')} />

                  <form onSubmit={handleSubmit} className="space-y-6">

                <Input
                  label="Full Name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  icon={<FaUser />}
                  required
                />

                <Input
                  label="Email Address"
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  icon={<FaEnvelope />}
                  required
                />

                <Input
                  label="Password"
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  icon={<FaLock />}
                  placeholder="Min 8 chars, uppercase, number, special char"
                  required
                />

                <Input
                  label="Confirm Password"
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  icon={<FaLock />}
                  placeholder="Re-enter your password"
                  required
                />

                <PasswordStrengthIndicator
                  password={formData.password}
                  confirmPassword={formData.confirmPassword}
                />

                <Input
                  label="Date of Birth"
                  type="date"
                  name="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                  icon={<FaCalendar />}
                  max={today}
                  required
                />

                <Input
                  label="Experience Level"
                  name="experienceLevel"
                  value={formData.experienceLevel}
                  onChange={handleChange}
                  icon={<FaInfoCircle />}
                  placeholder="e.g. Beginner, 5 years, Advanced"
                  required
                />

                <Input
                  label="Full Address"
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  icon={<FaMapMarkerAlt />}
                  required
                />

                <div className="mb-4">
                  <label className="block text-sm font-medium text-[#132F45] mb-2">
                    Mobile Number
                  </label>
                  <div className="flex gap-2">
                    <CountrySelect
                      name="countryDial"
                      value={formData.countryDial}
                      onChange={handleChange}
                      className="w-36"
                    />
                    <div className="relative flex-1">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
                        <FaPhone />
                      </div>
                      <input
                        type="tel"
                        name="mobileNumber"
                        value={formData.mobileNumber}
                        onChange={handleChange}
                        required
                        placeholder="3001234567"
                        className="w-full px-4 py-3 pl-12 border border-[#D1D5DB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#132F45] focus:border-transparent bg-white text-[#132F45] placeholder-[#132F45] placeholder-opacity-50"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#132F45] mb-2">
                    Bio (Optional)
                  </label>
                  <textarea
                    name="bio"
                    value={formData.bio}
                    onChange={handleChange}
                    rows={3}
                    className="w-full border border-[#D1D5DB] rounded-lg p-3"
                    placeholder="Tell us about yourself..."
                  />
                </div>

                <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200 space-y-2">
                  <p className="font-medium text-blue-800 flex items-center">
                    <FaEnvelope className="inline mr-2 h-4 w-4" />
                    Email Verification Required:
                  </p>
                  <p>After registration, you'll receive a verification email. You must verify your email to activate your account.</p>
                  <p className="text-xs font-medium text-blue-700 pt-2 border-t border-blue-200 flex items-center">
                    <FaLightbulb className="inline mr-1 h-3.5 w-3.5" />
                    Tip: Use an email you can access — the verification link expires in 24 hours. If you don't see it, check your spam folder.
                  </p>
                </div>

                <Button
                  type="submit"
                  loading={loading}
                  className="w-full"
                  variant="primary"
                >
                  Register as Player
                </Button>

                  </form>

                  <div className="mt-6 text-center space-y-2">
                    <p className="text-sm text-gray-600">
                      Already have an account?{' '}
                      <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
                        Login here
                      </Link>
                    </p>
                    <p className="text-sm text-gray-600">
                      Are you an organization?{' '}
                      <Link to="/register/organization" className="text-indigo-600 hover:text-indigo-700 font-medium">
                        Register as Organization
                      </Link>
                    </p>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </div>
    </Layout>
  );
}
