import { createContext, useState, useCallback, useContext, useEffect, useRef, useMemo } from 'react';
import apiClient from './apiClient';
import { useNotification } from './NotificationContext';
import { AuthContext } from './AuthContext';

export const OrganizationContext = createContext();

export function OrganizationProvider({ children }) {
  const [organization, setOrganization] = useState(null);
  const [venueOwners, setVenueOwners] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [currentSeason, setCurrentSeason] = useState(null);
  const [clubs, setClubs] = useState([]);
  const [venues, setVenues] = useState([]);
  const [venueRequests, setVenueRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { showToast } = useNotification();
  const lastUserIdRef = useRef(null);

  // Clear all org state on logout or user switch
  const auth = useContext(AuthContext);
  const user = auth?.user;
  useEffect(() => {
    if (!user) {
      setOrganization(null);
      setVenueOwners([]);
      setSeasons([]);
      setCurrentSeason(null);
      setClubs([]);
      setVenues([]);
      setVenueRequests([]);
      lastUserIdRef.current = null;
      return;
    }
    if (lastUserIdRef.current && lastUserIdRef.current !== user.id) {
      // Different user — clear stale data
      setOrganization(null);
      setVenueOwners([]);
      setSeasons([]);
      setCurrentSeason(null);
      setClubs([]);
      setVenues([]);
      setVenueRequests([]);
    }
    lastUserIdRef.current = user.id;
  }, [user]);

  // Helper function to extract error message (from useSeasons)
  const extractErrorMessage = (err) => {
    if (!err) return 'An error occurred';
    if (err.response) {
      const serverError = err.response.data;
      if (serverError && serverError.error) {
        return typeof serverError.error === 'string' ? serverError.error : 'Server error occurred';
      }
      return `Request failed with status ${err.response.status}`;
    }
    if (err.request) return 'Network error. Please check your connection.';
    return err.message || 'An unexpected error occurred';
  };

  const getProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/organization/me');
      setOrganization(data.data);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProfile = useCallback(async (updateData) => {
    try {
      const { data } = await apiClient.put('/organization/me', updateData);
      setOrganization(data.data);
      return { success: true, message: 'Profile updated successfully' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  }, []);

  const getVenueOwners = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/organization/venue-owners');
      setVenueOwners(data.data);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  }, []);

  const inviteVenueOwner = useCallback(async (inviteData) => {
    try {
      await apiClient.post('/organization/venue-owners/invite', inviteData);
      await getVenueOwners();
      return { success: true, message: 'Invitation sent successfully' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  }, [getVenueOwners]);

  const removeVenueOwner = useCallback(async (id) => {
    try {
      await apiClient.delete(`/organization/venue-owners/${id}`);
      await getVenueOwners();
      return { success: true, message: 'Venue owner removed' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  }, [getVenueOwners]);

  // Season methods
  const getSeasons = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/organization/seasons', { params });
      setSeasons(data.data.seasons || []);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  }, []);

  const getCurrentSeason = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/organization/seasons/current');
      setCurrentSeason(data.data);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  }, []);

  const createSeason = useCallback(async (seasonData) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.post('/organization/seasons', seasonData);
      await getSeasons();
      await getCurrentSeason();
      showToast('Season created successfully!', 'success');
      return { success: true, data: data.data };
    } catch (err) {
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage);
      showToast(errorMessage, 'error');
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const updateSeason = useCallback(async (seasonId, updateData) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.put(`/organization/seasons/${seasonId}`, updateData);
      await getSeasons();
      await getCurrentSeason();
      showToast('Season updated successfully!', 'success');
      return { success: true, data: data.data };
    } catch (err) {
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage);
      showToast(errorMessage, 'error');
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const deleteSeason = useCallback(async (seasonId) => {
    setLoading(true);
    setError(null);
    try {
      await apiClient.delete(`/organization/seasons/${seasonId}`);
      setSeasons(prev => prev.filter(season => season.id !== seasonId));
      if (currentSeason && currentSeason.id === seasonId) {
        setCurrentSeason(null);
      }
      showToast('Season deleted successfully!', 'success');
      return { success: true };
    } catch (err) {
      const errorMessage = extractErrorMessage(err);
      setError(errorMessage);
      showToast(errorMessage, 'error');
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  }, [currentSeason, showToast]);

  // Club management methods
  const getClubs = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      // Use getMyClubs to get only clubs where the user is a member
      const { data } = await apiClient.get('/clubs/my-clubs');
      setClubs(data.data || []);
      return { success: true, data: data.data };
    } catch (error) {
      const errMsg = error.response?.data?.error || error.message || 'Network error';
      console.error('[OrganizationContext] getClubs error:', errMsg, error.response?.status);
      setClubs([]);
      return { success: false, error: `${errMsg} (HTTP ${error.response?.status || 'N/A'})` };
    } finally {
      setLoading(false);
    }
  }, []);

  const getVenues = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      // Fetch user's clubs and flatten their venues arrays
      const { data } = await apiClient.get('/clubs/my-clubs');
      const clubsData = (data.data || []).filter(c => c.status !== 'pending');
      const extracted = [];
      clubsData.forEach((c) => {
        const clubVenues = c.venues || [];
        if (Array.isArray(clubVenues)) {
          clubVenues.forEach((v) => {
            if (!v) return;
            // Normalize venue id and name
            let idVal = v.id || v.venueId || v._id;
            let nameVal = v.name || v.venueName;

            // Safety check: if nameVal is an object (like {name, slots}), extract its string
            if (nameVal && typeof nameVal === 'object') {
              nameVal = nameVal.name || nameVal.venueName || JSON.stringify(nameVal);
            }
            // Safety check: if v itself was mistakenly just a string
            if (typeof v === 'string') {
              nameVal = v;
              idVal = v;
            }

            if (!idVal && typeof nameVal === 'string') {
              idVal = nameVal;
            }

            const finalName = typeof nameVal === 'string' && nameVal.trim() !== ''
              ? nameVal
              : `${c.name} - Venue`;

            // If somehow id is still an object
            if (idVal && typeof idVal === 'object') {
              idVal = idVal.id || JSON.stringify(idVal);
            }

            extracted.push({ id: idVal || Math.random().toString(), name: finalName });
          });
        }
      });
      setVenues(extracted);
      return { success: true, data: extracted };
    } catch (error) {
      setVenues([]);
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  }, []);

  // New venue approval methods
  const getVenuesWithApprovalStatus = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/organization/venues/all');
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  }, []);

  const requestVenueApproval = useCallback(async (venueOwnerId) => {
    try {
      const { data } = await apiClient.post(`/organization/venues/${venueOwnerId}/request-approval`);
      return { success: true, data: data.data, message: data.message };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  }, []);

  const getApprovalRequests = useCallback(async () => {
    try {
      const { data } = await apiClient.get('/organization/venues/approval-requests');
      setVenueRequests(data.data || []);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  }, []);

  const approveVenueRequest = useCallback(async (requestId) => {
    try {
      const { data } = await apiClient.put(`/organization/venues/approval-requests/${requestId}/approve`);
      return { success: true, data: data.data, message: data.message };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  }, []);

  const rejectVenueRequest = useCallback(async (requestId, rejectionReason = '') => {
    try {
      const { data } = await apiClient.put(`/organization/venues/approval-requests/${requestId}/reject`, { rejectionReason });
      return { success: true, data: data.data, message: data.message };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  }, []);

  const getMyClubs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/clubs/my-clubs');
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  }, []);

  const getClubById = useCallback(async (identifier) => {
    try {
      const { data } = await apiClient.get(`/clubs/${identifier}`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  }, []);

  const createClub = async (clubData) => {
    try {
      const { data } = await apiClient.post('/clubs', clubData);
      await getClubs(); // Refresh the list
      return { success: true, data: data.data };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to create club');
    }
  };

  const updateClub = async (id, clubData) => {
    try {
      const { data } = await apiClient.put(`/clubs/${id}`, clubData);
      await getClubs(); // Refresh the list
      return { success: true, data: data.data };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to update club');
    }
  };

  const archiveClub = async (id) => {
    try {
      await apiClient.post(`/clubs/${id}/archive`);
      await getClubs(); // Refresh the list
      return { success: true, message: 'Club archived successfully' };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to archive club');
    }
  };

  const suspendClub = async (id) => {
    try {
      await apiClient.post(`/clubs/${id}/suspend`);
      await getClubs(); // Refresh the list
      return { success: true, message: 'Club suspended successfully' };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to suspend club');
    }
  };

  const reactivateClub = async (id) => {
    try {
      await apiClient.post(`/clubs/${id}/reactivate`);
      await getClubs(); // Refresh the list
      return { success: true, message: 'Club reactivated successfully' };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to reactivate club');
    }
  };

  const updateJoinSettings = async (clubId, settings) => {
    try {
      const { data } = await apiClient.put(`/clubs/${clubId}/join-settings`, settings);
      return { success: true, data: data.data };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to update join settings');
    }
  };

  // Club member management methods
  const getClubMembers = async (clubId, params = {}) => {
    try {
      const { data } = await apiClient.get(`/clubs/${clubId}/members`, { params });
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const inviteClubMember = async (clubId, memberData) => {
    try {
      const { data } = await apiClient.post(`/clubs/${clubId}/members/invite`, memberData);
      return { success: true, data: data.data };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to invite member');
    }
  };

  const removeClubMember = async (clubId, memberId) => {
    try {
      await apiClient.delete(`/clubs/${clubId}/members/${memberId}`);
      return { success: true, message: 'Member removed successfully' };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to remove member');
    }
  };

  const updateMemberRole = async (clubId, memberId, roleData) => {
    try {
      const { data } = await apiClient.put(`/clubs/${clubId}/members/${memberId}/role`, roleData);
      return { success: true, data: data.data };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to update member role');
    }
  };

  const transferClubOwnership = async (clubId, transferData) => {
    try {
      const { data } = await apiClient.post(`/clubs/${clubId}/transfer-ownership`, transferData);
      return { success: true, data: data.data };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to transfer ownership');
    }
  };

  const leaveClub = async (clubId) => {
    try {
      await apiClient.post(`/clubs/${clubId}/leave`);
      await getClubs(); // Refresh the list
      return { success: true, message: 'Left club successfully' };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to leave club');
    }
  };

  // Approve a player's club join request
  const approveMemberRequest = useCallback(async (clubId, memberId) => {
    try {
      const { data } = await apiClient.post(`/clubs/${clubId}/members/${memberId}/approve`);
      return { success: true, data: data.data, message: 'Join request approved' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to approve request' };
    }
  }, []);

  // Reject a player's club join request
  const rejectMemberRequest = useCallback(async (clubId, memberId) => {
    try {
      const { data } = await apiClient.post(`/clubs/${clubId}/members/${memberId}/reject`);
      return { success: true, data: data.data, message: 'Join request rejected' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to reject request' };
    }
  }, []);

  // Check if club can be deleted
  const canDeleteClub = async (clubId) => {
    try {
      const { data } = await apiClient.get(`/clubs/${clubId}/can-delete`);
      return { success: true, data: data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  // Permanently delete club (Super Admin only, test clubs with zero data)
  const permanentlyDeleteClub = async (id) => {
    try {
      await apiClient.delete(`/clubs/${id}`);
      await getClubs(); // Refresh the list
      return { success: true, message: 'Club permanently deleted' };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to delete club');
    }
  };

  // Generate invitation link for club
  const generateInvitationLink = async (clubId, expiryDays = 7) => {
    try {
      const { data } = await apiClient.post(`/clubs/${clubId}/generate-invitation`, { expiryDays });
      return { success: true, data: data.data };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to generate invitation link');
    }
  };

  // Verify club (Super Admin only)
  const verifyClub = async (clubId, isVerified, verificationNote) => {
    try {
      const { data } = await apiClient.post(`/clubs/${clubId}/verify`, { isVerified, verificationNote });
      await getClubs(); // Refresh the list
      return { success: true, data: data.data };
    } catch (error) {
      throw new Error(error.response?.data?.error || 'Failed to verify club');
    }
  };

  // Legacy method for backward compatibility
  const deleteClub = async (id) => {
    // Delegate to archiveClub since we use soft deletes
    return await archiveClub(id);
  };


  const value = useMemo(() => ({
    organization,
    venueOwners,
    venues,
    venueRequests,
    seasons,
    currentSeason,
    clubs,
    loading,
    getProfile,
    updateProfile,
    getVenueOwners,
    inviteVenueOwner,
    removeVenueOwner,
    getVenues,
    getVenuesWithApprovalStatus,
    requestVenueApproval,
    getApprovalRequests,
    approveVenueRequest,
    rejectVenueRequest,
    getSeasons,
    getCurrentSeason,
    createSeason,
    updateSeason,
    deleteSeason,
    // Club management
    getClubs,
    getMyClubs,
    getClubById,
    createClub,
    updateClub,
    archiveClub,
    suspendClub,
    reactivateClub,
    updateJoinSettings,
    canDeleteClub,
    permanentlyDeleteClub,
    generateInvitationLink,
    verifyClub,
    deleteClub, // Legacy alias for archiveClub
    // Club member management
    getClubMembers,
    inviteClubMember,
    removeClubMember,
    updateMemberRole,
    approveMemberRequest,
    rejectMemberRequest,
    transferClubOwnership,
    leaveClub,
  }), [
    organization, venueOwners, venues, venueRequests, seasons, currentSeason,
    clubs, loading, getProfile, updateProfile, getVenueOwners, inviteVenueOwner,
    removeVenueOwner, getVenues, getVenuesWithApprovalStatus, requestVenueApproval,
    getApprovalRequests, approveVenueRequest, rejectVenueRequest, getSeasons,
    getCurrentSeason, createSeason, updateSeason, deleteSeason, getClubs,
    getMyClubs, getClubById, createClub, updateClub, archiveClub, suspendClub,
    reactivateClub, updateJoinSettings, canDeleteClub, permanentlyDeleteClub,
    generateInvitationLink, verifyClub, deleteClub, getClubMembers,
    inviteClubMember, removeClubMember, updateMemberRole, transferClubOwnership,
    leaveClub
  ]);

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}