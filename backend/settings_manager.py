"""
backend/settings_manager.py — Centralized Settings & Configuration Store
========================================================================
Manages local configuration persistence in backend/settings.json.
Provides:
  - load_settings() -> dict: Loads settings with fallback to defaults
  - save_settings(updates: dict) -> dict: Validates and saves settings
  - sanitize_user_name(name: str) -> str: Prevents prompt injection & regex issues
"""

from __future__ import annotations

import json
import os
import re
import threading
import time
from typing import Any, Dict
import uuid

WORKSPACE_DIR = os.path.dirname(os.path.abspath(__file__))
SETTINGS_FILE = os.path.join(WORKSPACE_DIR, "settings.json")
_settings_lock = threading.RLock()

DEFAULT_SETTINGS: Dict[str, Any] = {
    "user_name": "Guru",
    "inference_mode": "auto",  # Options: "auto", "ollama_only", "heuristic_only"
    "ollama_model": "llama3:latest",
    "ollama_url": "http://127.0.0.1:11434"
}

VALID_INFERENCE_MODES = {"auto", "ollama_only", "heuristic_only"}


def sanitize_user_name(name: Any) -> str:
    """
    Sanitize user display name to prevent prompt injection and regex malformation.
    Strips control characters, newlines, tabs, and limits length.
    """
    if not isinstance(name, str):
        return DEFAULT_SETTINGS["user_name"]

    # Remove leading @ if user typed '@Guru'
    cleaned = name.strip()
    if cleaned.startswith("@"):
        cleaned = cleaned[1:].strip()

    # Remove newlines, carriage returns, tabs, null bytes
    cleaned = re.sub(r"[\r\n\t\x00]+", " ", cleaned)

    # Disallow backticks or markdown quote blocks that could break prompt boundaries
    cleaned = cleaned.replace("`", "").replace('"', "'")

    # Collapse multiple spaces and trim
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    # Limit to 60 characters
    cleaned = cleaned[:60].strip()

    return cleaned if cleaned else DEFAULT_SETTINGS["user_name"]


def load_settings() -> Dict[str, Any]:
    """
    Load settings from backend/settings.json.
    Merges with DEFAULT_SETTINGS for any missing keys.
    """
    with _settings_lock:
        settings = dict(DEFAULT_SETTINGS)
        if os.path.exists(SETTINGS_FILE):
            try:
                with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                    saved = json.load(f)
                    if isinstance(saved, dict):
                        for k, v in saved.items():
                            if k in DEFAULT_SETTINGS and v is not None:
                                settings[k] = v
            except Exception as e:
                print(f"[Settings] Warning: Failed to load {SETTINGS_FILE}: {e}. Using defaults.")

        # Validate loaded values
        settings["user_name"] = sanitize_user_name(settings.get("user_name"))
        if settings.get("inference_mode") not in VALID_INFERENCE_MODES:
            settings["inference_mode"] = DEFAULT_SETTINGS["inference_mode"]
        if not settings.get("ollama_model"):
            settings["ollama_model"] = DEFAULT_SETTINGS["ollama_model"]
        if not settings.get("ollama_url"):
            settings["ollama_url"] = DEFAULT_SETTINGS["ollama_url"]

        return settings


def save_settings(updates: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate updates and persist them to backend/settings.json.
    Returns the complete updated settings dict.
    """
    if not isinstance(updates, dict):
        raise ValueError("Payload must be a JSON object")

    with _settings_lock:
        current = load_settings()

        if "user_name" in updates:
            current["user_name"] = sanitize_user_name(updates["user_name"])

        if "inference_mode" in updates:
            mode = str(updates["inference_mode"]).strip().lower()
            if mode in VALID_INFERENCE_MODES:
                current["inference_mode"] = mode
            else:
                raise ValueError(
                    f"Invalid inference_mode '{updates['inference_mode']}'. "
                    f"Must be one of {sorted(list(VALID_INFERENCE_MODES))}"
                )

        if "ollama_model" in updates and isinstance(updates["ollama_model"], str):
            model = updates["ollama_model"].strip()
            if model:
                current["ollama_model"] = model

        if "ollama_url" in updates and isinstance(updates["ollama_url"], str):
            url = updates["ollama_url"].strip()
            if url:
                current["ollama_url"] = url.rstrip("/")

        # Safe atomic file write with unique temp file per write and retry loop
        temp_file = f"{SETTINGS_FILE}.{uuid.uuid4().hex}.tmp"
        try:
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(current, f, indent=2)

            for attempt in range(5):
                try:
                    if os.path.exists(SETTINGS_FILE):
                        os.replace(temp_file, SETTINGS_FILE)
                    else:
                        os.rename(temp_file, SETTINGS_FILE)
                    break
                except (PermissionError, OSError):
                    if attempt == 4:
                        raise
                    time.sleep(0.02 * (attempt + 1))
        finally:
            if os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                except OSError:
                    pass

        return current
