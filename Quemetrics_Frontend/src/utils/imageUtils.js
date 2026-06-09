/**
 * Resolves a local or remote image path to a full URL.
 * Used for user avatars, club logos, etc.
 */
export const getImageUrl = (path) => {
  if (!path) return null;
  
  // If it's already a full URL or a DataURL, return as is
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  
  // Get the backend base URL from environment variables
  // VITE_API_URL is usually something like http://192.168.18.88:4000/api
  // We need to remove the /api suffix to get the root server URL
  const apiUrl = import.meta.env.VITE_API_URL || "";
  const baseUrl = apiUrl.replace(/\/api$/, "");
  
  // Ensure the path starts with a slash if it's relative
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  
  return `${baseUrl}${normalizedPath}`;
};
