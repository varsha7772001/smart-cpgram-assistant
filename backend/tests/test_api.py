import os
import unittest
from unittest.mock import patch

os.environ.setdefault("OPENROUTER_API_KEY", "test-key")
os.environ.setdefault("DEMO_ADMIN_API_KEY", "test-admin-key")

from fastapi import HTTPException
from fastapi.testclient import TestClient

import main


class ApiValidationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(main.app)

    def test_empty_complaint_rejected(self):
        response = self.client.post("/api/v1/grievance-assistance", json={"complaint": "   "})
        self.assertEqual(response.status_code, 422)

    def test_oversized_complaint_rejected(self):
        response = self.client.post(
            "/api/v1/grievance-assistance",
            json={"complaint": "x" * (main.MAX_COMPLAINT_LENGTH + 1)},
        )
        self.assertEqual(response.status_code, 422)

    def test_malformed_provider_response_is_hidden(self):
        with self.assertRaises(HTTPException) as raised:
            main.parse_model_json("not-json")
        self.assertEqual(raised.exception.status_code, 502)
        self.assertNotIn("not-json", raised.exception.detail)

    def test_missing_api_key_is_handled(self):
        with patch.object(main, "OPENROUTER_API_KEY", None):
            with self.assertRaises(HTTPException) as raised:
                main.get_client()
        self.assertEqual(raised.exception.status_code, 503)

    def test_duplicate_no_match_returns_no_grievance(self):
        result = main.compare_candidates(
            "pension payment delayed",
            [{"grievance_id": "ONE", "comparison_text": "streetlight is broken"}],
        )
        self.assertFalse(result.possible_match)
        self.assertIsNone(result.matched_grievance)

    def test_duplicate_likely_match_returns_candidate(self):
        text = "My speed post article has not been delivered for ten days"
        result = main.compare_candidates(
            text,
            [{"grievance_id": "ONE", "status": "Pending", "comparison_text": text}],
        )
        self.assertTrue(result.possible_match)
        self.assertEqual(result.matched_grievance["grievance_id"], "ONE")

    def test_local_dataset_loads(self):
        grievances = main.load_grievances()
        self.assertGreater(len(grievances), 0)
        self.assertTrue(all("grievance_id" in item for item in grievances))

    def test_sensitive_clarification_is_removed(self):
        category_path = main.CONTROLLED_CATEGORY_PATHS[0]
        result = main.validate_assistance({
            "category_path": category_path,
            "confidence": 80,
            "missing_information": ["What is your Aadhaar number?", "What was the approximate date?"],
            "prepared_grievance": "Please review and resolve the stated service issue.",
        })
        self.assertEqual(result.missing_information, ["What was the approximate date?"])
        self.assertEqual(result.org_code, main.TAXONOMY_METADATA[category_path]["org_code"])

    def test_status_update_missing_admin_key_rejected(self):
        response = self.client.patch(
            "/api/v1/admin/grievances/SMART-2026-TEST/status",
            json={"status": "Under Review"},
        )
        self.assertEqual(response.status_code, 401)

    def test_status_update_wrong_admin_key_rejected(self):
        response = self.client.patch(
            "/api/v1/admin/grievances/SMART-2026-TEST/status",
            headers={"X-Demo-Admin-Key": "wrong-key"},
            json={"status": "Under Review"},
        )
        self.assertEqual(response.status_code, 401)

    def test_status_update_invalid_status_rejected(self):
        response = self.client.patch(
            "/api/v1/admin/grievances/SMART-2026-TEST/status",
            headers={"X-Demo-Admin-Key": "test-admin-key"},
            json={"status": "Escalated"},
        )
        self.assertEqual(response.status_code, 422)

    def test_status_update_unknown_grievance_returns_404(self):
        with patch.object(main, "get_admin_grievance", return_value=None):
            response = self.client.patch(
                "/api/v1/admin/grievances/SMART-2026-MISSING/status",
                headers={"X-Demo-Admin-Key": "test-admin-key"},
                json={"status": "Under Review"},
            )
        self.assertEqual(response.status_code, 404)

    def test_forward_status_lifecycle_and_backward_rejection(self):
        state = {"status": "Draft"}

        def get_grievance(_grievance_id):
            return {"grievance_id": "SMART-2026-TEST", "status": state["status"]}

        def update_status(_grievance_id, status):
            state["status"] = status
            return {"grievance_id": "SMART-2026-TEST", "status": status}

        with patch.object(main, "get_admin_grievance", side_effect=get_grievance), patch.object(
            main, "update_admin_grievance_status", side_effect=update_status
        ):
            for expected_status in ("Pending", "Under Review", "Resolved", "Closed"):
                response = self.client.patch(
                    "/api/v1/admin/grievances/SMART-2026-TEST/status",
                    headers={"X-Demo-Admin-Key": "test-admin-key"},
                    json={"status": expected_status},
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], expected_status)

            backward = self.client.patch(
                "/api/v1/admin/grievances/SMART-2026-TEST/status",
                headers={"X-Demo-Admin-Key": "test-admin-key"},
                json={"status": "Resolved"},
            )
            self.assertEqual(backward.status_code, 409)


if __name__ == "__main__":
    unittest.main()
