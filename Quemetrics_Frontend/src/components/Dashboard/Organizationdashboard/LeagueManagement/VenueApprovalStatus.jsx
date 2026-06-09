import React from 'react';
import { FaCheck, FaHourglass, FaTimes, FaMapMarkerAlt } from 'react-icons/fa';

/**
 * Component to display venue approval status breakdown
 * Shows which venues need approval from which owners
 */
const VenueApprovalStatus = ({ league }) => {
  if (!league) return null;

  const { venueApprovalBreakdown, venueApprovalSummary } = league;
  
  if (!venueApprovalBreakdown || venueApprovalBreakdown.length === 0) {
    return null;
  }

  const getStatusInfo = (status) => {
    switch (status) {
      case 'approved':
        return {
          icon: <FaCheck />,
          bgColor: 'bg-green-50',
          textColor: 'text-green-700',
          borderColor: 'border-green-200',
          label: 'Approved',
          badgeColor: 'bg-green-100'
        };
      case 'pending':
        return {
          icon: <FaHourglass />,
          bgColor: 'bg-yellow-50',
          textColor: 'text-yellow-700',
          borderColor: 'border-yellow-200',
          label: 'Pending',
          badgeColor: 'bg-yellow-100'
        };
      case 'rejected':
        return {
          icon: <FaTimes />,
          bgColor: 'bg-red-50',
          textColor: 'text-red-700',
          borderColor: 'border-red-200',
          label: 'Rejected',
          badgeColor: 'bg-red-100'
        };
      default:
        return {
          icon: <FaHourglass />,
          bgColor: 'bg-gray-50',
          textColor: 'text-gray-700',
          borderColor: 'border-gray-200',
          label: 'Unknown',
          badgeColor: 'bg-gray-100'
        };
    }
  };

  return (
    <div className="mt-6 border-t pt-4">
      {/* Summary Section */}
      {venueApprovalSummary && venueApprovalSummary.total > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <FaMapMarkerAlt className="text-blue-600" />
            Venue Status
          </h4>
          
          {/* Summary Stats */}
          <div className="grid grid-cols-4 gap-2 mb-4">
            <div className="text-center bg-blue-50 p-2 rounded border border-blue-100">
              <div className="text-lg font-bold text-blue-700">{venueApprovalSummary.total}</div>
              <div className="text-xs text-blue-600">Total</div>
            </div>
            <div className="text-center bg-green-50 p-2 rounded border border-green-100">
              <div className="text-lg font-bold text-green-700">{venueApprovalSummary.approved}</div>
              <div className="text-xs text-green-600">Approved</div>
            </div>
            <div className="text-center bg-yellow-50 p-2 rounded border border-yellow-100">
              <div className="text-lg font-bold text-yellow-700">{venueApprovalSummary.pending}</div>
              <div className="text-xs text-yellow-600">Pending</div>
            </div>
            {venueApprovalSummary.rejected > 0 && (
              <div className="text-center bg-red-50 p-2 rounded border border-red-100">
                <div className="text-lg font-bold text-red-700">{venueApprovalSummary.rejected}</div>
                <div className="text-xs text-red-600">Rejected</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detailed Breakdown */}
      <div className="space-y-2">
        {venueApprovalBreakdown.map((item, idx) => {
          const statusInfo = getStatusInfo(item.status);
          
          // Extract proper venue name from composite ID if needed
          let displayVenueName = item.venueName || 'Unknown Venue';
          if (displayVenueName && displayVenueName.includes(':')) {
            // Composite format: venueOwnerId:venueName - extract the name part
            displayVenueName = displayVenueName.split(':')[1];
          }
          
          return (
            <div
              key={`${item.requestId}-${idx}`}
              className={`p-3 rounded border-l-4 flex items-start justify-between ${statusInfo.bgColor} ${statusInfo.borderColor} border`}
            >
              <div className="flex items-start gap-3 flex-1">
                <div className={`mt-1 ${statusInfo.textColor} text-lg`}>
                  {statusInfo.icon}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{displayVenueName}</div>
                  {item.venueOwner && (
                    <div className="text-xs text-gray-600 mt-0.5">
                      Owner: {item.venueOwner.name || item.venueOwner.venueName || 'Unknown'}
                    </div>
                  )}
                  {item.status === 'pending' && (
                    <div className="text-xs text-gray-500 mt-1 italic">
                      Waiting for owner to approve
                    </div>
                  )}
                  {item.status === 'rejected' && item.notes && (
                    <div className="text-xs text-red-600 mt-1">
                      Reason: {item.notes}
                    </div>
                  )}
                </div>
              </div>
              <div className={`px-2 py-1 rounded text-xs font-semibold ml-2 whitespace-nowrap ${statusInfo.badgeColor} ${statusInfo.textColor}`}>
                {statusInfo.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Important Notice */}
      {venueApprovalSummary && venueApprovalSummary.pending > 0 && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          <strong>⚠️ Note:</strong> This league cannot be started until all venue owners approve. 
          {venueApprovalSummary.pending === 1 
            ? ' 1 venue owner is awaiting response.' 
            : ` ${venueApprovalSummary.pending} venue owners are awaiting response.`}
        </div>
      )}

      {venueApprovalSummary && venueApprovalSummary.rejected > 0 && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          <strong>❌ Alert:</strong> 
          {venueApprovalSummary.rejected === 1 
            ? ' 1 venue owner has rejected this request.' 
            : ` ${venueApprovalSummary.rejected} venue owners have rejected this request.`}
          {' '}This league cannot be started.
        </div>
      )}

      {venueApprovalSummary && 
       venueApprovalSummary.approved === venueApprovalSummary.total && 
       venueApprovalSummary.total > 0 && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-800">
          <strong>✅ Success:</strong> All venue owners have approved! You can now start this league.
        </div>
      )}
    </div>
  );
};

export default VenueApprovalStatus;
