import time
import uuid
from datetime import datetime, timedelta
from database import SessionLocal, init_db, Contact, Message, Task

def run_faculty_demo():
    print("\n=======================================================")
    print("🤖 RAGTAG LIVE DEMO: DATABASE & FRONTEND CONNECTION")
    print("=======================================================\n")
    
    print("Step 1: Listening for new messages...")
    time.sleep(2)
    
    # 1. Ensure tables exist and start session
    init_db()
    session = SessionLocal()
    
    try:
        # Create a faculty contact for the demo
        prof_id = str(uuid.uuid4())
        prof = Contact(id=prof_id, name="Professor Sharma")
        session.add(prof)
        
        print(f"\n[+] New Contact Detected: {prof.name}")
        time.sleep(1)
        
        # Create a new message from the professor
        msg_id = str(uuid.uuid4())
        message = Message(
            id=msg_id,
            sender_id=prof_id,
            chat_name="CS-401 Project Chat",
            timestamp=datetime.now(),
            content="Team RAGTAG, please review the final presentation slides and submit the architecture diagram by tomorrow 5 PM."
        )
        session.add(message)
        
        print(f"[+] New WhatsApp Message Captured: '{message.content}'")
        time.sleep(2)
        
        print("\nStep 2: AI Agent analyzing message for action items...")
        time.sleep(3) # Simulate AI processing time
        
        # Create a new Task based on the message
        due_date = datetime.now() + timedelta(days=1)
        due_date = due_date.replace(hour=17, minute=0, second=0, microsecond=0)
        
        task = Task(
            task_name="Submit Architecture Diagram",
            due_date=due_date,
            priority="High",
            status="Pending",
            context_message_id=msg_id
        )
        session.add(task)
        
        # Commit to the SQLite database
        session.commit()
        
        print("\n[+] AI Extraction Complete! Task saved to SQLite Database.")
        print("-------------------------------------------------------")
        print(f"📌 TASK NAME: {task.task_name}")
        print(f"⏰ DUE DATE : {due_date.strftime('%b %d, %Y at %I:%M %p')}")
        print(f"🔥 PRIORITY : {task.priority}")
        print("-------------------------------------------------------\n")
        
        print("✅ SUCCESS! The database is now updated.")
        print("👉 ACTION REQUIRED: Go to your Next.js Dashboard in your browser and REFRESH the page.")
        print("   You will see this new task instantly fetched from the Flask API!\n")
        
    except Exception as e:
        session.rollback()
        print(f"\n[!] Error during demo: {e}")
    finally:
        session.close()

if __name__ == "__main__":
    run_faculty_demo()
