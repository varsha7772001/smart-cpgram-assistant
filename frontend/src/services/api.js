export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // A stable fallback is more useful to citizens than leaking provider output.
  }
  if (!response.ok) {
    throw new Error(payload?.detail || "The service is temporarily unavailable. Please try again.");
  }
  return payload;
}
