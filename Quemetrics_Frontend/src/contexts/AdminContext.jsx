import { createContext, useState } from 'react';
import apiClient from './apiClient';

export const AdminContext = createContext();

export function AdminProvider({ children }) {
  const [pendingOrganizations, setPendingOrganizations] = useState([]);
  const [allOrganizations, setAllOrganizations] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [loading, setLoading] = useState(false);

  const getPendingOrganizations = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/admin/organizations/pending');
      setPendingOrganizations(data.data);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const getAllOrganizations = async (params = {}) => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/admin/organizations', { params });
      setAllOrganizations(data.data.organizations);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const approveOrganization = async (id) => {
    try {
      await apiClient.post(`/admin/organizations/${id}/approve`);
      setPendingOrganizations((prev) => prev.filter((o) => o.id !== id));
      return { success: true, message: 'Organization approved' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const rejectOrganization = async (id, reason) => {
    try {
      await apiClient.post(`/admin/organizations/${id}/reject`, { reason });
      setPendingOrganizations((prev) => prev.filter((o) => o.id !== id));
      return { success: true, message: 'Organization rejected' };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    }
  };

  const getAllPlayers = async (params = {}) => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/admin/players', { params });
      setAllPlayers(data.data.players);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const value = {
    pendingOrganizations,
    allOrganizations,
    allPlayers,
    loading,
    getPendingOrganizations,
    getAllOrganizations,
    approveOrganization,
    rejectOrganization,
    getAllPlayers,
  };

  return (
    <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
  );
}
