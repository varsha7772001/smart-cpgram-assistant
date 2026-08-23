const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

if (!configuredApiBaseUrl) {
  throw new Error("Missing VITE_API_BASE_URL configuration.");
}

try {
  const parsedUrl = new URL(configuredApiBaseUrl);
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error();
} catch {
  throw new Error("VITE_API_BASE_URL must be a valid HTTP(S) origin.");
}

export const API_BASE_URL = configuredApiBaseUrl.replace(/\/+$/, "");

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
