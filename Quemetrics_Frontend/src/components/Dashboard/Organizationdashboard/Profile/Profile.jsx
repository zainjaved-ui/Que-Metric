import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
// import { useOrganization } from '../../../../hooks/useOrganization';
import Button from '../../../ui/Button';
import Input from '../../../ui/Input';
import Card from '../../../ui/Card';
import Alert from '../../../ui/Alert';
import Loader from '../../../ui/Loader';
import { FaCheckCircle, FaExclamationTriangle, FaArrowLeft, FaSave, FaBuilding, FaUser, FaPhone, FaTag, FaGlobe, FaFileAlt, FaIdCard, FaUsers } from 'react-icons/fa';

export default function OrganizationProfile() {
  // const { organization, loading, getProfile, updateProfile } = useOrganization();
  const organization = null;
  const loading = false;
  const getProfile = () => {};
  const updateProfile = async () => ({ success: false, error: 'Organization hook unavailable' });
  const [formData, setFormData] = useState({
    organizationName: '',
    contactPersonName: '',
    phoneNumber: '',
    organizationType: 'club',
    description: '',
    website: '',
    registrationNumber: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  // useEffect(() => {
  //   getProfile();
  // }, []);

  useEffect(() => {
    if (organization) {
      setFormData({
        organizationName: organization.organizationName || '',
        contactPersonName: organization.contactPersonName || '',
        phoneNumber: organization.phoneNumber || '',
        organizationType: organization.organizationType || 'club',
        description: organization.description || '',
        website: organization.website || '',
        registrationNumber: organization.registrationNumber || '',
      });
    }
  }, [organization]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.organizationName && !/^[A-Za-z\s]+$/.test(formData.organizationName)) {
      setError('Organization name must only contain alphabets and spaces.');
      return;
    }
    if (formData.organizationName && formData.organizationName.length > 50) {
      setError('Organization name must not exceed 50 characters.');
      return;
    }

    if (formData.contactPersonName && !/^[A-Za-z\s]+$/.test(formData.contactPersonName)) {
      setError('Contact person name must only contain alphabets and spaces.');
      return;
    }
    if (formData.contactPersonName && formData.contactPersonName.length > 50) {
      setError('Contact person name must not exceed 50 characters.');
      return;
    }

    if (!formData.phoneNumber || !/^\d{11}$/.test(formData.phoneNumber)) {
      setError('Phone number must be exactly 11 digits.');
      return;
    }

    setSaving(true);

    const result = await updateProfile(formData);

    if (result.success) {
      setSuccess(result.message);
    } else {
      setError(result.error);
    }

    setSaving(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Prevent non-numeric characters and limit to 11 digits for phone number
    if (name === 'phoneNumber') {
      const numericValue = value.replace(/\D/g, '').slice(0, 11);
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
      return;
    }

    // Only alphabets and spaces for names, max 50 chars
    if (name === 'organizationName' || name === 'contactPersonName') {
      const filteredValue = value.replace(/[^A-Za-z\s]/g, '').slice(0, 50);
      setFormData((prev) => ({ ...prev, [name]: filteredValue }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  if (loading) return <Loader />;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div className="flex items-center space-x-3">
            <Link to="/organization/dashboard" className="p-2 rounded-lg bg-white border border-gray-200 hover:bg-gray-50">
              <FaArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Organization Profile</h1>
              <p className="text-gray-600">Manage your organization information</p>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <span className={`px-4 py-2 rounded-full text-sm font-medium flex items-center space-x-2 ${
              organization?.isVerified
                ? 'bg-green-100 text-green-800'
                : 'bg-yellow-100 text-yellow-800'
            }`}>
              {organization?.isVerified ? (
                <>
                  <FaCheckCircle className="w-4 h-4" />
                  <span>Approved</span>
                </>
              ) : (
                <>
                  <FaExclamationTriangle className="w-4 h-4" />
                  <span>Pending</span>
                </>
              )}
            </span>
          </div>
        </div>

        {/* Status Card */}
        <div className="mb-8">
          <Card className="border border-gray-200 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  {organization?.isVerified ? (
                    <div className="p-2 rounded-lg bg-green-100">
                      <FaCheckCircle className="w-5 h-5 text-green-600" />
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-yellow-100">
                      <FaExclamationTriangle className="w-5 h-5 text-yellow-600" />
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Verification Status</h2>
                    <p className="text-sm text-gray-500">
                      {organization?.isVerified
                        ? 'Your organization is verified and can create leagues and tournaments.'
                        : 'Your organization is pending admin approval.'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Type:</span>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium capitalize">
                  {organization?.organizationType || 'club'}
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Main Form Card */}
        <Card className="border border-gray-200 shadow-sm">
          <div className="mb-6">
            {error && <Alert type="error" message={error} />}
            {success && <Alert type="success" message={success} />}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-6">
                {/* Organization Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <FaBuilding className="w-4 h-4 mr-2 text-gray-400" />
                    Organization Name *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="organizationName"
                      value={formData.organizationName}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#132F45] focus:border-transparent"
                      placeholder="Enter organization name"
                    />
                    <FaBuilding className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Contact Person */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <FaUser className="w-4 h-4 mr-2 text-gray-400" />
                    Contact Person Name *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="contactPersonName"
                      value={formData.contactPersonName}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#132F45] focus:border-transparent"
                      placeholder="Enter contact person name"
                    />
                    <FaUser className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Phone Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <FaPhone className="w-4 h-4 mr-2 text-gray-400" />
                    Phone Number *
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={handleChange}
                      required
                      className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#132F45] focus:border-transparent"
                      placeholder="Enter phone number"
                    />
                    <FaPhone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Organization Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <FaTag className="w-4 h-4 mr-2 text-gray-400" />
                    Organization Type
                  </label>
                  <div className="relative">
                    <select
                      name="organizationType"
                      value={formData.organizationType}
                      onChange={handleChange}
                      className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#132F45] focus:border-transparent appearance-none"
                    >
                      <option value="club">Club</option>
                      <option value="association">Association</option>
                      <option value="federation">Federation</option>
                      <option value="league">League</option>
                      <option value="independent">Independent</option>
                    </select>
                    <FaTag className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Registration Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <FaIdCard className="w-4 h-4 mr-2 text-gray-400" />
                    Registration Number
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      name="registrationNumber"
                      value={formData.registrationNumber}
                      onChange={handleChange}
                      className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#132F45] focus:border-transparent"
                      placeholder="Official registration/license number"
                    />
                    <FaIdCard className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Website */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <FaGlobe className="w-4 h-4 mr-2 text-gray-400" />
                    Website
                  </label>
                  <div className="relative">
                    <input
                      type="url"
                      name="website"
                      value={formData.website}
                      onChange={handleChange}
                      className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#132F45] focus:border-transparent"
                      placeholder="https://example.com"
                    />
                    <FaGlobe className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  </div>
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center">
                    <FaFileAlt className="w-4 h-4 mr-2 text-gray-400" />
                    Description
                  </label>
                  <div className="relative">
                    <textarea
                      name="description"
                      value={formData.description}
                      onChange={handleChange}
                      rows={4}
                      className="w-full px-4 py-3 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#132F45] focus:border-transparent resize-none"
                      placeholder="Tell us about your organization..."
                    />
                    <FaFileAlt className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  </div>
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <Button type="submit" loading={saving} className="w-full md:w-auto px-8 bg-[#132F45] hover:bg-blue-700">
                <div className="flex items-center justify-center space-x-2">
                  <FaSave className="w-4 h-4" />
                  <span>{saving ? 'Saving...' : 'Save Changes'}</span>
                </div>
              </Button>
            </div>
          </form>
        </Card>

        {/* Footer Note */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            All information is secured and will be used for verification purposes only.
          </p>
        </div>
      </div>
    </div>
  );
}