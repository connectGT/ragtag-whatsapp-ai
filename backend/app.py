from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import subprocess

app = Flask(__name__)
CORS(app) # Enable CORS for Next.js frontend

# Define the folder where backups will be synced
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR = os.path.join(WORKSPACE_DIR, "backups")

# Ensure the backup directory exists
os.makedirs(BACKUP_DIR, exist_ok=True)

@app.route('/api/status', methods=['GET'])
def check_status():
    """Endpoint to check if the .crypt15 file and key are present."""
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
    """Endpoint to trigger the Phase 1 decryption script."""
    print("[API] Decryption triggered by frontend...")
    
    # We call the decrypt_pipeline.py script
    try:
        result = subprocess.run(
            ["python", "decrypt_pipeline.py"], 
            capture_output=True, text=True, check=True
        )
        return jsonify({
            "status": "success", 
            "message": "Phase 1 Decryption complete.",
            "logs": result.stdout
        })
    except subprocess.CalledProcessError as e:
        return jsonify({
            "status": "error", 
            "message": "Decryption failed. Check key validity.",
            "error_logs": e.stderr
        }), 500

if __name__ == '__main__':
    print(f"Starting RAGTAG Backend API... Watching folder: {BACKUP_DIR}")
    app.run(debug=True, port=5000)
