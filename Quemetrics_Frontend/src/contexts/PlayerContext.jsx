// import { createContext, useState, useEffect, useContext } from 'react';
import { createContext, useState, useEffect, useContext, useRef } from 'react';
import apiClient from './apiClient';
import { AuthContext } from './AuthContext';

// Player Context
// Player Context
export const PlayerContext = createContext();

export function PlayerProvider({ children }) {
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(false);
  // Track last known user ID so we can detect account switches
  const lastUserIdRef = useRef(null);

  // -- Get AuthContext user SAFELY (PlayerProvider is inside AuthProvider) --
  const auth = useContext(AuthContext);
  const user = auth?.user;

  // ─── Clear player when user logs out or switches account ─────────────────
  useEffect(() => {
    if (!user) {
      // User logged out → clear everything immediately
      setPlayer(null);
      lastUserIdRef.current = null;
      return;
    }
    if (lastUserIdRef.current && lastUserIdRef.current !== user.id) {
      // Different user logged in → wipe old data then re-fetch
      setPlayer(null);
    }
    lastUserIdRef.current = user.id;
  }, [user]);

  const getProfile = async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get('/player/me');
      setPlayer(data.data);
      return { success: true, data: data.data };
    } catch (error) {
      return { success: false, error: error.response?.data?.error };
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (updateData) => {
    try {
      // Make sure we're sending exactly what backend expects
      const dataToSend = {
        name: updateData.name || '',
        nickname: updateData.nickname || '',
        dateOfBirth: updateData.dateOfBirth || '',
        phoneNumber: updateData.phoneNumber || '',
        address: updateData.address || '',
        bio: updateData.bio || '',
        sports: updateData.sports || ['snooker'],
        disabilityFlag: updateData.disabilityFlag || false,
        identityChangeReason: updateData.identityChangeReason || '',
        nameChangeReason: updateData.nameChangeReason || '',
      };

      console.log('Sending to backend:', dataToSend); // Debug

      const { data } = await apiClient.put('/player/me', dataToSend);
      setPlayer(data.data);
      return { success: true, message: 'Profile updated successfully' };
    } catch (error) {
      console.error('Update error details:', {
        error: error.response?.data,
        status: error.response?.status,
      });
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to update profile'
      };
    }
  };

  const uploadAvatar = async (formData) => {
    try {
      const { data } = await apiClient.post('/player/me/avatar', formData);
      setPlayer((prev) => ({ ...prev, avatarUrl: data.data.avatarUrl }));
      return { success: true, message: 'Avatar uploaded successfully' };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Failed to upload avatar'
      };
    }
  };

  const getPlayersByClub = async (clubId) => {
    try {
      const { data } = await apiClient.get(`/player/club/${clubId}`);
      return { success: true, data: data.data || [] };
    } catch (error) {
      return {
        success: false,
        data: [],
        error: error.response?.data?.error || 'Failed to fetch club players'
      };
    }
  };

  const getDashboardOverview = async () => {
    try {
      const { data } = await apiClient.get('/player/dashboard/overview');
      return data;
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to fetch dashboard overview' };
    }
  };

  const getDashboardStats = async (leagueFilter = 'both', gameFilter = 'all') => {
    try {
      const { data } = await apiClient.get(`/player/dashboard/stats?leagueFilter=${leagueFilter}&game=${gameFilter}`);
      return data;
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to fetch dashboard stats' };
    }
  };

  const getFilteredStats = async (leagueFilter = 'both', gameFilter = 'all') => {
    try {
      const { data } = await apiClient.get(`/player/dashboard/filtered-stats?leagueFilter=${leagueFilter}&game=${gameFilter}`);
      return data;
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to fetch filtered stats' };
    }
  };

  const getPlayerTournaments = async () => {
    try {
      const { data } = await apiClient.get('/player/tournaments');
      return data;
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to fetch player tournaments' };
    }
  };

  const getStatsEngineData = async () => {
    try {
      const { data } = await apiClient.get('/player/dashboard/stats-engine');
      return data;
    } catch (error) {
      return { success: false, error: error.response?.data?.error || 'Failed to fetch stats engine data' };
    }
  };


  const value = {
    player,
    loading,
    getProfile,
    updateProfile,
    uploadAvatar,
    getPlayersByClub,
    getDashboardOverview,
    getDashboardStats,
    getFilteredStats,
    getPlayerTournaments,
    getStatsEngineData,
  };

  return (
    <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>
  );
}

// Hook to use player context
// export const usePlayer = () => {
//   const context = useContext(PlayerContext);
//   if (context === undefined) {
//     throw new Error('usePlayer must be used within a PlayerProvider');
//   }
//   return context;
// };
// Hook to use player context
export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (context === undefined) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
};