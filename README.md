# Team RAGTAG — Offline Privacy-First WhatsApp AI & Task Command Center

[![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![Next.js 16](https://img.shields.io/badge/Next.js-16.3.5-black.svg)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.2.8-61dafb.svg)](https://react.dev/)
[![SQLite Ground Truth](https://img.shields.io/badge/SQLite-Ground%20Truth-003B57.svg)](https://www.sqlite.org/)
[![ChromaDB Vector Store](https://img.shields.io/badge/ChromaDB-Local%20Vector%20RAG-orange.svg)](https://www.trychroma.com/)
[![Ollama Local LLM](https://img.shields.io/badge/Ollama-Offline%20LLM-white.svg)](https://ollama.ai/)
[![Privacy Guarantee](https://img.shields.io/badge/Air--Gapped-100%25%20Local-success.svg)](#security--air-gap-guarantees)

---

## 1. System Overview

**Team RAGTAG** is a 100% offline, privacy-first personal intelligence command center and automated task management dashboard designed for WhatsApp. Modern group chats, project channels, and academic threads frequently bury critical deadlines, action items, and group consensus under hundreds of casual messages. 

Most AI solutions compromise user privacy by transmitting personal chat logs, phone numbers, and private conversations to external cloud LLM APIs. **Team RAGTAG eliminates this vulnerability completely** by running an air-gapped, zero-cloud processing pipeline directly on local consumer hardware:

1. **Decentralized Wi-Fi Ingestion**: Encrypted WhatsApp databases (`msgstore.db.crypt15`) or exported chat logs (`.txt`) are synced peer-to-peer over local Wi-Fi via Syncthing. No third-party servers ever touch the data.
2. **Relational Ground Truth**: Messages and contacts are structured in a local SQLite database (`msgstore_ragtag.db`) enforcing strict Foreign Key relationships (`PRAGMA foreign_keys = ON;`). Every action item is permanently grounded to its raw source message via `context_message_id`.
3. **Semantic Vector Retrieval**: Messages are indexed into a local ChromaDB vector store using ONNX-accelerated 384-dimensional embeddings (`sentence-transformers/all-MiniLM-L6-v2`) without internet access.
4. **Dual-Mode Intelligence Engine**: Action items, due dates, and priorities are extracted using a local Ollama LLM (`llama3:latest`). If Ollama is unavailable or uninstalled, the system automatically falls back to an offline rule-based heuristic extractor with zero runtime disruption, and automatically upgrades heuristic tasks once Ollama reconnects.
5. **Interactive Command Center**: A responsive Next.js 16 + Tailwind CSS frontend featuring a Kanban Task Dashboard, Interactive Monthly & Weekly Calendar, Agent Chat, System Settings, and a Faculty Simulation Demo Panel.

---

## 2. System Architecture

The following diagram illustrates the complete end-to-end data pipeline from the user's mobile device to the local desktop command center:

```
[Android Phone] ──(Local Wi-Fi / Syncthing TLS 1.3)──► [backend/backups/]
                                                               │
                       ┌───────────────────────────────────────┴───────────────────────────────────────┐
                       ▼                                                                               ▼
             [msgstore.db.crypt15]                                                           [.txt Chat Exports]
                       │ (wadecrypt + encrypted_backup.key)                                            │
                       ▼                                                                               ▼
               [msgstore.db]                                                                   [ingest.py]
                       │                                                                               │
                       └───────────────────────────────┬───────────────────────────────────────────────┘
                                                       ▼
                                              [backend/ingest.py]
                                                       │
                       ┌───────────────────────────────┴───────────────────────────────┐
                       ▼                                                               ▼
           [msgstore_ragtag.db] (SQLite)                                       [ChromaDB Store]
           • contacts (JID, name, phone)                                       • 384-dim ONNX MiniLM
           • messages (Ground Truth raw chats)                                 • Cosine Similarity Vector Index
           • tasks (Non-null context_message_id FK)                            • Contextual Message Snippets
                       │                                                               │
                       └───────────────────────────────┬───────────────────────────────┘
                                                       │
                                                       ▼
                                      [AI Task Extractor & Summarizer]
                                     ┌─────────────────────────────────┐
                                     │ Primary: Ollama (llama3:latest) │
                                     │ Fallback: Offline Heuristics    │
                                     │ Auto-Upgrade Mechanism          │
                                     └────────────────┬────────────────┘
                                                      │
                                                      ▼
                                            [Flask Backend: 5000]
                                     • REST Endpoints & WebSockets
                                     • Status & Health Telemetry
                                     • Live Evaluator Simulation Engine
                                                      │
                                                      ▼
                                           [Next.js Frontend: 3000]
                                     ┌─────────────────────────────────┐
                                     │ • Kanban Task Dashboard         │
                                     │ • Interactive Month/Week Cal    │
                                     │ • Local Vector RAG Agent Chat   │
                                     │ • Wi-Fi Data Ingestion Engine   │
                                     │ • System Settings & Telemetry   │
                                     │ • Faculty Simulation Panel      │
                                     └─────────────────────────────────┘
```

---

## 3. Core Architectural Pillars

### Pillar 1: Relational Ground Truth (SQLite `msgstore_ragtag.db`)
- **`contacts`**: Stores sender JIDs, contact names, and phone numbers.
- **`messages`**: Contains immutable raw chat logs with exact timestamps, sender foreign keys, and chat channel names.
- **`tasks`**: Stores extracted action items (`task_name`, `due_date`, `due_date_iso`, `priority`, `status`, `extraction_mode`).
- **Strict Foreign Key Enforcement**: SQLite pragma `PRAGMA foreign_keys = ON;` is enforced on every connection. A task cannot be created without a valid `context_message_id` linking back to a real `messages.id`, eliminating hallucinations and providing 100% auditability.

### Pillar 2: Semantic Vector Store (ChromaDB)
- High-efficiency vector collection `ragtag_collection` housed in `backend/chroma_store/`.
- Computes 384-dimensional dense semantic embeddings locally using `sentence-transformers/all-MiniLM-L6-v2` via ONNX runtime.
- Enables lightning-fast cosine similarity lookups for the Agent Chat without calling any remote embedding APIs.

### Pillar 3: Dual-Mode Intelligence Engine (`task_extractor.py`)
- **Primary Mode (Ollama LLM)**: Connects to local Ollama instance on `http://127.0.0.1:11434` running `llama3:latest` (or configured model). Parses complex linguistic nuances and dates into structured JSON.
- **Fallback Mode (Offline Heuristics)**: If Ollama is offline or uninstalled, extraction instantly falls back to regex trigger rules, priority keyword scoring, and flexible date parsing.
- **Task Upgrade Logic**: When Ollama becomes reachable, users can trigger task upgrades (`force_reprocess=True`). The engine re-analyzes tasks originally extracted by heuristics and upgrades their fields while preserving their task IDs and approval statuses.

### Pillar 4: Interactive Command Center (Next.js 16 + React 19)
- **Task Dashboard**: Kanban workflow (Pending, Approved, Dismissed), raw chat snippet inspection modal, and RFC-5545 `.ics` iCalendar export.
- **Interactive Calendar**: Monthly schedule grid and weekly timeline views plotting task deadlines with priority color tagging (High = Red, Medium = Amber, Low = Gray/Green).
- **Settings Panel**: Persistent configuration of user display name (used in mentions and executive briefings), LLM vs Heuristics inference mode toggle, and live database telemetry.
- **Sync & Simulation Panel**: Phone-to-PC Syncthing file ingestion monitor and one-click faculty evaluation demonstration controls.

---

## 4. Prerequisites & Environment Setup

Ensure your workstation meets the following requirements:

- **Operating System**: Windows 10/11 (or macOS / Linux)
- **Python**: Version 3.10 or higher
- **Node.js**: Version 18.0.0 or higher (with `npm`)
- **Ollama** *(Optional, recommended)*: Download from [ollama.ai](https://ollama.ai) for local LLM inference.
  ```bash
  ollama run llama3:latest
  ```
  *(Note: If Ollama is not installed, RAGTAG automatically runs in 100% offline heuristic mode).*

---

## 5. Installation & Startup Instructions

### Quick Start (One-Click Launch on Windows)
Simply double-click `start.bat` in the project root directory, or execute in PowerShell:
```cmd
.\start.bat
```
`start.bat` launches the Flask backend on port 5000, starts the Next.js development server on port 3000, waits 5 seconds for initialization, and automatically opens your browser to `http://localhost:3000`.

---

### Manual Startup (Step-by-Step)

#### Step 1: Clone and Set Up Backend
```bash
# Navigate to the backend directory
cd backend

# Create a Python virtual environment
python -m venv venv

# Activate the virtual environment
# Windows (PowerShell):
.\venv\Scripts\Activate.ps1
# Windows (cmd):
.\venv\Scripts\activate.bat
# Linux/macOS:
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Start the Flask API server
python app.py
```
The backend initializes on `http://127.0.0.1:5000`.

#### Step 2: Set Up and Start Frontend
Open a second terminal window:
```bash
# Navigate to the frontend directory
cd frontend

# Install Node.js packages
npm install

# Start the Next.js development server
npm run dev
```
The frontend starts on `http://localhost:3000`. Open your browser to explore the command center.

---

## 6. Complete REST API Reference

The Flask backend exposes 12 REST API endpoints supporting all ingest, task extraction, semantic query, settings, and simulation functions:

| Method | Endpoint | Description | Request Body / Parameters | Response Schema & Codes |
|---|---|---|---|---|
| `GET` | `/api/status` | Reports system health, backup/key presence, database row counts, active DB paths, and Ollama engine status. | None | **200 OK**: `{ backup_found: bool, key_found: bool, decrypted_db_ready: bool, backup_directory: str, contacts_count: int, messages_count: int, tasks_count: int, database_path: str, ollama_online: bool }` |
| `POST` | `/api/decrypt` | Triggers `decrypt_pipeline.py` to decrypt `msgstore.db.crypt15` using `encrypted_backup.key` via `wadecrypt`. | None | **200 OK**: `{ status: "success", message: str, logs: str }`<br>**500 Error**: `{ status: "error", message: str, error_logs: str }` |
| `POST` | `/api/ingest` | Ingests decrypted SQLite `msgstore.db` or exported `.txt` chat files into SQLite ground truth and syncs embeddings to ChromaDB. Automatically triggers task extraction. | `{ source_path?: str }` (Optional file path) | **200 OK**: `{ status: "success", source: str, contacts_added: int, messages_added: int, total_parsed: int, tasks_extracted: int }`<br>**500 Error**: `{ status: "error", message: str }` |
| `GET` | `/api/tasks` | Retrieves all extracted action items with normalized ISO dates and linked context message details. | None | **200 OK**: `[ { id: str, task_name: str, due_date: str, due_date_iso: str, priority: "High"\|"Medium"\|"Low", status: "Pending"\|"Approved"\|"Dismissed", extraction_mode: str, context_message_id: int, context_message: { id: int, sender_name: str, chat_name: str, content: str, timestamp: str } } ]` |
| `PATCH` | `/api/tasks/<id>` | Updates the approval status of a specific task. | `{ status: "Approved" \| "Dismissed" \| "Pending" }` | **200 OK**: `{ status: "success", task_id: int, new_status: str }`<br>**400 Bad Request**: `{ error: "No update fields provided" }`<br>**404 Not Found**: `{ error: "Task not found" }` |
| `POST` | `/api/tasks/extract` | Triggers automated task extraction over ground truth messages with dual-mode execution (Ollama or Heuristics) and optional heuristic task upgrades. | `{ chat_name?: str, force_reprocess?: bool, mode?: "auto" \| "ollama" \| "heuristic" }` | **200 OK**: `{ status: "success", scanned_messages: int, new_tasks_created: int, tasks_upgraded: int, extraction_mode_used: str, tasks: list }`<br>**500 Error**: `{ status: "error", message: str }` |
| `POST` | `/api/chat` | Performs semantic similarity search over local ChromaDB embeddings and returns top relevant message citations. | `{ query: str }` | **200 OK**: `{ text: str, sources: [ { id: str, sender_name: str, chat_name: str, snippet: str, similarity: float } ] }`<br>**400 Bad Request**: `{ error: "No query provided" }` |
| `GET` | `/api/chats` | Lists all indexed WhatsApp chat groups with their respective message counts. | None | **200 OK**: `[ { chat_name: str, message_count: int } ]` |
| `GET` / `POST` | `/api/catchup` | Generates an executive briefing of latest unread chat messages with decision bullets, action items, and urgent mentions of the user. | Query / JSON: `{ chat_name?: str, limit?: int, user_name?: str }` | **200 OK**: `{ summary: str, decisions: [str], actions: [str], mentions: [str], chat_name: str, unread_count: int }` |
| `GET` / `POST` | `/api/summary` | Generates a structured timeline summary of conversations across preset filters (`today`, `yesterday`, `week`, `month`, `all`) or explicit date bounds. | Query / JSON: `{ chat_name?: str, preset?: str, start_date?: str, end_date?: str, user_name?: str }` | **200 OK**: `{ summary: str, decisions: [str], actions: [str], date_range: str, message_count: int }` |
| `GET` | `/api/settings` | Retrieves current system configuration (user display name, inference mode, Ollama model and endpoint). | None | **200 OK**: `{ user_name: str, inference_mode: "auto" \| "ollama" \| "heuristic_only", ollama_model: str, ollama_url: str }` |
| `POST` | `/api/settings` | Updates and persists system settings to `backend/settings.json`. | `{ user_name?: str, inference_mode?: str, ollama_model?: str, ollama_url?: str }` | **200 OK**: `{ status: "success", user_name: str, inference_mode: str, ... }`<br>**400 Bad Request**: `{ error: str }` |
| `POST` | `/api/simulation/inject` | Injects synthetic or live evaluator chat messages directly into SQLite ground truth and triggers immediate task extraction for demonstrations. | `{ sender_name: str, chat_name: str, content: str, timestamp?: str }` | **200 OK**: `{ status: "success", message_id: int, tasks_extracted: list, task_count: int }`<br>**400 Bad Request**: `{ error: str }` |

---

## 7. Faculty Simulation Demonstration Walkthrough

Follow this step-by-step walkthrough during faculty reviews, project evaluations, or live viva demonstrations to showcase all core architectural capabilities:

### Step 1: Boot the Stack & Prove 100% Offline Air-Gap
1. Launch the system using `start.bat`.
2. Confirm the dashboard loads on `http://localhost:3000`.
3. **Prove Offline Operation**: Turn off your PC's Wi-Fi / Ethernet adapter. Refresh the page and execute any task or search. The system continues to operate flawlessly because all LLM, embedding, vector, and relational databases reside completely on the local host.

### Step 2: Live Evaluator Message Injection
1. Navigate to the **Sync & Simulation** page at `http://localhost:3000/sync`.
2. Scroll to the **Faculty Evaluation Simulator** panel.
3. Enter realistic demo parameters:
   - **Sender Name**: `Prof. Sharma`
   - **Chat / Group Name**: `CS-401 Capstone Review`
   - **Message Content**: `"Team RAGTAG, upload the final presentation slides and test metrics before Thursday 5 PM."`
4. Click **Inject & Extract Action Items**.

### Step 3: Observe Multi-Stage Visual Pipeline
Observe the visual progress stepper confirming each layer of execution:
- **Step 1 (Ground Truth)**: Message stored in SQLite `messages` table with a unique integer ID.
- **Step 2 (AI Extraction)**: Task Extractor detects action item *"Upload final presentation slides and test metrics"*, resolves deadline *"Thursday 5:00 PM"*, and assigns priority *"High"*.
- **Step 3 (Foreign Key Verification)**: Task is inserted with `context_message_id` referencing the exact ID created in Step 1.
- **Step 4 (UI Synchronization)**: Reactive state updates the Dashboard and Calendar instantly.

### Step 4: Verify Context Grounding & Auditability on Dashboard
1. Navigate to the **Dashboard** (`http://localhost:3000`).
2. Locate the newly created task card in the **Pending** column.
3. Observe the **High Priority** red badge and extraction mode badge (`ollama` or `heuristic`).
4. Click **View Context**:
   - A modal appears displaying the exact source message.
   - Verifies the sender (`Prof. Sharma`), channel (`CS-401 Capstone Review`), timestamp, and verbatim message text.
   - Highlights that RAGTAG does not generate hallucinated floating tasks.

### Step 5: Verify Interactive Calendar View
1. Navigate to the **Calendar** page at `http://localhost:3000/calendar`.
2. Toggle between **Month View** and **Week View**.
3. Locate Thursday's date cell: the newly created deadline is plotted on the date grid with a red High-Priority chip.
4. Click on the task chip to open the task detail drawer with full sender attribution.

### Step 6: Test Inference Mode Switching in Settings
1. Navigate to the **Settings** page at `http://localhost:3000/settings`.
2. Change the **User Display Name** to `Prof. Sharma Evaluator` and click **Save Settings**.
3. Toggle the **Inference Mode** switch from *Ollama LLM* to *Offline Heuristics Only*.
4. Inspect the **System Telemetry Cards**:
   - SQLite Path: Displays `backend/msgstore_ragtag.db` with live table counts.
   - Vector Store Path: Displays `backend/chroma_store/` with active embedding dimension (384).
   - Ollama Status: Displays active server state.

### Step 7: Export to Calendar (`.ics`) & Approve Task
1. Return to the **Dashboard**.
2. Click the **Export to Calendar (.ics)** button on the task card.
3. The browser automatically downloads an RFC-5545 `.ics` file containing standardized `SUMMARY`, `DTSTART`, `DTEND`, and `DESCRIPTION` metadata ready for import into Google Calendar, Microsoft Outlook, or Apple Calendar.
4. Click **Approve Task**: the task card moves to the **Approved** column, updating SQLite via `PATCH /api/tasks/<id>`.

---

## 8. Automated Testing & Verification Suite

Team RAGTAG enforces strict software engineering standards with an automated multi-tier test suite:

```
                  ┌────────────────────────────────────────┐
                  │    Tier 4: End-to-End Simulation      │
                  │   (Ingest ➔ Extract ➔ UI/API Flow)    │
                  ├────────────────────────────────────────┤
                  │    Tier 3: API & Contract Tests        │
                  │      (Flask REST Endpoints)            │
                  ├────────────────────────────────────────┤
                  │    Tier 2: Integration Tests           │
                  │    (Task Extractor & Ingestion)        │
                  ├────────────────────────────────────────┤
                  │    Tier 1: Unit & Schema Tests         │
                  │ (SQLite ORM, FKs, Heuristic Rules)     │
                  └────────────────────────────────────────┘
```

### Running All Tests
To run the complete automated test suite across all tiers:
```bash
# Activate your backend virtual environment
cd backend
.\venv\Scripts\activate

# Run tests from the project root using unittest or pytest
cd ..
python -m unittest discover tests
```

### Test Hierarchy Breakdown
- **Tier 1 (`tests/test_unit_schema.py`)**: Tests SQLite relational models (`Contact`, `Message`, `Task`), validates foreign key enforcement (`PRAGMA foreign_keys = ON;`), regex action/decision triggers, and flexible date parser.
- **Tier 2 (`tests/test_integration_extractor.py`)**: Tests rule-based heuristic extraction, Ollama unreachable fallback, task upgrading logic, and WhatsApp chat file ingestion.
- **Tier 3 (`tests/test_api_contracts.py`)**: Verifies Flask REST contract schemas, JSON status codes, error handling (400, 404), and telemetry endpoints.
- **Tier 4 (`tests/test_e2e_simulation.py`)**: Executes complete evaluator simulation workflows (injection, extraction, FK verification, calendar alignment, `.ics` payload, approval) and enforces air-gapped zero-socket leakage guarantees.
- **Tier 5 (`tests/test_adversarial_m1.py`)**: Rigorous adversarial stress testing with corrupted payloads, boundary dates, and high-concurrency requests.

---

## 9. Project Directory Layout

```
MACRO PROJECT 3rd sem Team RAGTAG/
├── backend/
│   ├── backups/                     # Syncthing staging folder (crypt15, keys, txt)
│   ├── chroma_store/                # Local ChromaDB persistent vector database
│   ├── venv/                        # Python virtual environment
│   ├── app.py                       # Flask REST API server (12 endpoints)
│   ├── database.py                  # SQLAlchemy models (Contact, Message, Task)
│   ├── decrypt_pipeline.py          # wadecrypt wrapper for msgstore.db.crypt15
│   ├── ingest.py                    # WhatsApp SQLite & TXT parsing engine
│   ├── msgstore_ragtag.db           # SQLite ground-truth relational database
│   ├── requirements.txt             # Python package dependencies
│   ├── summarizer.py                # Catch-up briefings & timeline summarizer
│   ├── task_extractor.py            # Dual-mode AI task extractor & upgrade engine
│   └── vector_db.py                 # ChromaDB client & ONNX MiniLM vector search
├── frontend/
│   ├── app/
│   │   ├── calendar/page.tsx        # Interactive Month & Week schedule grid
│   │   ├── chat/page.tsx            # Semantic Vector RAG Agent Chat
│   │   ├── settings/page.tsx        # System Settings & Engine Telemetry
│   │   ├── sync/page.tsx            # Wi-Fi Data Ingestion & Faculty Demo Panel
│   │   ├── layout.tsx               # Root Next.js layout & fonts
│   │   └── page.tsx                 # Dashboard redirect & landing page
│   ├── components/
│   │   ├── AppShell.tsx             # Main application layout wrapper
│   │   ├── ChatInterface.tsx        # Vector chat interface & source citations
│   │   ├── ContextModal.tsx         # Source message auditability modal
│   │   ├── DashboardView.tsx        # Kanban task cards & extraction controls
│   │   ├── Sidebar.tsx              # Navigation bar with badges & active routes
│   │   └── TaskCard.tsx             # Interactive task card & .ics export
│   └── package.json                 # Node.js dependencies (Next.js 16, React 19)
├── tests/
│   ├── test_unit_schema.py          # Tier 1: Unit & Schema tests
│   ├── test_integration_extractor.py# Tier 2: Extractor integration tests
│   ├── test_api_contracts.py        # Tier 3: Flask API contract tests
│   ├── test_e2e_simulation.py      # Tier 4: End-to-end faculty simulation tests
│   └── test_adversarial_m1.py       # Tier 5: Adversarial edge cases
├── start.bat                        # One-click Windows startup script
├── SYNC_GUIDE.md                    # Step-by-step Syncthing Phone-to-PC sync guide
└── README.md                        # Project documentation (this file)
```

---

## 10. Security & Air-Gap Guarantees

- **No Remote Telemetry**: Team RAGTAG never initiates outbound HTTP/HTTPS requests to external servers. All operations occur on `127.0.0.1` and `localhost`.
- **Decentralized Cryptography**: Mobile sync operates exclusively over TLS 1.3 peer-to-peer tunnels on your local Wi-Fi subnet.
- **Zero Cloud Storage**: Chat messages, contacts, tasks, and embeddings are stored solely in local SQLite and ChromaDB files on your computer.
- **Deterministic Traceability**: Every extracted task maintains a non-null foreign key reference to the exact message from which it was derived.

---

## 11. Authors & Academic Attribution

Developed for **Macro Project (3rd Semester) — Team RAGTAG**.
- **Focus**: Privacy-Preserving Natural Language Processing & Edge Intelligence for Communication Platforms.
- **License**: MIT License. See LICENSE for details.
