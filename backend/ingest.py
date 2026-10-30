"""
ingest.py — WhatsApp Chat Ingestion Engine for RAGTAG
======================================================
Bridges decrypted WhatsApp data into the RAGTAG relational ground truth (SQLite)
and triggers downstream vector indexing (ChromaDB).

Supported Sources:
  1. Decrypted WhatsApp SQLite database (msgstore.db from decrypt_pipeline.py)
  2. Exported WhatsApp chat logs (.txt exports from Android / iOS / WhatsApp Desktop)
  3. Compressed ZIP exports from WhatsApp Desktop (contains _chat.txt inside)

Workflow:
  Raw Source ──► Ingestion & Cleaning ──► SQLite (Contacts & Messages) ──► ChromaDB Vector Index
"""

from __future__ import annotations

import os
import re
import sqlite3
import uuid
import zipfile
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple, List, Dict

# Local SQLite ORM imports
from database import SessionLocal, init_db, Contact, Message, Task

BACKEND_DIR = Path(__file__).parent
BACKUP_DIR = BACKEND_DIR / "backups"
RAGTAG_DB_PATH = BACKEND_DIR / "msgstore_ragtag.db"


# ── Step 1: Cleaning & Filters ─────────────────────────────────────────────────

SYSTEM_MESSAGE_PATTERNS = [
    r"Messages and calls are end-to-end encrypted",
    r"created group",
    r"added you",
    r"changed the group",
    r"left the group",
    r"changed their phone number",
    r"<Media omitted>",
    r"This message was deleted",
    r"You deleted this message",
]

def is_system_message(text: str) -> bool:
    """Check if message is an automated WhatsApp system notice."""
    if not text or not text.strip():
        return True
    for pattern in SYSTEM_MESSAGE_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


# ── Step 1b: ZIP Export Extraction ────────────────────────────────────────────

def extract_txt_from_zip(zip_path: str) -> str:
    """
    Extract the _chat.txt file from a WhatsApp Desktop ZIP export.
    WhatsApp Desktop exports a .zip containing '_chat.txt' plus any media files.

    Returns the path to a temporary .txt file (caller should NOT delete it;
    it lives in a temp dir that gets cleaned up by the OS eventually).
    Raises ValueError if no .txt chat file is found inside the ZIP.
    """
    zip_path = str(zip_path)
    print(f"[Ingest] ZIP detected: {zip_path}")

    with zipfile.ZipFile(zip_path, 'r') as zf:
        # Find the chat txt — WhatsApp names it '_chat.txt' or '<GroupName>.txt'
        txt_entries = [
            name for name in zf.namelist()
            if name.endswith('.txt') and not name.startswith('__MACOSX')
        ]
        if not txt_entries:
            raise ValueError(
                f"No .txt file found inside ZIP '{zip_path}'. "
                "Make sure you exported 'Without Media' or the full ZIP."
            )

        # Prefer '_chat.txt' (standard WhatsApp Desktop name), else first .txt
        chat_entry = next((n for n in txt_entries if '_chat' in n.lower()), txt_entries[0])
        print(f"[Ingest] Extracting '{chat_entry}' from ZIP...")

        # Write to a temp file so parse_exported_txt can open it normally
        tmp_dir = tempfile.mkdtemp(prefix="ragtag_zip_")
        extracted_path = os.path.join(tmp_dir, os.path.basename(chat_entry))
        with zf.open(chat_entry) as src, open(extracted_path, 'wb') as dst:
            dst.write(src.read())

        print(f"[Ingest] Extracted to temp: {extracted_path}")
        return extracted_path


# ── Step 2: Decrypted msgstore.db Ingestion ────────────────────────────────────

def parse_decrypted_msgstore(db_path: str) -> List[Dict]:
    """
    Extract messages from a decrypted Android WhatsApp msgstore.db file.
    Dynamically adapts to both modern (v15+) and older WhatsApp schemas.
    """
    if not os.path.exists(db_path):
        raise FileNotFoundError(f"Decrypted database not found at: {db_path}")

    print(f"[Ingest] Reading decrypted WhatsApp DB: {db_path}...")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Determine tables present
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = {row[0] for row in cursor.fetchall()}

    extracted = []

    try:
        if "message" in tables and "chat" in tables:
            # Modern schema (WhatsApp 2020+)
            query = """
                SELECT 
                    m._id,
                    COALESCE(c.subject, j.raw_string, 'WhatsApp Chat') AS chat_name,
                    COALESCE(j.raw_string, 'User') AS sender_raw,
                    COALESCE(m.text_data, '') AS content,
                    m.timestamp
                FROM message m
                LEFT JOIN chat c ON m.chat_row_id = c._id
                LEFT JOIN jid j ON c.jid_row_id = j._id
                WHERE m.text_data IS NOT NULL AND m.text_data != ''
                ORDER BY m.timestamp ASC
            """
            cursor.execute(query)
            for row in cursor.fetchall():
                msg_id, chat_name, sender_raw, content, ts_ms = row
                if is_system_message(content):
                    continue
                # WhatsApp timestamps are in milliseconds epoch
                ts = datetime.fromtimestamp(ts_ms / 1000.0) if ts_ms else datetime.now()
                sender_name = sender_raw.split("@")[0] if "@" in sender_raw else sender_raw
                extracted.append({
                    "id": f"wa_{msg_id}",
                    "sender_name": sender_name,
                    "sender_jid": sender_raw,
                    "chat_name": chat_name,
                    "content": content.strip(),
                    "timestamp": ts,
                })

        elif "messages" in tables:
            # Older WhatsApp SQLite schema
            cursor.execute("""
                SELECT 
                    _id,
                    key_remote_jid,
                    data,
                    timestamp
                FROM messages
                WHERE data IS NOT NULL AND data != ''
                ORDER BY timestamp ASC
            """)
            for row in cursor.fetchall():
                msg_id, jid, content, ts_ms = row
                if is_system_message(content):
                    continue
                ts = datetime.fromtimestamp(ts_ms / 1000.0) if ts_ms else datetime.now()
                sender_name = jid.split("@")[0] if jid and "@" in jid else "User"
                extracted.append({
                    "id": f"wa_{msg_id}",
                    "sender_name": sender_name,
                    "sender_jid": jid or "unknown@s.whatsapp.net",
                    "chat_name": jid or "WhatsApp Chat",
                    "content": content.strip(),
                    "timestamp": ts,
                })
        else:
            print("[Ingest] ⚠ Unrecognized schema in msgstore.db")
    finally:
        conn.close()

    print(f"[Ingest] Extracted {len(extracted)} valid chat messages from msgstore.db.")
    return extracted


# ── Step 3: Exported Chat (.txt) Ingestion ──────────────────────────────────────

# Regex patterns for WhatsApp chat export logs:
# Format A: [23/09/26, 09:15:30 AM] Sender: Message
# Format B: 23/09/2026, 09:15 - Sender: Message
# Format C: 9/23/26, 9:15 AM - Sender: Message
TXT_PATTERNS = [
    re.compile(r"^\[(?P<date>\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}),?\s+(?P<time>\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]\s+(?P<sender>[^:]+):\s+(?P<content>.*)$"),
    re.compile(r"^(?P<date>\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}),?\s+(?P<time>\d{1,2}:\d{2}(?:\s*[APap][Mm])?)\s+-\s+(?P<sender>[^:]+):\s+(?P<content>.*)$"),
]

def parse_txt_timestamp(date_str: str, time_str: str) -> datetime:
    """Flexible datetime parsing across common regional formats."""
    clean_str = f"{date_str.strip()} {time_str.strip().upper()}"
    formats = [
        "%d/%m/%Y %H:%M",
        "%d/%m/%y %H:%M",
        "%d/%m/%Y %I:%M %p",
        "%d/%m/%y %I:%M %p",
        "%d/%m/%Y %I:%M:%S %p",
        "%d/%m/%y %I:%M:%S %p",
        "%m/%d/%Y %I:%M %p",
        "%m/%d/%y %I:%M %p",
        "%Y-%m-%d %H:%M",
    ]
    for fmt in formats:
        try:
            return datetime.strptime(clean_str, fmt)
        except ValueError:
            continue
    return datetime.now()


def parse_exported_txt(txt_path: str, default_chat_name: Optional[str] = None) -> List[Dict]:
    """
    Parse a standard exported WhatsApp .txt file, including multiline messages.
    """
    if not os.path.exists(txt_path):
        raise FileNotFoundError(f"Export file not found at: {txt_path}")

    chat_name = default_chat_name or Path(txt_path).stem.replace("WhatsApp Chat - ", "").replace("_chat", "")
    print(f"[Ingest] Reading exported chat file: {txt_path} (Chat: '{chat_name}')...")

    with open(txt_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()

    messages = []
    current_msg: Optional[Dict] = None

    for line in lines:
        matched = False
        for pattern in TXT_PATTERNS:
            match = pattern.match(line.strip())
            if match:
                matched = True
                if current_msg and not is_system_message(current_msg["content"]):
                    messages.append(current_msg)

                d = match.group("date")
                t = match.group("time")
                sender = match.group("sender").strip()
                content = match.group("content").strip()
                ts = parse_txt_timestamp(d, t)

                current_msg = {
                    "id": str(uuid.uuid4()),
                    "sender_name": sender,
                    "sender_jid": f"{sender.lower().replace(' ', '_')}@s.whatsapp.net",
                    "chat_name": chat_name,
                    "content": content,
                    "timestamp": ts,
                }
                break

        if not matched and current_msg:
            # Multiline message continuation
            current_msg["content"] += "\n" + line.rstrip()

    if current_msg and not is_system_message(current_msg["content"]):
        messages.append(current_msg)

    print(f"[Ingest] Extracted {len(messages)} messages from {Path(txt_path).name}.")
    return messages


# ── Step 4: Write to SQLite Ground Truth ────────────────────────────────────────

def save_to_ragtag_db(parsed_messages: List[Dict]) -> Tuple[int, int]:
    """
    Upsert extracted contacts and messages into msgstore_ragtag.db.
    Returns: (contacts_added, messages_added)
    """
    init_db()
    session = SessionLocal()

    contacts_added = 0
    messages_added = 0

    try:
        # Cache existing contacts and messages
        existing_contacts = {c.name.lower(): c for c in session.query(Contact).all()}
        existing_msg_ids = {m.id for m in session.query(Message.id).all()}

        for item in parsed_messages:
            sender_key = item["sender_name"].lower()
            
            # Find or create Contact
            if sender_key not in existing_contacts:
                contact = Contact(
                    id=item["sender_jid"],
                    name=item["sender_name"],
                    phone_number=None,
                )
                session.add(contact)
                session.flush()
                existing_contacts[sender_key] = contact
                contacts_added += 1
            else:
                contact = existing_contacts[sender_key]

            # Insert Message if not already present
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
        print(f"[SQLite] [OK] Ingestion committed: {contacts_added} new contacts, {messages_added} new messages.")
        return contacts_added, messages_added

    except Exception as e:
        session.rollback()
        print(f"[SQLite] [ERROR] Ingestion error: {e}")
        raise
    finally:
        session.close()


# ── Step 5: Full Ingestion Pipeline Orchestrator ───────────────────────────────

def run_ingestion(source_path: Optional[str] = None, sync_vectors: bool = True) -> Dict:
    """
    Main entry point for ingestion:
      1. Determines file type (.db vs .txt)
      2. Parses and cleans messages
      3. Saves to SQLite msgstore_ragtag.db
      4. Optionally indexes new vectors in ChromaDB via vector_db.py
    """
    print("\n=======================================================")
    print("[RAGTAG] CHAT INGESTION PIPELINE")
    print("=======================================================\n")

    target = source_path
    if not target:
        # Default lookups in backups/ -- priority: msgstore.db > .txt > .zip
        decrypted_db = BACKEND_DIR / "msgstore.db"
        if decrypted_db.exists():
            target = str(decrypted_db)
        else:
            txt_files = list(BACKUP_DIR.glob("*.txt"))
            if txt_files:
                target = str(txt_files[0])
            else:
                zip_files = list(BACKUP_DIR.glob("*.zip"))
                if zip_files:
                    target = str(zip_files[0])

    if not target or not os.path.exists(target):
        return {
            "status": "error",
            "message": (
                "No source found. Place a WhatsApp export (.txt or .zip) "
                f"or decrypted msgstore.db in '{BACKUP_DIR}'."
            ),
        }

    print(f"[Pipeline] Source identified: {target}")

    # Resolve ZIP -> extract inner _chat.txt first
    if target.endswith(".zip"):
        try:
            target = extract_txt_from_zip(target)
        except (zipfile.BadZipFile, ValueError) as e:
            return {"status": "error", "message": f"ZIP extraction failed: {e}"}

    if target.endswith(".db"):
        messages = parse_decrypted_msgstore(target)
    elif target.endswith(".txt"):
        messages = parse_exported_txt(target)
    else:
        return {"status": "error", "message": "Unsupported file format. Use .db, .txt, or .zip"}

    if not messages:
        return {"status": "warning", "message": "No valid messages found in source."}

    contacts_cnt, messages_cnt = save_to_ragtag_db(messages)

    vector_count = 0
    if sync_vectors:
        try:
            print("\n[Pipeline] Syncing newly ingested messages to ChromaDB...")
            import vector_db
            vector_db.main(reset=False)
            vector_count = len(messages)
        except Exception as err:
            print(f"[Pipeline] Vector sync warning: {err}")

    # ── Automated Task Extraction Hook (Milestone M1) ─────────────────────────
    tasks_extracted_count = 0
    try:
        print("\n[Pipeline] Running automated task extraction on newly ingested messages...")
        import task_extractor
        session = SessionLocal()
        try:
            extracted_tasks = task_extractor.extract_tasks_from_messages(messages, mode="auto")
            if extracted_tasks:
                save_res = task_extractor.save_extracted_tasks(session, extracted_tasks)
                tasks_extracted_count = save_res.get("new_tasks_created", 0)
                print(f"[Pipeline] [OK] Auto-extracted {tasks_extracted_count} action items from ingested messages.")
            else:
                print("[Pipeline] No action items found in ingested messages.")
        finally:
            session.close()
    except Exception as err:
        print(f"[Pipeline] ⚠ Task extraction warning (ingestion will not fail): {err}")

    return {
        "status": "success",
        "source": target,
        "contacts_added": contacts_cnt,
        "messages_added": messages_cnt,
        "total_parsed": len(messages),
        "vectors_synced": vector_count,
        "tasks_extracted": tasks_extracted_count,
    }


if __name__ == "__main__":
    import sys
    src = sys.argv[1] if len(sys.argv) > 1 else None
    res = run_ingestion(src)
    print("\n[Result]:", res)
