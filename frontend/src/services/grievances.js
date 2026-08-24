import { supabase } from "../lib/supabase";

export async function fetchGrievances() {
  const { data, error } = await supabase
    .from("grievances")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export function createGrievanceId(prefix = "SMART") {
  const year = new Date().getFullYear();
  const randomPart = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `${prefix}-${year}-${randomPart}`;
}

function grievancePayload({ userId, grievanceId, originalComplaint, preparedGrievance, classification, status }) {
  return {
    user_id: userId,
    grievance_id: grievanceId,
    org_code: classification?.org_code ?? null,
    category_v7: classification?.category_v7 ?? null,
    category_path: classification?.category_path ?? classification?.department ?? null,
    original_complaint: originalComplaint,
    prepared_grievance: preparedGrievance,
    status,
  };
}

export async function saveGrievanceDraft({
  userId,
  originalComplaint,
  preparedGrievance,
  classification,
  existingGrievanceId,
}) {
  const grievanceId = existingGrievanceId || createGrievanceId();
  const grievance = grievancePayload({ userId, grievanceId, originalComplaint, preparedGrievance, classification, status: "Draft" });

  if (existingGrievanceId) {
    const { data, error } = await supabase
      .from("grievances")
      .update(grievance)
      .eq("user_id", userId)
      .eq("grievance_id", existingGrievanceId)
      .eq("status", "Draft")
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from("grievances")
    .insert(grievance)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function submitGrievance({
  userId,
  originalComplaint,
  preparedGrievance,
  classification,
  draftGrievanceId,
}) {
  const grievanceId = draftGrievanceId || createGrievanceId();
  const grievance = grievancePayload({ userId, grievanceId, originalComplaint, preparedGrievance, classification, status: "Pending" });

  const query = draftGrievanceId
    ? supabase
        .from("grievances")
        .update(grievance)
        .eq("user_id", userId)
        .eq("grievance_id", draftGrievanceId)
        .eq("status", "Draft")
    : supabase.from("grievances").insert(grievance);

  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}
