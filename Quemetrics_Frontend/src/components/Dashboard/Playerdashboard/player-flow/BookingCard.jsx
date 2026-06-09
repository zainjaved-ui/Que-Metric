import {
  FaUsers,
  FaCalendarDay,
  FaClock,
  FaTag,
  FaCheck,
  FaTimesCircle,
  FaCheckCircle,
} from 'react-icons/fa';

const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return new Date(dateString).toLocaleDateString('en-US', options);
};

const getStatusBadge = (status) => {
  if (!status) status = 'pending';
  if (status === 'confirmed') {
    return { bg: 'bg-green-100', text: 'text-green-800', icon: <FaCheck className="mr-1" /> };
  }
  if (status === 'pending') {
    return { bg: 'bg-yellow-100', text: 'text-yellow-800', icon: <FaClock className="mr-1" /> };
  }
  if (status === 'rejected' || status === 'cancelled') {
    return { bg: 'bg-red-100', text: 'text-red-800', icon: <FaTimesCircle className="mr-1" /> };
  }
  if (status === 'completed') {
    return { bg: 'bg-blue-100', text: 'text-blue-800', icon: <FaCheckCircle className="mr-1" /> };
  }
  return { bg: 'bg-gray-100', text: 'text-gray-800', icon: null };
};

export default function BookingCard({ booking, onConfirm, onReject, onCancel }) {
  const statusBadge = getStatusBadge(booking.status);
  const isCreator = booking.isCreator;
  const displayName =
    booking.title || booking.leagueName || booking.tournamentName || 'Unnamed';
  const isTournament = booking.bookingType === 'tournament';

  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden hover:shadow-lg transition">
      <div className="p-5">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-[#132F45]">{displayName}</h3>
            {isTournament && (
              <span className="text-xs font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">
                Tournament
              </span>
            )}
          </div>
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusBadge.bg} ${statusBadge.text}`}
          >
            {statusBadge.icon}
            {booking.status}
          </span>
        </div>

        <div className="space-y-2 text-gray-600 text-sm">
          <div className="flex items-center">
            <FaCalendarDay className="mr-2 text-[#132F45]" />
            <span>{formatDate(booking.date)}</span>
          </div>

          {booking.startTime && booking.endTime && (
            <div className="flex items-center">
              <FaClock className="mr-2 text-[#132F45]" />
              <span>
                {booking.startTime} - {booking.endTime}
              </span>
            </div>
          )}

          {booking.venueName && (
            <div className="flex items-center">
              <FaTag className="mr-2 text-[#132F45]" />
              <span>{booking.venueName}</span>
            </div>
          )}

          {booking.tableNumber && (
            <div className="flex items-center">
              <FaTag className="mr-2 text-[#132F45]" />
              <span>{booking.tableNumber}</span>
            </div>
          )}

          {booking.opponentName && booking.opponentName !== 'TBD' && (
            <div className="flex items-center">
              <FaUsers className="mr-2 text-[#132F45]" />
              <span>
                <strong>vs {booking.opponentName}</strong>
              </span>
            </div>
          )}
        </div>

        {!isCreator && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
            {booking.status === 'pending' && (
              <>
                <button
                  type="button"
                  onClick={() => onConfirm(booking.id)}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white px-3 py-2 rounded text-sm font-medium transition"
                >
                  <FaCheck className="inline mr-1" /> Accept
                </button>
                <button
                  type="button"
                  onClick={() => onReject(booking.id)}
                  className="flex-1 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded text-sm font-medium transition"
                >
                  <FaTimesCircle className="inline mr-1" /> Reject
                </button>
              </>
            )}
            {booking.status === 'confirmed' && (
              <button
                type="button"
                onClick={() => onCancel(booking.id)}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded text-sm font-medium transition"
              >
                <FaTimesCircle className="inline mr-1" /> Cancel
              </button>
            )}
          </div>
        )}

        {isCreator && (booking.status === 'pending' || booking.status === 'confirmed') && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => onCancel(booking.id)}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded text-sm font-medium transition"
            >
              <FaTimesCircle className="inline mr-1" /> Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
