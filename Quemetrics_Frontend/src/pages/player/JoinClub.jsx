import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Users, CheckCircle, XCircle, Loader } from 'lucide-react';
import apiClient from '../../contexts/apiClient';

const JoinClub = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [clubInfo, setClubInfo] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const autoJoinAttempted = useRef(false);

  // Check if user is authenticated
  useEffect(() => {
    const authToken = localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken');
    setIsAuthenticated(!!authToken);
  }, []);

  // Validate token and get club info
  useEffect(() => {
    const validateToken = async () => {
      if (!token) {
        setError('Invalid invitation link. No token provided.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const response = await apiClient.get(`/clubs/validate-invitation/${token}`);

        if (response.data.success) {
          setClubInfo(response.data.data);
        } else {
          setError(response.data.error || 'Invalid or expired invitation link.');
        }
      } catch (err) {
        console.error('Token validation error:', err);
        setError(
          err.response?.data?.error ||
          'Unable to validate invitation link. It may be expired or invalid.'
        );
      } finally {
        setLoading(false);
      }
    };

    validateToken();
  }, [token]);

  // Auto-join if authenticated and came from redirect
  useEffect(() => {
    const attemptAutoJoin = async () => {
      // Check if user is authenticated, club info is loaded, and we haven't attempted auto-join yet
      if (isAuthenticated && clubInfo && !loading && !autoJoinAttempted.current && !success && !error && !joining) {
        // Check if we came from a login redirect
        const wasRedirected = sessionStorage.getItem('justLoggedIn');

        if (wasRedirected === 'true') {
          sessionStorage.removeItem('justLoggedIn');
          autoJoinAttempted.current = true;

          // Automatically join the club
          setJoining(true);
          setError('');

          try {
            const response = await apiClient.post(`/clubs/join-via-invitation/${token}`);

            if (response.data.success) {
              setSuccess(true);
              // Redirect to player dashboard after 2 seconds
              setTimeout(() => {
                navigate('/player/dashboard');
              }, 2000);
            } else {
              setError(response.data.error || 'Failed to join club.');
            }
          } catch (err) {
            console.error('Auto-join club error:', err);
            setError(
              err.response?.data?.error ||
              'Unable to join club. Please try again or contact support.'
            );
          } finally {
            setJoining(false);
          }
        }
      }
    };

    attemptAutoJoin();
  }, [isAuthenticated, clubInfo, loading, success, error, joining, token, navigate]);

  const handleJoinClub = async () => {
    if (!isAuthenticated) {
      // Redirect to login with return URL
      localStorage.setItem('redirectAfterLogin', `/club/join/${token}`);
      // Stash the invite context so the Login page can show a one-time
      // "You've been invited to join <club>" banner. Cleared after the
      // player successfully signs in.
      localStorage.setItem('pendingClubJoin', JSON.stringify({
        token,
        clubName: clubInfo?.clubName || '',
      }));
      navigate('/login');
      return;
    }

    setJoining(true);
    setError('');

    try {
      const response = await apiClient.post(`/clubs/join-via-invitation/${token}`);

      if (response.data.success) {
        setSuccess(true);
        // Redirect to player dashboard after 2 seconds
        setTimeout(() => {
          navigate('/player/dashboard');
        }, 2000);
      } else {
        setError(response.data.error || 'Failed to join club.');
      }
    } catch (err) {
      console.error('Join club error:', err);
      setError(
        err.response?.data?.error ||
        'Unable to join club. Please try again or contact support.'
      );
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Validating invitation...</p>
        </div>
      </div>
    );
  }

  if (joining) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Joining {clubInfo?.clubName}...</h2>
          <p className="text-gray-600">Please wait while we add you to the club.</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to {clubInfo?.clubName}!</h1>
          <p className="text-gray-600 mb-4">
            You have successfully joined the club. Redirecting to your dashboard...
          </p>
        </div>
      </div>
    );
  }

  // Special-case: backend returns "You are already a member of this club" when
  // the invited player is already in the club. Treat that as a friendly state
  // (green icon, "Go to My Club") rather than a hard error.
  const isAlreadyMember = !!error && /already a member/i.test(error);

  if (isAlreadyMember) {
    const clubName = clubInfo?.clubName || 'this club';
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Already a Member</h1>
          <p className="text-gray-600 mb-6">
            You are already a member of {clubName}. Go to your club page.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => navigate('/player/clubs')}
              className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Go to My Club
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Go to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !clubInfo) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-rose-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full text-center">
          <XCircle className="w-16 h-16 text-red-600 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Join Club Invitation</h1>
          <p className="text-gray-600">You've been invited to join</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-2">{clubInfo.clubName}</h2>
          {clubInfo.description && (
            <p className="text-gray-600 mb-3">{clubInfo.description}</p>
          )}
          <div className="space-y-2 text-sm text-gray-700">
            {clubInfo.sportTypes && (
              <p>
                <span className="font-medium">Sport:</span>{' '}
                {Array.isArray(clubInfo.sportTypes)
                  ? clubInfo.sportTypes.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ')
                  : clubInfo.sportTypes}
              </p>
            )}
            {clubInfo.address && (
              <p>
                <span className="font-medium">Address:</span> {clubInfo.address}
              </p>
            )}
            {clubInfo.memberCount !== undefined && (
              <p>
                <span className="font-medium">Members:</span> {clubInfo.memberCount}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <div className="space-y-3">
          <button
            onClick={handleJoinClub}
            disabled={joining}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
          >
            {joining ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Joining...
              </>
            ) : (
              <>
                <Users className="w-5 h-5" />
                {isAuthenticated ? 'Join Club' : 'Login to Join Club'}
              </>
            )}
          </button>

          <button
            onClick={() => navigate('/')}
            className="w-full py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
          >
            Decline
          </button>
        </div>

        {!isAuthenticated && (
          <p className="text-xs text-gray-500 text-center mt-4">
            You need to login to join this club. Click "Login to Join Club" to continue.
          </p>
        )}
      </div>
    </div>
  );
};

export default JoinClub;
