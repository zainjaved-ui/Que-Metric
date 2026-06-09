import { createContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from './apiClient';
import { AUTH_FORCE_LOGOUT_EVENT } from './apiClient';

export const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // ✅ Helper function to restore user from storage
  const restoreUserFromStorage = () => {
    try {
      // Check localStorage first (Remember Me = checked)
      let token = localStorage.getItem('accessToken');
      let userData = localStorage.getItem('user');

      // If not in localStorage, check sessionStorage (Remember Me = unchecked)
      if (!token) {
        token = sessionStorage.getItem('accessToken');
        userData = sessionStorage.getItem('user');
      }

      if (token && userData) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        console.log('[AuthContext] ✅ User restored from storage:', parsedUser.email);
        return true;
      }
      return false;
    } catch (error) {
      console.error('[AuthContext] Error restoring user from storage:', error);
      return false;
    }
  };

  // ✅ Initial load - restore from storage
  useEffect(() => {
    restoreUserFromStorage();
    setLoading(false);

    // ✅ Listen for storage changes across tabs/windows
    const handleStorageChange = (event) => {
      console.log('[AuthContext] 🔄 Storage event detected:', event.key);

      // If storage is cleared or auth tokens removed
      if (!event.key || event.key.includes('accessToken')) {
        const stillHasToken =
          localStorage.getItem('accessToken') ||
          sessionStorage.getItem('accessToken');

        if (!stillHasToken) {
          console.log('[AuthContext] 🚨 Auth tokens removed, clearing user');
          setUser(null);
        } else {
          // Token still exists, restore user
          console.log('[AuthContext] ✅ Auth token still exists, restoring user');
          restoreUserFromStorage();
        }
      }

      // If localStorage is cleared from another tab
      if (event.key === null) {
        console.log('[AuthContext] 💥 LocalStorage cleared from another tab');
        // Check if we need to update
        if (!localStorage.getItem('accessToken') && !sessionStorage.getItem('accessToken')) {
          setUser(null);
        }
      }
    };

    // Listen for storage changes across tabs/windows
    window.addEventListener('storage', handleStorageChange);
    const handleForceLogout = () => {
      setUser(null);
    };
    window.addEventListener(AUTH_FORCE_LOGOUT_EVENT, handleForceLogout);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(AUTH_FORCE_LOGOUT_EVENT, handleForceLogout);
    };
  }, [navigate]);

  const login = async (email, password, role = null, rememberMe = false) => {
    try {
      const { data } = await apiClient.post('/auth/login', {
        email,
        password,
        role: role || undefined,
      });

      // Multiple role contexts available — ask user to choose
      if (data.requiresRoleSelection && data.availableRoles) {
        return {
          success: true,
          requiresRoleSelection: true,
          availableRoles: data.availableRoles,
          roleSelectionToken: data.roleSelectionToken,  // ✅ Include temporary token
          email: data.email,
          message: data.message,
        };
      }

      // ✅ Save token and user based on "Remember Me" flag
      if (rememberMe) {
        // Save email + token in localStorage (persistent)
        localStorage.setItem('accessToken', data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);
        localStorage.setItem('user', JSON.stringify(data.data.user));
        localStorage.setItem('email', email);
        // Clear sessionStorage if it exists
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('email');
      } else {
        // Save only token in sessionStorage (clears when browser closes)
        sessionStorage.setItem('accessToken', data.data.accessToken);
        sessionStorage.setItem('refreshToken', data.data.refreshToken);
        sessionStorage.setItem('user', JSON.stringify(data.data.user));
        sessionStorage.setItem('email', email);
        // Clear localStorage to avoid conflicts
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        localStorage.removeItem('email');
      }

      setUser(data.data.user);

      // Check for redirect URL (e.g., from club invitation)
      const redirectUrl = localStorage.getItem('redirectAfterLogin');
      if (redirectUrl) {
        localStorage.removeItem('redirectAfterLogin');
        sessionStorage.setItem('justLoggedIn', 'true');
        navigate(redirectUrl);
        return { success: true };
      }

      // Route based on the ACTIVE role context (may differ from primaryRole)
      const activeRole = data.data.user.role;
      const roleRoutes = {
        player: '/player/dashboard',
        organization: '/organization/dashboard',
        venue_owner: '/venue-owner/dashboard',
        super_admin: '/admin/dashboard',
      };

      navigate(roleRoutes[activeRole] || '/');

      return { success: true };
    } catch (error) {
      const errorResponse = error.response?.data;

      // Handle email verification requirement
      if (errorResponse?.requiresEmailVerification || errorResponse?.requiresVerification) {
        return {
          success: false,
          error: errorResponse.error || 'Please verify your email address before logging in.',
          requiresVerification: true,
          email: errorResponse.email,
        };
      }

      return {
        success: false,
        error: errorResponse?.error || 'Login failed',
      };
    }
  };

  const registerPlayer = async (formData) => {
    try {
      const { data } = await apiClient.post('/auth/register/player', formData);

      // ✅ FIXED: Do NOT auto-login after registration
      // User must verify email and then login
      return {
        success: true,
        requiresVerification: true,
        email: formData.email,
        message: data.message || 'Registration successful! Please check your email to verify your account before logging in.'
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Registration failed',
      };
    }
  };

  const registerOrganization = async (formData) => {
    try {
      const { data } = await apiClient.post('/auth/register/organization', formData);

      return {
        success: true,
        requiresVerification: true,
        email: formData.email,
        availableRoles: data.data?.availableRoles || ["organization"],
        message: data.message || 'Registration successful! After verifying your email, you can log in and switch between organizer and player roles.',
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.error || 'Registration failed',
      };
    }
  };

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
      console.log('[AuthContext] ✅ Backend logout successful');
    } catch (error) {
      console.error('[AuthContext] Backend logout error (non-blocking):', error);
    } finally {
      // ✅ Clear from both localStorage and sessionStorage
      console.log('[AuthContext] 🧹 Clearing all storage and user state');
      localStorage.clear();
      sessionStorage.clear();
      setUser(null);
      navigate('/login');
    }
  };

  // ✅ Called by Login component after role selection
  const setUserAfterRoleSelection = (userData) => {
    if (userData) {
      setUser(userData);
      console.log('[AuthContext] ✅ User set after role selection:', userData.email);
    }
  };

  const value = {
    user,
    loading,
    login,
    registerPlayer,
    registerOrganization,
    logout,
    restoreUserFromStorage,
    setUserAfterRoleSelection,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
