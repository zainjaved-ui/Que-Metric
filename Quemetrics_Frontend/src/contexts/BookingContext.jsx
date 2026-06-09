import { createContext, useState, useContext } from 'react';
import apiClient from './apiClient';

export const BookingContext = createContext();

export function BookingProvider({ children }) {
  const [loading, setLoading] = useState(false);

  const getSnookerLeagues = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/bookings/snooker-leagues');
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const getLeagueMatches = async (leagueId) => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/bookings/leagues/${leagueId}/matches`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const getPoolLeagues = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/bookings/pool-leagues');
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const getPoolMatches = async (leagueId) => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/bookings/pool-matches/${leagueId}`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const getPokerLeagues = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/bookings/poker-leagues');
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const getPokerMatches = async (leagueId) => {
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/bookings/poker-matches/${leagueId}`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const getAvailableVenues = async (leagueId) => {
    try {
      const { data } = await apiClient.get('/bookings/venues', { params: leagueId ? { leagueId } : {} });
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const getAvailableTimeSlots = async (venueId, date) => {
    try {
      const { data } = await apiClient.get('/bookings/time-slots', { params: { venueId, date } });
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const createBooking = async (bookingData) => {
    setLoading(true);
    try {
      const { data } = await apiClient.post('/bookings', bookingData);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const getMyBookings = async (status) => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/bookings/my-bookings', { params: status ? { status } : {} });
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const getCompletedBookings = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/bookings/my-bookings/completed');
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const confirmBooking = async (bookingId) => {
    try {
      const { data } = await apiClient.put(`/bookings/${bookingId}/confirm`);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const rejectBooking = async (bookingId, reason) => {
    try {
      const { data } = await apiClient.put(`/bookings/${bookingId}/reject`, { reason });
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const cancelBooking = async (bookingId, reason) => {
    try {
      const { data } = await apiClient.put(`/bookings/${bookingId}/cancel`, { reason });
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const value = {
    loading,
    getSnookerLeagues,
    getLeagueMatches,
    getPoolLeagues,
    getPoolMatches,
    getPokerLeagues,
    getPokerMatches,
    getAvailableVenues,
    getAvailableTimeSlots,
    createBooking,
    getMyBookings,
    getCompletedBookings,
    confirmBooking,
    rejectBooking,
    cancelBooking,
  };

  return (
    <BookingContext.Provider value={value}>
      {children}
    </BookingContext.Provider>
  );
}
