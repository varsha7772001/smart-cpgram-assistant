import { supabase } from "../lib/supabase";

export async function fetchGrievances() {
  const user = await requireAuthenticatedUser();
  const { data, error } = await supabase
    .from("grievances")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

async function requireAuthenticatedUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) {
    throw new Error("Your session has expired. Please sign in again.");
  }
  return data.session.user;
}

export function createGrievanceId(prefix = "SMART") {
  const year = new Date().getFullYear();
  const randomPart = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  return `${prefix}-${year}-${randomPart}`;
}

function isReferenceCollision(error) {
  return error?.code === "23505" && String(error?.message || "").includes("grievance_id");
}

function grievancePayload({ userId, grievanceId, originalComplaint, preparedGrievance, classification, status, submittedAt = null }) {
  return {
    user_id: userId,
    grievance_id: grievanceId,
    org_code: classification?.org_code ?? null,
    category_v7: classification?.category_v7 ?? null,
    category_path: classification?.category_path ?? classification?.department ?? null,
    original_complaint: originalComplaint,
    prepared_grievance: preparedGrievance,
    status,
    submitted_at: submittedAt,
  };
}

export async function saveGrievanceDraft({
  originalComplaint,
  preparedGrievance,
  classification,
  existingGrievanceId,
}) {
  const user = await requireAuthenticatedUser();
  const userId = user.id;
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

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = attempt === 0 ? grievance : { ...grievance, grievance_id: createGrievanceId() };
    const { data, error } = await supabase.from("grievances").insert(candidate).select().single();
    if (!error) return data;
    if (!isReferenceCollision(error) || attempt === 2) throw error;
  }
  throw new Error("Unable to generate a unique prototype reference.");
}

export async function submitGrievance({
  originalComplaint,
  preparedGrievance,
  classification,
  draftGrievanceId,
}) {
  const user = await requireAuthenticatedUser();
  const userId = user.id;
  const grievanceId = draftGrievanceId || createGrievanceId();
  const grievance = grievancePayload({ userId, grievanceId, originalComplaint, preparedGrievance, classification, status: "Pending", submittedAt: new Date().toISOString() });

  if (draftGrievanceId) {
    const { data, error } = await supabase
      .from("grievances")
      .update(grievance)
      .eq("user_id", userId)
      .eq("grievance_id", draftGrievanceId)
      .eq("status", "Draft")
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const candidate = attempt === 0 ? grievance : { ...grievance, grievance_id: createGrievanceId() };
    const { data, error } = await supabase.from("grievances").insert(candidate).select().single();
    if (!error) return data;
    if (!isReferenceCollision(error) || attempt === 2) throw error;
  }
  throw new Error("Unable to generate a unique prototype reference.");
}
