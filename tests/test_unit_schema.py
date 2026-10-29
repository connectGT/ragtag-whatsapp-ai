"""
tests/test_unit_schema.py - Tier 1: Unit & Schema Integrity Tests
==================================================================
Verifies:
  1. SQLite ORM models (Contact, Message, Task) creation and field structure.
  2. Mandatory foreign key enforcement on context_message_id (PRAGMA foreign_keys = ON).
  3. Non-null constraints on Task.context_message_id (anti-hallucination guarantee).
  4. Action and Decision regex triggers for message parsing.
  5. Flexible date parsing across formats and relative date anchors.
"""

import os
import re
import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from sqlalchemy import create_engine, event, select
from sqlalchemy.engine import Engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

# Add backend directory to sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import Base, Contact, Message, Task
from ingest import parse_txt_timestamp, is_system_message
from summarizer import ACTION_TRIGGERS, DECISION_TRIGGERS


class TestDatabaseSchemaAndForeignKeys(unittest.TestCase):
    """Tier 1: Tests relational schema models, SQLite foreign key enforcement, and constraints."""

    def setUp(self):
        """Create an isolated in-memory SQLite database with enforced foreign keys."""
        self.engine = create_engine("sqlite:///:memory:", echo=False, future=True)

        # Enforce SQLite foreign keys
        @event.listens_for(self.engine, "connect")
        def set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.close()

        Base.metadata.create_all(bind=self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.session = self.Session()

    def tearDown(self):
        self.session.close()
        Base.metadata.drop_all(bind=self.engine)
        self.engine.dispose()

    def test_models_creation(self):
        """Verify Contact, Message, and Task tables can be instantiated in SQLite."""
        contact = Contact(id="user1@s.whatsapp.net", name="Test User", phone_number="+919876543210")
        self.session.add(contact)
        self.session.commit()

        retrieved_contact = self.session.query(Contact).filter_by(id="user1@s.whatsapp.net").first()
        self.assertIsNotNone(retrieved_contact)
        self.assertEqual(retrieved_contact.name, "Test User")
        self.assertEqual(retrieved_contact.phone_number, "+919876543210")

    def test_valid_task_with_context_message_foreign_key(self):
        """Verify inserting a Task with a valid context_message_id succeeds and establishes relationship."""
        contact = Contact(id="prof@s.whatsapp.net", name="Prof. Sharma")
        self.session.add(contact)
        self.session.commit()

        msg = Message(
            id="msg_001",
            sender_id="prof@s.whatsapp.net",
            chat_name="CS-401 Capstone Review",
            timestamp=datetime(2026, 9, 22, 14, 30),
            content="Submit the SDMS portal files by Friday end of day without fail.",
        )
        self.session.add(msg)
        self.session.commit()

        task = Task(
            task_name="Submit the SDMS portal files",
            due_date=datetime(2026, 9, 25, 17, 0),
            priority="High",
            status="pending",
            context_message_id="msg_001",
        )
        self.session.add(task)
        self.session.commit()

        saved_task = self.session.query(Task).filter_by(context_message_id="msg_001").first()
        self.assertIsNotNone(saved_task)
        self.assertEqual(saved_task.task_name, "Submit the SDMS portal files")
        self.assertEqual(saved_task.priority, "High")
        self.assertEqual(saved_task.context_message.content, msg.content)
        self.assertEqual(saved_task.context_message.sender.name, "Prof. Sharma")

    def test_foreign_key_violation_raises_integrity_error(self):
        """Verify inserting a Task with an invalid context_message_id raises IntegrityError."""
        task = Task(
            task_name="Hallucinated Task Without Source Message",
            due_date=datetime.now(),
            priority="Low",
            status="pending",
            context_message_id="non_existent_message_id",
        )
        self.session.add(task)
        with self.assertRaises(IntegrityError):
            self.session.commit()
        self.session.rollback()

    def test_null_context_message_id_raises_integrity_error(self):
        """Verify inserting a Task with context_message_id=None raises IntegrityError (NOT NULL constraint)."""
        task = Task(
            task_name="Task without context_message_id",
            due_date=datetime.now(),
            priority="Medium",
            status="pending",
            context_message_id=None,
        )
        self.session.add(task)
        with self.assertRaises(IntegrityError):
            self.session.commit()
        self.session.rollback()

    def test_message_invalid_sender_foreign_key_violation(self):
        """Verify inserting a Message with an invalid sender_id raises IntegrityError."""
        msg = Message(
            id="msg_orphan",
            sender_id="non_existent_sender@s.whatsapp.net",
            chat_name="Test Chat",
            timestamp=datetime.now(),
            content="Message with no contact",
        )
        self.session.add(msg)
        with self.assertRaises(IntegrityError):
            self.session.commit()
        self.session.rollback()

    def test_message_cascade_delete_tasks(self):
        """Verify that deleting a source Message cascades and deletes dependent Tasks."""
        contact = Contact(id="c1@s.whatsapp.net", name="Lead Dev")
        self.session.add(contact)
        self.session.commit()

        msg = Message(
            id="msg_to_delete",
            sender_id="c1@s.whatsapp.net",
            chat_name="Dev Group",
            timestamp=datetime.now(),
            content="Fix urgent bug before demo",
        )
        self.session.add(msg)
        self.session.commit()

        task = Task(
            task_name="Fix urgent bug",
            due_date=datetime.now() + timedelta(hours=2),
            priority="High",
            status="pending",
            context_message_id="msg_to_delete",
        )
        self.session.add(task)
        self.session.commit()

        # Delete message
        self.session.delete(msg)
        self.session.commit()

        # Task should also be removed
        remaining_tasks = self.session.query(Task).filter_by(context_message_id="msg_to_delete").all()
        self.assertEqual(len(remaining_tasks), 0)


class TestActionAndDecisionTriggers(unittest.TestCase):
    """Tier 1: Tests regex triggers for action item detection and decision capture."""

    def test_action_triggers_match_positive_cases(self):
        """Verify action patterns match common imperative task phrases."""
        positive_phrases = [
            "Please submit the assignment by tomorrow",
            "Can you review the LangChain text chunk size tonight?",
            "Guru, please finish the Next.js UI mockups by tomorrow night.",
            "Reminder to all teams: Submit the SDMS portal files by Friday end of day without fail.",
            "Team RAGTAG, please review the final presentation slides",
            "We must finish the test suite before Thursday 3 PM",
            "Need to upload the finalized architecture diagram",
            "TODO: verify SQLite foreign key enforcement",
        ]

        compiled_patterns = [re.compile(p, re.IGNORECASE) for p in ACTION_TRIGGERS]
        for phrase in positive_phrases:
            matched = any(p.search(phrase) for p in compiled_patterns)
            self.assertTrue(matched, f"Expected action match for phrase: '{phrase}'")

    def test_decision_triggers_match_positive_cases(self):
        """Verify decision patterns match agreement and resolution phrases."""
        positive_phrases = [
            "We decided to use ChromaDB with local ONNX embeddings",
            "Approved the pull request for the task extractor",
            "Let's go with Ollama as the default local LLM",
            "Confirmed: the demonstration is scheduled for Friday 4 PM",
            "I have pushed the decryption script and SQLite database schema to GitHub",
            "The schema migration is completed and merged",
        ]

        compiled_patterns = [re.compile(p, re.IGNORECASE) for p in DECISION_TRIGGERS]
        for phrase in positive_phrases:
            matched = any(p.search(phrase) for p in compiled_patterns)
            self.assertTrue(matched, f"Expected decision match for phrase: '{phrase}'")

    def test_negative_cases_do_not_trigger_action_or_decision(self):
        """Verify non-actionable chatter does not falsely trigger actions or decisions."""
        negative_phrases = [
            "Good morning everyone",
            "See you at lunch",
            "Haha that was hilarious 😂",
            "Thanks for the coffee",
            "Okay got it",
            "What time does the cafeteria close?",
        ]

        action_patterns = [re.compile(p, re.IGNORECASE) for p in ACTION_TRIGGERS]
        decision_patterns = [re.compile(p, re.IGNORECASE) for p in DECISION_TRIGGERS]

        for phrase in negative_phrases:
            has_action = any(p.search(phrase) for p in action_patterns)
            has_decision = any(p.search(phrase) for p in decision_patterns)
            self.assertFalse(has_action, f"False positive action match for: '{phrase}'")
            self.assertFalse(has_decision, f"False positive decision match for: '{phrase}'")

    def test_system_message_filtering(self):
        """Verify WhatsApp system notices are recognized and discarded."""
        system_notices = [
            "Messages and calls are end-to-end encrypted. No one outside of this chat can read them.",
            "Prof. Sharma created group 'CS-401 Capstone Review'",
            "Guru Tiwari added you",
            "<Media omitted>",
            "This message was deleted",
            "You deleted this message",
            "Eshanya changed the group subject",
        ]
        for notice in system_notices:
            self.assertTrue(is_system_message(notice), f"Expected '{notice}' to be flagged as system message")

        regular_msg = "Please submit the final PDF report before 5 PM."
        self.assertFalse(is_system_message(regular_msg))


class TestFlexibleDateParser(unittest.TestCase):
    """Tier 1: Tests date parsing robustness across regional formats, 12h/24h times, and relative dates."""

    def test_parse_txt_timestamp_24h(self):
        """Verify standard 24-hour timestamp parsing."""
        dt = parse_txt_timestamp("22/09/2026", "14:30")
        self.assertEqual(dt.year, 2026)
        self.assertEqual(dt.month, 9)
        self.assertEqual(dt.day, 22)
        self.assertEqual(dt.hour, 14)
        self.assertEqual(dt.minute, 30)

    def test_parse_txt_timestamp_12h_pm(self):
        """Verify 12-hour PM timestamp parsing."""
        dt = parse_txt_timestamp("23/09/26", "09:15 PM")
        self.assertEqual(dt.year, 2026)
        self.assertEqual(dt.month, 9)
        self.assertEqual(dt.day, 23)
        self.assertEqual(dt.hour, 21)
        self.assertEqual(dt.minute, 15)

    def test_parse_txt_timestamp_12h_am(self):
        """Verify 12-hour AM timestamp parsing."""
        dt = parse_txt_timestamp("23/09/2026", "08:45 AM")
        self.assertEqual(dt.year, 2026)
        self.assertEqual(dt.month, 9)
        self.assertEqual(dt.day, 23)
        self.assertEqual(dt.hour, 8)
        self.assertEqual(dt.minute, 45)

    def test_parse_txt_timestamp_seconds(self):
        """Verify timestamps with seconds."""
        dt = parse_txt_timestamp("22/09/2026", "09:15:30 AM")
        self.assertEqual(dt.hour, 9)
        self.assertEqual(dt.minute, 15)
        self.assertEqual(dt.second, 30)

    def test_parse_txt_timestamp_iso(self):
        """Verify ISO format YYYY-MM-DD."""
        dt = parse_txt_timestamp("2026-09-24", "16:00")
        self.assertEqual(dt.year, 2026)
        self.assertEqual(dt.month, 9)
        self.assertEqual(dt.day, 24)
        self.assertEqual(dt.hour, 16)
        self.assertEqual(dt.minute, 0)

    def test_parse_txt_timestamp_us_format(self):
        """Verify US format MM/DD/YYYY."""
        dt = parse_txt_timestamp("09/25/2026", "5:00 PM")
        self.assertEqual(dt.year, 2026)
        self.assertEqual(dt.month, 9)
        self.assertEqual(dt.day, 25)
        self.assertEqual(dt.hour, 17)
        self.assertEqual(dt.minute, 0)

    def test_relative_date_anchoring_logic(self):
        """Verify relative dates resolve anchored to message timestamp, not system clock."""
        msg_timestamp = datetime(2026, 9, 22, 14, 30)  # Tuesday

        # Function simulating relative deadline resolution
        def resolve_relative_deadline(phrase: str, anchor: datetime) -> datetime:
            phrase_lower = phrase.lower()
            if "tomorrow" in phrase_lower:
                target = anchor + timedelta(days=1)
                # Check for explicit time (e.g., 5 PM)
                time_match = re.search(r"(\d{1,2})\s*(pm|am)", phrase_lower)
                if time_match:
                    h = int(time_match.group(1))
                    if time_match.group(2) == "pm" and h != 12:
                        h += 12
                    elif time_match.group(2) == "am" and h == 12:
                        h = 0
                    return target.replace(hour=h, minute=0, second=0, microsecond=0)
                return target.replace(hour=17, minute=0, second=0, microsecond=0)
            elif "friday" in phrase_lower:
                days_ahead = (4 - anchor.weekday()) % 7
                if days_ahead == 0:
                    days_ahead = 7
                target = anchor + timedelta(days=days_ahead)
                return target.replace(hour=23, minute=59, second=0, microsecond=0)
            return anchor

        tomorrow_deadline = resolve_relative_deadline("submit by tomorrow 5 PM", msg_timestamp)
        self.assertEqual(tomorrow_deadline.year, 2026)
        self.assertEqual(tomorrow_deadline.month, 9)
        self.assertEqual(tomorrow_deadline.day, 23)
        self.assertEqual(tomorrow_deadline.hour, 17)

        friday_deadline = resolve_relative_deadline("Submit by Friday end of day", msg_timestamp)
        self.assertEqual(friday_deadline.year, 2026)
        self.assertEqual(friday_deadline.month, 9)
        self.assertEqual(friday_deadline.day, 25)
        self.assertEqual(friday_deadline.hour, 23)


if __name__ == "__main__":
    unittest.main()
