import { supabase } from "../lib/supabase";

export async function fetchGrievances() {
  const { data, error } = await supabase
    .from("grievances")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

function createGrievanceId() {
  const year = new Date().getFullYear();
  const randomPart = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `SMART-${year}-${randomPart}`;
}

export async function saveGrievanceDraft({
  userId,
  originalComplaint,
  preparedGrievance,
  classification,
}) {
  const grievance = {
    user_id: userId,
    grievance_id: createGrievanceId(),
    org_code: classification?.org_code ?? null,
    category_v7: classification?.category_v7 ?? null,
    category_path: classification?.category_path ?? classification?.department ?? null,
    original_complaint: originalComplaint,
    prepared_grievance: preparedGrievance,
    status: "Draft",
  };

  const { data, error } = await supabase
    .from("grievances")
    .insert(grievance)
    .select()
    .single();

  if (error) throw error;
  return data;
}
