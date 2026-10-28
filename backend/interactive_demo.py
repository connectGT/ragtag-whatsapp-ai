import time
import uuid
from datetime import datetime, timedelta
from database import SessionLocal, init_db, Contact, Message, Task

def run_interactive_demo():
    print("\n=======================================================")
    print("🎙️ RAGTAG LIVE INTERACTIVE DEMO")
    print("=======================================================\n")
    
    # Get custom input from the professor
    sender_name = input("👤 Enter Sender Name (e.g., Prof. Smith): ")
    message_content = input("💬 Enter Message Content: ")
    task_name = input("📌 Enter Extracted Task Name: ")
    
    print("\n[Processing...] Simulating AI pipeline...\n")
    time.sleep(1.5)
    
    # 1. Ensure tables exist and start session
    init_db()
    session = SessionLocal()
    
    try:
        # Create Contact
        contact_id = str(uuid.uuid4())
        contact = Contact(id=contact_id, name=sender_name)
        session.add(contact)
        
        # Create Message
        msg_id = str(uuid.uuid4())
        message = Message(
            id=msg_id,
            sender_id=contact_id,
            chat_name="Live Demo Chat",
            timestamp=datetime.now(),
            content=message_content
        )
        session.add(message)
        
        # Create Task
        due_date = datetime.now() + timedelta(days=2)
        due_date = due_date.replace(hour=12, minute=0, second=0, microsecond=0)
        
        task = Task(
            task_name=task_name,
            due_date=due_date,
            priority="Medium",
            status="Pending",
            context_message_id=msg_id
        )
        session.add(task)
        
        # Commit to the SQLite database
        session.commit()
        
        print(f"✅ Success! Contact '{sender_name}' added to DB.")
        print(f"✅ Success! Message saved to DB.")
        print(f"✅ Success! Task '{task_name}' generated and saved.")
        print("\n👉 ACTION REQUIRED: Refresh your Next.js Dashboard to see it live!\n")
        
    except Exception as e:
        session.rollback()
        print(f"\n[!] Error during demo: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    run_interactive_demo()
