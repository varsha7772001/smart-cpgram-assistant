import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    "Missing Supabase configuration. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY."
  );
}

try {
  const parsedUrl = new URL(supabaseUrl);
  if (parsedUrl.protocol !== "https:") throw new Error();
} catch {
  throw new Error("VITE_SUPABASE_URL must be a valid HTTPS URL.");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
