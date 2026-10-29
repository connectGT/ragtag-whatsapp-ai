"""
summarizer.py — Emergency Catch-Me-Up Engine for RAGTAG
=========================================================
Solves the "100+ unread messages before jumping on a team call" problem.

Analyzes the latest N messages from a specific WhatsApp group or chat and generates:
  1. Executive TL;DR (Context & Decision highlights)
  2. Active Participants & Discussion Timeline
  3. Action Items & Deadlines
  4. Direct Questions / Mentions for the User

Zero-Cloud / Offline-First:
  - First checks for local Ollama (Llama 3 / Mistral / Phi-3) if available.
  - Automatically falls back to high-accuracy offline heuristic NLP summarization
    so it works anywhere, anytime, with zero external dependencies.
"""

from __future__ import annotations

import re
import urllib.request
import json
from datetime import datetime
from typing import Dict, List, Optional
from database import SessionLocal, Message, Contact

OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
DEFAULT_MODEL = "llama3:latest"

ACTION_TRIGGERS = [
    r"\b(please|plz|can you|need to|have to|must|finish|submit|send|review|prepare|upload|check|todo)\b",
    r"\b(by tonight|by tomorrow|by friday|by monday|deadline|due|before \d+)\b",
]

DECISION_TRIGGERS = [
    r"\b(decided|agreed|approved|confirmed|finalized|done|pushed|merged|completed|fixed)\b",
    r"\b(let's go with|let's do|we will use|looks good|sounds good)\b",
]


def check_ollama_available() -> bool:
    """Check if local Ollama daemon is running."""
    try:
        req = urllib.request.Request("http://127.0.0.1:11434/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=1.0) as res:
            return res.status == 200
    except Exception:
        return False


def summarize_with_ollama(chat_name: str, transcript: str, user_name: str = "Guru") -> str:
    """Generate LLM synthesis via local Ollama."""
    prompt = f"""You are RAGTAG, an executive WhatsApp briefing AI. 
The user ({user_name}) has missed recent messages in the group '{chat_name}' and is about to join an urgent call.
Give an emergency briefing based strictly on the chat transcript below.

Format:
1. 🔥 Executive TL;DR (3 bullet points max)
2. 📌 Key Decisions Made
3. ⚠️ Questions or Action Items for {user_name}

Transcript:
{transcript}

Briefing:"""

    payload = {
        "model": DEFAULT_MODEL,
        "prompt": prompt,
        "stream": False,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(OLLAMA_URL, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30.0) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        return res.get("response", "").strip()


def heuristic_catchup_summary(
    chat_name: str,
    messages: List[Dict],
    user_name: str = "Guru"
) -> Dict:
    """
    Offline extractive summarizer. Extracts decisions, tasks, and mentions
    without needing any external LLM server.
    """
    participants = list({m["sender_name"] for m in messages})
    start_time = messages[0]["timestamp"].strftime("%b %d, %H:%M") if messages[0]["timestamp"] else ""
    end_time = messages[-1]["timestamp"].strftime("%b %d, %H:%M") if messages[-1]["timestamp"] else ""

    decisions = []
    actions = []
    mentions_for_user = []

    user_pattern = re.compile(rf"\b{re.escape(user_name)}\b", re.IGNORECASE)

    for m in messages:
        text = m["content"]
        sender = m["sender_name"]
        item_str = f"{sender}: \"{text}\""

        # Check for direct mentions of user
        if user_pattern.search(text) and sender.lower() != user_name.lower():
            mentions_for_user.append(item_str)

        # Check for decisions
        for pattern in DECISION_TRIGGERS:
            if re.search(pattern, text, re.IGNORECASE):
                decisions.append(item_str)
                break

        # Check for action items
        for pattern in ACTION_TRIGGERS:
            if re.search(pattern, text, re.IGNORECASE):
                actions.append(item_str)
                break

    # Build concise readable TL;DR
    tldr = [
        f"{len(messages)} messages exchanged between {len(participants)} team members ({', '.join(participants[:3])}) from {start_time} to {end_time}.",
    ]
    if decisions:
        tldr.append(f"Key Progress: {decisions[-1]}")
    if actions:
        tldr.append(f"Urgent Request: {actions[-1]}")

    return {
        "chat_name": chat_name,
        "message_count": len(messages),
        "timeline": f"{start_time} - {end_time}",
        "participants": participants,
        "tldr": tldr,
        "decisions": decisions[:4],
        "actions": actions[:4],
        "mentions_for_user": mentions_for_user,
        "generated_by": "offline_heuristic_engine",
    }


def generate_catchup_briefing(chat_name: Optional[str] = None, limit: int = 50, user_name: str = "Guru") -> Dict:
    """
    Main entry point for 'Catch Me Up' briefing.
    Retrieves recent chat messages from SQLite and generates an executive summary.
    """
    db = SessionLocal()
    try:
        # If no chat specified, pick the most active chat
        if not chat_name:
            latest_msg = db.query(Message).order_by(Message.timestamp.desc()).first()
            if not latest_msg:
                return {"error": "No messages found in database. Ingest chats first."}
            chat_name = latest_msg.chat_name

        # Query messages for this chat
        raw_msgs = (
            db.query(Message)
            .filter(Message.chat_name == chat_name)
            .order_by(Message.timestamp.desc())
            .limit(limit)
            .all()
        )
        if not raw_msgs:
            return {"error": f"No messages found for chat '{chat_name}'."}

        # Order chronologically for reading
        raw_msgs.reverse()

        messages = []
        contacts_cache = {c.id: c.name for c in db.query(Contact).all()}

        for m in raw_msgs:
            sender_name = contacts_cache.get(m.sender_id, "User")
            messages.append({
                "id": m.id,
                "sender_name": sender_name,
                "content": m.content,
                "timestamp": m.timestamp,
            })

        # Check if Ollama is running for neural summary
        if check_ollama_available():
            transcript = "\n".join([f"[{m['timestamp'].strftime('%H:%M') if m['timestamp'] else ''}] {m['sender_name']}: {m['content']}" for m in messages])
            try:
                llm_response = summarize_with_ollama(chat_name, transcript, user_name=user_name)
                return {
                    "chat_name": chat_name,
                    "message_count": len(messages),
                    "timeline": f"{messages[0]['timestamp']} - {messages[-1]['timestamp']}",
                    "participants": list({m['sender_name'] for m in messages}),
                    "briefing_markdown": llm_response,
                    "generated_by": "ollama_llama3_local",
                }
            except Exception as e:
                print(f"[Summarizer] Ollama call failed, falling back to heuristic: {e}")

        # Fallback to local heuristic briefing
        summary = heuristic_catchup_summary(chat_name, messages, user_name=user_name)
        return summary

    finally:
        db.close()


if __name__ == "__main__":
    briefing = generate_catchup_briefing()
    print("\n[EMERGENCY CATCH-UP BRIEFING]:")
    print(json.dumps(briefing, indent=2, default=str))
