import os
import unittest
from unittest.mock import patch

os.environ.setdefault("OPENROUTER_API_KEY", "test-key")

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


if __name__ == "__main__":
    unittest.main()
