from flask import Flask, jsonify, request
from flask_cors import CORS
import os
import subprocess
import json
import uuid
import re
import socket
import threading
import time
from datetime import datetime

from database import SessionLocal, Task, Message, Contact, DB_PATH
from ingest import run_ingestion
from vector_db import search_chats, CHROMA_PATH, COLLECTION_NAME
from summarizer import generate_catchup_briefing, generate_timeline_summary
from settings_manager import load_settings, save_settings, DEFAULT_SETTINGS

try:
    import task_extractor
except ImportError:
    task_extractor = None

app = Flask(__name__)
CORS(app) # Enable CORS for Next.js frontend

# Define the folder where backups will be synced
WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR = os.path.join(WORKSPACE_DIR, "backups")

# Ensure the backup directory exists
os.makedirs(BACKUP_DIR, exist_ok=True)


def get_vectors_count() -> int:
    """Return current count of embedded vectors in ChromaDB ragtag_collection without loading model."""
    try:
        import chromadb
        client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        collection = client.get_collection(name=COLLECTION_NAME)
        return int(collection.count())
    except Exception:
        return 0


_ollama_online_cache = {"timestamp": 0.0, "online": False}
_ollama_cache_lock = threading.Lock()


def get_ollama_online() -> bool:
    """Check Ollama service liveness with caching and fast socket timeout."""
    global _ollama_online_cache
    now = time.time()
    with _ollama_cache_lock:
        if now - _ollama_online_cache["timestamp"] < 5.0:
            return _ollama_online_cache["online"]

    # Check mode
    try:
        mode = load_settings().get("inference_mode", "auto")
        if mode == "heuristic_only":
            with _ollama_cache_lock:
                _ollama_online_cache = {"timestamp": now, "online": False}
            return False
    except Exception:
        pass

    # Fast socket check
    is_online = False
    try:
        with socket.create_connection(("127.0.0.1", 11434), timeout=0.03):
            is_online = True
    except Exception:
        is_online = False

    with _ollama_cache_lock:
        _ollama_online_cache = {"timestamp": now, "online": is_online}
    return is_online


def get_active_model() -> str:
    """Return active Ollama model name from settings or default."""
    try:
        settings = load_settings()
        return str(settings.get("ollama_model", "llama3:latest"))
    except Exception:
        return "llama3:latest"


@app.route('/api/status', methods=['GET'])
def check_status():
    crypt_file = os.path.join(BACKUP_DIR, "msgstore.db.crypt15")
    key_file = os.path.join(BACKUP_DIR, "encrypted_backup.key")
    db_file = os.path.join(WORKSPACE_DIR, "msgstore.db")
    
    session = SessionLocal()
    try:
        contacts_count = session.query(Contact).count()
        messages_count = session.query(Message).count()
        tasks_count = session.query(Task).count()
    except Exception:
        contacts_count = messages_count = tasks_count = 0
    finally:
        session.close()

    try:
        database_path = os.path.normpath(str(DB_PATH))
    except Exception:
        database_path = os.path.normpath(os.path.join(WORKSPACE_DIR, "msgstore_ragtag.db"))

    try:
        chroma_path = os.path.normpath(str(CHROMA_PATH))
    except Exception:
        chroma_path = os.path.normpath(os.path.join(WORKSPACE_DIR, "chroma_store"))

    settings = load_settings()

    status = {
        "backup_found": os.path.exists(crypt_file),
        "key_found": os.path.exists(key_file),
        "decrypted_db_ready": os.path.exists(db_file),
        "backup_directory": BACKUP_DIR,
        "database_path": database_path,
        "chroma_path": chroma_path,
        "ollama_online": get_ollama_online(),
        "active_model": get_active_model(),
        "inference_mode": settings.get("inference_mode", "auto"),
        "user_name": settings.get("user_name", "Guru"),
        "contacts_count": contacts_count,
        "messages_count": messages_count,
        "tasks_count": tasks_count,
        "vectors_count": get_vectors_count(),
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

@app.route('/api/ingest', methods=['POST'])
def trigger_ingest():
    print("[API] Ingestion triggered...")
    data = request.get_json(silent=True) or {}
    source_path = data.get("source_path")
    try:
        result = run_ingestion(source_path=source_path)
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/upload', methods=['POST'])
def upload_chat_file():
    """
    Accept a direct file upload (.txt or .zip) from the frontend,
    save it to backups/, then immediately run ingestion on it.
    Supports WhatsApp Desktop ZIP exports and plain .txt exports.
    """
    if 'file' not in request.files:
        return jsonify({"status": "error", "message": "No file part in request."}), 400

    uploaded = request.files['file']
    if not uploaded.filename:
        return jsonify({"status": "error", "message": "No file selected."}), 400

    filename = uploaded.filename
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ('.txt', '.zip', '.db'):
        return jsonify({
            "status": "error",
            "message": f"Unsupported file type '{ext}'. Upload a .txt, .zip, or .db file."
        }), 400

    save_path = os.path.join(BACKUP_DIR, filename)
    uploaded.save(save_path)
    print(f"[API] Uploaded '{filename}' saved to {save_path}")

    try:
        result = run_ingestion(source_path=save_path)
        result["uploaded_file"] = filename
        return jsonify(result)
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route('/api/chat', methods=['POST'])
def chat_query():
    data = request.get_json(silent=True) or {}
    query = data.get("query", "").strip()
    chat_name = data.get("chat_name")
    if not query:
        return jsonify({"error": "No query provided"}), 400

    settings = load_settings()
    user_name = settings.get("user_name", "Guru")

    hits = search_chats(query, n_results=4, chat_name=chat_name)
    if not hits:
        target_info = f" in '{chat_name}'" if chat_name else ""
        return jsonify({
            "text": f"I searched the local ChromaDB vector store{target_info}, but found no relevant messages matching '{query}'.",
            "sources": [],
            "action_items": []
        })

    # If Ollama is available, synthesize an agentic answer
    action_items = []
    if get_ollama_online():
        try:
            import urllib.request
            context_blocks = []
            for h in hits:
                context_blocks.append(f"[{h.get('timestamp')}] {h.get('sender_name')} ({h.get('chat_name')}): {h.get('snippet')}")
            context_str = "\n".join(context_blocks)

            prompt = f"""You are RAGTAG, an intelligent local assistant for WhatsApp.
The active user is "{user_name}".
Answer the user's question accurately using ONLY the provided WhatsApp message excerpts.
If the excerpts mention any deadlines, tasks, or action items relevant to the question, state them clearly.

User Question: {query}

WhatsApp Excerpts:
{context_str}

Helpful Answer:"""

            payload = {
                "model": settings.get("ollama_model", "llama3:latest"),
                "prompt": prompt,
                "stream": False,
                "options": {"temperature": 0.2}
            }
            req = urllib.request.Request(
                "http://127.0.0.1:11434/api/generate",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=20.0) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                response_text = res.get("response", "").strip()

            # Attempt to extract action item for reminders if found in hits
            for h in hits:
                snippet = h.get("snippet", "")
                if any(k in snippet.lower() for k in ("submit", "upload", "review", "due", "deadline", "by ", "before ")):
                    action_items.append({
                        "task_name": snippet[:80].strip(),
                        "sender_name": h.get("sender_name", ""),
                        "chat_name": h.get("chat_name", ""),
                        "due_date": h.get("timestamp", ""),
                        "context": snippet
                    })
                    break  # highlight top one

            return jsonify({
                "text": response_text,
                "sources": hits,
                "action_items": action_items
            })
        except Exception as err:
            print(f"[Chat] Ollama synthesis warning: {err}")

    # Fallback to direct semantic citation
    top_hit = hits[0]
    response_text = (
        f"Based on local semantic search in ChromaDB, here is the most relevant discussion found:\n\n"
        f"**{top_hit['sender_name']}** ({top_hit['chat_name']}):\n"
        f"\"{top_hit['snippet']}\"\n\n"
        f"Retrieved with {top_hit['similarity']*100:.1f}% confidence from encrypted storage."
    )

    return jsonify({
        "text": response_text,
        "sources": hits,
        "action_items": action_items
    })

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
                "due_date": t.due_date.strftime("%b %d, %Y at %H:%M") if (t.due_date and isinstance(t.due_date, datetime)) else (str(t.due_date) if t.due_date else None),
                "due_date_iso": t.due_date.isoformat() if (t.due_date and isinstance(t.due_date, datetime)) else (str(t.due_date) if t.due_date else None),
                "priority": t.priority,
                "status": t.status.capitalize() if t.status else "Pending",
                "assigned_to": getattr(t, "assigned_to", "Me") or "Me",
                "extraction_mode": getattr(t, "extraction_mode", "heuristic") or "heuristic",
                "context_message_id": t.context_message_id,
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
                    "timestamp": msg.timestamp.strftime("%b %d, %Y %H:%M") if (msg.timestamp and isinstance(msg.timestamp, datetime)) else str(msg.timestamp) if msg.timestamp else None
                }
            result.append(task_dict)
        return jsonify(result), 200
    finally:
        session.close()


@app.route('/api/tasks/extract', methods=['POST'])
def extract_tasks_endpoint():
    """
    Triggers automated task extraction from chat messages.
    Supports chat filtering, dual-mode execution (Ollama / heuristics),
    and on-demand upgrading of heuristic tasks.
    """
    if task_extractor is None:
        return jsonify({
            "status": "error",
            "message": "task_extractor module is not available on the backend."
        }), 500

    data = request.get_json(silent=True) or {}
    chat_name = data.get("chat_name")
    force_reprocess = bool(data.get("force_reprocess", False))
    mode = data.get("mode", "auto")
    if mode not in ("auto", "ollama", "heuristic"):
        mode = "auto"

    session = SessionLocal()
    try:
        # 1. Query target ground-truth messages from SQLite
        query = session.query(Message)
        if chat_name and chat_name.strip():
            query = query.filter(Message.chat_name == chat_name.strip())
        messages = query.order_by(Message.timestamp.asc()).all()

        scanned_count = len(messages)
        messages_data = [
            {
                "id": m.id,
                "sender_name": m.sender.name if m.sender else "Unknown",
                "chat_name": m.chat_name,
                "content": m.content,
                "timestamp": m.timestamp,
            }
            for m in messages
        ]

        # 2. Extract tasks using dual-mode engine
        extracted = task_extractor.extract_tasks_from_messages(messages_data, mode=mode)

        # 3. Determine actual extraction mode used
        if extracted:
            mode_used = extracted[0].get("extraction_mode", "heuristic")
        elif mode in ("auto", "ollama") and task_extractor.check_ollama_available():
            mode_used = "ollama"
        else:
            mode_used = "heuristic"

        # 4. Save extracted tasks with foreign key validation & deduplication
        save_res = task_extractor.save_extracted_tasks(session, extracted)
        new_count = save_res.get("new_tasks_created", 0)
        saved_tasks = save_res.get("tasks", [])

        # 5. Execute upgrade if force_reprocess or Ollama mode requested
        upgraded_count = 0
        upgraded_tasks = []
        if force_reprocess or mode == "ollama":
            upg_res = task_extractor.upgrade_heuristic_tasks(session)
            upgraded_count = upg_res.get("upgraded_count", upg_res.get("tasks_upgraded", 0))
            upgraded_tasks = upg_res.get("tasks", [])

        # Combine newly created tasks and upgraded tasks (avoiding duplicate objects)
        saved_ids = {t["id"] for t in saved_tasks}
        all_tasks = list(saved_tasks) + [
            t for t in upgraded_tasks if t.get("id") not in saved_ids
        ]

        return jsonify({
            "status": "success",
            "scanned_messages": scanned_count,
            "new_tasks_created": new_count,
            "tasks_upgraded": upgraded_count,
            "extraction_mode_used": mode_used,
            "tasks": all_tasks
        }), 200

    except Exception as e:
        session.rollback()
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
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

@app.route('/api/chats', methods=['GET'])
def get_chats():
    session = SessionLocal()
    try:
        from sqlalchemy import func, desc
        # Retrieve all unique chat names
        chat_names = [r[0] for r in session.query(Message.chat_name).distinct().all() if r[0]]
        chats = []
        for name in chat_names:
            msg_count = session.query(Message).filter(Message.chat_name == name).count()
            last_msg = (
                session.query(Message)
                .filter(Message.chat_name == name)
                .order_by(desc(Message.timestamp))
                .first()
            )
            # Distinct senders
            senders_count = session.query(Message.sender_id).filter(Message.chat_name == name).distinct().count()

            sender_name = "Unknown"
            if last_msg:
                contact = session.query(Contact).filter(Contact.id == last_msg.sender_id).first()
                if contact:
                    sender_name = contact.name

            # Format relative time or time string
            ts_str = ""
            date_str = ""
            if last_msg and last_msg.timestamp:
                ts_str = last_msg.timestamp.strftime("%I:%M %p").lstrip("0")
                date_str = last_msg.timestamp.strftime("%Y-%m-%d")

            chats.append({
                "chat_name": name,
                "message_count": msg_count,
                "is_group": senders_count > 2 or any(k in name.lower() for k in ("group", "club", "team", "cse", "office", "committee")),
                "last_message": {
                    "content": last_msg.content if last_msg else "",
                    "timestamp": ts_str,
                    "date": date_str,
                    "sender_name": sender_name
                } if last_msg else None
            })

        # Sort with most recent chat at the top
        chats.sort(key=lambda c: (
            c["last_message"]["date"] if c["last_message"] else "",
            c["last_message"]["timestamp"] if c["last_message"] else ""
        ), reverse=True)

        return jsonify(chats)
    finally:
        session.close()


@app.route('/api/chats/<path:chat_name>/messages', methods=['GET'])
def get_chat_messages(chat_name):
    """Return full chronological message stream for a specific WhatsApp chat/group."""
    session = SessionLocal()
    try:
        from sqlalchemy import asc
        msgs = (
            session.query(Message)
            .filter(Message.chat_name == chat_name)
            .order_by(asc(Message.timestamp))
            .limit(300)
            .all()
        )
        results = []
        for m in msgs:
            contact = session.query(Contact).filter(Contact.id == m.sender_id).first()
            sender_name = contact.name if contact else m.sender_id
            results.append({
                "id": m.id,
                "sender_id": m.sender_id,
                "sender_name": sender_name,
                "content": m.content,
                "timestamp": m.timestamp.strftime("%I:%M %p").lstrip("0") if m.timestamp else "",
                "timestamp_raw": m.timestamp.isoformat() if m.timestamp else "",
                "date": m.timestamp.strftime("%b %d, %Y") if m.timestamp else ""
            })
        return jsonify({
            "chat_name": chat_name,
            "count": len(results),
            "messages": results
        })
    finally:
        session.close()

@app.route('/api/settings', methods=['GET', 'POST'])
def handle_settings():
    """
    GET: Returns current settings dictionary.
    POST: Validates and updates persistent settings in backend/settings.json.
    """
    if request.method == 'POST':
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return jsonify({"error": "Invalid or missing JSON payload"}), 400
        try:
            updated = save_settings(data)
            return jsonify(updated), 200
        except ValueError as ve:
            return jsonify({"error": str(ve)}), 400
        except Exception as e:
            return jsonify({"error": str(e)}), 500
    else:
        settings = load_settings()
        return jsonify(settings), 200


@app.route('/api/messages/inject', methods=['POST'])
@app.route('/api/simulation/inject', methods=['POST'])
def inject_simulation_message():
    """
    Simulation Message Injection API (Milestone M2 / Faculty Evaluation).
    Inserts live or synthetic evaluator messages directly into SQLite ground truth
    (contacts and messages tables), extracts action items into the tasks table
    with strict foreign key traceability, and updates ChromaDB vector index.
    """
    data = request.get_json(silent=True) or {}
    content = str(data.get("content") or "").strip()
    if not content:
        return jsonify({
            "status": "error",
            "message": "Message content cannot be empty."
        }), 400

    sender_name = (data.get("sender_name") or "Contact").strip()
    chat_name = (data.get("chat_name") or "WhatsApp Group").strip()
    raw_ts = data.get("timestamp")
    mode = data.get("mode", "auto")
    if mode not in ("auto", "ollama", "heuristic"):
        mode = "auto"

    # 1. Parse timestamp safely (Python 3.10 compatible)
    msg_time = datetime.now()
    if raw_ts and isinstance(raw_ts, str) and raw_ts.strip():
        clean_ts = raw_ts.strip().replace("Z", "")
        try:
            msg_time = datetime.fromisoformat(clean_ts)
            if msg_time.tzinfo is not None:
                msg_time = msg_time.replace(tzinfo=None)
        except Exception:
            for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M:%S"):
                try:
                    msg_time = datetime.strptime(clean_ts, fmt)
                    break
                except Exception:
                    pass

    session = SessionLocal()
    try:
        # 2. Resolve or create Contact in SQLite contacts table
        contact = session.query(Contact).filter(Contact.name == sender_name).first()
        if not contact:
            sanitized_name = re.sub(r'[^a-z0-9]+', '_', sender_name.lower()).strip('_')
            base_jid = f"{sanitized_name or 'user'}@s.whatsapp.net"
            contact_jid = base_jid

            existing_by_jid = session.query(Contact).filter(Contact.id == contact_jid).first()
            if existing_by_jid:
                contact_jid = f"{sanitized_name}_{uuid.uuid4().hex[:6]}@s.whatsapp.net"

            contact = Contact(
                id=contact_jid,
                name=sender_name,
                phone_number=None,
            )
            session.add(contact)
            session.flush()

        # 3. Create and commit Message in SQLite messages table
        msg_id = f"sim_{uuid.uuid4().hex[:12]}"
        new_message = Message(
            id=msg_id,
            sender_id=contact.id,
            chat_name=chat_name,
            timestamp=msg_time,
            content=content.strip(),
        )
        session.add(new_message)
        session.commit()

        # 4. Trigger immediate task extraction and save to tasks table
        tasks_extracted = []
        if task_extractor is not None:
            msg_dict = {
                "id": new_message.id,
                "sender_name": contact.name,
                "chat_name": new_message.chat_name,
                "content": new_message.content,
                "timestamp": new_message.timestamp,
            }
            extracted = task_extractor.extract_tasks_from_messages([msg_dict], mode=mode)
            if extracted:
                save_res = task_extractor.save_extracted_tasks(session, extracted)
                tasks_extracted = save_res.get("tasks", [])

        # 5. Synchronize new message to ChromaDB vector store
        try:
            import vector_db
            collection = vector_db.init_chroma(reset=False)
            chunks = vector_db.chunk_messages([new_message])
            if chunks:
                vector_db.embed_and_store(collection, chunks)
        except Exception as chroma_err:
            print(f"[Simulation] ChromaDB sync warning (non-fatal): {chroma_err}")

        # 6. Return response conforming to contract
        return jsonify({
            "status": "success",
            "message_id": new_message.id,
            "tasks_extracted": tasks_extracted,
            "sender_name": contact.name,
            "chat_name": new_message.chat_name,
            "timestamp": new_message.timestamp.isoformat(),
        }), 200

    except Exception as e:
        session.rollback()
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
    finally:
        session.close()


@app.route('/api/catchup', methods=['GET', 'POST'])
def catchup_briefing():
    data = {}
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
    else:
        data = request.args.to_dict()

    chat_name = data.get("chat_name")
    limit = int(data.get("limit", 50))

    # Priority: explicit non-empty request param > settings.json user_name > default "Guru"
    settings = load_settings()
    configured_user = settings.get("user_name", "Guru")
    req_user = data.get("user_name")
    if req_user and isinstance(req_user, str) and req_user.strip():
        user_name = req_user.strip()
    else:
        user_name = configured_user

    briefing = generate_catchup_briefing(chat_name=chat_name, limit=limit, user_name=user_name)
    return jsonify(briefing)


@app.route('/api/summary', methods=['GET', 'POST'])
def timeline_summary():
    data = {}
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
    else:
        data = request.args.to_dict()

    chat_name = data.get("chat_name")
    preset = data.get("preset", "all")
    start_date = data.get("start_date")
    end_date = data.get("end_date")

    # Priority: explicit non-empty request param > settings.json user_name > default "Guru"
    settings = load_settings()
    configured_user = settings.get("user_name", "Guru")
    req_user = data.get("user_name")
    if req_user and isinstance(req_user, str) and req_user.strip():
        user_name = req_user.strip()
    else:
        user_name = configured_user

    summary = generate_timeline_summary(
        chat_name=chat_name,
        preset=preset,
        start_date=start_date,
        end_date=end_date,
        user_name=user_name
    )
    return jsonify(summary)

if __name__ == '__main__':
    print(f"Starting RAGTAG Backend API... Watching folder: {BACKUP_DIR}")
    app.run(host='0.0.0.0', port=5000, debug=False)
