# 🎟️ EventPulse — Event Ticket Booking Platform (MERN Stack)

[![Node.js](https://img.shields.io/badge/Node.js-v20.x-339933?style=flat-square&logo=nodedotjs)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-v4.x-000000?style=flat-square&logo=express)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-v8.x-47A248?style=flat-square&logo=mongodb)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-v7.x-DC382D?style=flat-square&logo=redis)](https://redis.io/)
[![BullMQ](https://img.shields.io/badge/BullMQ-v5.x-E0234E?style=flat-square)](https://docs.bullmq.io/)
[![React](https://img.shields.io/badge/React-v19.x-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-v3.x-06B6D4?style=flat-square&logo=tailwindcss)](https://tailwindcss.com/)
[![Python](https://img.shields.io/badge/Python-v3.13.x-3776AB?style=flat-square&logo=python)](https://python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-v0.115.x-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

A production-grade, enterprise-ready event ticket booking platform built with the MERN stack (Node.js, Express, MongoDB, React 19) augmented with a dedicated **Python Agentic AI Microservice** (FastAPI + Pydantic). Features real-time visual seat map selection, atomic Redis-backed seat locking to eliminate double bookings, an AI Agent for conversational event discovery and autonomous ticket reservations with two-phase human confirmation, mock payment gateway integration, automated refund lifecycle simulation, in-app notification center, BullMQ background email & PDF pass processing with retry policies, role-based access control (Customer, Organizer, Admin), organizer revenue analytics, polymorphic admin audit logging, distributed rate-limiting, and complete containerization via Docker Compose.

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
│  Bookings, Payments,   │ │ (10-min TTL), Rate   │ │ Background PDF Pass  │ │ Agent Orchestrator │
│  Notifications, Audits │ │ Limit Memory Engine  │ │ Generation (PDFKit)  │ │ Two-Phase Confirm  │
└────────────────────────┘ └──────────────────────┘ └──────────────────────┘ └────────────────────┘
```

---

## ✨ Key Engineering Highlights

- 🤖 **Python Agentic AI Microservice (FastAPI + Pydantic)**: Dedicated Python AI agent service (`ai-service/`) operating with **zero direct DB/Redis access**. Interacts strictly through authenticated HTTP REST tool calling against the Express monolith, enforcing existing business rules, RBAC, and transaction boundaries.
- 🤝 **Two-Phase Human Confirmation Protocol**: Sensitive, state-changing actions (`create_booking`, `cancel_booking`) cannot execute silently. The agent prepares an action summary, total price, and seat list, halting execution until the user explicitly confirms via interactive UI chips.
- 🔌 **Pluggable AI Providers (Offline Mock + LLM)**: Comes with an out-of-the-box offline deterministic regex & intent parser provider requiring **0 API keys** and zero external network calls, with automatic fallback support for OpenAI (`gpt-4o-mini`) and Google Gemini (`gemini-2.0-flash`).
- 🔒 **Atomic Redis Seat Locking (`SET NX EX`)**: When a customer selects seats, locks are acquired atomically in Redis for 10 minutes. If another customer attempts to lock the same seat simultaneously, the operation fails instantly without race conditions.
- ⚡ **Database Transactions (`withTransaction`)**: Booking confirmation executes inside an atomic Mongoose session transaction, guaranteeing synchronized updates across booking creation, seat status mutation, and event inventory count.
- 💳 **Mock Payment Gateway & Transaction Ledger**: Native `/api/v1/payments` integration simulating card, UPI, netbanking, and wallet workflows with transaction tracking and decline simulation.
- 💸 **Automated Refund Lifecycle Simulation**: Booking cancellations automatically calculate refund amounts, generate immutable `REF-*` reference IDs, transition `paymentStatus` to `refunded`, and notify the user via email and in-app alerts.
- 🔔 **In-App Notification Center**: Live notification tray with unread badge indicators, mark-as-read controls, and automatic alerts for bookings, cancellations, and event updates.
- 📨 **Background PDF Pass Generation & Asynchronous Job Queue**: Offloads ticket generation to PDFKit and dispatches official PDF passes with embedded verification QR codes directly as attachments via BullMQ with exponential backoff retries.
- 🛡️ **Polymorphic Admin Audit Logging**: All administrative overrides (event status moderation, organizer verifications, force cancellations, user suspensions) are captured in an immutable `AuditLog` collection.
- 🌐 **Distributed Rate Limiting with Fallback**: Custom `express-rate-limit` Redis Store with seamless in-memory fallback ensures multi-instance rate coordination while remaining fault-tolerant if Redis drops offline.
- 🔐 **Dual JWT Authentication & Email Verification**: Short-lived access tokens (15 mins) combined with HTTP-Only refresh cookies stored as SHA-256 hashes in MongoDB, paired with crypto token email verification.

---

## 📁 Repository Structure

```
event-ticket-booking/
├── docker-compose.yml          # Multi-container orchestration (Server, Client, Mongo, Redis)
├── README.md                   # System documentation & architectural reference
├── ai-service/                 # Python FastAPI Agentic AI Microservice (Port 8000)
│   ├── Dockerfile              # Python 3.13 production container
│   ├── requirements.txt        # FastAPI, Pydantic, HTTPX, Pytest
│   ├── app/
│   │   ├── main.py             # FastAPI entrypoint (/health, /api/chat)
│   │   ├── config.py           # Pydantic BaseSettings
│   │   ├── models/schemas.py   # Chat, ToolCall, and Confirmation Pydantic schemas
│   │   ├── prompts/            # RBAC and anti-hallucination system prompts
│   │   ├── providers/          # Pluggable Base, MockProvider, LLMProvider
│   │   ├── tools/              # Search, Seat, Booking, Analytics REST tools
│   │   ├── agents/event_agent.py # Agent orchestrator loop (max 5 turns)
│   │   └── utils/http_client.py # Async HTTP client forwarding JWT
│   └── tests/                  # Pytest test suite (13 automated tests)
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

## 🚀 Quickstart & Setup

### Option 1: Docker Compose (Recommended)

Run the entire platform (Express API, React Frontend, MongoDB, Redis) with a single command:

```bash
# Clone the repository
git clone https://github.com/your-username/event-ticket-booking.git
cd event-ticket-booking

# Build and start all 4 services
docker compose up --build -d

# Check running services
docker compose ps
```

- **Frontend Application**: [http://localhost:5173](http://localhost:5173)
- **Backend REST API**: [http://localhost:5000](http://localhost:5000)
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

#### 3. Start Development Servers
```bash
# Terminal 1: Backend Server (Nodemailer + BullMQ + Express)
cd server
npm run dev

# Terminal 2: Python AI Microservice (FastAPI + Pydantic)
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
| **POST** | `/api/v1/ai/chat` | AI Agent chat gateway (discovery, seat check, bookings, analytics) | Public / User |
| **POST** | `/api/v1/auth/register` | Register new account (organizers require admin approval) | Public |
| **POST** | `/api/v1/auth/login` | Authenticate user & receive access token + refresh cookie | Public |
| **GET** | `/api/v1/auth/verify-email` | Verify email address using token | Public |
| **POST** | `/api/v1/auth/resend-verification` | Resend verification email | Public |
| **POST** | `/api/v1/auth/refresh-token` | Issue new access token via HTTP-only refresh cookie | Public |
| **GET** | `/api/v1/events` | List published events with text search, date, city & price filters | Public |
| **GET** | `/api/v1/events/:id` | Get event details & interactive seat map layout | Public |
| **POST** | `/api/v1/events` | Create new event (status: draft) | Organizer / Admin |
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

The backend includes a comprehensive Jest and Supertest suite:

```bash
# Run backend test suite
cd server
npm test

# Run code style & lint checks
npm run lint

# Test production client build
cd ../client
npm run build
```

---

## 🚢 Production Deployment Guide

### Deployment Options
1. **Containerized (Docker / AWS ECS / DigitalOcean Droplets)**:
   - Use the provided `docker-compose.yml` or build `server/Dockerfile` and `client/Dockerfile`.
   - Set environment variables via `.env` or container runtime config.
   - Nginx inside the client container handles SPA fallback and proxies `/api` requests directly to `http://server:5000`.
2. **PaaS (Render / Railway / Fly.io)**:
   - Deploy `server/` as a Web Service (Node.js runtime, build: `npm ci`, start: `node src/server.js`).
   - Deploy `client/` as a Static Site (build: `npm run build`, publish directory: `dist`).
   - Set `CLIENT_URL` on the server and `VITE_API_URL` on the client.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
