"""
tests/test_integration_extractor.py - Tier 2: Integration Tests
================================================================
Verifies:
  1. Chat ingestion integration (parsing WhatsApp export .txt, writing to SQLite ground truth, deduplication).
  2. Dual-mode task extraction (Ollama LLM vs offline rule-based heuristics).
  3. 1.0s connection timeout fallback when Ollama is offline or unreachable.
  4. Task upgrade mechanism (upgrading heuristic tasks with Ollama while strictly preserving
     user approval status and context_message_id foreign keys).
  5. Filtering of non-actionable messages to prevent hallucinated tasks.
"""

import json
import os
import sys
import time
import unittest
import urllib.error
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import MagicMock, patch
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import Base, Contact, Message, Task
from ingest import parse_exported_txt, is_system_message

try:
    import task_extractor
except ImportError:
    task_extractor = None


class TestChatIngestionIntegration(unittest.TestCase):
    """Tier 2: Ingestion integration tests verifying parser, database upsert, and deduplication."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", echo=False, future=True)
        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.session = self.Session()
        self.sample_txt_path = str(BACKEND_DIR / "backups" / "sample_chat.txt")

    def tearDown(self):
        self.session.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_parse_exported_txt_structure(self):
        """Verify parse_exported_txt extracts valid messages from sample_chat.txt."""
        self.assertTrue(os.path.exists(self.sample_txt_path), f"Sample chat missing at {self.sample_txt_path}")
        messages = parse_exported_txt(self.sample_txt_path, default_chat_name="CS-401 Project Chat")

        self.assertGreaterEqual(len(messages), 6, "Expected at least 6 chat messages from sample_chat.txt")
        for m in messages:
            self.assertIn("id", m)
            self.assertIn("sender_name", m)
            self.assertIn("sender_jid", m)
            self.assertIn("chat_name", m)
            self.assertIn("content", m)
            self.assertIn("timestamp", m)
            self.assertIsInstance(m["timestamp"], datetime)
            # Ensure no system encryption message was extracted as content
            self.assertFalse(is_system_message(m["content"]), f"System message should be filtered: {m['content']}")

    def test_save_to_database_and_deduplication(self):
        """Verify inserting parsed messages into SQLite handles contacts, messages, and deduplication."""
        messages = parse_exported_txt(self.sample_txt_path, default_chat_name="CS-401 Project Chat")

        # Custom save logic against our isolated test session
        def save_to_isolated_db(parsed, session):
            contacts_added = 0
            messages_added = 0
            existing_contacts = {c.name.lower(): c for c in session.query(Contact).all()}
            existing_msg_ids = {m.id for m in session.query(Message.id).all()}

            for item in parsed:
                key = item["sender_name"].lower()
                if key not in existing_contacts:
                    contact = Contact(id=item["sender_jid"], name=item["sender_name"], phone_number=None)
                    session.add(contact)
                    session.flush()
                    existing_contacts[key] = contact
                    contacts_added += 1
                else:
                    contact = existing_contacts[key]

                if item["id"] not in existing_msg_ids:
                    msg = Message(
                        id=item["id"],
                        sender_id=contact.id,
                        chat_name=item["chat_name"],
                        timestamp=item["timestamp"],
                        content=item["content"],
                    )
                    session.add(msg)
                    existing_msg_ids.add(item["id"])
                    messages_added += 1

            session.commit()
            return contacts_added, messages_added

        # First ingestion run
        c1, m1 = save_to_isolated_db(messages, self.session)
        self.assertGreater(c1, 0)
        self.assertGreater(m1, 0)

        total_contacts = self.session.query(Contact).count()
        total_messages = self.session.query(Message).count()
        self.assertEqual(total_contacts, c1)
        self.assertEqual(total_messages, m1)

        # Second ingestion run (idempotency check)
        c2, m2 = save_to_isolated_db(messages, self.session)
        self.assertEqual(c2, 0, "Second ingestion should add 0 new contacts (deduplicated)")
        self.assertEqual(m2, 0, "Second ingestion should add 0 new messages (deduplicated)")
        self.assertEqual(self.session.query(Contact).count(), total_contacts)
        self.assertEqual(self.session.query(Message).count(), total_messages)


class TestDualModeExtractionContract(unittest.TestCase):
    """Tier 2: Verifies task extractor contracts, Ollama integration, heuristic fallback, and upgrade logic."""

    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:", echo=False, future=True)

        @event.listens_for(self.engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.close()

        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.session = self.Session()

        # Seed sample contact and messages
        self.contact = Contact(id="prof@s.whatsapp.net", name="Prof. H. Sharma")
        self.session.add(self.contact)
        self.session.commit()

        self.msg_action = Message(
            id="msg_action_1",
            sender_id="prof@s.whatsapp.net",
            chat_name="CS-401 Capstone Review",
            timestamp=datetime(2026, 9, 22, 14, 30),
            content="Reminder to all teams: Submit the SDMS portal files by Friday end of day without fail.",
        )
        self.msg_chatter = Message(
            id="msg_chatter_1",
            sender_id="prof@s.whatsapp.net",
            chat_name="CS-401 Capstone Review",
            timestamp=datetime(2026, 9, 22, 14, 35),
            content="Good morning everyone! Please remember coffee is available in the lab.",
        )
        self.session.add_all([self.msg_action, self.msg_chatter])
        self.session.commit()

    def tearDown(self):
        self.session.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    @unittest.skipIf(task_extractor is None, "backend/task_extractor.py pending implementation in Milestone M1")
    def test_check_ollama_available_contract(self):
        """Verify check_ollama_available returns True on 200 and False on network error."""
        with patch("urllib.request.urlopen") as mock_url:
            mock_resp = MagicMock()
            mock_resp.status = 200
            mock_url.return_value.__enter__.return_value = mock_resp
            self.assertTrue(task_extractor.check_ollama_available())

        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("Connection refused")):
            self.assertFalse(task_extractor.check_ollama_available())

    @unittest.skipIf(task_extractor is None, "backend/task_extractor.py pending implementation in Milestone M1")
    def test_extract_with_heuristics_contract(self):
        """Verify extract_with_heuristics correctly detects task name, priority, due date, and context_message_id."""
        messages_input = [
            {
                "id": self.msg_action.id,
                "sender_name": "Prof. H. Sharma",
                "chat_name": self.msg_action.chat_name,
                "content": self.msg_action.content,
                "timestamp": self.msg_action.timestamp,
            }
        ]
        tasks = task_extractor.extract_with_heuristics(messages_input)
        self.assertIsInstance(tasks, list)
        self.assertGreaterEqual(len(tasks), 1, "Expected at least 1 task extracted from actionable message")

        task = tasks[0]
        self.assertIn("task_name", task)
        self.assertIn("due_date", task)
        self.assertIn("priority", task)
        self.assertEqual(task["context_message_id"], self.msg_action.id)
        self.assertEqual(task.get("extraction_mode", "heuristic"), "heuristic")
        self.assertIn(task["priority"], ["High", "Medium", "Low"])

    @unittest.skipIf(task_extractor is None, "backend/task_extractor.py pending implementation in Milestone M1")
    def test_extract_with_ollama_contract(self):
        """Verify extract_with_ollama parses structured JSON response from Ollama API."""
        mock_ollama_response = {
            "response": json.dumps([
                {
                    "task_name": "Submit SDMS portal files",
                    "due_date": "2026-09-25T23:59:00",
                    "priority": "High"
                }
            ])
        }

        messages_input = [
            {
                "id": self.msg_action.id,
                "sender_name": "Prof. H. Sharma",
                "chat_name": self.msg_action.chat_name,
                "content": self.msg_action.content,
                "timestamp": self.msg_action.timestamp,
            }
        ]

        with patch("urllib.request.urlopen") as mock_url:
            mock_resp = MagicMock()
            mock_resp.read.return_value = json.dumps(mock_ollama_response).encode("utf-8")
            mock_url.return_value.__enter__.return_value = mock_resp

            tasks = task_extractor.extract_with_ollama(messages_input)
            self.assertIsInstance(tasks, list)
            self.assertEqual(len(tasks), 1)
            self.assertEqual(tasks[0]["task_name"], "Submit SDMS portal files")
            self.assertEqual(tasks[0]["priority"], "High")
            self.assertEqual(tasks[0]["context_message_id"], self.msg_action.id)
            self.assertEqual(tasks[0]["extraction_mode"], "ollama")

    @unittest.skipIf(task_extractor is None, "backend/task_extractor.py pending implementation in Milestone M1")
    def test_extract_tasks_fallback_when_ollama_offline(self):
        """Verify extract_tasks_from_messages automatically falls back to heuristics when Ollama is offline."""
        messages_input = [
            {
                "id": self.msg_action.id,
                "sender_name": "Prof. H. Sharma",
                "chat_name": self.msg_action.chat_name,
                "content": self.msg_action.content,
                "timestamp": self.msg_action.timestamp,
            }
        ]

        # Force Ollama offline
        with patch.object(task_extractor, "check_ollama_available", return_value=False):
            start_time = time.time()
            tasks = task_extractor.extract_tasks_from_messages(messages_input, mode="auto")
            elapsed = time.time() - start_time

            self.assertLess(elapsed, 1.5, "Fallback must not block or hang beyond 1.5 seconds")
            self.assertIsInstance(tasks, list)
            self.assertGreaterEqual(len(tasks), 1)
            self.assertEqual(tasks[0]["context_message_id"], self.msg_action.id)
            self.assertEqual(tasks[0]["extraction_mode"], "heuristic")

    @unittest.skipIf(task_extractor is None, "backend/task_extractor.py pending implementation in Milestone M1")
    def test_task_upgrade_preserves_user_status_and_foreign_key(self):
        """Verify upgrading heuristic tasks with Ollama preserves user status (Approved/Dismissed) and foreign key."""
        # 1. Insert a heuristic task and mark it 'approved' by user
        heuristic_task = Task(
            task_name="Preliminary SDMS submission",
            due_date=datetime(2026, 9, 25, 23, 59),
            priority="Medium",
            status="approved",  # User explicitly approved
            context_message_id=self.msg_action.id,
        )
        if hasattr(Task, "extraction_mode"):
            heuristic_task.extraction_mode = "heuristic"

        self.session.add(heuristic_task)
        self.session.commit()
        task_id = heuristic_task.id

        # 2. Mock Ollama returning upgraded task details
        mock_upgraded_response = {
            "response": json.dumps([
                {
                    "task_name": "Final SDMS Portal Files Submission",
                    "due_date": "2026-09-25T17:00:00",
                    "priority": "High"
                }
            ])
        }

        with patch.object(task_extractor, "check_ollama_available", return_value=True):
            with patch("urllib.request.urlopen") as mock_url:
                mock_resp = MagicMock()
                mock_resp.read.return_value = json.dumps(mock_upgraded_response).encode("utf-8")
                mock_url.return_value.__enter__.return_value = mock_resp

                res = task_extractor.upgrade_heuristic_tasks(self.session)

        # 3. Verify task is upgraded in-place
        upgraded_task = self.session.query(Task).filter_by(id=task_id).first()
        self.assertIsNotNone(upgraded_task)
        # Crucial invariants:
        self.assertEqual(upgraded_task.status, "approved", "User status MUST NOT be overwritten to 'pending'")
        self.assertEqual(upgraded_task.context_message_id, self.msg_action.id, "FK must remain intact")
        if hasattr(Task, "extraction_mode"):
            self.assertEqual(upgraded_task.extraction_mode, "ollama")

    @unittest.skipIf(task_extractor is None, "backend/task_extractor.py pending implementation in Milestone M1")
    def test_whatsapp_mention_and_pronoun_assignee_attribution(self):
        """Verify WhatsApp @~ pushname mentions and 1st-person pronouns are correctly attributed."""
        msg = {
            "id": "msg_tanishk_1",
            "sender_name": "Cse Shreya Goyal✨ senior",
            "chat_name": "Aerospace Members 2026",
            "content": "@~Tanishk send today's attendance and photos to @~Lakshyyy and me",
            "timestamp": datetime(2026, 10, 30, 10, 55),
        }
        tasks = task_extractor.extract_with_heuristics([msg])
        self.assertEqual(len(tasks), 1)
        task = tasks[0]
        self.assertEqual(task["assigned_to"], "Tanishk")
        self.assertFalse(task["is_assigned_to_user"], "Task addressed to Tanishk must not be assigned to user")
        self.assertIn("Shreya Goyal", task["task_name"], "'and me' must be resolved to sender display name")

    @unittest.skipIf(task_extractor is None, "backend/task_extractor.py pending implementation in Milestone M1")
    def test_poll_and_celebration_idioms_not_extracted(self):
        """Verify WhatsApp Polls and celebratory 'forward' idioms are not extracted as tasks."""
        msgs = [
            {
                "id": "msg_poll",
                "sender_name": "Cse Shreya Goyal",
                "chat_name": "Aerospace Members 2026",
                "content": "Poll: Are you going to be present on 24 october during hackathon.",
                "timestamp": datetime(2026, 10, 20, 10, 0),
            },
            {
                "id": "msg_anniv",
                "sender_name": "Cse Shreya Goyal",
                "chat_name": "Aerospace Members 2026",
                "content": "Today marks 8 years of the club carried forward by the efforts of our seniors!",
                "timestamp": datetime(2026, 10, 18, 10, 0),
            },
        ]
        tasks = task_extractor.extract_with_heuristics(msgs)
        self.assertEqual(len(tasks), 0, "Polls and idioms must not produce tasks")


if __name__ == "__main__":
    unittest.main()
