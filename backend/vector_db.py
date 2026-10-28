"""
vector_db.py — Anti-Hallucination Data Bridge for RAGTAG
=========================================================
Pipeline:  SQLite (Messages) → Chunk → Embed (local) → ChromaDB

Every vector chunk carries a `context_message_id` metadata field that
maps it back to the immutable source row in the Messages table.
This is the core anti-hallucination guarantee: the RAG system can NEVER
return a result that isn't traceable to a real, stored message.

100% offline — no cloud APIs, no external network calls.

Embedding model: sentence-transformers/all-MiniLM-L6-v2
  - ~80 MB download on first run, cached locally after that.
  - To swap for Ollama instead, replace get_embedding_function() with:
      from langchain_community.embeddings import OllamaEmbeddings
      return OllamaEmbeddings(model="nomic-embed-text")
    (Requires `ollama serve` running locally.)
"""

from __future__ import annotations

import sys
from datetime import datetime
from pathlib import Path
from typing import TYPE_CHECKING

import chromadb
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings

# Import from our SQLite layer (same directory)
from database import Message, SessionLocal

if TYPE_CHECKING:
    pass

# ── Configuration ──────────────────────────────────────────────────────────────

CHROMA_PATH: Path = Path(__file__).parent / "chroma_store"
COLLECTION_NAME: str = "ragtag_collection"

# Local HuggingFace model — downloaded once to ~/.cache/huggingface/
# all-MiniLM-L6-v2: fast, lightweight, 384-dim, great for short chat messages
EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"

# Chunking parameters — tuned for WhatsApp message lengths
CHUNK_SIZE: int = 300       # characters per chunk
CHUNK_OVERLAP: int = 50     # overlap between adjacent chunks
BATCH_SIZE: int = 64        # how many chunks to upsert per ChromaDB call


# ── Step 1: Embedding Model ────────────────────────────────────────────────────

def get_embedding_function() -> HuggingFaceEmbeddings:
    """
    Load the local sentence-transformer embedding model.
    Runs entirely on CPU — no GPU or internet required.
    Model is cached in ~/.cache/huggingface after first download.
    """
    print(f"[Embeddings] Loading model: '{EMBEDDING_MODEL}' (CPU, offline)")
    embedder = HuggingFaceEmbeddings(
        model_name=EMBEDDING_MODEL,
        model_kwargs={"device": "cpu"},
        encode_kwargs={"normalize_embeddings": True},  # Cosine similarity ready
    )
    print("[Embeddings] ✓ Model loaded.")
    return embedder


# ── Step 2: ChromaDB Init ──────────────────────────────────────────────────────

def init_chroma(reset: bool = False) -> chromadb.Collection:
    """
    Initialize a persistent ChromaDB client and return the target collection.

    Args:
        reset: If True, wipes the existing collection and starts fresh.
               Use this when re-ingesting after a message schema change.
               Default is False (safe, idempotent upsert mode).

    Returns:
        chromadb.Collection: The 'ragtag_collection' ready for inserts.
    """
    print(f"[ChromaDB] Initializing persistent store at: {CHROMA_PATH}")
    client = chromadb.PersistentClient(path=str(CHROMA_PATH))

    if reset:
        try:
            client.delete_collection(COLLECTION_NAME)
            print(f"[ChromaDB] ⚠  Collection '{COLLECTION_NAME}' wiped for full re-index.")
        except Exception:
            pass  # Collection didn't exist yet — safe to ignore

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},  # Use cosine distance for similarity
    )
    print(f"[ChromaDB] ✓ Collection '{COLLECTION_NAME}' ready. "
          f"Existing vectors: {collection.count()}")
    return collection


# ── Step 3: Fetch from SQLite ──────────────────────────────────────────────────

def fetch_messages() -> list[Message]:
    """
    Open a SQLAlchemy session and retrieve all rows from the Messages table.
    This is our immutable analytical ground truth.

    Returns:
        List of Message ORM objects.
    """
    print("[SQLite] Connecting to msgstore_ragtag.db...")
    db = SessionLocal()
    try:
        messages = db.query(Message).all()
        print(f"[SQLite] ✓ Fetched {len(messages)} message(s).")
        return messages
    finally:
        db.close()


# ── Step 4: Chunking ───────────────────────────────────────────────────────────

def chunk_messages(messages: list[Message]) -> list[dict]:
    """
    Split each message's content into semantic chunks using
    RecursiveCharacterTextSplitter, preserving full metadata on every chunk.

    The metadata dict is the Anti-Hallucination Bridge:
      - `context_message_id` is the FK back to SQLite's messages.id
      - Every vector in ChromaDB is traceable to a real source row

    Args:
        messages: List of Message ORM objects from SQLite.

    Returns:
        List of chunk dicts with keys: id, text, metadata.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        # Separators ordered from coarsest to finest grain
        separators=["\n\n", "\n", ". ", "! ", "? ", " ", ""],
    )

    chunks: list[dict] = []

    for msg in messages:
        if not msg.content or not msg.content.strip():
            continue  # Skip empty messages silently

        splits = splitter.split_text(msg.content)

        for i, chunk_text in enumerate(splits):
            chunks.append({
                # Deterministic ID: re-running is safe (upsert deduplicates)
                "id": f"{msg.id}__chunk_{i}",
                "text": chunk_text,
                # ── THE BRIDGE ──────────────────────────────────────────────
                # context_message_id is the single source of truth link.
                # When the RAG system retrieves this chunk, it can JOIN back
                # to SQLite to get the full message, sender, and related tasks.
                "metadata": {
                    "context_message_id": msg.id,   # FK → messages.id (SQLite)
                    "sender_id":          msg.sender_id,
                    "chat_name":          msg.chat_name,
                    "timestamp":          msg.timestamp.isoformat() if msg.timestamp else "",
                    "chunk_index":        i,
                    "total_chunks":       len(splits),
                },
            })

    print(f"[Chunking] ✓ {len(messages)} message(s) → {len(chunks)} chunk(s) "
          f"(size={CHUNK_SIZE}, overlap={CHUNK_OVERLAP}).")
    return chunks


# ── Step 5: Embed & Store ──────────────────────────────────────────────────────

def embed_and_store(
    collection: chromadb.Collection,
    chunks: list[dict],
    embedder: HuggingFaceEmbeddings,
) -> None:
    """
    Embed each chunk locally and upsert into ChromaDB in batches.

    Uses `upsert` (not `add`) so the script is safely re-runnable —
    existing chunks with the same deterministic ID are updated in place.

    Args:
        collection: Target ChromaDB collection.
        chunks:     Output of chunk_messages().
        embedder:   Loaded HuggingFaceEmbeddings instance.
    """
    total = len(chunks)
    num_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"[Embed] Embedding {total} chunk(s) in {num_batches} batch(es) of {BATCH_SIZE}...")

    for batch_num, i in enumerate(range(0, total, BATCH_SIZE), start=1):
        batch   = chunks[i : i + BATCH_SIZE]
        texts   = [c["text"]     for c in batch]
        ids     = [c["id"]       for c in batch]
        metas   = [c["metadata"] for c in batch]

        # All embedding happens locally on CPU — no API call
        embeddings = embedder.embed_documents(texts)

        collection.upsert(
            ids=ids,
            embeddings=embeddings,
            documents=texts,
            metadatas=metas,
        )
        print(f"  Batch {batch_num}/{num_batches}: upserted {len(batch)} chunk(s).")

    print(f"[Embed] ✓ Done. Total vectors in collection: {collection.count()}")


# ── Step 6: Smoke Test Query ───────────────────────────────────────────────────

def smoke_test(
    collection: chromadb.Collection,
    embedder: HuggingFaceEmbeddings,
    query: str = "deadline UI mockups",
    n_results: int = 3,
) -> None:
    """
    Run a quick semantic query to verify the pipeline is working end-to-end.
    Prints the top results with their SQLite context_message_id so you can
    verify the bridge is intact.
    """
    print(f"\n[Smoke Test] Query: \"{query}\"")

    if collection.count() == 0:
        print("[Smoke Test] ⚠  Collection is empty — skipping query.")
        return

    n = min(n_results, collection.count())
    query_embedding = embedder.embed_query(query)
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=n,
        include=["documents", "metadatas", "distances"],
    )

    print(f"{'─' * 60}")
    for rank, (doc, meta, dist) in enumerate(zip(
        results["documents"][0],
        results["metadatas"][0],
        results["distances"][0],
    ), start=1):
        score = 1.0 - dist  # Convert cosine distance → similarity
        print(f"  #{rank}  Score: {score:.4f}")
        print(f"       context_message_id : {meta['context_message_id']}")
        print(f"       chat               : {meta['chat_name']}")
        print(f"       chunk              : {meta['chunk_index'] + 1}/{meta['total_chunks']}")
        print(f"       text               : {doc[:100].strip()}...")
        print()
    print(f"{'─' * 60}")


# ── Main Orchestrator ──────────────────────────────────────────────────────────

def main(reset: bool = False) -> None:
    """
    Full pipeline: SQLite → Chunk → Embed (local) → ChromaDB.

    Args:
        reset: Wipe and fully re-index the ChromaDB collection.
               Safe to run repeatedly without reset for incremental updates.
    """
    print("=" * 60)
    print("  RAGTAG  |  Anti-Hallucination Data Bridge")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60 + "\n")

    # 1. Load local embedding model
    embedder   = get_embedding_function()

    # 2. Init ChromaDB
    collection = init_chroma(reset=reset)

    # 3. Fetch ground truth from SQLite
    messages   = fetch_messages()
    if not messages:
        print("\n[Warning] No messages in SQLite. Run `python seed_db.py` first.")
        sys.exit(0)

    # 4. Chunk
    chunks = chunk_messages(messages)
    if not chunks:
        print("\n[Warning] All messages were empty — no chunks produced.")
        sys.exit(0)

    # 5. Embed & store
    embed_and_store(collection, chunks, embedder)

    # 6. Smoke test
    smoke_test(collection, embedder)

    print("\n✅ Bridge complete — SQLite ↔ ChromaDB are in sync.")
    print(f"   ChromaDB store : {CHROMA_PATH}")
    print(f"   Collection     : {COLLECTION_NAME}")
    print(f"   Total vectors  : {collection.count()}\n")


if __name__ == "__main__":
    # Pass reset=True via CLI flag: python vector_db.py --reset
    reset_flag = "--reset" in sys.argv
    main(reset=reset_flag)
