import { useContext, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Alert from '../../components/ui/Alert';
import Layout from '../../components/Layout/Layout';
import { FaBuilding, FaUser, FaEnvelope, FaPhone, FaLock, FaCheckCircle, FaArrowRight, FaLightbulb } from 'react-icons/fa';
import PasswordStrengthIndicator from '../../components/ui/PasswordStrengthIndicator';
import { DEFAULT_DIAL, getPhoneRule } from '../../utils/countryCodes';
import CountrySelect from '../../components/ui/CountrySelect';

export default function RegisterOrganization() {
  const [formData, setFormData] = useState({
    organizationName: '',
    contactPersonName: '',
    email: '',
    countryDial: DEFAULT_DIAL,
    phoneNumber: '',
    password: '',
    confirmPassword: '',
    isClub: false
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);

  const { registerOrganization } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    // Country selector: switch dial code and re-truncate any existing number
    // to the newly-selected country's max length.
    if (name === 'countryDial') {
      const { max } = getPhoneRule(value);
      setFormData((prev) => ({
        ...prev,
        countryDial: value,
        phoneNumber: prev.phoneNumber.slice(0, max)
      }));
      return;
    }

    // Prevent non-numeric characters and limit digits to the selected
    // country's max national-number length.
    if (name === 'phoneNumber') {
      const { max } = getPhoneRule(formData.countryDial);
      const numericValue = value.replace(/\D/g, '').slice(0, max);
      setFormData((prev) => ({
        ...prev,
        [name]: numericValue
      }));
      return;
    }

    // Only alphabets and spaces for names, max 50 chars
    if (name === 'organizationName' || name === 'contactPersonName') {
      const filteredValue = value.replace(/[^A-Za-z\s]/g, '').slice(0, 50);
      setFormData((prev) => ({
        ...prev,
        [name]: filteredValue
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Additional check in case button is enabled somehow (should not happen)
    if (!formData.isClub) {
      setError('You must confirm that you are registering a club.');
      return;
    }

    if (!formData.organizationName.trim()) {
      setError('Organization name is required.');
      return;
    }

    if (!/^[A-Za-z\s]+$/.test(formData.organizationName)) {
      setError('Organization name must only contain alphabets and spaces.');
      return;
    }

    if (formData.organizationName.length > 50) {
      setError('Organization name must not exceed 50 characters.');
      return;
    }

    if (!formData.contactPersonName.trim()) {
      setError('Contact person name is required.');
      return;
    }

    if (!/^[A-Za-z\s]+$/.test(formData.contactPersonName)) {
      setError('Contact person name must only contain alphabets and spaces.');
      return;
    }

    if (formData.contactPersonName.length > 50) {
      setError('Contact person name must not exceed 50 characters.');
      return;
    }

    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Please provide a valid email address.');
      return;
    }

    if (!formData.phoneNumber.trim()) {
      setError('Phone number is required.');
      return;
    }

    {
      const { min, max } = getPhoneRule(formData.countryDial);
      const digits = formData.phoneNumber.replace(/\D/g, '');
      if (!/^\d+$/.test(digits)) {
        setError('Phone number must contain digits only.');
        return;
      }
      if (digits.length < min || digits.length > max) {
        setError(
          min === max
            ? `Phone number must be exactly ${min} digits for the selected country.`
            : `Phone number must be ${min}–${max} digits for the selected country.`
        );
        return;
      }
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])/.test(formData.password)) {
      setError('Password must contain uppercase, lowercase, number, and special character (@$!%*?&#).');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);

    try {
      const fullPhone = `${formData.countryDial}${formData.phoneNumber}`.replace(/\D/g, '');
      const { countryDial: _cd, ...rest } = formData;
      const result = await registerOrganization({ ...rest, phoneNumber: fullPhone });
      if (result.success) {
        if (result.requiresVerification) {
          setSuccess(result.message || 'Registration successful! Check your email to verify your account before logging in.');
          setVerificationSent(true);
          setTimeout(() => {
            navigate('/login');
          }, 3000);
        } else {
          setSuccess('Organization registered successfully!');
          setFormData({
            organizationName: '',
            contactPersonName: '',
            email: '',
            countryDial: DEFAULT_DIAL,
            phoneNumber: '',
            password: '',
            confirmPassword: '',
            isClub: false
          });
        }
      } else {
        setError(result.error || 'Failed to register organization.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="min-h-[80vh] bg-gradient-to-br from-[#FFFBF4] to-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Static Content */}
            <div className="space-y-8">
              <h1 className="text-3xl md:text-4xl font-bold text-[#132F45] leading-tight">
                Register Your Organization or Club
              </h1>

              <p className="text-lg text-[#132F45] opacity-90">
                Join our platform to manage leagues, tournaments, and teams effectively. Get access to powerful tools designed for organizers.
              </p>

              {/* Key Points */}
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="shrink-0">
                    <FaCheckCircle className="h-5 w-5 text-[#132F45]" />
                  </div>
                  <span className="text-[#132F45]">Create and manage leagues & tournaments</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="shrink-0">
                    <FaCheckCircle className="h-5 w-5 text-[#132F45]" />
                  </div>
                  <span className="text-[#132F45]">Register teams and track player statistics</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="shrink-0">
                    <FaCheckCircle className="h-5 w-5 text-[#132F45]" />
                  </div>
                  <span className="text-[#132F45]">Real‑time updates and comprehensive analytics</span>
                </div>
              </div>

              {/* Link to Login */}
              <div className="pt-8 border-t border-[#D1D5DB]">
                <Link
                  to="/login"
                  className="inline-flex items-center text-[#132F45] font-medium hover:text-[#1A3F5C] transition-colors"
                >
                  Already have an account?
                  <FaArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Right Column - Form or Verification Message */}
            <div className="bg-white rounded-xl shadow-xl p-8 border border-[#D1D5DB]">
              {verificationSent ? (
                // Verification success message
                <>
                  <div className="text-center mb-6">
                    <FaEnvelope className="h-16 w-16 mx-auto text-indigo-600 mb-4" />
                    <h2 className="text-2xl font-bold text-gray-800">Check Your Email!</h2>
                  </div>

                  <Alert type="success" message={success} onClose={() => setSuccess('')} />

                  <div className="space-y-4 text-center text-gray-600">
                    <p className="font-medium">We've sent a verification link to:</p>
                    <p className="text-lg font-semibold text-indigo-600 break-all">{formData.email}</p>
                    <p>Click the link in the email to verify your organization account.</p>
                    <p className="text-sm text-gray-500">The link expires in 24 hours. If you don't see the email, check your spam folder.</p>
                  </div>

                  <div className="mt-8 pt-6 border-t border-gray-200 space-y-2 text-center">
                    <p className="text-sm text-gray-600">
                      After verification, you can{' '}
                      <Link to="/login" className="text-indigo-600 hover:text-indigo-700 font-medium">
                        log in here
                      </Link>
                    </p>
                    <p className="text-sm text-gray-600">
                      <Link to="/register/player" className="text-indigo-600 hover:text-indigo-700 font-medium">
                        Register as Player instead
                      </Link>
                    </p>
                  </div>
                </>
              ) : (
                // Registration form
                <>
                  <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
                    Register as Organizer / Club
                  </h2>

                  <Alert type="error" message={error} onClose={() => setError('')} />
                  <Alert type="success" message={success} onClose={() => setSuccess('')} />

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <Input
                      label="Organization Name"
                      name="organizationName"
                      value={formData.organizationName}
                      onChange={handleChange}
                      required
                      icon={<FaBuilding className="h-5 w-5 text-gray-500 opacity-70" />}
                    />
                    <Input
                      label="Contact Person Name"
                      name="contactPersonName"
                      value={formData.contactPersonName}
                      onChange={handleChange}
                      required
                      icon={<FaUser className="h-5 w-5 text-gray-500 opacity-70" />}
                    />
                    <Input
                      label="Email Address"
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      required
                      icon={<FaEnvelope className="h-5 w-5 text-gray-500 opacity-70" />}
                    />
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-[#132F45] mb-2">
                        Phone Number
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
                            <FaPhone className="h-5 w-5 text-gray-500 opacity-70" />
                          </div>
                          <input
                            type="tel"
                            name="phoneNumber"
                            value={formData.phoneNumber}
                            onChange={handleChange}
                            required
                            placeholder="3001234567"
                            className="w-full px-4 py-3 pl-12 border border-[#D1D5DB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#132F45] focus:border-transparent bg-white text-[#132F45] placeholder-[#132F45] placeholder-opacity-50"
                          />
                        </div>
                      </div>
                    </div>
                    <Input
                      label="Password"
                      type="password"
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      placeholder="Min 8 chars, uppercase, number, special char"
                      icon={<FaLock className="h-5 w-5 text-gray-500 opacity-70" />}
                    />
                    <Input
                      label="Confirm Password"
                      type="password"
                      name="confirmPassword"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      required
                      placeholder="Re-enter your password"
                      icon={<FaLock className="h-5 w-5 text-gray-500 opacity-70" />}
                    />

                    <PasswordStrengthIndicator
                      password={formData.password}
                      confirmPassword={formData.confirmPassword}
                    />

                    {/* Checkbox section with required indication */}
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id="isClub"
                          name="isClub"
                          checked={formData.isClub}
                          onChange={handleChange}
                          className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                          required // HTML5 required attribute – shows browser's default validation popup
                        />
                        <label htmlFor="isClub" className="text-sm text-gray-700">
                          I am registering a club <span className="text-red-500">*</span>
                        </label>
                      </div>
                      {/* Show a hint when checkbox is not checked */}
                      {!formData.isClub && (
                        <p className="text-xs text-red-600 mt-1">
                          You must check this box to register as a club/organization.
                        </p>
                      )}
                    </div>

                    <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200 space-y-2">
                      <p className="font-medium text-blue-800 flex items-center">
                        <FaEnvelope className="inline mr-2 h-4 w-4" />
                        Email Verification Required:
                      </p>
                      <p>After registration, you'll receive a verification email. You must verify your email to activate your account.</p>
                      <p className="text-xs font-medium text-blue-700 pt-2 border-t border-blue-200 flex items-center">
                        <FaLightbulb className="inline mr-1 h-3.5 w-3.5" />
                        Tip: Registering as an organizer automatically creates a Player profile too. After login, you can switch between Organization and Player roles.
                      </p>
                    </div>

                    <Button
                      type="submit"
                      loading={loading}
                      variant="primary"
                      className="w-full"
                      disabled={!formData.isClub} // Disable button if checkbox is not checked
                    >
                      Register Organization
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
                      Are you a player?{' '}
                      <Link to="/register/player" className="text-indigo-600 hover:text-indigo-700 font-medium">
                        Register as Player
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