import React, { useState, useEffect, useContext } from 'react';
import { FaTrophy, FaClock, FaCheckCircle, FaTimesCircle, FaCalendarAlt } from 'react-icons/fa';
import { AuthContext } from '../../../../contexts/AuthContext';
import apiClient from '../../../../contexts/apiClient';
import Loader from '../../../ui/Loader';

export default function TournamentInvitations() {
  const { user } = useContext(AuthContext);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acceptingId, setAcceptingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user?.email) {
      fetchPendingInvitations();
    }
  }, [user?.email]);

  const fetchPendingInvitations = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.get(`/tournaments/invitations/pending?email=${encodeURIComponent(user.email)}`);

      if (response.data.success) {
        setInvitations(response.data.data || []);
      }
    } catch (err) {
      console.error('Error fetching invitations:', err);
      setError('Failed to load tournament invitations');
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvitation = async (token, tournamentName) => {
    try {
      setAcceptingId(token);

      const response = await apiClient.post('/tournaments/invitations/accept', {
        token,
      });

      if (response.data.success) {
        // Remove accepted invitation from list
        setInvitations(invitations.filter(inv => inv.invitationToken !== token));

        // Show success message
        alert(`✅ Successfully joined tournament: ${tournamentName}`);
      } else {
        alert(`❌ Error: ${response.data.error}`);
      }
    } catch (err) {
      console.error('Error accepting invitation:', err);
      alert('Failed to accept invitation. Please try again.');
    } finally {
      setAcceptingId(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <Loader />
      </div>
    );
  }

  if (invitations.length === 0) {
    return null; // Don't show section if no invitations
  }

  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold text-[#132F45] mb-4 flex items-center gap-2">
        <FaTrophy className="text-[#BA995D]" />
        Tournament Invitations ({invitations.length})
      </h3>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
          >
            {/* Tournament Header */}
            <div className="mb-3">
              <h4 className="font-bold text-[#132F45] text-base truncate">
                {invitation.Tournament?.name || 'Tournament'}
              </h4>
              <p className="text-xs text-gray-600">
                by {invitation.Tournament?.Organization?.name || 'Organization'}
              </p>
            </div>

            {/* Tournament Details */}
            <div className="space-y-2 mb-4">
              {/* Sport */}
              {invitation.Tournament?.sport && (
                <div className="flex items-center gap-2 text-xs">
                  <FaTrophy className="text-[#BA995D] text-xs" />
                  <span className="capitalize font-medium text-gray-700">
                    {invitation.Tournament.sport}
                  </span>
                </div>
              )}

              {/* Format */}
              {invitation.Tournament?.TournamentFormat?.name && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="inline-block bg-blue-200 text-blue-800 px-2 py-1 rounded text-[10px] font-semibold">
                    {invitation.Tournament.TournamentFormat.name}
                  </span>
                </div>
              )}

              {/* Start Date */}
              {invitation.Tournament?.startDate && (
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <FaCalendarAlt className="text-gray-400" />
                  <span>
                    {new Date(invitation.Tournament.startDate).toLocaleDateString()}
                  </span>
                </div>
              )}

              {/* Expires */}
              <div className="flex items-center gap-2 text-xs text-orange-600">
                <FaClock className="text-orange-400" />
                <span>
                  Expires: {new Date(invitation.expiresAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Invited Email */}
            <div className="bg-white bg-opacity-50 rounded px-2 py-2 mb-3 text-xs text-gray-600 truncate border border-blue-100">
              {invitation.invitedEmail}
            </div>

            {/* Action Button */}
            <button
              onClick={() =>
                handleAcceptInvitation(
                  invitation.invitationToken,
                  invitation.Tournament?.name
                )
              }
              disabled={acceptingId === invitation.invitationToken}
              className={`w-full py-2 rounded font-bold text-sm transition-colors flex items-center justify-center gap-2 ${
                acceptingId === invitation.invitationToken
                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
              }`}
            >
              {acceptingId === invitation.invitationToken ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Accepting...
                </>
              ) : (
                <>
                  <FaCheckCircle />
                  Accept Invitation
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
