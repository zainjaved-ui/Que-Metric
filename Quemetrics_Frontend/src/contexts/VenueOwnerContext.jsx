import { createContext, useCallback, useState } from 'react';
import apiClient from './apiClient';

// eslint-disable-next-line react-refresh/only-export-components
export const VenueOwnerContext = createContext();

export function VenueOwnerProvider({ children }) {
  const [venueOwner, setVenueOwner] = useState(null);
  const [ownedVenues, setOwnedVenues] = useState([]);
  const [approvalRequests, setApprovalRequests] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const getProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/venue-owner/me');
      setVenueOwner(data.data);
      setOwnedVenues(data.data?.ownedVenues || []);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProfile = async (updateData) => {
    try {
      const { data } = await apiClient.put('/venue-owner/me', updateData);
      setVenueOwner(data.data);
      setOwnedVenues(data.data?.ownedVenues || ownedVenues);
      return { success: true, message: 'Profile updated successfully' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const getMyVenues = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/venue-owner/venues');
      setOwnedVenues(data.data || []);
      return { success: true, data: data.data || [] };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  }, []);

  const acceptInvitation = async (invitationToken, password) => {
    try {
      const { data } = await apiClient.post('/venue-owner/accept-invitation', { invitationToken, password });
      return { success: true, data: data.data, message: data.message };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const getApprovalRequests = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/venue-owner/approval-requests');
      setApprovalRequests(data.data || []);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const approveRequest = async (requestId) => {
    try {
      const { data } = await apiClient.put(`/venue-owner/approval-requests/${requestId}/approve`);
      await getApprovalRequests(); // Refresh the list
      return { success: true, data: data.data, message: data.message };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const rejectRequest = async (requestId, rejectionReason = '') => {
    try {
      const { data } = await apiClient.put(`/venue-owner/approval-requests/${requestId}/reject`, { rejectionReason });
      await getApprovalRequests(); // Refresh the list
      return { success: true, data: data.data, message: data.message };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const getDashboardStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/venue-owner/dashboard-stats');
      setDashboardStats(data.data);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  }, []);

  const getSlotAvailability = async (date) => {
    setLoading(true);
    try {
      const params = date ? { date: date.toISOString().split('T')[0] } : {};
      const { data } = await apiClient.get('/venue-owner/slot-availability', { params });
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const getAllBookings = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/venue-owner/all-bookings');
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const getMemberBookings = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/venue-owner/member-bookings');
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const createMemberBooking = async (bookingData) => {
    setLoading(true);
    try {
      const { data } = await apiClient.post('/venue-owner/new-member-booking', bookingData);
      return { success: true, data: data.data, message: 'Member booking created successfully' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const deleteBooking = async (bookingId) => {
    try {
      const { data } = await apiClient.delete(`/venue-owner/bookings/${bookingId}`);
      return { success: true, message: data.message };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const value = {
    venueOwner,
    ownedVenues,
    approvalRequests,
    dashboardStats,
    loading,
    getProfile,
    getMyVenues,
    updateProfile,
    acceptInvitation,
    getApprovalRequests,
    approveRequest,
    rejectRequest,
    getDashboardStats,
    getSlotAvailability,
    getAllBookings,
    getMemberBookings,
    createMemberBooking,
    deleteBooking,
  };

  return (
    <VenueOwnerContext.Provider value={value}>
      {children}
    </VenueOwnerContext.Provider>
  );
}
