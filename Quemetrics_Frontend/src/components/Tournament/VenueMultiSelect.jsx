import React, { useState, useMemo } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { FaSpinner, FaX } from 'react-icons/fa6';

/**
 * VenueMultiSelect
 * A reusable multi-select component for venue selection in tournaments.
 *
 * Props:
 * - venues: Array of venue objects
 * - selectedVenueIds: Array of selected venue IDs
 * - onChange: Callback when selected venues change
 * - venuesLoading: Boolean indicating loading state
 * - currentOrganizerId: Current user's organization ID
 * - allowSingleSelect: If true, only one venue can be selected
 */
export default function VenueMultiSelect({
  venues = [],
  selectedVenueIds = [],
  onChange,
  venuesLoading = false,
  currentOrganizerId = null,
  allowSingleSelect = false,
  required = true,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter and sort venues based on search and ownership
  const filteredVenues = useMemo(() => {
    let result = venues.filter((v) => {
      const normalizedQuery = searchQuery.trim().toLowerCase();
      if (!normalizedQuery) return true;
      const name = (v.name || v.venueName || '').toLowerCase();
      const address = (v.address || '').toLowerCase();
      return name.includes(normalizedQuery) || address.includes(normalizedQuery);
    });

    // Sort: owned venues first, then others
    return result.sort((a, b) => {
      const aIsOwned = currentOrganizerId && a.organizationId === currentOrganizerId;
      const bIsOwned = currentOrganizerId && b.organizationId === currentOrganizerId;
      if (aIsOwned && !bIsOwned) return -1;
      if (!aIsOwned && bIsOwned) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [venues, searchQuery, currentOrganizerId]);

  // Get owned and external venues
  const ownedVenues = filteredVenues.filter(
    (v) => currentOrganizerId && v.organizationId === currentOrganizerId
  );
  const externalVenues = filteredVenues.filter(
    (v) => !(currentOrganizerId && v.organizationId === currentOrganizerId)
  );

  // Get selected venue objects
  const selectedVenues = venues.filter((v) =>
    selectedVenueIds.includes(v.id)
  );

  const handleToggleVenue = (venueId) => {
    let newIds;
    if (allowSingleSelect) {
      // Single select mode
      newIds = selectedVenueIds.includes(venueId) ? [] : [venueId];
    } else {
      // Multi-select mode
      newIds = selectedVenueIds.includes(venueId)
        ? selectedVenueIds.filter((id) => id !== venueId)
        : [...selectedVenueIds, venueId];
    }
    onChange?.(newIds);
  };

  const handleRemoveVenue = (venueId) => {
    const newIds = selectedVenueIds.filter((id) => id !== venueId);
    onChange?.(newIds);
  };

  return (
    <div className="space-y-2">
      {/* Selected Venues Display */}
      {selectedVenues.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {selectedVenues.map((venue) => (
            <div
              key={venue.id}
              className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-900 rounded-full text-sm font-medium"
            >
              <span>
                {venue.name || venue.venueName}
                {currentOrganizerId &&
                  venue.organizationId !== currentOrganizerId && (
                    <span className="text-xs ml-1 opacity-75">
                      ({venue.ownerOrganizationName || 'Other Organizer'})
                    </span>
                  )}
              </span>
              {!allowSingleSelect && (
                <button
                  type="button"
                  onClick={() => handleRemoveVenue(venue.id)}
                  className="ml-1 hover:opacity-70 transition-opacity"
                  aria-label={`Remove ${venue.name}`}
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Dropdown Button/Input */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full px-4 py-2 border rounded-lg text-left flex items-center justify-between ${
            isOpen
              ? 'border-blue-500 focus:ring-2 focus:ring-blue-200 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-gray-400'
          } transition-colors`}
        >
          <span className={selectedVenueIds.length === 0 ? 'text-gray-500' : 'text-gray-900'}>
            {venuesLoading ? (
              <span className="flex items-center gap-2">
                <FaSpinner className="animate-spin" /> Loading venues...
              </span>
            ) : selectedVenueIds.length === 0 ? (
              'Select venues...'
            ) : (
              <span className="flex flex-wrap gap-1">
                {selectedVenues.map((v) => (
                  <span key={v.id} className="text-sm">
                    {v.name || v.venueName}
                    {selectedVenues.length > 1 && selectedVenues.indexOf(v) < selectedVenues.length - 1 && ','}
                  </span>
                ))}
              </span>
            )}
          </span>
          <svg
            className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 14l-7 7m0 0l-7-7m7 7V3"
            />
          </svg>
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-lg z-50">
            {/* Search Input */}
            <div className="p-3 border-b border-gray-200">
              <input
                type="text"
                placeholder="Search venues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Venue List */}
            <div className="max-h-60 overflow-y-auto">
              {filteredVenues.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  {searchQuery ? 'No venues match your search' : 'No venues available'}
                </div>
              ) : (
                <>
                  {/* Owned Venues Group */}
                  {ownedVenues.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-600 border-b border-gray-200">
                        ✓ Your Venues
                      </div>
                      {ownedVenues.map((venue) => (
                        <label
                          key={venue.id}
                          className="flex items-start p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <input
                            type={allowSingleSelect ? 'radio' : 'checkbox'}
                            name={
                              allowSingleSelect
                                ? 'venue-select'
                                : `venue-${venue.id}`
                            }
                            checked={selectedVenueIds.includes(venue.id)}
                            onChange={() => handleToggleVenue(venue.id)}
                            className="mt-1 rounded border-gray-300 text-blue-600"
                          />
                          <div className="ml-3 flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {venue.name || venue.venueName}
                            </p>
                            {venue.address && (
                              <p className="text-xs text-gray-500 mt-1">{venue.address}</p>
                            )}
                          </div>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* External Venues Group */}
                  {externalVenues.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-600 border-b border-gray-200">
                        Other Organizer Venues
                      </div>
                      {externalVenues.map((venue) => (
                        <label
                          key={venue.id}
                          className="flex items-start p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <input
                            type={allowSingleSelect ? 'radio' : 'checkbox'}
                            name={
                              allowSingleSelect
                                ? 'venue-select'
                                : `venue-${venue.id}`
                            }
                            checked={selectedVenueIds.includes(venue.id)}
                            onChange={() => handleToggleVenue(venue.id)}
                            className="mt-1 rounded border-gray-300 text-blue-600"
                          />
                          <div className="ml-3 flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {venue.name || venue.venueName}
                            </p>
                            {venue.address && (
                              <p className="text-xs text-gray-500 mt-1">{venue.address}</p>
                            )}
                            <p className="text-xs text-amber-600 mt-1">
                              🔒 Requires owner approval
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-3 border-t border-gray-200 flex gap-2 justify-end bg-gray-50">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  setSearchQuery('');
                }}
                className="px-3 py-1 text-sm text-gray-700 hover:bg-gray-200 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Validation Message */}
      {required && selectedVenueIds.length === 0 && (
        <p className="text-xs text-red-600 mt-1">At least one venue must be selected</p>
      )}

      {/* Info Message for External Venues */}
      {selectedVenues.some(
        (v) => currentOrganizerId && v.organizationId !== currentOrganizerId
      ) && (
        <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <p className="text-sm font-semibold text-yellow-900">
            Venue approval required from owner
          </p>
          <p className="text-xs text-yellow-800 mt-1">
            These venues belong to other organizers. Their approval is required before
            the tournament can proceed.
          </p>
        </div>
      )}

      {/* Help Text */}
      {venues.length === 0 && !venuesLoading && (
        <p className="text-xs text-gray-600 mt-2">
          Using your club's default primary venue (no venues available for selection).
        </p>
      )}
    </div>
  );
}
