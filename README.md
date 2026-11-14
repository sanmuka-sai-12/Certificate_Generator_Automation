# Smart Certificate Generator & Bulk Email Automation

A scalable, full-stack web application designed for colleges and event organizers to design certificates, import participants from Excel/CSV, generate personalized PDFs, and email them through authorized Gmail accounts in controlled batches with real-time tracking, failure retry, and public QR-code verification.

---

## 🛠️ Tech Stack Architecture

- **Frontend**: React 18 + Vite + Fabric.js (drag-and-drop designer) + Lucide Icons
- **Backend API**: Python 3.11 + FastAPI (RESTful API, Pydantic validation)
- **Database**: PostgreSQL 16 + SQLAlchemy ORM
- **Background Jobs & Queue**: Celery + Redis
- **Storage & Delivery**: Google Drive API (PDF storage) & Gmail API (OAuth 2.0 dispatch)
- **PDF Engine**: PyMuPDF + Pillow + qrcode (A4 300 DPI high-fidelity rendering)
- **Containerization**: Docker & Docker Compose

---

## 🚀 Getting Started

### Option 1: Run with Docker Compose (Recommended)

1. **Clone and configure environment**:
   ```bash
   cp .env.example .env
   # Add your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
   ```

2. **Start all services**:
   ```bash
   docker-compose up --build
   ```

3. **Access the application**:
   - Frontend UI: [http://localhost:5173](http://localhost:5173)
   - FastAPI Interactive Docs: [http://localhost:8000/api/v1/docs](http://localhost:8000/api/v1/docs)

---

### Option 2: Run Locally for Development

#### 1. Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### 2. Celery Worker (requires Redis running on port 6379)
```bash
cd backend
celery -A app.worker.celery_app.celery_app worker --loglevel=info
```

#### 3. Frontend (React + Vite)
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:5173](http://localhost:5173).

---

## 📂 Project Structure

```
├── backend/
│   ├── app/
│   │   ├── api/v1/          # FastAPI routers (auth, projects, participants, emails, verify)
│   │   ├── core/            # Config, database engine, token encryption
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic request & response schemas
│   │   ├── services/        # Gmail, Drive, PyMuPDF, and QR services
│   │   └── worker/          # Celery worker & background job tasks
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/      # Sidebar, TopBar, modals, notifications
│   │   ├── pages/           # Dashboard, Projects, Designer, Workspace, Settings
│   │   └── services/        # FastAPI client bridge
│   ├── package.json
│   └── vite.config.js
├── docker-compose.yml       # Orchestrates FastAPI, Postgres, Redis, Celery, and React
└── .env.example             # Configuration variables
```

---

## 🔒 Security & Idempotency Rules

1. **Zero Password Storage**: Senders authorize via Google OAuth 2.0; refresh tokens are stored encrypted using Fernet symmetric encryption.
2. **Crash-Safe Batch Processing**: Participant status is recorded as `Processing` before dispatch and `Sent` immediately after confirmation, eliminating duplicate emails.
3. **Privacy-Preserving Public Verification**: Verification QR codes reveal only authenticity status, recipient name, event, and issuer—never private contact details.
