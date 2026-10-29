"""
backend/task_extractor.py — Dual-Mode Task Extraction Engine for RAGTAG
Local Ollama LLM with Offline Rule-Based NLP Fallback & Task Upgrading
"""

from __future__ import annotations

import json
import re
import urllib.request
import urllib.error
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any

from sqlalchemy import or_
from database import SessionLocal, Message, Task

# ── Configuration & Constants ──────────────────────────────────────────────────
OLLAMA_URL = "http://127.0.0.1:11434/api/generate"
OLLAMA_TAGS_URL = "http://127.0.0.1:11434/api/tags"
DEFAULT_MODEL = "llama3:latest"
DEFAULT_TIMEOUT = 30.0

ACTION_VERBS = [
    "submit", "review", "prepare", "upload", "send", "finish", "check",
    "complete", "create", "update", "fix", "verify", "draft", "share",
    "implement", "deploy", "test", "present", "deliver", "schedule",
    "write", "push", "merge", "email", "forward", "format"
]

DAYS_MAP = {
    "monday": 0, "mon": 0,
    "tuesday": 1, "tue": 1, "tues": 1,
    "wednesday": 2, "wed": 2,
    "thursday": 3, "thu": 3, "thur": 3, "thurs": 3,
    "friday": 4, "fri": 4,
    "saturday": 5, "sat": 5,
    "sunday": 6, "sun": 6,
}

MONTHS_MAP = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6,
    "july": 7, "jul": 7, "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12
}

SYSTEM_PATTERNS = [
    r"Messages and calls are end-to-end encrypted",
    r"<Media omitted>",
    r"This message was deleted",
    r"You deleted this message",
    r"created group",
    r"added you",
    r"left the group",
    r"changed the group subject"
]

NON_ACTIONABLE_REGEX = re.compile(
    r"^(?:ok|okay|k|noted|cool|great|thanks|thank you|thx|done|sure|yes|no|yep|nope|got it|understood|will do|good morning|good evening|good night|hello|hi|hey|welcome)[.!]?$",
    re.IGNORECASE
)

STATUS_INQUIRY_REGEX = re.compile(
    r"^(?:did|have|has|were|was|are)\s+(?:you|we|anyone|they|he|she)\b.*\?",
    re.IGNORECASE
)


# ── Health & Availability ──────────────────────────────────────────────────────
def check_ollama_available() -> bool:
    """Check if local Ollama daemon is running with 1.0s timeout."""
    try:
        req = urllib.request.Request(OLLAMA_TAGS_URL, method="GET")
        with urllib.request.urlopen(req, timeout=1.0) as res:
            return res.status == 200
    except Exception:
        return False


# ── Date & Time Parsing Helpers ────────────────────────────────────────────────
def parse_relative_datetime(text: str, base_time: Optional[datetime] = None) -> Tuple[Optional[datetime], Optional[str]]:
    """Resolves relative date and time phrases relative to base_time."""
    if base_time is None:
        base_time = datetime.now()

    lower = text.lower()
    target_hour = 17
    target_minute = 0
    time_found = False

    # Check 12-hr time (e.g. 5 PM, 5:30 pm, 5pm)
    t12 = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", lower)
    if t12:
        h = int(t12.group(1))
        m = int(t12.group(2) or 0)
        meridiem = t12.group(3)
        if meridiem == "pm" and h < 12:
            h += 12
        elif meridiem == "am" and h == 12:
            h = 0
        target_hour, target_minute = h, m
        time_found = True
    else:
        # Check 24-hr time
        t24 = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", lower)
        if t24:
            target_hour = int(t24.group(1))
            target_minute = int(t24.group(2))
            time_found = True
        elif "end of day" in lower or "eod" in lower:
            target_hour = 23
            target_minute = 59
            time_found = True
        elif "midnight" in lower:
            target_hour = 23
            target_minute = 59
            time_found = True
        elif "tonight" in lower or "night" in lower or "evening" in lower:
            target_hour = 21
            target_minute = 0
            time_found = True
        elif "noon" in lower:
            target_hour = 12
            target_minute = 0
            time_found = True

    target_date = None
    matched_phrase = None

    if re.search(r"\bday after tomorrow\b", lower):
        target_date = base_time.date() + timedelta(days=2)
        matched_phrase = "day after tomorrow"
    elif re.search(r"\b(tomorrow|tmrw)\b", lower):
        target_date = base_time.date() + timedelta(days=1)
        matched_phrase = "tomorrow"
    elif re.search(r"\b(today|tonight)\b", lower):
        target_date = base_time.date()
        matched_phrase = "today" if "today" in lower else "tonight"
    else:
        for day_name, day_idx in DAYS_MAP.items():
            if re.search(rf"\b{day_name}\b", lower):
                current_day = base_time.weekday()
                days_ahead = (day_idx - current_day) % 7
                if days_ahead == 0:
                    days_ahead = 7
                target_date = base_time.date() + timedelta(days=days_ahead)
                matched_phrase = day_name
                break

    if target_date:
        res = datetime.combine(target_date, datetime.min.time()).replace(
            hour=target_hour, minute=target_minute, second=0, microsecond=0
        )
        return res, matched_phrase

    return None, None


def parse_explicit_date(text: str, base_year: int = 2026) -> Optional[datetime]:
    """Parses explicit calendar dates (ISO, DD/MM/YYYY, Month Day)."""
    # ISO YYYY-MM-DD
    m_iso = re.search(r"\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b", text)
    if m_iso:
        try:
            return datetime(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
        except ValueError:
            pass

    # DD/MM/YYYY or DD-MM-YYYY
    m_dmy = re.search(r"\b(\d{1,2})[-/](\d{1,2})[-/](20\d{2})\b", text)
    if m_dmy:
        try:
            return datetime(int(m_dmy.group(3)), int(m_dmy.group(2)), int(m_dmy.group(1)))
        except ValueError:
            pass

    # Month Day (e.g. Oct 30, October 30th)
    months_re = "|".join(MONTHS_MAP.keys())
    m_md = re.search(r"\b(" + months_re + r")\s+(\d{1,2})(?:st|nd|rd|th)?\b", text, re.IGNORECASE)
    if m_md:
        try:
            mon_num = MONTHS_MAP[m_md.group(1).lower()]
            return datetime(base_year, mon_num, int(m_md.group(2)))
        except ValueError:
            pass

    return None


def resolve_due_date(text: str, base_time: Optional[datetime] = None) -> Optional[datetime]:
    """Combines relative and explicit date parsing."""
    if base_time is None:
        base_time = datetime.now()

    dt, _ = parse_relative_datetime(text, base_time=base_time)
    if dt:
        return dt

    exp_dt = parse_explicit_date(text, base_year=base_time.year)
    if exp_dt:
        # Check if an explicit time is also mentioned in the text
        lower = text.lower()
        t12 = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", lower)
        if t12:
            h = int(t12.group(1))
            m = int(t12.group(2) or 0)
            meridiem = t12.group(3)
            if meridiem == "pm" and h < 12:
                h += 12
            elif meridiem == "am" and h == 12:
                h = 0
            return exp_dt.replace(hour=h, minute=m, second=0, microsecond=0)

        t24 = re.search(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", lower)
        if t24:
            return exp_dt.replace(hour=int(t24.group(1)), minute=int(t24.group(2)), second=0, microsecond=0)

        return exp_dt.replace(hour=17, minute=0, second=0, microsecond=0)

    return None


# ── Priority & Title Helpers ──────────────────────────────────────────────────
def determine_priority(text: str, due_date: Optional[datetime], base_time: datetime) -> str:
    """Computes task priority: High, Medium, or Low."""
    lower = text.lower()

    # 1. High-priority triggers
    high_keywords = [
        r"\b(urgent|asap|immediately|critical|emergency|high priority|important|mandatory|strict)\b",
        r"\b(without fail|final deadline|blocking)\b",
        r"\b(tonight|today|by tonight|before tonight)\b",
        r"\b(must|have to|required)\b",
    ]
    for pat in high_keywords:
        if re.search(pat, lower):
            return "High"

    # 2. Time-proximity heuristic: deadline within 24 hours of message
    if due_date and (due_date - base_time).total_seconds() <= 86400:
        return "High"

    # 3. Low-priority triggers
    low_keywords = [
        r"\b(whenever|low priority|if possible|optional|when you have time|no rush|fyi|take your time|eventually)\b",
        r"\b(if you can|suggest|consider)\b",
    ]
    for pat in low_keywords:
        if re.search(pat, lower):
            return "Low"

    # 4. Standard default
    return "Medium"


def clean_task_title(verb: str, predicate: str) -> str:
    """Strips deadline tails and formats clean task title."""
    DEADLINE_TAIL = r"\s+(?:by|before|due(?:\s+on)?|until|on|at|for)\s+(?:today|tonight|tomorrow|tmrw|yesterday|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}|[A-Za-z]+ \d{1,2}).*$"
    pred_cleaned = re.sub(DEADLINE_TAIL, "", predicate, flags=re.IGNORECASE).strip()
    pred_cleaned = re.sub(r"\s+(?:whenever(?:\s+you\s+have\s+time)?|if\s+possible|no\s+rush|without\s+fail|asap|urgently?).*$", "", pred_cleaned, flags=re.IGNORECASE).strip()
    pred_cleaned = pred_cleaned.rstrip(".,;!?")
    return f"{verb.capitalize()} {pred_cleaned}".strip()


def is_non_actionable_message(text: str) -> bool:
    """Filters out greetings, short acknowledgements, and system messages."""
    stripped = text.strip()
    if not stripped or len(stripped) < 4:
        return True

    for pattern in SYSTEM_PATTERNS:
        if re.search(pattern, stripped, re.IGNORECASE):
            return True

    if NON_ACTIONABLE_REGEX.match(stripped):
        return True

    if STATUS_INQUIRY_REGEX.match(stripped):
        return True

    return False


# ── Extraction Engines ─────────────────────────────────────────────────────────
def extract_with_heuristics(messages: List[Dict]) -> List[Dict]:
    """Rule-based extractor running 100% offline."""
    extracted_tasks = []
    verb_pattern = r"(?:" + "|".join(ACTION_VERBS) + r")\b"

    for msg in messages:
        content = msg.get("content", "").strip()
        msg_id = msg.get("id")
        msg_time = msg.get("timestamp")
        if not isinstance(msg_time, datetime):
            msg_time = datetime.now()

        if not msg_id or is_non_actionable_message(content):
            continue

        # Split sentences preserving technical dots (e.g. Next.js, schema.py)
        sentences = re.split(r"(?<=[.!?])\s+", content)
        for sentence in sentences:
            sentence_clean = sentence.strip()
            if not sentence_clean or is_non_actionable_message(sentence_clean):
                continue
            if STATUS_INQUIRY_REGEX.match(sentence_clean):
                continue

            segments = re.split(rf"\s+(?:and|,|then)\s+(?={verb_pattern})", sentence_clean, flags=re.IGNORECASE)
            for seg in segments:
                match = re.search(rf"\b(" + "|".join(ACTION_VERBS) + rf")\b\s+(.*)", seg, re.IGNORECASE)
                if match:
                    verb = match.group(1).lower()
                    rest = match.group(2).strip()

                    task_title = clean_task_title(verb, rest)
                    if len(task_title) < 5:
                        continue

                    due_dt = resolve_due_date(sentence_clean, base_time=msg_time)
                    priority = determine_priority(sentence_clean, due_dt, base_time=msg_time)

                    extracted_tasks.append({
                        "task_name": task_title,
                        "due_date": due_dt,
                        "priority": priority,
                        "context_message_id": msg_id,
                        "extraction_mode": "heuristic"
                    })

    return extracted_tasks


def extract_with_ollama(messages: List[Dict]) -> List[Dict]:
    """LLM extractor querying local Ollama instance with JSON format."""
    valid_msgs = [
        {
            "id": m["id"],
            "sender": m.get("sender_name", "User"),
            "timestamp": m["timestamp"].isoformat() if hasattr(m["timestamp"], "isoformat") else str(m["timestamp"]),
            "content": m["content"]
        }
        for m in messages
        if m.get("id") and not is_non_actionable_message(m.get("content", ""))
    ]
    if not valid_msgs:
        return []

    prompt = f"""You are RAGTAG Task Extractor, an intelligent WhatsApp task extraction AI.
Analyze the provided WhatsApp messages and extract actionable deliverables and tasks into a valid JSON array.

RULES:
- If a message contains non-actionable chatter, greetings, or questions, return an empty array [].
- "task_name": Concise title starting with an action verb (e.g. "Submit SDMS portal files").
- "due_date": ISO-8601 string (e.g. "2026-09-25T17:00:00") resolved relative to message timestamp, or null if no deadline.
- "priority": Exactly "High", "Medium", or "Low".
- "context_message_id": The exact message id that originated the task.

Output a valid JSON array of objects only.

Messages:
{json.dumps(valid_msgs, indent=2)}

JSON Output:"""

    payload = {
        "model": DEFAULT_MODEL,
        "prompt": prompt,
        "format": "json",
        "stream": False,
        "options": {"temperature": 0.1, "top_p": 0.9}
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(OLLAMA_URL, data=data, headers={"Content-Type": "application/json"})

    with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT) as resp:
        res = json.loads(resp.read().decode("utf-8"))
        raw_text = res.get("response", "").strip()

    clean_json = re.sub(r"^```(?:json)?|```$", "", raw_text, flags=re.MULTILINE).strip()
    try:
        parsed = json.loads(clean_json)
    except Exception:
        match = re.search(r"\[.*\]", clean_json, re.DOTALL)
        parsed = json.loads(match.group(0)) if match else []

    if isinstance(parsed, dict):
        for k in ("tasks", "action_items", "items"):
            if k in parsed and isinstance(parsed[k], list):
                parsed = parsed[k]
                break
        else:
            parsed = [parsed] if "task_name" in parsed else []

    valid_id_set = {m["id"] for m in messages if m.get("id")}
    default_msg_id = messages[0]["id"] if len(messages) == 1 else None

    tasks = []
    for item in parsed:
        name = str(item.get("task_name", "")).strip()
        cid = str(item.get("context_message_id", "") or "").strip()

        # If LLM didn't return context_message_id, fallback to single input message
        if not cid and default_msg_id:
            cid = default_msg_id

        if not name or cid not in valid_id_set:
            continue

        raw_due = item.get("due_date")
        due_dt = None
        if raw_due:
            if isinstance(raw_due, datetime):
                due_dt = raw_due
            elif isinstance(raw_due, str):
                try:
                    due_dt = datetime.fromisoformat(raw_due)
                except Exception:
                    due_dt = resolve_due_date(raw_due)

        p = str(item.get("priority", "Medium")).strip().capitalize()
        priority = p if p in ("High", "Medium", "Low") else "Medium"

        tasks.append({
            "task_name": name,
            "due_date": due_dt,
            "priority": priority,
            "context_message_id": cid,
            "extraction_mode": "ollama"
        })

    return tasks


# ── Top-Level Orchestrator ─────────────────────────────────────────────────────
def extract_tasks_from_messages(messages: List[Any], mode: str = "auto") -> List[Dict]:
    """
    Main extraction interface.
    mode: 'auto' | 'ollama' | 'heuristic'
    """
    if not messages:
        return []

    # Normalize messages if SQLAlchemy instances were passed
    normalized = []
    for m in messages:
        if isinstance(m, dict):
            normalized.append(m)
        else:
            normalized.append({
                "id": getattr(m, "id"),
                "sender_name": getattr(m.sender, "name", "User") if hasattr(m, "sender") and m.sender else "User",
                "chat_name": getattr(m, "chat_name", ""),
                "timestamp": getattr(m, "timestamp", datetime.now()),
                "content": getattr(m, "content", ""),
            })

    if mode == "heuristic":
        return extract_with_heuristics(normalized)

    if mode in ("auto", "ollama"):
        if check_ollama_available():
            try:
                return extract_with_ollama(normalized)
            except Exception as e:
                print(f"[TaskExtractor] Ollama extraction failed ({e}), falling back to heuristics.")
        elif mode == "ollama":
            print("[TaskExtractor] Ollama requested but unavailable. Falling back to heuristics.")

    return extract_with_heuristics(normalized)


# ── Persistence & Upgrade ──────────────────────────────────────────────────────
def save_extracted_tasks(session, tasks_data: List[Dict]) -> Dict:
    """Saves extracted tasks to SQLite with deduplication against existing records."""
    new_count = 0
    skipped_count = 0
    saved_records = []

    for td in tasks_data:
        cid = td.get("context_message_id")
        tname = td.get("task_name", "").strip()

        if not cid:
            raise ValueError("Task context_message_id cannot be null or empty.")

        # Check existing deduplication
        existing = session.query(Task).filter(
            Task.context_message_id == cid,
            Task.task_name == tname
        ).first()

        if existing:
            skipped_count += 1
            continue

        task_obj = Task(
            task_name=tname,
            due_date=td.get("due_date"),
            priority=td.get("priority", "Medium"),
            status="pending",
            context_message_id=cid,
            extraction_mode=td.get("extraction_mode", "heuristic")
        )
        session.add(task_obj)
        session.flush()

        saved_records.append({
            "id": task_obj.id,
            "task_name": task_obj.task_name,
            "due_date": task_obj.due_date.strftime("%b %d, %Y at %H:%M") if task_obj.due_date else None,
            "due_date_iso": task_obj.due_date.isoformat() if task_obj.due_date else None,
            "priority": task_obj.priority,
            "status": task_obj.status,
            "context_message_id": task_obj.context_message_id,
            "extraction_mode": task_obj.extraction_mode
        })
        new_count += 1

    session.commit()
    return {
        "new_tasks_created": new_count,
        "skipped_duplicates": skipped_count,
        "tasks": saved_records
    }


def upgrade_heuristic_tasks(session) -> Dict:
    """
    Scans for tasks previously extracted via heuristics, fetches their source message,
    re-evaluates them using local Ollama LLM, updates task attributes in-place,
    and sets extraction_mode to 'ollama'.
    
    Invariants:
      - Strictly preserves task.status ('Approved', 'Dismissed', 'Pending').
      - Preserves task.context_message_id foreign key.
    """
    if not check_ollama_available():
        return {
            "status": "skipped",
            "message": "Local Ollama LLM is unavailable or offline",
            "candidates_found": 0,
            "upgraded_count": 0,
            "tasks_upgraded": 0,
            "failed_count": 0,
            "tasks": []
        }

    candidates = (
        session.query(Task)
        .filter(or_(Task.extraction_mode == "heuristic", Task.extraction_mode == None))
        .all()
    )

    if not candidates:
        return {
            "status": "success",
            "message": "No heuristic tasks pending upgrade",
            "candidates_found": 0,
            "upgraded_count": 0,
            "tasks_upgraded": 0,
            "failed_count": 0,
            "tasks": []
        }

    upgraded_tasks = []
    failed_count = 0

    for task in candidates:
        msg = task.context_message or session.query(Message).filter(Message.id == task.context_message_id).first()
        if not msg:
            failed_count += 1
            continue

        msg_payload = [{
            "id": msg.id,
            "sender_name": msg.sender.name if msg.sender else "Unknown",
            "chat_name": msg.chat_name,
            "content": msg.content,
            "timestamp": msg.timestamp,
        }]

        try:
            extracted_items = extract_with_ollama(msg_payload)
            if extracted_items:
                best_item = extracted_items[0]

                # INVARIANT: Preserves task.status and task.context_message_id untouched
                task.task_name = best_item.get("task_name", task.task_name)

                due = best_item.get("due_date")
                if isinstance(due, str):
                    try:
                        due = datetime.fromisoformat(due)
                    except ValueError:
                        due = None
                if due is not None:
                    task.due_date = due

                if best_item.get("priority"):
                    task.priority = best_item["priority"]

                task.extraction_mode = "ollama"
                upgraded_tasks.append(task)
        except Exception as e:
            print(f"[TaskExtractor] Upgrade failed for task {task.id}: {e}")
            failed_count += 1

    try:
        session.commit()
    except Exception as e:
        session.rollback()
        raise e

    return {
        "status": "success",
        "candidates_found": len(candidates),
        "upgraded_count": len(upgraded_tasks),
        "tasks_upgraded": len(upgraded_tasks),
        "failed_count": failed_count,
        "tasks": [
            {
                "id": t.id,
                "task_name": t.task_name,
                "due_date": t.due_date.strftime("%b %d, %Y at %H:%M") if t.due_date else None,
                "due_date_iso": t.due_date.isoformat() if t.due_date else None,
                "priority": t.priority,
                "status": t.status,
                "extraction_mode": t.extraction_mode,
                "context_message_id": t.context_message_id,
            }
            for t in upgraded_tasks
        ]
    }
