import { apiRequest } from "./api";

export function getGrievanceAssistance(complaint) {
  return apiRequest("/api/v1/grievance-assistance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ complaint }),
  });
}

export function checkAuthenticatedDuplicate({ complaint, categoryPath, history }) {
  const candidates = history.slice(0, 50).map((item) => ({
    grievance_id: item.grievance_id,
    category_path: item.category_path,
    status: item.status,
    created_at: item.created_at,
    submitted_at: item.submitted_at,
    original_complaint: item.original_complaint,
    prepared_grievance: item.prepared_grievance,
    complaint: item.complaint,
  }));
  return apiRequest("/api/v1/duplicate-check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ complaint, category_path: categoryPath, candidates }),
  });
}
