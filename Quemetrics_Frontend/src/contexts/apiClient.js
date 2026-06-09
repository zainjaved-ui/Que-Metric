import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '';
export const AUTH_FORCE_LOGOUT_EVENT = 'auth:force-logout';
let isForceLogoutInProgress = false;
let isTokenRefreshInProgress = false;
let refreshTokenPromise = null;

const AUTH_EXCLUDED_PATHS = ['/auth/login', '/auth/refresh-token', '/auth/logout'];

const isExcludedAuthPath = (url = '') =>
  AUTH_EXCLUDED_PATHS.some((path) => url.includes(path));

export const forceLogout = (reason = 'Session expired. Please login again.') => {
  if (isForceLogoutInProgress) {
    return;
  }
  isForceLogoutInProgress = true;
  isTokenRefreshInProgress = false; // Reset refresh flag
  refreshTokenPromise = null;

  localStorage.clear();
  sessionStorage.clear();

  window.dispatchEvent(
    new CustomEvent('show-toast', {
      detail: {
        message: reason,
        type: 'warning',
      },
    })
  );

  window.dispatchEvent(
    new CustomEvent(AUTH_FORCE_LOGOUT_EVENT, {
      detail: { reason },
    })
  );

  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
    return;
  }

  // If already on login route, do not permanently lock the guard.
  setTimeout(() => {
    isForceLogoutInProgress = false;
  }, 500);
};

/**
 * Attempts to refresh the access token using the refresh token.
 * Returns the new access token if successful, or rejects if refresh fails.
 * Uses a shared promise to prevent multiple simultaneous refresh attempts.
 */
const refreshAccessToken = async () => {
  // If a refresh is already in progress, return the same promise
  if (refreshTokenPromise) {
    return refreshTokenPromise;
  }

  // Create the refresh promise to be shared across all concurrent requests
  refreshTokenPromise = (async () => {
    try {
      isTokenRefreshInProgress = true;

      // Get the refresh token from storage
      let refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        refreshToken = sessionStorage.getItem('refreshToken');
      }

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      // Make the refresh request directly with axios to avoid interceptor recursion
      const response = await axios.post(
        `${API_URL}/auth/refresh-token`,
        { refreshToken },
        {
          baseURL: API_URL,
          headers: { 'Content-Type': 'application/json' },
          withCredentials: true,
        }
      );

      if (!response.data.success || !response.data.data.accessToken) {
        throw new Error('Invalid refresh response');
      }

      const newAccessToken = response.data.data.accessToken;

      // Update token in storage (maintain localStorage/sessionStorage consistency)
      if (localStorage.getItem('accessToken')) {
        localStorage.setItem('accessToken', newAccessToken);
      } else {
        sessionStorage.setItem('accessToken', newAccessToken);
      }

      console.log('[apiClient] ✅ Token refreshed successfully');
      isTokenRefreshInProgress = false;
      return newAccessToken;
    } catch (error) {
      console.error('[apiClient] ❌ Token refresh failed:', error.message);
      isTokenRefreshInProgress = false;
      // If refresh fails, force logout
      forceLogout('Session expired. Please log in again.');
      throw error;
    } finally {
      // Reset the promise so a new refresh can be attempted later
      refreshTokenPromise = null;
    }
  })();

  return refreshTokenPromise;
};

const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 30000, // 30 seconds max - FIXES infinite spinner
});

// Request interceptor - attach token
apiClient.interceptors.request.use(
  (config) => {
    let token = localStorage.getItem('accessToken');
    if (!token) {
      token = sessionStorage.getItem('accessToken');
    }
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle global auth errors with token refresh retry
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config || {};

    // Identify auth endpoints to avoid redirect loops while logging in/out
    const isAuthRequest = isExcludedAuthPath(originalRequest.url || '');

    // Only attempt token refresh on 401 for non-auth requests that haven't been retried yet
    if (
      error.response?.status === 401 &&
      !isAuthRequest &&
      !originalRequest._retryWithRefresh &&
      !isForceLogoutInProgress
    ) {
      try {
        console.log('[apiClient] 🔄 Attempting to refresh token...');
        // Mark this request as having attempted a refresh
        originalRequest._retryWithRefresh = true;

        // Attempt to refresh the token
        const newToken = await refreshAccessToken();

        // Update the request with the new token
        originalRequest.headers.Authorization = `Bearer ${newToken}`;

        // Retry the original request with the new token
        console.log('[apiClient] 🔁 Retrying original request with new token');
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Token refresh failed - proceed to force logout
        console.error('[apiClient] ⚠️ Token refresh failed, forcing logout:', refreshError.message);
        return Promise.reject(error);
      }
    }

    // If it's a 401 and we've already attempted refresh, or it's an auth request, force logout
    if (error.response?.status === 401 && !isAuthRequest) {
      forceLogout('Session expired. Please login again.');
      return Promise.reject(error);
    }

    // Global Error Handling for other statuses (403, 404, 500, etc.)
    if (error.response) {
      const status = error.response.status;
      const message = error.response.data?.error || error.response.data?.message || 'An unexpected error occurred';

      // Prefer the backend's specific error message when it provided one —
      // generic phrases hide real causes (e.g. "Join by code is currently
      // disabled" being rewritten to "Access denied" misleads the user).
      // Fall back to the generic phrasing only when the backend gave no body.
      const hasBackendMessage = !!(error.response.data?.error || error.response.data?.message);
      let userFriendlyMessage = message;
      if (status === 403 && !hasBackendMessage) userFriendlyMessage = 'Access denied. You do not have permission to perform this action.';
      if (status === 404 && !hasBackendMessage) userFriendlyMessage = 'The requested resource was not found.';
      if (status >= 500) userFriendlyMessage = 'Something went wrong on our end. Please try again later.';

      // Dispatch custom event for ToastProvider
      const toastEvent = new CustomEvent('show-toast', {
        detail: {
          message: userFriendlyMessage,
          type: 'error'
        }
      });
      window.dispatchEvent(toastEvent);
    } else if (error.code === 'ECONNABORTED') {
      // Timeout error
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: {
          message: 'Request timed out. Please try again.',
          type: 'error'
        }
      }));
    } else if (error.request) {
      // Network error (no response received)
      window.dispatchEvent(new CustomEvent('show-toast', {
        detail: {
          message: 'Network error. Please check your internet connection.',
          type: 'error'
        }
      }));
    }

    return Promise.reject(error);
  }
);

export default apiClient;
