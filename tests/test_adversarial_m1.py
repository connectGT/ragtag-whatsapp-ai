"""
tests/test_adversarial_m1.py — Tier 5: Adversarial Probes & Stress Harness (Milestone 1)
========================================================================================
Adversarial challenge for Milestone 1 (Backend Task Extractor & Ingestion Integration):
1. Upgrade heuristic tasks:
   - "Approved", "Dismissed", and custom statuses strictly preserved (never reverts to "pending").
   - context_message_id foreign key strictly preserved.
   - Ollama offline, malformed responses, empty results, and orphaned records handled gracefully.
2. Stress test POST /api/tasks/extract:
   - Empty body {}, malformed body, invalid mode strings/types, non-existent chat_name, SQL injection attempts.
   - Deduplication: multiple repeated extract calls do not create duplicate tasks in SQLite ground truth.
3. Verify GET /api/tasks ISO dates:
   - due_date_iso parses cleanly in Python datetime.fromisoformat().
   - due_date_iso parses cleanly in JavaScript new Date(...) via Node.js subprocess.
   - Null dates are properly serialized as None/null.
4. Hard invariants & zero-hallucination constraints:
   - Intra-batch deduplication in save_extracted_tasks.
   - Rejection of null/empty context_message_id.
   - SQLite foreign key violation enforcement.
"""

import json
import os
import subprocess
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch

from sqlalchemy import create_engine, event
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

# Add project root and backend to sys.path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = PROJECT_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import app as flask_app_module
from app import app
from database import Base, Contact, Message, Task
import task_extractor


def create_isolated_sqlite_engine():
    """Creates an in-memory SQLite engine with PRAGMA foreign_keys = ON enforced."""
    engine = create_engine("sqlite:///:memory:", echo=False, future=True)

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys = ON;")
        cursor.close()

    return engine


class TestAdversarialTaskUpgrade(unittest.TestCase):
    """Adversarial stress testing of upgrade_heuristic_tasks."""

    def setUp(self):
        self.engine = create_isolated_sqlite_engine()
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.session = self.Session()

        # Seed baseline contact and messages
        self.contact = Contact(id="user_adv@s.whatsapp.net", name="Test Challenger", phone_number="+1000000001")
        self.session.add(self.contact)
        self.session.flush()

        self.msg_1 = Message(
            id="MSG_ADV_001",
            sender_id=self.contact.id,
            chat_name="Project RAGTAG",
            timestamp=datetime(2026, 10, 29, 10, 0, 0),
            content="Please submit the final documentation before tomorrow 5pm.",
        )
        self.msg_2 = Message(
            id="MSG_ADV_002",
            sender_id=self.contact.id,
            chat_name="Project RAGTAG",
            timestamp=datetime(2026, 10, 29, 11, 0, 0),
            content="Can you review the pull request by tonight?",
        )
        self.session.add_all([self.msg_1, self.msg_2])
        self.session.commit()

    def tearDown(self):
        self.session.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_upgrade_preserves_approved_status_and_foreign_key(self):
        """Invariant: An 'Approved' task upgraded via Ollama MUST keep status='Approved' and identical context_message_id."""
        task = Task(
            task_name="Submit documentation",
            due_date=datetime(2026, 10, 30, 17, 0, 0),
            priority="Low",
            status="Approved",  # User explicitly marked as Approved
            extraction_mode="heuristic",
            context_message_id=self.msg_1.id,
        )
        self.session.add(task)
        self.session.commit()
        task_id = task.id

        mock_ollama_resp = {
            "response": json.dumps([
                {
                    "task_name": "Submit Final Project Architecture Documentation",
                    "due_date": "2026-10-30T17:00:00",
                    "priority": "High",
                    "context_message_id": self.msg_1.id,
                }
            ])
        }

        with patch.object(task_extractor, "check_ollama_available", return_value=True):
            with patch("urllib.request.urlopen") as mock_url:
                mock_resp = MagicMock()
                mock_resp.read.return_value = json.dumps(mock_ollama_resp).encode("utf-8")
                mock_url.return_value.__enter__.return_value = mock_resp

                res = task_extractor.upgrade_heuristic_tasks(self.session)

        self.assertEqual(res["status"], "success")
        self.assertEqual(res["upgraded_count"], 1)

        # Re-fetch from DB
        upgraded = self.session.query(Task).filter_by(id=task_id).one()
        self.assertEqual(upgraded.status, "Approved", "Status MUST remain 'Approved' and not revert to 'pending'!")
        self.assertEqual(upgraded.context_message_id, self.msg_1.id, "Foreign key context_message_id MUST be preserved!")
        self.assertEqual(upgraded.task_name, "Submit Final Project Architecture Documentation")
        self.assertEqual(upgraded.priority, "High")
        self.assertEqual(upgraded.extraction_mode, "ollama")

    def test_upgrade_preserves_dismissed_status(self):
        """Invariant: A 'Dismissed' task upgraded via Ollama MUST keep status='Dismissed'."""
        task = Task(
            task_name="Review PR",
            due_date=datetime(2026, 10, 29, 21, 0, 0),
            priority="Medium",
            status="Dismissed",  # User explicitly dismissed
            extraction_mode="heuristic",
            context_message_id=self.msg_2.id,
        )
        self.session.add(task)
        self.session.commit()
        task_id = task.id

        mock_ollama_resp = {
            "response": json.dumps([
                {
                    "task_name": "Review Milestone 1 Backend Pull Request",
                    "due_date": "2026-10-29T21:00:00",
                    "priority": "High",
                    "context_message_id": self.msg_2.id,
                }
            ])
        }

        with patch.object(task_extractor, "check_ollama_available", return_value=True):
            with patch("urllib.request.urlopen") as mock_url:
                mock_resp = MagicMock()
                mock_resp.read.return_value = json.dumps(mock_ollama_resp).encode("utf-8")
                mock_url.return_value.__enter__.return_value = mock_resp

                res = task_extractor.upgrade_heuristic_tasks(self.session)

        self.assertEqual(res["status"], "success")
        self.assertEqual(res["upgraded_count"], 1)

        upgraded = self.session.query(Task).filter_by(id=task_id).one()
        self.assertEqual(upgraded.status, "Dismissed", "Status MUST remain 'Dismissed'!")
        self.assertEqual(upgraded.context_message_id, self.msg_2.id)
        self.assertEqual(upgraded.extraction_mode, "ollama")

    def test_upgrade_handles_ollama_offline_gracefully(self):
        """Verify upgrade_heuristic_tasks returns status='skipped' when Ollama is offline."""
        task = Task(
            task_name="Submit documentation",
            due_date=None,
            priority="Medium",
            status="Pending",
            extraction_mode="heuristic",
            context_message_id=self.msg_1.id,
        )
        self.session.add(task)
        self.session.commit()

        with patch.object(task_extractor, "check_ollama_available", return_value=False):
            res = task_extractor.upgrade_heuristic_tasks(self.session)

        self.assertEqual(res["status"], "skipped")
        self.assertEqual(res["upgraded_count"], 0)
        self.assertEqual(res["tasks_upgraded"], 0)

        # Confirm task remained untouched
        task_in_db = self.session.query(Task).filter_by(id=task.id).one()
        self.assertEqual(task_in_db.extraction_mode, "heuristic")
        self.assertEqual(task_in_db.status, "Pending")

    def test_upgrade_handles_ollama_empty_response(self):
        """When Ollama returns empty array (LLM considers message non-actionable), task remains unchanged."""
        task = Task(
            task_name="Submit documentation",
            due_date=datetime(2026, 10, 30, 17, 0, 0),
            priority="Medium",
            status="Approved",
            extraction_mode="heuristic",
            context_message_id=self.msg_1.id,
        )
        self.session.add(task)
        self.session.commit()

        mock_ollama_resp = {"response": "[]"}

        with patch.object(task_extractor, "check_ollama_available", return_value=True):
            with patch("urllib.request.urlopen") as mock_url:
                mock_resp = MagicMock()
                mock_resp.read.return_value = json.dumps(mock_ollama_resp).encode("utf-8")
                mock_url.return_value.__enter__.return_value = mock_resp

                res = task_extractor.upgrade_heuristic_tasks(self.session)

        self.assertEqual(res["upgraded_count"], 0)
        task_in_db = self.session.query(Task).filter_by(id=task.id).one()
        self.assertEqual(task_in_db.status, "Approved")
        self.assertEqual(task_in_db.task_name, "Submit documentation")
        self.assertEqual(task_in_db.extraction_mode, "heuristic")

    def test_upgrade_handles_malformed_due_date_without_crashing(self):
        """If Ollama returns an unparseable date string, due_date should not crash or corrupt."""
        task = Task(
            task_name="Submit documentation",
            due_date=datetime(2026, 10, 30, 17, 0, 0),
            priority="Medium",
            status="Pending",
            extraction_mode="heuristic",
            context_message_id=self.msg_1.id,
        )
        self.session.add(task)
        self.session.commit()

        mock_ollama_resp = {
            "response": json.dumps([
                {
                    "task_name": "Submit documentation updated",
                    "due_date": "not-a-valid-iso-date-string",
                    "priority": "High",
                    "context_message_id": self.msg_1.id,
                }
            ])
        }

        with patch.object(task_extractor, "check_ollama_available", return_value=True):
            with patch("urllib.request.urlopen") as mock_url:
                mock_resp = MagicMock()
                mock_resp.read.return_value = json.dumps(mock_ollama_resp).encode("utf-8")
                mock_url.return_value.__enter__.return_value = mock_resp

                res = task_extractor.upgrade_heuristic_tasks(self.session)

        self.assertEqual(res["status"], "success")
        self.assertEqual(res["upgraded_count"], 1)
        upgraded = self.session.query(Task).filter_by(id=task.id).one()
        self.assertEqual(upgraded.task_name, "Submit documentation updated")
        self.assertEqual(upgraded.priority, "High")


class TestAdversarialExtractEndpoint(unittest.TestCase):
    """Stress testing POST /api/tasks/extract and deduplication behavior."""

    def setUp(self):
        self.engine = create_isolated_sqlite_engine()
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.session = self.Session()

        # Seed contact and actionable messages
        self.contact = Contact(id="prof_adv@s.whatsapp.net", name="Prof Adversary", phone_number="+1999999999")
        self.session.add(self.contact)
        self.session.flush()

        self.actionable_msg1 = Message(
            id="MSG_ACT_001",
            sender_id=self.contact.id,
            chat_name="Capstone Review",
            timestamp=datetime(2026, 10, 29, 14, 0, 0),
            content="Submit the system architecture diagram before Friday 5pm without fail.",
        )
        self.actionable_msg2 = Message(
            id="MSG_ACT_002",
            sender_id=self.contact.id,
            chat_name="Capstone Review",
            timestamp=datetime(2026, 10, 29, 15, 0, 0),
            content="Prepare the deployment checklist for Monday.",
        )
        self.chatter_msg = Message(
            id="MSG_CHATTER_001",
            sender_id=self.contact.id,
            chat_name="Capstone Review",
            timestamp=datetime(2026, 10, 29, 16, 0, 0),
            content="Cool, thanks! Good morning everyone.",
        )
        self.session.add_all([self.actionable_msg1, self.actionable_msg2, self.chatter_msg])
        self.session.commit()

        # Patch app.SessionLocal and task_extractor.SessionLocal with our test session factory
        self.patcher_app_session = patch.object(flask_app_module, "SessionLocal", side_effect=lambda: self.Session())
        self.patcher_ext_session = patch.object(task_extractor, "SessionLocal", side_effect=lambda: self.Session())
        self.patcher_app_session.start()
        self.patcher_ext_session.start()

        self.client = app.test_client()

    def tearDown(self):
        self.patcher_app_session.stop()
        self.patcher_ext_session.stop()
        self.session.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_extract_empty_json_body(self):
        """Calling POST /api/tasks/extract with {} must return clean HTTP 200 without crashing."""
        res = self.client.post("/api/tasks/extract", json={})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertIn("scanned_messages", data)
        self.assertIn("new_tasks_created", data)
        self.assertIn("tasks_upgraded", data)
        self.assertIn("extraction_mode_used", data)
        self.assertIn("tasks", data)

    def test_extract_invalid_mode_falls_back_cleanly(self):
        """Calling with mode='invalid_mode' or non-standard values must fallback to 'auto' with HTTP 200."""
        invalid_modes = ["invalid_mode", "UNKNOWN", "random123", "", None, 12345]
        for bad_mode in invalid_modes:
            res = self.client.post("/api/tasks/extract", json={"mode": bad_mode})
            self.assertEqual(res.status_code, 200, f"Failed for bad_mode={bad_mode}")
            data = res.get_json()
            self.assertEqual(data["status"], "success")

    def test_extract_nonexistent_chat_name(self):
        """Calling with a non-existent chat_name returns 200 with 0 messages scanned and 0 tasks created."""
        res = self.client.post("/api/tasks/extract", json={"chat_name": "NonExistentChat_XYZ_99999"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["scanned_messages"], 0)
        self.assertEqual(data["new_tasks_created"], 0)
        self.assertEqual(data["tasks"], [])

    def test_extract_sql_injection_resistance(self):
        """Adversarial SQL injection attempts in chat_name must be safely parameterized without 500 or SQL syntax errors."""
        injection_payloads = [
            "'; DROP TABLE tasks; --",
            "' OR '1'='1",
            "\" OR \"1\"=\"1",
            "Capstone Review' UNION SELECT * FROM tasks --",
        ]
        for injection in injection_payloads:
            res = self.client.post("/api/tasks/extract", json={"chat_name": injection})
            self.assertEqual(res.status_code, 200, f"Failed on payload: {injection}")
            data = res.get_json()
            self.assertEqual(data["status"], "success")
            # Verify table still exists and wasn't dropped
            check_session = self.Session()
            count = check_session.query(Task).count()
            check_session.close()
            self.assertGreaterEqual(count, 0)

    def test_extract_deduplication_multi_run(self):
        """
        Verify task deduplication: calling extract multiple times on the same chat
        does NOT create duplicate tasks in SQLite.
        """
        # Run 1: initial extraction
        res1 = self.client.post("/api/tasks/extract", json={"chat_name": "Capstone Review", "mode": "heuristic"})
        self.assertEqual(res1.status_code, 200)
        data1 = res1.get_json()
        initial_created = data1["new_tasks_created"]
        self.assertGreater(initial_created, 0, "Expected tasks to be created in first run")

        check_session1 = self.Session()
        initial_db_count = check_session1.query(Task).count()
        check_session1.close()
        self.assertEqual(initial_created, initial_db_count)

        # Run 2: immediate repeat extraction on same chat
        res2 = self.client.post("/api/tasks/extract", json={"chat_name": "Capstone Review", "mode": "heuristic"})
        self.assertEqual(res2.status_code, 200)
        data2 = res2.get_json()
        self.assertEqual(data2["new_tasks_created"], 0, "Second extraction MUST report 0 new tasks created!")

        check_session2 = self.Session()
        repeat_db_count = check_session2.query(Task).count()
        check_session2.close()
        self.assertEqual(initial_db_count, repeat_db_count, "SQLite task count MUST NOT increase on repeat extraction!")

        # Run 3: repeat extraction with force_reprocess: true
        with patch.object(task_extractor, "check_ollama_available", return_value=False):
            res3 = self.client.post("/api/tasks/extract", json={
                "chat_name": "Capstone Review",
                "force_reprocess": True,
                "mode": "heuristic"
            })
            self.assertEqual(res3.status_code, 200)
            data3 = res3.get_json()
            self.assertEqual(data3["new_tasks_created"], 0)

        check_session3 = self.Session()
        final_db_count = check_session3.query(Task).count()
        check_session3.close()
        self.assertEqual(initial_db_count, final_db_count, "Task count MUST remain strictly constant!")


class TestAdversarialGetTasksIsoParsing(unittest.TestCase):
    """Verifies GET /api/tasks due_date_iso parses in both Python and JavaScript."""

    def setUp(self):
        self.engine = create_isolated_sqlite_engine()
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.session = self.Session()

        # Seed contact and message
        self.contact = Contact(id="iso_adv@s.whatsapp.net", name="ISO Tester", phone_number="+1888888888")
        self.session.add(self.contact)
        self.session.flush()

        self.msg = Message(
            id="MSG_ISO_001",
            sender_id=self.contact.id,
            chat_name="ISO Test Chat",
            timestamp=datetime(2026, 10, 29, 12, 0, 0),
            content="Submit assignment before October 31st at 11:59pm.",
        )
        self.session.add(self.msg)
        self.session.flush()

        # Seed task with explicit due date
        self.task_with_date = Task(
            task_name="Submit Assignment",
            due_date=datetime(2026, 10, 31, 23, 59, 0),
            priority="High",
            status="pending",
            extraction_mode="heuristic",
            context_message_id=self.msg.id,
        )
        # Seed task with null due date
        self.task_null_date = Task(
            task_name="Check repo status whenever",
            due_date=None,
            priority="Low",
            status="pending",
            extraction_mode="heuristic",
            context_message_id=self.msg.id,
        )
        self.session.add_all([self.task_with_date, self.task_null_date])
        self.session.commit()

        self.patcher_app_session = patch.object(flask_app_module, "SessionLocal", side_effect=lambda: self.Session())
        self.patcher_app_session.start()
        self.client = app.test_client()

    def tearDown(self):
        self.patcher_app_session.stop()
        self.session.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_due_date_iso_parses_in_python_and_javascript(self):
        """Verify due_date_iso string parses with datetime.fromisoformat() and JS new Date()."""
        res = self.client.get("/api/tasks")
        self.assertEqual(res.status_code, 200)
        tasks = res.get_json()
        self.assertEqual(len(tasks), 2)

        # Locate dated task and null task
        dated_task = next(t for t in tasks if t["task_name"] == "Submit Assignment")
        null_task = next(t for t in tasks if t["task_name"] == "Check repo status whenever")

        # 1. Verify null date handling
        self.assertIsNone(null_task["due_date_iso"], "Null due_date must yield null due_date_iso!")

        # 2. Verify non-null date handling in Python
        iso_str = dated_task["due_date_iso"]
        self.assertIsNotNone(iso_str)
        self.assertIsInstance(iso_str, str)

        py_parsed = datetime.fromisoformat(iso_str)
        self.assertEqual(py_parsed.year, 2026)
        self.assertEqual(py_parsed.month, 10)
        self.assertEqual(py_parsed.day, 31)
        self.assertEqual(py_parsed.hour, 23)
        self.assertEqual(py_parsed.minute, 59)

        # 3. Verify in JavaScript via Node.js CLI subprocess
        js_verification_code = f"""
        const iso = "{iso_str}";
        const d = new Date(iso);
        if (isNaN(d.getTime())) {{
            console.error("Invalid Date parsed from ISO string:", iso);
            process.exit(1);
        }}
        console.log(JSON.stringify({{
            year: d.getFullYear(),
            month: d.getMonth() + 1,
            day: d.getDate(),
            hours: d.getHours(),
            minutes: d.getMinutes(),
            isValid: true
        }}));
        """
        proc = subprocess.run(
            ["node", "-e", js_verification_code],
            capture_output=True,
            text=True,
            check=True
        )
        js_result = json.loads(proc.stdout.strip())
        self.assertTrue(js_result["isValid"])
        self.assertEqual(js_result["year"], 2026)
        self.assertEqual(js_result["month"], 10)
        self.assertEqual(js_result["day"], 31)
        self.assertEqual(js_result["hours"], 23)
        self.assertEqual(js_result["minutes"], 59)


class TestAdversarialIntegrityAndDeduplication(unittest.TestCase):
    """Direct harness for intra-batch deduplication, null FK prevention, and SQLite FK constraints."""

    def setUp(self):
        self.engine = create_isolated_sqlite_engine()
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.session = self.Session()

        self.contact = Contact(id="integrity_adv@s.whatsapp.net", name="Integrity Test", phone_number="+1777777777")
        self.session.add(self.contact)
        self.session.flush()

        self.msg = Message(
            id="MSG_INT_001",
            sender_id=self.contact.id,
            chat_name="Integrity Chat",
            timestamp=datetime(2026, 10, 29, 9, 0, 0),
            content="Deploy the microservice immediately.",
        )
        self.session.add(self.msg)
        self.session.commit()

    def tearDown(self):
        self.session.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_intra_batch_deduplication(self):
        """Passing duplicate tasks in the same batch must save 1 and skip 1."""
        batch = [
            {
                "task_name": "Deploy microservice",
                "due_date": datetime(2026, 10, 29, 18, 0, 0),
                "priority": "High",
                "context_message_id": self.msg.id,
                "extraction_mode": "heuristic"
            },
            {
                "task_name": "Deploy microservice",
                "due_date": datetime(2026, 10, 29, 18, 0, 0),
                "priority": "High",
                "context_message_id": self.msg.id,
                "extraction_mode": "heuristic"
            }
        ]
        res = task_extractor.save_extracted_tasks(self.session, batch)
        self.assertEqual(res["new_tasks_created"], 1)
        self.assertEqual(res["skipped_duplicates"], 1)

        total = self.session.query(Task).count()
        self.assertEqual(total, 1)

    def test_null_or_empty_context_message_id_rejected(self):
        """Zero-hallucination guard: null or empty context_message_id must raise ValueError."""
        with self.assertRaises(ValueError):
            task_extractor.save_extracted_tasks(self.session, [
                {"task_name": "Hallucinated Task", "context_message_id": None}
            ])

        with self.assertRaises(ValueError):
            task_extractor.save_extracted_tasks(self.session, [
                {"task_name": "Hallucinated Task", "context_message_id": ""}
            ])

    def test_foreign_key_violation_raises_integrity_error(self):
        """Ungrounded task with non-existent message ID must trigger SQLite IntegrityError."""
        orphaned_task = Task(
            task_name="Orphaned Task",
            due_date=None,
            priority="Medium",
            status="pending",
            extraction_mode="heuristic",
            context_message_id="NON_EXISTENT_MSG_ID_999",
        )
        self.session.add(orphaned_task)
        with self.assertRaises(IntegrityError):
            self.session.commit()
        self.session.rollback()


if __name__ == "__main__":
    unittest.main()
