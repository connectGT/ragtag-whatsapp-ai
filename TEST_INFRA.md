# Team RAGTAG — Automated Test Infrastructure (Tiers 1–4)

## 1. Overview & Test Architecture

Team RAGTAG is a 100% offline, privacy-first WhatsApp AI and task command center. To verify system correctness, data integrity, and strict air-gapped guarantees, the automated test suite is structured across four progressive testing tiers:

```
┌─────────────────────────────────────────────────────────────┐
│ Tier 4: End-to-End Simulation Tests                         │
│ Location: tests/test_e2e_simulation.py                      │
│ Scope: Complete Faculty Evaluation Workflow & Air-Gap Check │
├─────────────────────────────────────────────────────────────┤
│ Tier 3: API & Contract Tests                                │
│ Location: tests/test_api_contracts.py                       │
│ Scope: Flask REST Endpoints & Data Schemas                  │
├─────────────────────────────────────────────────────────────┤
│ Tier 2: Integration Tests                                   │
│ Location: tests/test_integration_extractor.py               │
│ Scope: Dual-Mode Task Extractor, Ollama Fallback & Ingest   │
├─────────────────────────────────────────────────────────────┤
│ Tier 1: Unit & Schema Tests                                 │
│ Location: tests/test_unit_schema.py                         │
│ Scope: SQLite ORM, Foreign Key Enforcement, Regex & Dates   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Test Tiers Specification

### Tier 1: Unit & Schema Integrity Tests (`tests/test_unit_schema.py`)
- **Objective**: Validate the core data layer, relational schema rules, trigger regexes, and flexible date parser.
- **Key Verifications**:
  1. **ORM Model Creation**: Verifies `Contact`, `Message`, and `Task` instantiate correctly in an isolated SQLite database.
  2. **Mandatory Foreign Key Enforcement**:
     - Enforces `PRAGMA foreign_keys = ON;` in SQLite.
     - Asserts that inserting a `Task` referencing a non-existent `context_message_id` raises `IntegrityError`.
     - Asserts that inserting a `Task` with `context_message_id = None` raises `IntegrityError` (NOT NULL constraint).
     - Asserts that valid foreign keys referencing existing messages succeed.
  3. **Action & Decision Regex Triggers**:
     - Action patterns (`please submit`, `need to finish`, `review by tomorrow`, `upload slides`, `must send`, `todo:`, etc.).
     - Decision patterns (`we decided`, `approved`, `confirmed`, `let's go with`, `completed`).
     - Negative assertions on casual non-actionable chatter (`good morning`, `lunch?`, `lol`).
  4. **Flexible Date Parser**:
     - Regional formats (`DD/MM/YYYY`, `MM/DD/YYYY`, `YYYY-MM-DD`, 12-hour AM/PM, 24-hour).
     - Relative date resolution (`tomorrow`, `tonight`, `by Friday`) relative to anchor message timestamps.

### Tier 2: Integration Tests (`tests/test_integration_extractor.py`)
- **Objective**: Verify dual-mode task extraction, offline resilience, upgrade capabilities, and chat log ingestion.
- **Key Verifications**:
  1. **Offline Heuristic Task Extraction**:
     - Scans chat messages and extracts structured tasks with `task_name`, `priority`, `due_date`, and `context_message_id`.
  2. **Ollama LLM Integration & 1.0s Timeout Fallback**:
     - Simulates Ollama online response with valid JSON payload.
     - Simulates Ollama daemon offline/unreachable: verifies the extractor catches connection errors within 1.0s and falls back to heuristics without crashing or hanging.
  3. **Task Upgrade Mechanism**:
     - Upgrades tasks originally extracted via heuristics when Ollama becomes available.
     - Preserves user status (`Approved`, `Dismissed`) — never reverts to `Pending`.
     - Preserves original `context_message_id` foreign key link.
  4. **Chat Export Ingestion Integration**:
     - Ingests `.txt` WhatsApp export files into SQLite.
     - Verifies non-actionable messages generate zero hallucinated tasks.

### Tier 3: API & Contract Tests (`tests/test_api_contracts.py`)
- **Objective**: Verify all Flask REST API routes against the frontend interface contracts.
- **Key Endpoints & Contracts**:
  - `GET /api/status`: Returns system telemetry (`backup_found`, `key_found`, `contacts_count`, `messages_count`, `tasks_count`, DB paths, engine status).
  - `GET /api/tasks`: Returns list of tasks with `due_date_iso`, `priority`, `status`, and embedded `context_message` object.
  - `PATCH /api/tasks/<id>`: Updates task status (`Approved`, `Dismissed`); handles 404 for unknown task IDs.
  - `POST /api/tasks/extract`: Triggers task extraction on demand with statistics payload.
  - `GET /api/settings` & `POST /api/settings`: Manages user display name (`user_name`) and inference mode (`inference_mode`).
  - `POST /api/simulation/inject`: Injects synthetic evaluator messages and triggers extraction.
  - `GET /api/chats`: Returns active chat groups with message counts.
  - `GET/POST /api/catchup`: Returns executive unread briefing.
  - `GET/POST /api/summary`: Returns timeline summary for designated presets or date windows.

### Tier 4: End-to-End Simulation Tests (`tests/test_e2e_simulation.py`)
- **Objective**: Validate the full faculty evaluation lifecycle and verify zero external network leakage.
- **Key Scenarios**:
  1. **Complete Faculty Evaluation Simulation Flow**:
     - Inject message: *"Team RAGTAG, please review the final presentation slides and submit the architecture diagram by tomorrow 5 PM."*
     - Ingest into SQLite `messages` with unique UUID.
     - Extractor detects task *"Submit the architecture diagram"*, priority `High`, due tomorrow 5 PM.
     - Verifies `Task.context_message_id` equals the injected message UUID.
     - Fetches task via `GET /api/tasks`.
     - Approves task via `PATCH /api/tasks/<id>`.
     - Validates RFC-5545 iCalendar (`.ics`) generation for calendar export.
  2. **Air-Gapped Zero External Network Verification**:
     - Intercepts network socket calls during pipeline execution.
     - Asserts that all connections are strictly bound to localhost (`127.0.0.1` / `::1`).
     - Asserts zero outbound requests to external internet IPs or cloud DNS.

---

## 3. Test Runner & Execution Guide

### Primary Test Runner (`run_tests.py`)
The suite provides a unified test runner:
```powershell
.\backend\venv\Scripts\python.exe run_tests.py
```
Options supported:
- `--tier <1|2|3|4>`: Run a specific tier only.
- `--verbose` / `-v`: Detailed test output.

### Standard `unittest` Discovery
```powershell
.\backend\venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
```

### Pytest (if installed)
```powershell
.\backend\venv\Scripts\python.exe -m pytest tests -v
```

---

## 4. Test Isolation & Environment Design

1. **In-Memory & Dedicated Test Databases**:
   - Tests instantiate isolated SQLite databases (in-memory `sqlite:///:memory:` or temporary files) to avoid corrupting or depending on existing runtime databases (`msgstore_ragtag.db`).
2. **Explicit Foreign Key Enforcement**:
   - Every SQLite connection configured in tests enforces `PRAGMA foreign_keys = ON;`.
3. **Deterministic Mocking**:
   - External services (Ollama port 11434) are mocked using `unittest.mock` to simulate both responsive and offline states deterministically.
4. **Air-Gap Sandbox**:
   - Tier 4 installs a socket guard that intercepts `socket.socket.connect` and `socket.getaddrinfo`, asserting all targets are localhost.
