# TEST_READY: Team RAGTAG Automated Test Suite (Tiers 1–4)

**Status**: READY FOR MILESTONE VERIFICATION  
**Author**: `test_writer_e2e_track`  
**Execution Timestamp**: 2026-10-29T14:56:00Z  
**Total Test Cases Authored**: 37 tests across 4 tiers  
**Current Execution Pass Rate**: 100% of runnable tests passed (29 passed, 8 progressive skips for pending M1/M2 code, 0 failures)

---

## 1. Test Runner Invocations

The automated test suite can be run using either the project's unified test runner or standard Python test discovery:

### A. Unified Test Runner (Recommended)
```powershell
# Run all test tiers (Tiers 1-4)
.\backend\venv\Scripts\python.exe run_tests.py

# Run individual tiers
.\backend\venv\Scripts\python.exe run_tests.py --tier 1
.\backend\venv\Scripts\python.exe run_tests.py --tier 2
.\backend\venv\Scripts\python.exe run_tests.py --tier 3
.\backend\venv\Scripts\python.exe run_tests.py --tier 4

# Run with verbose reporting
.\backend\venv\Scripts\python.exe run_tests.py -v
```

### B. Standard `unittest` Discovery
```powershell
.\backend\venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
```

### C. Pytest (if installed in environment)
```powershell
.\backend\venv\Scripts\python.exe -m pytest tests -v
```

---

## 2. Test Suite Tier Hierarchy & Results Summary

| Tier | Test File | Target Scope | Tests Authored | Pass | Skip | Fail | Time |
|---|---|---|---|---|---|---|---|
| **Tier 1: Unit & Schema** | `tests/test_unit_schema.py` | SQLite ORM models, mandatory foreign key pragma, action/decision regex triggers, flexible date parser | 17 | 17 | 0 | 0 | 0.03s |
| **Tier 2: Extractor & Ingest** | `tests/test_integration_extractor.py` | Chat ingestion pipeline, deduplication, dual-mode Ollama/heuristic extractor, 1.0s timeout fallback, task upgrade preservation | 7 | 2 | 5* | 0 | 0.01s |
| **Tier 3: API Contracts** | `tests/test_api_contracts.py` | Flask REST endpoints (`/api/status`, `/api/tasks`, `/api/tasks/<id>`, `/api/chats`, `/api/catchup`, `/api/summary`, `/api/tasks/extract`, `/api/settings`, `/api/simulation/inject`) | 11 | 8 | 3* | 0 | 2.06s |
| **Tier 4: E2E Simulation** | `tests/test_e2e_simulation.py` | Complete faculty evaluation lifecycle, FK traceability, RFC-5545 ICS export, air-gapped zero external network guarantee | 2 | 2 | 0 | 0 | 0.03s |
| **TOTAL** | — | **Full System Verification** | **37** | **29** | **8** | **0** | **3.14s** |

*\*Note: 8 tests employ progressive testability guards and are safely skipped pending code generation in Milestones M1 (`task_extractor.py`, `/api/tasks/extract`) and M2 (`/api/settings`, `/api/simulation/inject`). The instant those modules/routes are added, these tests will activate and enforce contracts automatically.*

---

## 3. Deep-Dive Tier Specifications

### Tier 1: Unit & Schema Integrity Tests (`tests/test_unit_schema.py`)
- `test_models_creation`: Verifies `Contact`, `Message`, `Task` instantiate correctly in SQLite.
- `test_valid_task_with_context_message_foreign_key`: Validates foreign key linkage and ORM relationship resolution between `Task` and `Message`.
- `test_foreign_key_violation_raises_integrity_error`: Asserts that inserting a `Task` referencing an invalid/hallucinated `context_message_id` raises `IntegrityError` when `PRAGMA foreign_keys = ON;`.
- `test_null_context_message_id_raises_integrity_error`: Asserts non-null enforcement on `Task.context_message_id`.
- `test_message_invalid_sender_foreign_key_violation`: Asserts orphan messages with invalid `sender_id` are rejected.
- `test_message_cascade_delete_tasks`: Confirms deleting a source message cascades to dependent tasks.
- `test_action_triggers_match_positive_cases`: Asserts 8 realistic action phrases trigger regex matchers.
- `test_decision_triggers_match_positive_cases`: Asserts 6 realistic decision phrases trigger regex matchers.
- `test_negative_cases_do_not_trigger_action_or_decision`: Asserts non-actionable chatter (greetings, lunch chatter, memes) produces zero false positives.
- `test_system_message_filtering`: Validates 7 WhatsApp system messages (encryption notices, group creation, member added, media omitted) are dropped.
- `test_parse_txt_timestamp_*`: Validates 24-hour, 12-hour AM/PM, seconds, ISO, and US date formats.
- `test_relative_date_anchoring_logic`: Validates relative deadlines ("tomorrow 5 PM", "by Friday") resolve anchored to message timestamp.

### Tier 2: Extractor & Ingestion Integration Tests (`tests/test_integration_extractor.py`)
- `test_parse_exported_txt_structure`: Parses authentic `backend/backups/sample_chat.txt` and verifies extracted message fields.
- `test_save_to_database_and_deduplication`: Verifies chat ingestion into SQLite and tests idempotency (zero duplicates on re-ingestion).
- `test_check_ollama_available_contract`: Validates Ollama liveness detection and network error handling.
- `test_extract_with_heuristics_contract`: Verifies heuristic rule extractor extracts task name, priority (`High`, `Medium`, `Low`), due date, and foreign key.
- `test_extract_with_ollama_contract`: Validates parsing of structured JSON task array from Ollama LLM.
- `test_extract_tasks_fallback_when_ollama_offline`: Verifies 1.0s connection timeout fallback to heuristics without hanging.
- `test_task_upgrade_preserves_user_status_and_foreign_key`: Guarantees user status (`Approved` or `Dismissed`) and `context_message_id` are preserved during task upgrade.

### Tier 3: Flask API Contract Tests (`tests/test_api_contracts.py`)
- `test_get_status_contract`: Validates `GET /api/status` telemetry payload (`backup_found`, `key_found`, `contacts_count`, `messages_count`, `tasks_count`).
- `test_get_tasks_contract`: Validates `GET /api/tasks` task schema, priority enum, nested `context_message`, and ISO dates.
- `test_patch_task_status_success`: Validates `PATCH /api/tasks/<id>` status transition to `Approved`.
- `test_patch_task_status_not_found`: Validates HTTP 404 for non-existent task IDs.
- `test_patch_task_status_empty_body_bad_request`: Validates HTTP 400 for empty update bodies.
- `test_post_tasks_extract_contract`: Validates `POST /api/tasks/extract` request/response schema (M1).
- `test_settings_get_and_post_contract`: Validates `GET /api/settings` and `POST /api/settings` persistence (M2).
- `test_post_simulation_inject_contract`: Validates `POST /api/simulation/inject` message injection (M2).
- `test_get_chats_contract`: Validates `GET /api/chats` group listings.
- `test_post_catchup_contract`: Validates `POST /api/catchup` unread briefing generation.
- `test_post_summary_contract`: Validates `POST /api/summary` timeline summary generation.

### Tier 4: End-to-End Simulation Tests (`tests/test_e2e_simulation.py`)
- `test_complete_faculty_evaluation_flow`:
  - Step 1: Inject simulated faculty message from Prof. Sharma: *"Team RAGTAG, please review the final presentation slides and submit the architecture diagram by tomorrow 5 PM."*
  - Step 2: Ingest into SQLite ground truth (`contacts` and `messages`).
  - Step 3: Run task extraction and verify priority 'High' and deadline tomorrow 5 PM.
  - Step 4: Verify strict Foreign Key traceability (`context_message_id`).
  - Step 5: Verify task presence and nested message data via `GET /api/tasks`.
  - Step 6: Verify calendar deadline alignment on Thursday 5 PM.
  - Step 7: Verify RFC-5545 iCalendar (`.ics`) export payload generation (`BEGIN:VCALENDAR` ... `END:VCALENDAR`).
  - Step 8: Update task approval status via `PATCH /api/tasks/<id>`.
- `test_airgap_guarantee_during_pipeline_execution`:
  - Enforces socket guard on `socket.connect` and `socket.getaddrinfo`.
  - Executes full ingestion, summarization, extraction, and API calls.
  - Confirms 0 outbound requests to public internet / cloud DNS.

---

## 4. Observations & Recommendations for Implementing Agents

1. **SQLite Foreign Keys in `backend/database.py`**:
   - In SQLite, foreign key enforcement must be explicitly enabled per connection via `PRAGMA foreign_keys = ON;`.
   - Milestone M1 must add the SQLAlchemy connection event listener to `backend/database.py`:
     ```python
     @event.listens_for(engine, "connect")
     def set_sqlite_pragma(dbapi_connection, connection_record):
         cursor = dbapi_connection.cursor()
         cursor.execute("PRAGMA foreign_keys=ON;")
         cursor.close()
     ```
2. **Column `extraction_mode` on `Task`**:
   - Milestone M1 should add `extraction_mode: Mapped[str] = mapped_column(String, default="heuristic", nullable=False)` to `Task` in `backend/database.py`.
3. **M1 & M2 Routes in `backend/app.py`**:
   - `POST /api/tasks/extract` (M1)
   - `GET /api/settings` and `POST /api/settings` (M2)
   - `POST /api/simulation/inject` (M2)
   Once implemented, running `python run_tests.py` will automatically execute all 37 tests without skipping.
