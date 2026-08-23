import { apiRequest } from "./api";

const DEMO_USER_ID = "DEMO035";

export async function fetchDemoGrievances() {
  const data = await apiRequest(`/api/users/${DEMO_USER_ID}/grievances`);
  return data.grievances ?? [];
}

export async function checkDemoDuplicate(complaint) {
  return apiRequest("/api/check-duplicate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: DEMO_USER_ID, complaint }),
  });
}
