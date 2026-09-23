"""
seed_db.py - Seed Script for RAGTAG Relational Database
Populates msgstore_ragtag.db with initial sample contacts, messages, and tasks.
"""

from datetime import datetime, timedelta
import uuid
from database import SessionLocal, init_db, Contact, Message, Task


def seed_database():
    """Seeds the SQLite database with initial dummy data."""
    # Ensure tables exist
    init_db()

    session = SessionLocal()

    try:
        # Create Contacts
        guru = Contact(
            id=str(uuid.uuid4()),
            name="Guru Tiwari"
        )
        eshanya = Contact(
            id=str(uuid.uuid4()),
            name="Eshanya Bhaiji"
        )

        session.add(guru)
        session.add(eshanya)
        session.flush()

        # Create Message from Guru
        message_content = "Eshanya, please finish the Next.js UI mockups by tomorrow night."
        msg_id = str(uuid.uuid4())
        message = Message(
            id=msg_id,
            sender_id=guru.id,
            chat_name="RAGTAG Project Group",
            timestamp=datetime.now(),
            content=message_content
        )

        session.add(message)
        session.flush()

        # Create Task linked to the message
        tomorrow = datetime.now() + timedelta(days=1)
        task = Task(
            task_name="Finish Next.js UI mockups",
            due_date=tomorrow,
            priority="High",
            status="Pending",
            context_message_id=message.id
        )

        session.add(task)
        session.commit()

        print("Successfully seeded the database!")
        print(f"  - Created Contact: {guru.name} ({guru.id})")
        print(f"  - Created Contact: {eshanya.name} ({eshanya.id})")
        print(f"  - Created Message in '{message.chat_name}' (ID: {message.id})")
        print(f"  - Created Task: '{task.task_name}' (Due: {task.due_date.strftime('%Y-%m-%d %H:%M')}, Priority: {task.priority})")

    except Exception as e:
        session.rollback()
        print(f"Error seeding database: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed_database()
