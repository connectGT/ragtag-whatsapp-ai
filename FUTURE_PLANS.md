# Future Plans

## Phase 2: Desktop Application Conversion (Option 2)
Currently, the project runs as a local web application accessed via `localhost:3000`. 
Before final submission or deployment, we plan to convert this into a standalone Desktop Application (`.exe`).

### Strategy
- Use **Electron** (or **Tauri**) to wrap the Next.js frontend into a native desktop window.
- Bundle the Python Flask backend to run silently as a background process when the desktop app launches.
- This will provide a true "software" feel, ensuring 100% offline usage without requiring the user to open a web browser or see a terminal window.
