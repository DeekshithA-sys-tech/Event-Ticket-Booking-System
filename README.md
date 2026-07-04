# Event Ticket Booking System

A production-grade MERN stack event ticket booking platform with reserved seat-map selection, role-based dashboards (Customer / Organizer / Admin), Redis-backed seat locking to prevent double booking, QR/PDF ticket generation, and full deployment configs.

> 🚧 This README is a placeholder scaffolded in Milestone 1. It will be fully expanded in Milestone 19 with architecture diagrams, setup instructions, API docs, and deployment guide.

## Monorepo Layout

```
event-ticket-booking/
├── client/   # React 19 + Vite frontend
└── server/   # Node.js + Express backend
```

## Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS, React Router, Axios, TanStack Query, Redux Toolkit, React Hook Form, Zod, Framer Motion, Recharts
- **Backend:** Node.js, Express.js, MongoDB, Mongoose, Redis, BullMQ
- **Auth:** JWT (access + rotating refresh tokens), role-based authorization
- **Storage:** Cloudinary
- **Docs:** Swagger

## Status

Development is happening incrementally, milestone by milestone. See commit history for progress.
