import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout/Layout';
import apiClient from '../contexts/apiClient';
// import { useAuth } from '../hooks/useAuth';

export default function TournamentJoin() {
  const { tournamentId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [error, setError] = useState(null);
  const [accepting, setAccepting] = useState(false);

  const query = new URLSearchParams(location.search);
  const token = query.get('token');

  useEffect(() => {
    if (!token) {
      setError('Missing token in URL');
      setLoading(false);
      return;
    }
    setLoading(true);
    apiClient
      .get(`/tournaments/invitations/validate?token=${encodeURIComponent(token)}`)
      .then(({ data }) => setInvite(data.data))
      .catch((err) => setError(err?.response?.data?.error || 'Failed to validate invitation'))
      .finally(() => setLoading(false));
  }, [token]);

  // const { user } = useAuth();
  const user = null;
  const isLoggedIn = !!user;

  const handleAccept = async (force = false) => {
    setAccepting(true);
    try {
      await apiClient.post(`/tournaments/invitations/accept`, { token, force });

      // Redirect according to user role. If the current user is a player, send to player dashboard.
      // Otherwise redirect to login so they can sign-in with the correct account.
      if (user && user.role === 'player') {
        navigate('/player/dashboard');
      } else {
        navigate('/login');
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  // Auto-accept when returning from login (AuthContext sets `justLoggedIn` in sessionStorage)
  React.useEffect(() => {
    if (!loading && isLoggedIn && sessionStorage.getItem('justLoggedIn') === 'true') {
      sessionStorage.removeItem('justLoggedIn');
      // Only auto-accept if the authenticated user's email matches the invited email
      if (!invite?.invitedEmail || (user && invite.invitedEmail.toLowerCase() === user.email.toLowerCase())) {
        handleAccept();
      }
    }
  }, [isLoggedIn, loading, invite, user]);

  const emailMismatch = !!(invite?.invitedEmail && user && invite.invitedEmail.toLowerCase() !== user.email.toLowerCase());

  const handleLogin = () => {
    localStorage.setItem('redirectAfterLogin', location.pathname + location.search);
    navigate('/login');
  };

  const handleRegister = () => {
    localStorage.setItem('redirectAfterLogin', location.pathname + location.search);
    navigate('/register/player');
  };

  return (
    <Layout>
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="max-w-xl w-full bg-white rounded shadow p-6">
          {loading ? (
            <div>Loading invitation...</div>
          ) : error ? (
            <div className="text-red-600">{error}</div>
          ) : (
            <>
              <h2 className="text-2xl font-semibold mb-2">You're invited to join {invite?.tournament?.name || 'this tournament'}</h2>
              {invite?.invitationMessage && <p className="mb-4">{invite.invitationMessage}</p>}
              <p className="mb-2"><strong>Invited Email:</strong> {invite.invitedEmail || 'Not specified'}</p>
              <p className="mb-4"><strong>Expires:</strong> {invite.expiresAt ? new Date(invite.expiresAt).toLocaleString() : 'No expiry'}</p>
              {isLoggedIn ? (
                emailMismatch ? (
                  <>
                    <div className="mb-4 p-3 rounded bg-yellow-50 text-yellow-800">
                      This invitation was sent to <strong>{invite.invitedEmail}</strong> but you're signed in as <strong>{user.email}</strong>.
                      Please sign in with the invited email to accept, or you may accept with your current account if you are authorized.
                    </div>
                    <div className="flex gap-2">
                      <button onClick={handleLogin} className="px-4 py-2 border rounded">Login as invited email</button>
                      <button onClick={() => handleAccept(true)} className="bg-red-600 text-white px-4 py-2 rounded" disabled={accepting}>{accepting ? 'Accepting...' : 'Accept with current account'}</button>
                      <button onClick={() => navigate('/player/dashboard')} className="border px-4 py-2 rounded">Cancel</button>
                    </div>
                  </>
                ) : (
                  <div className="flex gap-2">
                    <button onClick={() => handleAccept(false)} className="bg-blue-600 text-white px-4 py-2 rounded" disabled={accepting}>{accepting ? 'Accepting...' : 'Accept Invitation'}</button>
                    <button onClick={() => navigate('/player/dashboard')} className="border px-4 py-2 rounded">Cancel</button>
                  </div>
                )
              ) : (
                <div className="flex gap-2">
                  <button onClick={handleLogin} className="bg-blue-600 text-white px-4 py-2 rounded">Login to Accept</button>
                  <button onClick={handleRegister} className="border px-4 py-2 rounded">Register Player</button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
