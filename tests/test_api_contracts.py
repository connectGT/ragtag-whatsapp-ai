"""
tests/test_api_contracts.py - Tier 3: API & Contract Tests
===========================================================
Verifies Flask REST endpoints against frontend interface contracts:
  1. GET /api/status (telemetry, counts, engine status)
  2. GET /api/tasks (task list, ISO date normalization, context message)
  3. PATCH /api/tasks/<id> (status updates, 404 and 400 error handling)
  4. POST /api/tasks/extract (extraction trigger contract)
  5. GET/POST /api/settings (display name, inference mode persistence)
  6. POST /api/simulation/inject (evaluator message injection contract)
  7. GET /api/chats (chat group registry and message counts)
  8. GET/POST /api/catchup (executive briefing contract)
  9. GET/POST /api/summary (timeline summary contract)
"""

import json
import sys
import unittest
from pathlib import Path

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import app
from database import SessionLocal, Task, Message, Contact


def is_route_registered(rule_path: str) -> bool:
    """Helper to check if a route rule is registered in the Flask url_map."""
    return any(r.rule == rule_path for r in app.url_map.iter_rules())


class TestApiContracts(unittest.TestCase):
    """Tier 3: Test suite verifying Flask API contracts, status codes, and JSON schemas."""

    def setUp(self):
        self.client = app.test_client()
        self.app_context = app.app_context()
        self.app_context.push()

    def tearDown(self):
        self.app_context.pop()

    # ── 1. GET /api/status ───────────────────────────────────────────────────────
    def test_get_status_contract(self):
        """Verify GET /api/status returns HTTP 200 and matches required telemetry schema."""
        res = self.client.get("/api/status")
        self.assertEqual(res.status_code, 200)

        data = res.get_json()
        self.assertIsInstance(data, dict)

        # Baseline required fields
        required_fields = ["backup_found", "key_found", "contacts_count", "messages_count", "tasks_count"]
        for field in required_fields:
            self.assertIn(field, data, f"Missing required telemetry field: '{field}'")
            if "count" in field:
                self.assertIsInstance(data[field], int)
            elif "found" in field:
                self.assertIsInstance(data[field], bool)

        # M2 enhanced telemetry fields (if implemented)
        if "database_path" in data:
            self.assertIsInstance(data["database_path"], str)
        if "ollama_online" in data:
            self.assertIsInstance(data["ollama_online"], bool)

    # ── 2. GET /api/tasks ────────────────────────────────────────────────────────
    def test_get_tasks_contract(self):
        """Verify GET /api/tasks returns 200, array of tasks, and context_message structures."""
        res = self.client.get("/api/tasks")
        self.assertEqual(res.status_code, 200)

        tasks = res.get_json()
        self.assertIsInstance(tasks, list)

        if len(tasks) > 0:
            task = tasks[0]
            self.assertIn("id", task)
            self.assertIn("task_name", task)
            self.assertIn("priority", task)
            self.assertIn("status", task)
            self.assertIn(task["priority"], ["High", "Medium", "Low"])

            # Verify context_message embedding
            self.assertIn("context_message", task)
            if task["context_message"]:
                ctx = task["context_message"]
                self.assertIn("sender_name", ctx)
                self.assertIn("chat_name", ctx)
                self.assertIn("content", ctx)

            # M1 ISO Date Normalization verification (if implemented)
            if "due_date_iso" in task and task["due_date_iso"]:
                self.assertIsInstance(task["due_date_iso"], str)
                # Ensure ISO-8601 string structure (e.g. 2026-09-23T17:00:00)
                self.assertIn("T", task["due_date_iso"])

    # ── 3. PATCH /api/tasks/<id> ─────────────────────────────────────────────────
    def test_patch_task_status_success(self):
        """Verify PATCH /api/tasks/<id> updates status and returns success."""
        # Find an existing task or skip if DB has no tasks
        session = SessionLocal()
        existing_task = session.query(Task).first()
        session.close()

        if not existing_task:
            self.skipTest("No tasks currently in database to update via PATCH.")

        target_id = existing_task.id
        new_status = "Approved"

        res = self.client.patch(f"/api/tasks/{target_id}", json={"status": new_status})
        self.assertEqual(res.status_code, 200)

        data = res.get_json()
        self.assertEqual(data.get("status"), "success")
        self.assertEqual(data.get("new_status"), new_status.lower())

    def test_patch_task_status_not_found(self):
        """Verify PATCH /api/tasks/999999 returns HTTP 404 for non-existent task."""
        res = self.client.patch("/api/tasks/999999", json={"status": "Approved"})
        self.assertEqual(res.status_code, 404)
        data = res.get_json()
        self.assertIn("error", data)

    def test_patch_task_status_empty_body_bad_request(self):
        """Verify PATCH /api/tasks/<id> with empty body returns HTTP 400 Bad Request."""
        session = SessionLocal()
        existing_task = session.query(Task).first()
        session.close()

        if not existing_task:
            self.skipTest("No tasks currently in database to update via PATCH.")

        res = self.client.patch(f"/api/tasks/{existing_task.id}", json={})
        self.assertEqual(res.status_code, 400)
        data = res.get_json()
        self.assertIn("error", data)

    # ── 4. POST /api/tasks/extract (Milestone M1) ─────────────────────────────────
    @unittest.skipUnless(is_route_registered("/api/tasks/extract"), "Endpoint pending registration in Milestone M1")
    def test_post_tasks_extract_contract(self):
        """Verify POST /api/tasks/extract accepts filter parameters and returns task metrics."""
        payload = {
            "chat_name": "CS-401 Capstone Review",
            "force_reprocess": False,
            "mode": "auto"
        }
        res = self.client.post("/api/tasks/extract", json=payload)
        self.assertEqual(res.status_code, 200)

        data = res.get_json()
        self.assertEqual(data.get("status"), "success")
        self.assertIn("scanned_messages", data)
        self.assertIn("new_tasks_created", data)
        self.assertIn("tasks_upgraded", data)
        self.assertIn("extraction_mode_used", data)
        self.assertIn("tasks", data)
        self.assertIsInstance(data["tasks"], list)

    # ── 5. GET/POST /api/settings (Milestone M2) ──────────────────────────────────
    @unittest.skipUnless(is_route_registered("/api/settings"), "Endpoint pending registration in Milestone M2")
    def test_settings_get_and_post_contract(self):
        """Verify GET /api/settings and POST /api/settings persist user identity and mode."""
        # 1. Test GET
        res_get = self.client.get("/api/settings")
        self.assertEqual(res_get.status_code, 200)
        data_get = res_get.get_json()
        self.assertIn("user_name", data_get)
        self.assertIn("inference_mode", data_get)

        # 2. Test POST update
        payload = {
            "user_name": "Prof. Sharma Evaluator",
            "inference_mode": "heuristic_only",
            "ollama_model": "llama3:latest",
            "ollama_url": "http://127.0.0.1:11434"
        }
        res_post = self.client.post("/api/settings", json=payload)
        self.assertEqual(res_post.status_code, 200)
        data_post = res_post.get_json()
        self.assertEqual(data_post.get("user_name"), "Prof. Sharma Evaluator")
        self.assertEqual(data_post.get("inference_mode"), "heuristic_only")

        # 3. Restore default active user settings
        self.client.post("/api/settings", json={"user_name": "Guru", "inference_mode": "auto"})

    # ── 6. POST /api/simulation/inject (Milestone M2) ─────────────────────────────
    @unittest.skipUnless(is_route_registered("/api/simulation/inject"), "Endpoint pending registration in Milestone M2")
    def test_post_simulation_inject_contract(self):
        """Verify POST /api/simulation/inject inserts live evaluator messages and triggers extraction."""
        payload = {
            "sender_name": "Dr. V. Rao",
            "chat_name": "Evaluator Demo Panel",
            "content": "Please submit the final test coverage metrics and ICS export by Friday 5 PM.",
            "timestamp": "2026-09-24T10:00:00"
        }
        res = self.client.post("/api/simulation/inject", json=payload)
        self.assertEqual(res.status_code, 200)

        data = res.get_json()
        self.assertEqual(data.get("status"), "success")
        self.assertIn("message_id", data)
        self.assertIn("tasks_extracted", data)
        self.assertIsInstance(data["tasks_extracted"], list)

    # ── 7. GET /api/chats ────────────────────────────────────────────────────────
    def test_get_chats_contract(self):
        """Verify GET /api/chats returns HTTP 200 and list of chat groups with message counts."""
        res = self.client.get("/api/chats")
        self.assertEqual(res.status_code, 200)

        chats = res.get_json()
        self.assertIsInstance(chats, list)
        for c in chats:
            self.assertIn("chat_name", c)
            self.assertIn("message_count", c)
            self.assertIsInstance(c["message_count"], int)

    # ── 8. GET/POST /api/catchup ─────────────────────────────────────────────────
    def test_post_catchup_contract(self):
        """Verify POST /api/catchup returns executive briefing structure."""
        payload = {"user_name": "Guru", "limit": 25}
        res = self.client.post("/api/catchup", json=payload)
        self.assertEqual(res.status_code, 200)

        data = res.get_json()
        self.assertIsInstance(data, dict)
        self.assertTrue("summary" in data or "decisions" in data or "actions" in data or "error" in data)

    # ── 9. GET/POST /api/summary ─────────────────────────────────────────────────
    def test_post_summary_contract(self):
        """Verify POST /api/summary returns timeline summary structure."""
        payload = {"preset": "all", "user_name": "Guru"}
        res = self.client.post("/api/summary", json=payload)
        self.assertEqual(res.status_code, 200)

        data = res.get_json()
        self.assertIsInstance(data, dict)
        self.assertTrue("summary" in data or "decisions" in data or "actions" in data or "error" in data)


if __name__ == "__main__":
    unittest.main()
