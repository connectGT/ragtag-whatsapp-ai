"""
clear_data.py — Data & Vector Store Reset Utility for Team RAGTAG
==================================================================
Usage:
    python backend/clear_data.py
    (or: .\\backend\\venv\\Scripts\\python.exe backend/clear_data.py)

Actions performed:
  1. Deletes all rows from SQLite tables (tasks, messages, contacts).
  2. Resets SQLite autoincrement counters (sqlite_sequence).
  3. Vacuums SQLite database to reclaim disk space.
  4. Resets the local ChromaDB vector store collection to 0 vectors.
  5. Cleans temporary upload archives in backend/user_archives/.
"""

import sys
import sqlite3
import shutil
from pathlib import Path

# Resolve directories independent of where the script is executed from
BACKEND_DIR = Path(__file__).resolve().parent
DB_PATH = BACKEND_DIR / "msgstore_ragtag.db"
CHROMA_PATH = BACKEND_DIR / "chroma_store"
USER_ARCHIVES_DIR = BACKEND_DIR / "user_archives"

# Ensure backend directory is in sys.path
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


def clear_sqlite():
    """Wipes all rows from contacts, messages, and tasks in msgstore_ragtag.db."""
    if not DB_PATH.exists():
        print(f"[SQLite] Database not found at {DB_PATH}. Skipping.")
        return

    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    try:
        # Disable foreign keys temporarily to avoid constraint ordering conflicts during purge
        cur.execute("PRAGMA foreign_keys = OFF;")

        # Count existing rows before deletion
        counts_before = {}
        for table in ["tasks", "messages", "contacts"]:
            try:
                cur.execute(f"SELECT COUNT(*) FROM {table}")
                counts_before[table] = cur.fetchone()[0]
            except sqlite3.OperationalError:
                counts_before[table] = 0

        # Purge all tables
        cur.execute("DELETE FROM tasks;")
        cur.execute("DELETE FROM messages;")
        cur.execute("DELETE FROM contacts;")

        # Reset autoincrement sequence counters
        try:
            cur.execute("DELETE FROM sqlite_sequence WHERE name IN ('tasks', 'messages', 'contacts');")
        except sqlite3.OperationalError:
            pass

        conn.commit()

        # Vacuum database file to reclaim disk space
        cur.execute("VACUUM;")
        conn.close()

        print("[SQLite] Cleared tables successfully:")
        for table, cnt in counts_before.items():
            print(f"  - {table}: deleted {cnt} rows (now 0)")

    except Exception as e:
        conn.rollback()
        conn.close()
        print(f"[SQLite] Error clearing database: {e}")
        raise


def clear_chroma():
    """Wipes all vector embeddings in ChromaDB collection."""
    try:
        from vector_db import init_chroma
        collection = init_chroma(reset=True)
        print(f"[ChromaDB] Reset vector collection: now {collection.count()} vectors.")
    except Exception:
        # Fallback if chromadb module is not in current Python path: wipe persistent files directly
        if CHROMA_PATH.exists():
            try:
                for item in CHROMA_PATH.iterdir():
                    if item.is_dir():
                        shutil.rmtree(item, ignore_errors=True)
                    elif item.is_file():
                        item.unlink(missing_ok=True)
                print("[ChromaDB] Cleared persistent vector storage files directly.")
            except Exception as fe:
                print(f"[ChromaDB] Notice: Could not reset vector storage ({fe}).")
        else:
            print("[ChromaDB] Storage directory not found. Skipping.")


def clear_archives():
    """Cleans temporary chat archives stored in user_archives."""
    if USER_ARCHIVES_DIR.exists():
        cleaned = 0
        for item in USER_ARCHIVES_DIR.iterdir():
            if item.is_file():
                try:
                    item.unlink()
                    cleaned += 1
                except Exception:
                    pass
        if cleaned > 0:
            print(f"[Storage] Removed {cleaned} uploaded archive file(s) from user_archives/.")


def main():
    print("=" * 60)
    print(" RAGTAG DATA PURGE UTILITY")
    print("=" * 60)
    print("Wiping all messages, tasks, contacts, and ChromaDB vector embeddings...")
    print()

    clear_sqlite()
    clear_chroma()
    clear_archives()

    print()
    print("SUCCESS: System data wiped clean. Ready for fresh chat ingestion.")
    print("=" * 60)


if __name__ == "__main__":
    main()
