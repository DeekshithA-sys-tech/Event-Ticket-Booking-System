# 🎟️ EventPulse — Event Ticket Booking Platform (MERN Stack + Hybrid RAG AI)

[![Node.js](https://img.shields.io/badge/Node.js-v20.x-339933?style=flat-square&logo=nodedotjs)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-v4.x-000000?style=flat-square&logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v8.x-47A248?style=flat-square&logo=mongodb)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-v7.x-DC382D?style=flat-square&logo=redis)](https://redis.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-v5.x-E0234E?style=flat-square)](https://docs.bullmq.io/)
[![React](https://img.shields.io/badge/React-v19.x-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v3.x-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Python](https://img.shields.io/badge/Python-v3.13.x-3776AB?style=flat-square&logo=python)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-v0.115.x-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![ChromaDB](https://img.shields.io/badge/ChromaDB-v1.5.x-FF6F00?style=flat-square)](https://www.trychroma.com/)
[![SentenceTransformers](https://img.shields.io/badge/Embeddings-all--MiniLM--L6--v2-orange?style=flat-square)](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

A production-grade, enterprise-ready event ticket booking platform built with the MERN stack (Node.js, Express, MongoDB, React 19) augmented with a dedicated **Python Agentic AI Microservice** (FastAPI + ChromaDB + Hybrid RAG). 

Features real-time visual seat map selection, atomic Redis-backed seat locking to eliminate double bookings, an AI Agent for conversational event discovery and autonomous ticket reservations with two-phase human confirmation, mock payment gateway integration, automated refund lifecycle simulation, in-app notification center, BullMQ background email & PDF pass processing with retry policies, role-based access control (Customer, Organizer, Admin), organizer revenue analytics, polymorphic admin audit logging, distributed rate-limiting, persistent vector embeddings in ChromaDB, and an authoritative 70-question golden evaluation benchmark.

---

## 🌐 Live Demo & Demo Accounts

The full platform is deployed and publicly accessible with end-to-end integration across Vercel, Railway, MongoDB Atlas, and Redis:

- **🌐 Live Web Application**: [https://event-ticket-booking-system-six.vercel.app](https://event-ticket-booking-system-six.vercel.app)
- **⚡ Backend API Gateway**: [https://eventpulse-api-production-aff2cf4b.up.railway.app](https://eventpulse-api-production-aff2cf4b.up.railway.app)
- **🤖 Python AI Microservice**: [https://eventpulse-ai-production-8a4e1166.up.railway.app](https://eventpulse-ai-production-8a4e1166.up.railway.app)
- **📚 Swagger OpenAPI Documentation**: [https://eventpulse-api-production-aff2cf4b.up.railway.app/api-docs](https://eventpulse-api-production-aff2cf4b.up.railway.app/api-docs)

### 🔑 Demo Login Credentials

You can use the one-click **"Demo Credentials Quick Select"** buttons directly on the [Login Page](https://event-ticket-booking-system-six.vercel.app/login) or enter any of the pre-seeded role accounts:

| Role | Email Address | Password | Permissions & Features |
|---|---|---|---|
| 👤 **Customer** | `customer@example.com` | `Password123!` | Interactive seat map booking, AI chat reservations & cancellations, PDF pass & QR code download, order history, event reviews |
| 🎪 **Organizer** | `organizer@example.com` | `Password123!` | Create & publish events, view real-time sales analytics (revenue, occupancy rate, tickets sold volume), manage listings |
| 🛡️ **Administrator** | `admin@example.com` | `Password123!` | Platform-wide management, immutable audit trail inspection, user directory, event status moderation & overrides |

> 💡 **Guest Browsing**: You can explore live catalog events, view seat layouts, and test the **EventPulse AI Assistant** as a guest without signing in. Login is only required to confirm purchases or access protected dashboard tools.

---

## 🏛️ System Architecture

```
                                  ┌────────────────────────────────┐
                                  │   React 19 Single Page App     │
                                  │ (Vite + Tailwind + Redux + RTK)│
                                  │ + Floating AI Assistant Drawer │
                                  └───────────────┬────────────────┘
                                                  │ HTTP / REST (JWT Bearer)
                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    Express API Gateway (Port 5000)                              │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐ │
│ │ Security & CSP       │ │  HPP / MongoSanitize │ │ Distributed Limiter  │ │  API Versioning  │ │
│ └──────────┬───────────┘ └──────────┬───────────┘ └──────────┬───────────┘ └────────┬─────────┘ │
└────────────┼────────────────────────┼────────────────────────┼──────────────────────┼───────────┘
             │                        │                        │                      │
             ▼                        ▼                        ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 Domain Controller & Business Layer                              │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐ │
│ │ Auth & Email Verify  │ │ Event & Seat Layout  │ │ Booking & Lock Logic │ │ Payment & Refund │ │
│ └──────────┬───────────┘ └──────────┬───────────┘ └──────────┬───────────┘ └────────┬─────────┘ │
│ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────┐ │
│ │ Notification Service │ │ Organizer Analytics  │ │ Admin Audit Engine   │ │ Review Engine    │ │
│ └──────────┬───────────┘ └──────────┬───────────┘ └──────────┬───────────┘ └────────┬─────────┘ │
└────────────┼────────────────────────┼────────────────────────┼──────────────────────┼───────────┘
             │                        │                        │                      ▲
             │                        │                        │                      │ HTTP / REST
             ▼                        ▼                        ▼                      │ Tool Calls
┌────────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐ ┌────────┴──────────┐
│  MongoDB Atlas         │ │ Redis Cache & Locks  │ │ BullMQ Worker        │ │ Python AI Service  │
│  Users, Events, Seats, │ │ Atomic Seat Locks    │ │ Async Notification & │ │ (FastAPI - 8000)   │
│  Bookings, Payments,   │ │ (10-min TTL), Rate   │ │ Background PDF Pass  │ │ Hybrid RAG Engine  │
│  Notifications, Audits │ │ Limit Memory Engine  │ │ Generation (PDFKit)  │ │ Two-Phase Confirm  │
└────────────────────────┘ └──────────────────────┘ └──────────────────────┘ └────────┬───────────┘
                                                                                      │
                                                                   ┌──────────────────┴──────────┐
                                                                   │  ChromaDB Persistent Store  │
                                                                   │  Collection: eventpulse_vec │
                                                                   │  HNSW Cosine + all-MiniLM   │
                                                                   └─────────────────────────────┘
```

---

## ✨ Key Engineering Highlights

### 🤖 Hybrid RAG & Agentic AI Architecture
- **Persistent ChromaDB Vector Store**: Vector database powered by ChromaDB (`ai-service/data/chroma_db/`) utilizing HNSW cosine distance indexing over the `eventpulse_vectors` collection.
- **Local Dense Embeddings (`all-MiniLM-L6-v2`)**: Generates 384-dimensional dense semantic vectors using HuggingFace's `SentenceTransformer` with zero external API dependencies or inference costs.
- **Pure-Python BM25 Lexical Engine**: Tokenizes and ranks documentation using Okapi BM25 with inverse document frequency (IDF) weighting for exact keyword matches (e.g., policy percentages, ticket IDs, fee rules).
- **Reciprocal Rank Fusion (RRF)**: Combines dense ChromaDB semantic search with sparse BM25 scores with equal weighting (`VECTOR_WEIGHT = 0.5`, `BM25_WEIGHT = 0.5`) to eliminate retrieval blind spots.
- **Strict Anti-Hallucination Extractive Grounding**: Synthesizes verified answers with explicit markdown citations (`[1]`, `[2]`), document excerpts, and source attribution.
- **Out-of-Scope & Adversarial Guardrails**:
  - **Weather Notice (`GQ-061`)**: Transparently clarifies that weather forecasts are not tracked by EventPulse and suggests external forecast tools without hallucinating conditions or dumping venue policies.
  - **Sports Prediction Refusal (`GQ-062`)**: Politely redirects inquiries about IPL / tournament winners back to EventPulse scope.
  - **Student Discounts (`GQ-063`)**: Notes ID requirements while clarifying event-specific terms.
  - **Payment Methods (`GQ-064`)**: Explains checkout options (UPI, Cards, Net Banking) without confirming unstated payment methods.
  - **Prompt Injection Defense (`GQ-065`)**: Rejects adversarial prompt overrides attempting to bypass cancellation confirmation or force automatic refunds.
  - **Privacy Protection (`GQ-067`)**: Strictly restricts users from viewing other customers' booking records.
- **Two-Phase Human Confirmation Protocol**: Sensitive, state-changing actions (`create_booking`, `cancel_booking`, `create_event`) cannot execute silently. The agent prepares an action summary, total price, and seat list, halting execution until the user explicitly confirms via interactive UI chips.
- **Pluggable LLM Providers**: Operates offline with deterministic extractive grounding (zero API keys), while supporting Google Gemini (`gemini-2.5-flash`) and Groq (`llama-3.3-70b-versatile`) when API keys are configured in `.env`.

### 🎟️ Core Ticketing & Platform Engine
- **Atomic Redis Seat Locking (`SET NX EX`)**: When a customer selects seats, locks are acquired atomically in Redis for 10 minutes. If another customer attempts to lock the same seat simultaneously, the operation fails instantly without race conditions.
- **Database Transactions (`withTransaction`)**: Booking confirmation executes inside an atomic Mongoose session transaction, guaranteeing synchronized updates across booking creation, seat status mutation, and event inventory count.
- **Mock Payment Gateway & Transaction Ledger**: Native `/api/v1/payments` integration simulating card, UPI, netbanking, and wallet workflows with transaction tracking and decline simulation.
- **Automated Refund Lifecycle Simulation**: Booking cancellations automatically calculate refund amounts based on cancellation timelines (>7 days: 100%, 48h–7d: 80%, 24h–48h: 50%, <24h: non-refundable), generate immutable `REF-*` reference IDs, transition `paymentStatus` to `refunded`, and notify the user.
- **In-App Notification Center**: Live notification tray with unread badge indicators, mark-as-read controls, and automatic alerts for bookings, cancellations, and event updates.
- **Background PDF Pass Generation & Asynchronous Job Queue**: Offloads ticket generation to PDFKit and dispatches official PDF passes with embedded verification QR codes directly as attachments via BullMQ with exponential backoff retries.
- **Polymorphic Admin Audit Logging**: All administrative overrides (event status moderation, organizer verifications, force cancellations, user suspensions) are captured in an immutable `AuditLog` collection.
- **Distributed Rate Limiting with Fallback**: Custom `express-rate-limit` Redis Store with seamless in-memory fallback ensures multi-instance rate coordination while remaining fault-tolerant if Redis drops offline.
- **Dual JWT Authentication & Email Verification**: Short-lived access tokens (15 mins) combined with HTTP-Only refresh cookies stored as SHA-256 hashes in MongoDB, paired with crypto token email verification.

---

## 📁 Repository Structure

```
event-ticket-booking/
├── docker-compose.yml          # Multi-container orchestration (Server, Client, Mongo, Redis)
├── README.md                   # System documentation & architectural reference
├── knowledge/                  # Official platform policy markdown documents
│   ├── refund_and_cancellation.md # Refund percentages, timelines, transfer rules
│   ├── ticket_and_booking_faq.md  # 10-min seat hold, QR pass delivery, group bookings
│   └── venue_and_entry_rules.md   # Photo ID rules, ADA accessibility, bag policy
│
├── ai-service/                 # Python FastAPI Agentic AI Microservice (Port 8000)
│   ├── Dockerfile              # Python 3.13 production container
│   ├── requirements.txt        # FastAPI, ChromaDB, SentenceTransformers, HTTPX, Pytest
│   ├── .env.example            # Environment variables template
│   ├── data/
│   │   └── chroma_db/          # Persistent ChromaDB vector database files
│   ├── app/
│   │   ├── main.py             # FastAPI entrypoint, lifespan loader & index initializer
│   │   ├── agent/
│   │   │   ├── orchestrator.py # Conversation agent, intent router, RBAC, two-phase confirmation
│   │   │   └── tools.py        # Tool registry (search_events, check_availability, list_users, etc.)
│   │   ├── core/
│   │   │   ├── config.py       # Pydantic BaseSettings & ChromaDB configuration
│   │   │   └── logging.py      # Standardized logging setup
│   │   ├── eval/
│   │   │   ├── golden_dataset.py # 70 authoritative benchmark test cases (GQ-001 - GQ-070)
│   │   │   └── metrics.py      # Recall@k metric evaluator
│   │   ├── generation/
│   │   │   ├── grounder.py     # Deterministic extractive grounding with citations [1], [2]
│   │   │   └── llm_client.py   # Optional Google Gemini / Groq API client
│   │   ├── ingestion/
│   │   │   ├── chunker.py      # Markdown heading-aware & event document chunker
│   │   │   └── loader.py       # Knowledge markdown loader & seed events fallback
│   │   ├── models/
│   │   │   └── schemas.py      # Pydantic models (ChatRequest, ChatResponse, Citation, etc.)
│   │   └── retrieval/
│   │       ├── bm25.py         # Pure-Python BM25 sparse keyword ranker
│   │       ├── hybrid.py       # Hybrid retrieval engine with Reciprocal Rank Fusion (RRF)
│   │       └── vector_store.py # Persistent ChromaDB vector store client (HNSW Cosine)
│   └── tests/                  # 32 automated Pytest tests
│       ├── test_agent.py       # Agent conversation, intents, RBAC, weather & out-of-scope tests
│       ├── test_eval.py        # Recall@3 verification on 70 golden questions (>= 85%)
│       ├── test_rag.py         # Ingestion, chunking, BM25 & vector search tests
│       └── test_tools.py       # REST tool registry execution tests
│
├── client/                     # React 19 Frontend SPA (Vite + Tailwind)
│   ├── Dockerfile              # Multi-stage production container with Nginx
│   ├── nginx.conf              # Production Nginx reverse proxy & SPA router
│   ├── src/
│   │   ├── components/         # Navbar, Footer, SeatMap, TicketCard, AIChatWidget, ThemeToggle
│   │   ├── layouts/            # MainLayout (Toaster, Navbar, Outlet, AIChatWidget, Footer)
│   │   ├── pages/              # 12+ Pages (Home, Events, SeatSelection, Checkout, Dashboards, 404)
│   │   ├── routes/             # AppRoutes with role-based ProtectedRoute guards
│   │   ├── store/              # Redux Toolkit state slices (authSlice, bookingSlice)
│   │   └── services/           # Axios API services with silent 401 refresh interceptors
│   └── package.json
│
└── server/                     # Node.js Express REST API Monolith
    ├── Dockerfile              # Production Alpine container
    ├── jest.config.js          # ES Modules test configuration
    ├── tests/                  # Jest & Supertest automated test suite
    ├── src/
    │   ├── config/             # DB, Redis, Cloudinary, Env, Swagger specs
    │   ├── constants/          # Status enums, HTTP codes, system messages
    │   ├── controllers/        # Request handlers & domain business logic
    │   ├── emails/             # HTML email templates (confirmation, cancellation, welcome)
    │   ├── jobs/               # BullMQ queues & worker processes
    │   ├── middlewares/        # Auth, RBAC, Rate-limiters, HPP, Security, Versioning
    │   ├── models/             # Mongoose schemas (User, Event, Booking, Payment, Notification, Audit)
    │   ├── repositories/       # Data Access Layer (DB query abstraction)
    │   ├── routes/             # Express API routes
    │   ├── utils/              # PDF generator, QR generator, SeatLock, AsyncHandler, Logger
    │   ├── app.js              # Express app factory & middleware pipeline
    │   └── server.js           # Server bootstrapper & graceful shutdown handler
    └── package.json
```

---

## 🧪 Golden Evaluation Benchmark & Verification

EventPulse includes an authoritative **70-question golden evaluation dataset** (`GQ-001` through `GQ-070`) designed to rigorously evaluate retrieval precision, extractive grounding, role-based security, and out-of-scope handling:

| Category | Questions | Expected Behavior | Example Inquiries |
|---|---|---|---|
| **Booking & Seats** | 7 cases (`GQ-001`–`GQ-007`) | `answer_from_kb` | 10-min seat holds, max tickets (6), timer expiration |
| **Digital Passes & Entry** | 5 cases (`GQ-008`–`GQ-012`) | `answer_from_kb` | QR pass delivery, email issues, screenshot validity |
| **Cancellation & Refunds** | 10 cases (`GQ-013`–`GQ-022`) | `answer_from_kb` | 10 days before (100%), 36h before (50%), double charges |
| **Postponement & Rescheduling** | 3 cases (`GQ-023`–`GQ-025`) | `answer_from_kb` | Organizer cancellations (100%), 14-day reschedule window |
| **Refund Processing** | 2 cases (`GQ-026`–`GQ-027`) | `answer_from_kb` | 5–7 business days, no cash refunds |
| **Transfers & Resale** | 3 cases (`GQ-028`–`GQ-030`) | `answer_from_kb` | Transfer cutoff (12h), scalping prohibition, ID checks |
| **Entry Rules & Age** | 5 cases (`GQ-031`–`GQ-035`) | `answer_from_kb` | Photo ID proof, minor entry restrictions, 18+ refusal |
| **Bags & Security** | 4 cases (`GQ-036`–`GQ-039`) | `answer_from_kb` | Bag dimensions (12x12x6"), prohibited cameras/water |
| **Parking & Transit** | 4 cases (`GQ-040`–`GQ-043`) | `answer_from_kb` | Dedicated parking, Uber/Ola pickup at Gate 2 |
| **Accessibility (ADA)** | 2 cases (`GQ-044`–`GQ-045`) | `answer_from_kb` | Listening devices, service dogs permitted |
| **Groups & Corporate** | 2 cases (`GQ-046`–`GQ-047`) | `answer_from_kb` | Bulk bookings (>20), enterprise support |
| **Event Discovery & Filters** | 6 cases (`GQ-048`–`GQ-053`) | `call_tool` | City, category, price filtering, trending events |
| **Live Actions & State** | 4 cases (`GQ-054`–`GQ-057`) | `call_tool` / `answer_and_tool` | Seat checks, view bookings, two-phase cancellation |
| **Role-Based Access (RBAC)**| 3 cases (`GQ-058`–`GQ-060`) | `refuse` / `call_tool` | Customer blocked from analytics & audit logs |
| **Out-of-Scope Detection** | 4 cases (`GQ-061`–`GQ-064`) | `not_found_or_partial` / `refuse` | Weather forecast (`GQ-061`), IPL sports predictions (`GQ-062`), PayPal/Crypto (`GQ-064`) |
| **Adversarial & Safety** | 3 cases (`GQ-065`–`GQ-067`) | `refuse_injection` / `refuse` | Prompt injection refund bypass, user privacy violation |
| **Ambiguous & Multi-Turn** | 3 cases (`GQ-068`–`GQ-070`) | `clarify` / `answer_and_tool` | "Can I cancel?", multi-turn event + parking inquiry |

### Benchmark Evaluation Metrics
- **Retrieval Recall@3**: **91.2%** (Exceeds target of $\ge 85.0\%$)
- **Benchmark Evaluation Pass Rate**: **100% (70 / 70 passed)**
- **Automated Test Suite**: **32 / 32 Pytest tests passing**

To run the golden evaluation suite:
```bash
# Verify Recall@3 retrieval metric (>= 85%)
python -m pytest ai-service/tests/test_eval.py

# Run all 32 unit and integration tests
python -m pytest ai-service/tests
```

---

## 🚀 Quickstart & Setup

### Option 1: Docker Compose (Recommended)

Run the entire platform (Express API, React Frontend, MongoDB, Redis) with a single command:

```bash
# Clone the repository
git clone https://github.com/DeekshithA-sys-tech/Event-Ticket-Booking-System.git
cd Event-Ticket-Booking-System

# Build and start all services
docker compose up --build -d

# Check running services
docker compose ps
```

- **Frontend Application**: [http://localhost:5173](http://localhost:5173)
- **Backend REST API**: [http://localhost:5000](http://localhost:5000)
- **AI Microservice**: [http://localhost:8000](http://localhost:8000)
- **Swagger OpenAPI Docs**: [http://localhost:5000/api-docs](http://localhost:5000/api-docs)
- **Health Endpoint**: [http://localhost:5000/api/v1/health](http://localhost:5000/api/v1/health)

To stop services:
```bash
docker compose down
```

---

### Option 2: Local Development Setup

#### Prerequisites
- **Node.js** v20.x or higher
- **npm** v10.x or higher
- **Python** v3.11+ (Python 3.13 supported)
- **MongoDB** running locally (`mongodb://localhost:27017`) or MongoDB Atlas URI
- **Redis** running locally (`redis://localhost:6379`) or Redis Cloud URI

#### 1. Install Dependencies
```bash
# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install

# Install AI service dependencies
cd ../ai-service
pip install -r requirements.txt
```

#### 2. Environment Configuration
Create `server/.env` based on `server/.env.example`:

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173

# Database & Cache
MONGODB_URI=mongodb://localhost:27017/event_ticket_booking
REDIS_URL=redis://localhost:6379
BULLMQ_REDIS_URL=redis://localhost:6379

# JWT Authentication
JWT_ACCESS_SECRET=your_super_secret_access_key_32chars_min
JWT_REFRESH_SECRET=your_super_secret_refresh_key_32chars_min
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Cloudinary Storage
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# SMTP Email Configuration
SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
EMAIL_FROM="EventPulse Tickets <no-reply@eventpulse.com>"
```

Create `ai-service/.env` based on `ai-service/.env.example`:
```env
PORT=8000
HOST=0.0.0.0
EXPRESS_BASE_URL=http://localhost:5000/api/v1
EMBEDDING_MODEL=all-MiniLM-L6-v2
CHROMA_PERSIST_DIR=data/chroma_db
CHROMA_COLLECTION_NAME=eventpulse_vectors

# Optional free LLM API keys (Google Gemini / Groq)
# Leave blank to use zero-cost local deterministic extractive grounding
GEMINI_API_KEY=
GROQ_API_KEY=
LLM_PROVIDER=auto
```

#### 3. Start Development Servers
```bash
# Terminal 1: Backend Server (Express + MongoDB + Redis)
cd server
npm run dev

# Terminal 2: Python AI Microservice (FastAPI + ChromaDB + Hybrid RAG)
cd ai-service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 3: Frontend Client (Vite Dev Server)
cd client
npm run dev
```

---

## 📋 API Route Reference

| Method | Endpoint | Description | Access |
|---|---|---|---|
| **POST** | `/api/v1/ai/chat` | AI Agent chat gateway (RAG discovery, seat checks, bookings, analytics) | Public / User |
| **POST** | `/api/v1/auth/register` | Register new account (organizers require admin approval) | Public |
| **POST** | `/api/v1/auth/login` | Authenticate user & receive access token + refresh cookie | Public |
| **GET** | `/api/v1/auth/verify-email` | Verify email address using token | Public |
| **POST** | `/api/v1/auth/resend-verification` | Resend verification email | Public |
| **POST** | `/api/v1/auth/refresh-token` | Issue new access token via HTTP-only refresh cookie | Public |
| **GET** | `/api/v1/events` | List published events with text search, date, city & price filters | Public |
| **GET** | `/api/v1/events/:id` | Get event details & interactive seat map layout | Public |
| **POST** | `/api/v1/events` | Create new event (status: draft, requires admin moderation) | Organizer / Admin |
| **POST** | `/api/v1/bookings/lock` | Lock seats for 10 minutes in Redis | Customer |
| **POST** | `/api/v1/bookings` | Confirm booking atomically in Mongoose transaction | Customer |
| **GET** | `/api/v1/bookings/my-bookings` | Retrieve authenticated user's booking history | Customer |
| **POST** | `/api/v1/bookings/:id/cancel` | Cancel booking, release seats, and trigger refund | Owner / Admin |
| **GET** | `/api/v1/bookings/:id/ticket` | Download official PDF pass with QR code | Owner / Admin |
| **POST** | `/api/v1/payments/process` | Process mock payment transaction (card/UPI/mock) | Customer |
| **GET** | `/api/v1/payments/booking/:id` | View payment history and refund status for booking | Owner / Admin |
| **GET** | `/api/v1/notifications` | Retrieve in-app notifications & unread count | Private |
| **PATCH**| `/api/v1/notifications/:id/read` | Mark individual notification as read | Private |
| **PATCH**| `/api/v1/notifications/read-all` | Mark all notifications as read | Private |
| **GET** | `/api/v1/analytics/overview` | Organizer revenue, sales, and occupancy analytics | Organizer / Admin |
| **GET** | `/api/v1/admin/dashboard` | Platform metrics & moderation queue | Admin |
| **PATCH**| `/api/v1/admin/events/:id/status`| Moderate and publish draft events + write audit log | Admin |
| **GET** | `/api/v1/admin/audit-logs` | View immutable administrative audit trail | Admin |

---

## 💳 Mock Payment & Refund Simulation Guide

### Test Payment Execution
When confirming a booking or testing `/api/v1/payments/process`:
- **Default Mock Payment**: Set `paymentMethod: "mock"` → Instantly records `status: "successful"` with a unique `TXN-*` ledger ID.
- **Simulate Card Decline**: Pass `simulateFailure: true` → Returns HTTP 400 with `status: "failed"` and reason `"Transaction declined by issuer"`.

### Refund Verification Flow
1. User clicks **Cancel Booking** on `MyBookingsPage` or calls `POST /api/v1/bookings/:id/cancel`.
2. Backend initiates a transaction:
   - Sets `booking.status = "cancelled"` and `booking.paymentStatus = "refunded"`.
   - Generates unique refund reference: `refundId = "REF-..."`.
   - Records refund metadata (`refundAmount`, `refundStatus: "completed"`, `refundedAt`).
   - Updates `Payment` record with refund ledger details.
   - Restores seat statuses back to `available` and increments event inventory.
3. User receives:
   - Cancellation email with the refund amount and refund reference ID.
   - In-app notification alert confirming the cancellation and refund initiation.

---

## 🧪 Automated Testing Suite

The project includes automated test coverage across both backend and AI services:

```bash
# 1. Run Node.js backend test suite (Jest + Supertest)
cd server
npm test

# 2. Run Python AI Microservice tests (Pytest)
cd ../ai-service
python -m pytest tests/

# 3. Test production client build
cd ../client
npm run build
```

---

## 🚢 Production Deployment Guide

### Deployment Options
1. **Containerized (Docker / AWS ECS / DigitalOcean Droplets)**:
   - Use the provided `docker-compose.yml` or build `server/Dockerfile`, `client/Dockerfile`, and `ai-service/Dockerfile`.
   - Set environment variables via `.env` or container runtime config.
   - Nginx inside the client container handles SPA fallback and reverse proxies `/api` requests directly to `http://server:5000`.
2. **PaaS (Render / Railway / Fly.io)**:
   - Deploy `server/` as a Web Service (Node.js runtime, build: `npm ci`, start: `node src/server.js`).
   - Deploy `ai-service/` as a Web Service (Python runtime, start: `uvicorn app.main:app --host 0.0.0.0 --port 8000`).
   - Deploy `client/` as a Static Site (build: `npm run build`, publish directory: `dist`).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
