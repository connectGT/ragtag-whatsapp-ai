"""
vector_db.py — Anti-Hallucination Data Bridge for RAGTAG
=========================================================
Pipeline:  SQLite (Messages) → Chunk → Embed (local ONNX) → ChromaDB

Every vector chunk carries a `context_message_id` metadata field that
maps it back to the immutable source row in the Messages table.
This is the core anti-hallucination guarantee: the RAG system can NEVER
return a result that isn't traceable to a real, stored message.

100% offline — no cloud APIs, no external network calls.
Embedding model: sentence-transformers/all-MiniLM-L6-v2 (ONNX Runtime, 384-dim)
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional

import chromadb
import chromadb.utils.embedding_functions as ef

# Import from our SQLite layer (same directory)
from database import Message, Contact, SessionLocal

# ── Configuration ──────────────────────────────────────────────────────────────

CHROMA_PATH: Path = Path(__file__).parent / "chroma_store"
COLLECTION_NAME: str = "ragtag_collection"

# Chunking parameters — tuned for WhatsApp message lengths
CHUNK_SIZE: int = 300       # characters per chunk
CHUNK_OVERLAP: int = 50     # overlap between adjacent chunks
BATCH_SIZE: int = 64        # how many chunks to upsert per ChromaDB call


# ── Step 1: Embedding Model ────────────────────────────────────────────────────

def get_embedding_function():
    """
    Load the local ONNX-accelerated all-MiniLM-L6-v2 embedding function.
    Runs entirely on CPU via onnxruntime — 100% offline, zero cloud API calls.
    """
    return ef.DefaultEmbeddingFunction()


# ── Step 2: ChromaDB Init ──────────────────────────────────────────────────────

def init_chroma(reset: bool = False) -> chromadb.Collection:
    """
    Initialize a persistent ChromaDB client and return the target collection.
    """
    client = chromadb.PersistentClient(path=str(CHROMA_PATH))
    embedder = get_embedding_function()

    if reset:
        try:
            client.delete_collection(COLLECTION_NAME)
            print(f"[ChromaDB] Collection '{COLLECTION_NAME}' wiped for full re-index.")
        except Exception:
            pass

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=embedder,
        metadata={"hnsw:space": "cosine"},
    )
    return collection


# ── Step 3: Fetch from SQLite ──────────────────────────────────────────────────

def fetch_messages() -> List[Message]:
    """Retrieve all rows from the SQLite Messages table."""
    db = SessionLocal()
    try:
        messages = db.query(Message).all()
        return messages
    finally:
        db.close()


# ── Step 4: Chunking ───────────────────────────────────────────────────────────

def simple_chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping chunks, respecting sentence and newline boundaries."""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            split_point = text.rfind("\n", start, end)
            if split_point == -1 or split_point <= start:
                split_point = text.rfind(". ", start, end)
            if split_point == -1 or split_point <= start:
                split_point = text.rfind(" ", start, end)
            if split_point > start:
                end = split_point + 1
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(start + 1, end - overlap)

    return chunks or [text]


def chunk_messages(messages: List[Message]) -> List[Dict]:
    """
    Split messages into semantic chunks preserving full metadata for provenance.
    """
    chunks: List[Dict] = []

    for msg in messages:
        if not msg.content or not msg.content.strip():
            continue

        splits = simple_chunk_text(msg.content)

        for i, chunk_text in enumerate(splits):
            chunks.append({
                "id": f"{msg.id}__chunk_{i}",
                "text": chunk_text,
                "metadata": {
                    "context_message_id": msg.id,
                    "sender_id": msg.sender_id,
                    "chat_name": msg.chat_name or "WhatsApp Chat",
                    "timestamp": msg.timestamp.strftime("%b %d, %Y %H:%M") if msg.timestamp else "",
                    "chunk_index": i,
                    "total_chunks": len(splits),
                },
            })

    return chunks


# ── Step 5: Embed & Store ──────────────────────────────────────────────────────

def embed_and_store(collection: chromadb.Collection, chunks: List[Dict]) -> None:
    """
    Upsert chunks into ChromaDB in batches.
    """
    total = len(chunks)
    num_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE

    for batch_num, i in enumerate(range(0, total, BATCH_SIZE), start=1):
        batch = chunks[i : i + BATCH_SIZE]
        texts = [c["text"] for c in batch]
        ids = [c["id"] for c in batch]
        metas = [c["metadata"] for c in batch]

        collection.upsert(
            ids=ids,
            documents=texts,
            metadatas=metas,
        )

    print(f"[Embed] Done. Total vectors in collection: {collection.count()}")


# ── Step 6: Semantic Query Function (For Flask RAG API) ─────────────────────────

def search_chats(query: str, n_results: int = 4, chat_name: Optional[str] = None) -> List[Dict]:
    """
    Search ChromaDB for the most relevant message chunks matching the query.
    Enriches results with contact names from SQLite for full traceability.
    Supports optional chat_name scoping.
    """
    collection = init_chroma(reset=False)
    if collection.count() == 0:
        return []

    n = min(n_results, collection.count())
    query_params = {
        "query_texts": [query],
        "n_results": n,
        "include": ["documents", "metadatas", "distances"],
    }
    if chat_name and chat_name.strip() and chat_name.lower() not in ("all", "all chats", "all groups"):
        query_params["where"] = {"chat_name": chat_name.strip()}

    try:
        results = collection.query(**query_params)
    except Exception:
        # If where filter has fewer items or fails, fallback to general search
        query_params.pop("where", None)
        results = collection.query(**query_params)

    db = SessionLocal()
    hits = []
    try:
        if results and results.get("documents") and results["documents"][0]:
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            ):
                score = round(1.0 - dist, 4)
                sender_id = meta.get("sender_id")
                sender = db.query(Contact).filter(Contact.id == sender_id).first() if sender_id else None
                sender_name = sender.name if sender else meta.get("sender_id", "Unknown")

                hits.append({
                    "context_message_id": meta.get("context_message_id"),
                    "chat_name": meta.get("chat_name", "Chat"),
                    "sender_name": sender_name,
                    "timestamp": meta.get("timestamp", ""),
                    "snippet": doc,
                    "similarity": score,
                })
    finally:
        db.close()

    return hits


# ── Main Orchestrator ──────────────────────────────────────────────────────────

def main(reset: bool = False) -> None:
    """Full pipeline: SQLite → Chunk → Embed (local ONNX) → ChromaDB."""
    print("=" * 60)
    print("  RAGTAG | Local Vector Data Bridge (ChromaDB)")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60 + "\n")

    collection = init_chroma(reset=reset)
    messages = fetch_messages()

    if not messages:
        print("[Warning] No messages in SQLite. Ingest chats or run seed_db.py first.")
        return

    chunks = chunk_messages(messages)
    if not chunks:
        print("[Warning] All messages were empty — no chunks produced.")
        return

    embed_and_store(collection, chunks)
    print(f"\n[OK] Vector indexing complete! Collection count: {collection.count()}\n")


if __name__ == "__main__":
    reset_flag = "--reset" in sys.argv
    main(reset=reset_flag)
