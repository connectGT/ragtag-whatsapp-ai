# Macro Project

This project contains a Next.js frontend and a Python (Flask) backend.

## Prerequisites

- Node.js & npm
- Python 3

## Running the Backend

Open a terminal and navigate to the `backend` folder:

```bash
cd backend
# Activate the virtual environment
# On Windows:
.\venv\Scripts\activate
# On Mac/Linux:
# source venv/bin/activate

# Run the Flask app
python app.py
```
The backend will run on `http://127.0.0.1:5000`.

## Running the Frontend

Open another terminal and navigate to the `frontend` folder:

```bash
cd frontend

# Run the Next.js development server
npm run dev
```
The frontend will run on `http://localhost:3000`.

Open your browser and navigate to `http://localhost:3000` to see the frontend communicating with the backend!
