import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import apiClient from '../../contexts/apiClient';
import { AuthContext } from '../../contexts/AuthContext';
import Button from '../../components/ui/Button';
import Loader from '../../components/ui/Loader';
import Layout from '../../components/Layout/Layout';
import {
  FaArrowLeft,
  FaCalendarAlt,
  FaMapMarkerAlt,
  FaUsers,
  FaTrophy,
  FaCheckCircle,
  FaTimesCircle,
  FaClock,
} from 'react-icons/fa';
import { isRegistrationOpenUTC } from '../../lib/utils/registrationWindow';

// Helper to normalize entryMethods from corrupted/legacy data
const normalizeEntryMethods = (raw, row) => {
  const result = {};

  // Strategy 1: If raw is an object with expected keys
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const keys = ['selfRegistration', 'invitationLink', 'joinCode', 'adminEntry', 'openRequestWithApproval'];
    if (keys.some(k => Object.prototype.hasOwnProperty.call(raw, k))) {
      result.selfRegistration = Boolean(raw.selfRegistration);
      result.invitationLink = Boolean(raw.invitationLink);
      result.joinCode = Boolean(raw.joinCode);
      result.adminEntry = Boolean(raw.adminEntry);
      result.openRequestWithApproval = Boolean(raw.openRequestWithApproval);
      return result;
    }
  }

  // Strategy 2: If raw is a JSON string, try to parse it
  if (raw && typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        result.selfRegistration = Boolean(parsed.selfRegistration);
        result.invitationLink = Boolean(parsed.invitationLink);
        result.joinCode = Boolean(parsed.joinCode);
        result.adminEntry = Boolean(parsed.adminEntry);
        result.openRequestWithApproval = Boolean(parsed.openRequestWithApproval);
        return result;
      }
    } catch {
      // ignore JSON parse error
    }
  }

  // Strategy 3 (Fallback): Use individual boolean columns from the row
  if (row) {
    result.selfRegistration = Boolean(row.allowsSelfRegistration);
    result.invitationLink = Boolean(row.allowsInvitations);
    result.joinCode = Boolean(row.allowsJoinCodes);
    result.adminEntry = Boolean(row.allowsAdminEntry);
    result.openRequestWithApproval = Boolean(row.allowsOpenRegistration);
    return result;
  }

  // Last resort: empty object (show nothing if no data available)
  return {};
};

export default function TournamentRegister() {
  const { tournamentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useContext(AuthContext);

  const [tournament, setTournament] = useState(null);
  const [loading, setLoading] = useState(!location.state?.tournament);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [registrationType, setRegistrationType] = useState('standard');
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  const loadTournament = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(`/tournaments/${tournamentId}`);
      const received = response.data.data;
      received.entryMethods = normalizeEntryMethods(received.entryMethods, received);
      setTournament(received);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load tournament');
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    if (location.state?.tournament) {
      // Normalize tournament from location state
      const t = { ...location.state.tournament };
      t.entryMethods = normalizeEntryMethods(t.entryMethods, t);
      setTournament(t);
    } else {
      loadTournament();
    }
  }, [location.state?.tournament, loadTournament]);

  // Check whether current player is already registered for this tournament
  useEffect(() => {
    const checkJoined = async () => {
      if (!user) return;
      try {
        const resp = await apiClient.get('/player/tournaments');
        const joined = (resp.data.data || []).some((p) => (p.tournament && (p.tournament.id == tournamentId)));
        setAlreadyRegistered(Boolean(joined));
      } catch (e) {
        console.debug('Could not verify player registrations', e?.message || e);
      }
    };

    checkJoined();
  }, [user, tournamentId]);

  const handleRegister = async () => {
    setRegistering(true);
    setError(null);

    try {
      // Choose endpoint based on registration type
      // Standard Registration: immediate approval, no approval needed
      // Open Registration: submitted for approval, requires organizer approval
      const endpoint = registrationType === 'open'
        ? `/tournaments/${tournamentId}/register-open-request`
        : `/tournaments/${tournamentId}/register`;

      const payload = {
        registrationMethod: registrationType === 'open' ? 'open_request' : 'self',
      };

      await apiClient.post(endpoint, payload);

      setSuccess(true);

      // Redirect after 2 seconds
      setTimeout(() => {
        navigate('/player/my-tournaments');
      }, 2000);
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to register for tournament';
      const errorCode = err.response?.data?.errorCode || '';

      // Provide more helpful error messages based on error code or message content
      let displayError = errorMsg;

      if (errorCode === 'REGISTRATION_CLOSED') {
        displayError = 'Registration Closed';
      } else if (errorCode === 'LATE_REGISTRATION_DISABLED') {
        displayError = '⏰ Late registration is not allowed for this tournament. The organizer has not enabled late entries.';
      } else if (errorCode === 'LATE_REGISTRATION_DEADLINE_PASSED') {
        displayError = '⏰ The late registration period has ended. No more entries are being accepted, even for organizers.';
      } else if (errorCode === 'FIXTURES_GENERATED') {
        displayError = '🔒 This tournament is locked. Fixtures have been generated and no more entries are allowed.';
      } else if (errorMsg.includes('Player profile')) {
        displayError = 'Setting up your player profile... Please try again in a moment.';
      } else if (errorMsg.includes('already registered')) {
        displayError = 'You are already registered for this tournament.';
      } else if (errorMsg.includes('Tournament is full')) {
        displayError = 'Sorry, this tournament has reached maximum capacity.';
      } else if (errorMsg.includes('Registration deadline has passed')) {
        displayError = 'The registration deadline for this tournament has passed.';
      }

      setError(displayError);
      console.error('Registration error:', err);
    } finally {
      setRegistering(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) return <Loader />;

  if (!tournament) {
    return (
      <Layout>
        <div className="min-h-screen bg-gray-50 p-6">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-red-600">Tournament not found</p>
            <Button onClick={() => navigate('/player/tournaments')} className="mt-4">
              Back to All Tournaments
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  const now = new Date();
  const registrationDeadline = new Date(tournament.registrationDeadline || tournament.startDate);
  const startDate = new Date(tournament.startDate);
  const registrationClosed = !isRegistrationOpenUTC(tournament, now);
  const currentParticipants = tournament.currentParticipantCount || 0;
  const maxParticipants = tournament.maxParticipants;
  const spotsAvailable = maxParticipants ? maxParticipants - currentParticipants : null;
  const isFull = spotsAvailable !== null && spotsAvailable <= 0;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Back Button */}
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6 font-medium"
          >
            <FaArrowLeft />
            Back
          </button>

          {success ? (
            // Success Message
            <div className="bg-white rounded-lg shadow-lg p-8 text-center space-y-4">
              <FaCheckCircle className="mx-auto text-6xl text-green-600" />
              <h2 className="text-3xl font-bold text-gray-900">Registration Successful!</h2>
              <p className="text-gray-600 text-lg max-w-md mx-auto">
                {tournament.participantApprovalRequired
                  ? 'Your registration is pending approval from the tournament organizer. You will be notified once approved.'
                  : 'You are now registered for this tournament!'}
              </p>
              <div className="pt-6">
                <Button
                  onClick={() => navigate('/player/my-tournaments')}
                  className="px-8"
                >
                  View My Tournaments
                </Button>
              </div>
            </div>
          ) : (
            // Registration Form
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Tournament Details */}
              <div className="lg:col-span-2 space-y-6">
                {/* Header */}
                <div className="bg-linear-to-r from-blue-600 to-blue-700 text-white rounded-lg p-6 space-y-2">
                  <h1 className="text-3xl font-bold">{tournament.name}</h1>
                  <p className="text-blue-100">{tournament.description}</p>
                  <div className="flex gap-3 pt-3 flex-wrap">
                    <span className="bg-white/20 px-3 py-1 rounded text-sm capitalize font-medium">
                      {tournament.sport}
                    </span>
                    {tournament.ranked && (
                      <span className="bg-yellow-400 text-yellow-900 px-3 py-1 rounded text-sm font-medium">
                        Ranked - {tournament.tier ? tournament.tier.charAt(0).toUpperCase() + tournament.tier.slice(1) : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Tournament Details Grid */}
                <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Tournament Details</h2>

                  <div className="grid grid-cols-2 gap-4">
                    {/* Start Date */}
                    <div className="flex gap-3">
                      <FaCalendarAlt className="text-blue-600 shrink-0 mt-1" />
                      <div>
                        <p className="text-sm text-gray-600">Start Date</p>
                        <p className="font-semibold text-gray-900">{formatDate(startDate)}</p>
                      </div>
                    </div>

                    {/* End Date */}
                    {tournament.endDate && (
                      <div className="flex gap-3">
                        <FaCalendarAlt className="text-blue-600 shrink-0 mt-1" />
                        <div>
                          <p className="text-sm text-gray-600">End Date</p>
                          <p className="font-semibold text-gray-900">{formatDate(tournament.endDate)}</p>
                        </div>
                      </div>
                    )}

                    {/* Location */}
                    {tournament.county && (
                      <div className="flex gap-3">
                        <FaMapMarkerAlt className="text-blue-600 shrink-0 mt-1" />
                        <div>
                          <p className="text-sm text-gray-600">Location</p>
                          <p className="font-semibold text-gray-900">{tournament.county}</p>
                        </div>
                      </div>
                    )}

                    {/* Participants */}
                    <div className="flex gap-3">
                      <FaUsers className="text-blue-600 shrink-0 mt-1" />
                      <div>
                        <p className="text-sm text-gray-600">Participants</p>
                        <p className="font-semibold text-gray-900">
                          {currentParticipants}
                          {maxParticipants ? `/${maxParticipants}` : '+'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Registration Deadline */}
                  <div className="border-t pt-4 mt-4">
                    <p className="text-sm font-medium text-gray-700 mb-2">Registration Deadline</p>
                    <p className="font-semibold text-gray-900">{formatDate(registrationDeadline)}</p>
                    {registrationClosed && (
                      <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                        <FaTimesCircle /> Registration Closed
                      </p>
                    )}
                  </div>
                </div>

                {/* Entry Methods Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                  <h3 className="font-semibold text-blue-900 mb-3">Entry Methods</h3>
                  <div className="space-y-2 text-sm text-blue-900">
                    {tournament.entryMethods?.selfRegistration && (
                      <p className="flex items-center gap-2">
                        <FaCheckCircle className="text-green-600" />
                        Self-registration available
                      </p>
                    )}
                    {tournament.entryMethods?.invitationLink && (
                      <p className="flex items-center gap-2">
                        <FaCheckCircle className="text-green-600" />
                        Invitation links accepted
                      </p>
                    )}
                    {tournament.entryMethods?.joinCode && (
                      <p className="flex items-center gap-2">
                        <FaCheckCircle className="text-green-600" />
                        Join codes accepted
                      </p>
                    )}
                    {tournament.entryMethods?.adminEntry && (
                      <p className="flex items-center gap-2">
                        <FaCheckCircle className="text-green-600" />
                        Admin entry available
                      </p>
                    )}
                    {tournament.entryMethods?.openRequestWithApproval && (
                      <p className="flex items-center gap-2">
                        <FaCheckCircle className="text-green-600" />
                        Registration requires approval
                      </p>
                    )}
                  </div>
                </div>

                {/* Organizer Info */}
                {tournament.organization && (
                  <div className="bg-white rounded-lg shadow-md p-6">
                    <h3 className="font-semibold text-gray-900 mb-3">Organizer</h3>
                    <p className="text-gray-700 font-medium">{tournament.organization.organizationName}</p>
                  </div>
                )}
              </div>

              {/* Registration Sidebar */}
              <div className="lg:col-span-1">
                <div className="sticky top-6 bg-white rounded-lg shadow-lg p-6 space-y-4">
                  <h2 className="text-xl font-bold text-gray-900">Registration</h2>

                  {/* Status */}
                  <div className="space-y-2">
                    {registrationClosed && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex gap-2">
                        <FaTimesCircle className="shrink-0 mt-0.5" />
                      <span>Registration Closed</span>
                      </div>
                    )}

                    {isFull && (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700 flex gap-2">
                        <FaClock className="shrink-0 mt-0.5" />
                        <span>Tournament is full</span>
                      </div>
                    )}

                    {!registrationClosed && !isFull && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700">
                        ✓ Registration is open
                      </div>
                    )}
                  </div>

                  {/* Spots Available */}
                  {spotsAvailable !== null && (
                    <div className="bg-gray-50 rounded-lg p-3">
                      <p className="text-xs text-gray-600 mb-1">Spots Available</p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-bold text-gray-900">{Math.max(0, spotsAvailable)}</span>
                        <span className="text-gray-600">of {maxParticipants}</span>
                      </div>
                    </div>
                  )}

                  {/* Approval Message */}
                  {tournament.participantApprovalRequired && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                      <p className="font-semibold mb-1">⏳ Approval Required</p>
                      <p>Your registration will need to be approved by the organizer.</p>
                    </div>
                  )}

                  {/* Registration Error */}
                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  {/* Registration Type Selection */}
                  <div className="border-t pt-4">
                    <p className="font-medium text-gray-900 mb-3 text-sm">Registration Type</p>
                    <div className="space-y-2">
                      {tournament.entryMethods?.selfRegistration && (
                        <label className="flex items-start gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                          <input
                            type="radio"
                            name="registrationType"
                            value="standard"
                            checked={registrationType === 'standard'}
                            onChange={(e) => setRegistrationType(e.target.value)}
                            className="rounded-full mt-0.5"
                          />
                          <div>
                            <span className="text-sm text-gray-700 block font-medium">Standard Registration</span>
                            <span className="text-xs text-gray-500">You will join the tournament immediately</span>
                          </div>
                        </label>
                      )}

                      {tournament.entryMethods?.openRequestWithApproval && (
                        <label className="flex items-start gap-3 p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                          <input
                            type="radio"
                            name="registrationType"
                            value="open"
                            checked={registrationType === 'open'}
                            onChange={(e) => setRegistrationType(e.target.value)}
                            className="rounded-full mt-0.5"
                          />
                          <div>
                            <span className="text-sm text-gray-700 block font-medium">Request to Join (Needs Approval)</span>
                            <span className="text-xs text-gray-500">Your registration will need approval from the organizer</span>
                          </div>
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Register Button */}
                  <Button
                    onClick={handleRegister}
                    disabled={registrationClosed || isFull || registering || alreadyRegistered}
                    isLoading={registering}
                    className="w-full py-3 text-center font-semibold"
                    title={
                      alreadyRegistered
                        ? 'You are already registered'
                        : registrationClosed
                        ? 'Registration Closed'
                        : isFull
                        ? 'Tournament is full'
                        : registrationType === 'open'
                        ? 'Submit your request for approval'
                        : 'Join the tournament immediately'
                    }
                  >
                    {registering
                      ? 'Registering...'
                      : alreadyRegistered
                      ? 'Already Registered'
                      : registrationClosed
                      ? 'Registration Closed'
                      : registrationType === 'open'
                      ? 'Submit Registration Request'
                      : 'Register Now'
                    }
                  </Button>

                  {alreadyRegistered && (
                    <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded text-sm text-gray-700">
                      You are already registered for this tournament.
                    </div>
                  )}

                  {/* Back Button */}
                  <Button
                    onClick={() => navigate(-1)}
                    variant="secondary"
                    className="w-full"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
