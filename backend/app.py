from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import subprocess
from database import SessionLocal, Task, Message, Contact

app = Flask(__name__)
CORS(app) # Enable CORS for Next.js frontend

# Define the folder where backups will be synced
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR = os.path.join(WORKSPACE_DIR, "backups")

# Ensure the backup directory exists
os.makedirs(BACKUP_DIR, exist_ok=True)

@app.route('/api/status', methods=['GET'])
def check_status():
    crypt_file = os.path.join(BACKUP_DIR, "msgstore.db.crypt15")
    key_file = os.path.join(BACKUP_DIR, "encrypted_backup.key")
    db_file = os.path.join(WORKSPACE_DIR, "msgstore.db")
    
    status = {
        "backup_found": os.path.exists(crypt_file),
        "key_found": os.path.exists(key_file),
        "decrypted_db_ready": os.path.exists(db_file),
        "backup_directory": BACKUP_DIR
    }
    return jsonify(status)

@app.route('/api/decrypt', methods=['POST'])
def trigger_decryption():
    print("[API] Decryption triggered by frontend...")
    try:
        result = subprocess.run(
            ["python", "decrypt_pipeline.py"], 
            capture_output=True, text=True, check=True
        )
        return jsonify({"status": "success", "message": "Phase 1 Decryption complete.", "logs": result.stdout})
    except subprocess.CalledProcessError as e:
        return jsonify({"status": "error", "message": "Decryption failed. Check key validity.", "error_logs": e.stderr}), 500

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    session = SessionLocal()
    try:
        tasks = session.query(Task).all()
        result = []
        for t in tasks:
            task_dict = {
                "id": str(t.id),
                "task_name": t.task_name,
                "due_date": t.due_date.strftime("%b %d, %Y at %H:%M") if t.due_date else None,
                "priority": t.priority,
                "status": t.status.capitalize() if t.status else "Pending",
                "context_message": None
            }
            if t.context_message:
                msg = t.context_message
                sender = session.query(Contact).filter(Contact.id == msg.sender_id).first()
                task_dict["context_message"] = {
                    "id": msg.id,
                    "sender_name": sender.name if sender else "Unknown",
                    "sender_id": msg.sender_id,
                    "chat_name": msg.chat_name,
                    "content": msg.content,
                    "timestamp": msg.timestamp.strftime("%b %d, %Y %H:%M") if msg.timestamp else None
                }
            result.append(task_dict)
        return jsonify(result)
    finally:
        session.close()

@app.route('/api/tasks/<int:task_id>', methods=['PATCH'])
def update_task(task_id):
    data = request.get_json() or {}
    new_status = data.get("status")
    
    session = SessionLocal()
    try:
        task = session.query(Task).filter(Task.id == task_id).first()
        if not task:
            return jsonify({"error": "Task not found"}), 404
        
        if new_status:
            task.status = new_status.lower()
            session.commit()
            return jsonify({"status": "success", "task_id": task_id, "new_status": task.status})
        
        return jsonify({"error": "No update fields provided"}), 400
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

if __name__ == '__main__':
    print(f"Starting RAGTAG Backend API... Watching folder: {BACKUP_DIR}")
    app.run(debug=True, port=5000)
