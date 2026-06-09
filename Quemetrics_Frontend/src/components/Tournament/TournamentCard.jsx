import React from 'react';
import { FaMapMarkerAlt, FaCalendarAlt, FaUsers, FaTrophy, FaLock } from 'react-icons/fa';
import Button from '../ui/Button';
import { isRegistrationOpenUTC } from '../../lib/utils/registrationWindow';

export default function TournamentCard({ tournament, onRegister, onJoinWithCode, isJoined }) {
  const registrationDeadline = new Date(tournament.registrationDeadline || tournament.startDate);
  const startDate = new Date(tournament.startDate);
  const registrationClosed = !isRegistrationOpenUTC(tournament);
  const spotsAvailable = tournament.maxParticipants
    ? tournament.maxParticipants - tournament.currentParticipantCount
    : null;
  const isFull = spotsAvailable !== null && spotsAvailable <= 0;

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const formatTime = (date) => {
    return new Date(date).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Status badge color
  let statusColor = 'bg-green-100 text-green-800';
  let statusText = 'Open';
  if (registrationClosed) {
    statusColor = 'bg-red-100 text-red-800';
    statusText = 'Closed';
  } else if (isFull) {
    statusColor = 'bg-yellow-100 text-yellow-800';
    statusText = 'Full';
  }

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden">
      {/* Header with Sport Badge */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-4 text-white">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-xl font-bold">{tournament.name}</h3>
          <span className="text-xs bg-white/20 px-2 py-1 rounded capitalize">
            {tournament.sport}
          </span>
        </div>
        <p className="text-sm text-blue-100 line-clamp-2">{tournament.description || 'No description'}</p>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Status Badge */}
        <div className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusColor}`}>
          {statusText}
        </div>

        {/* Key Details */}
        <div className="space-y-2 text-sm text-gray-700">
          {/* Date */}
          <div className="flex items-center gap-2">
            <FaCalendarAlt className="text-blue-600" />
            <div>
              <p>{formatDate(startDate)}</p>
              {tournament.endDate && (
                <p className="text-xs text-gray-500">to {formatDate(tournament.endDate)}</p>
              )}
            </div>
          </div>

          {/* Location */}
          {tournament.county && (
            <div className="flex items-center gap-2">
              <FaMapMarkerAlt className="text-blue-600" />
              <span>{tournament.county}</span>
            </div>
          )}

          {/* Organizer */}
          {tournament.organization && (
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-xs font-medium bg-gray-100 px-2 py-1 rounded">
                {tournament.organization.organizationName}
              </span>
            </div>
          )}

          {/* Tier/Ranking */}
          {tournament.ranked && (
            <div className="flex items-center gap-2">
              <FaTrophy className="text-yellow-600" />
              <span className="text-xs font-semibold">
                Ranked - {tournament.tier ? tournament.tier.charAt(0).toUpperCase() + tournament.tier.slice(1) : ''}{' '}
              </span>
            </div>
          )}
        </div>

        {/* Participants & Capacity */}
        <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FaUsers className="text-blue-600" />
              <span>Participants</span>
            </div>
            <span className="font-bold">
              {tournament.currentParticipantCount}
              {tournament.maxParticipants ? `/${tournament.maxParticipants}` : '+'}
            </span>
          </div>

          {spotsAvailable !== null && (
            <div className="text-xs text-gray-600">
              {spotsAvailable > 0 ? (
                <span className="text-green-600">{spotsAvailable} spots available</span>
              ) : (
                <span className="text-red-600">Tournament full</span>
              )}
            </div>
          )}
        </div>

        {/* Registration Deadline */}
        <div className="text-xs text-gray-600 border-t pt-3">
          Registration deadline: <span className="font-semibold">{formatDate(registrationDeadline)}</span>
        </div>

        {/* Entry Method Indicators */}
        <div className="flex gap-2 flex-wrap text-xs">
          {tournament.entryMethods?.selfRegistration && (
            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">Self-Register</span>
          )}
          {tournament.entryMethods?.invitationLink && (
            <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">Invitation</span>
          )}
          {tournament.entryMethods?.joinCode && (
            <span className="bg-green-100 text-green-700 px-2 py-1 rounded">Join Code</span>
          )}
          {tournament.entryMethods?.openRequestWithApproval && (
            <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded">Request to Join</span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex gap-2">
        <Button
          onClick={() => onRegister(tournament)}
          disabled={registrationClosed || isFull || isJoined}
          variant="primary"
          className="flex-1 flex items-center justify-center gap-2"
          title={
            isJoined
              ? 'Already registered'
              : registrationClosed
              ? 'Registration Closed'
              : isFull
              ? 'Tournament full'
              : 'Register for this tournament'
          }
        >
          {isJoined
            ? 'Already Registered'
            : registrationClosed
            ? 'Registration Closed'
            : tournament.entryMethods?.selfRegistration
            ? 'Register'
            : 'Request to Join'}
        </Button>

        {tournament.entryMethods?.joinCode && (
          <Button
            onClick={onJoinWithCode}
            disabled={isJoined}
            variant="secondary"
            className="flex-1 flex items-center justify-center gap-2"
            title={isJoined ? 'Already registered' : 'Enter a join code to register'}
          >
            <FaLock className="text-sm" />
            Use Code
          </Button>
        )}
      </div>
    </div>
  );
}
