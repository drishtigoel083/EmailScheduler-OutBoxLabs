# 🚀 Production-Grade Email Job Scheduler & Dashboard

A scalable, reliable, restart-safe distributed email job scheduling service + Next.js dashboard built with **TypeScript**, **Express**, **BullMQ**, **Redis**, **PostgreSQL**, **Elasticsearch**, **Ethereal Email**, and **Tailwind CSS**.

---

## 🌟 Key Features & Ground Rules Compliance

- [x] **Strictly NO Cron**: Powered entirely by BullMQ delayed jobs (`delay` parameter). Zero reliance on `node-cron`, `agenda`, or OS cron jobs.
- [x] **PostgreSQL DB as Source of Truth**: BullMQ job payload contains ONLY `{ emailId: string }`. Recipient data, subject, status, and retry state live in Postgres.
- [x] **Restart-Safe & Boot Reconciliation**: Recovers gracefully from server restarts or Redis flushes. On boot, all `SCHEDULED` emails in Postgres missing from BullMQ are re-enqueued automatically.
- [x] **Atomic Redis Rate Limiting**: Fixed/sliding hourly rate limits per sender using atomic Redis Lua scripts (`INCR` + `EXPIRE`). Jobs exceeding the rate limit are **rescheduled into the next hour window (never dropped or lost)**.
- [x] **Real Slack OAuth Integration**: Connect flow stores access tokens per user and posts real `chat.postMessage` alerts to Slack the exact moment an hourly limit is hit.
- [x] **Ethereal Email Integration**: Real fake-SMTP transport with automatic test account generation and clickable preview URLs logged for verification.
- [x] **Elasticsearch Indexing**: Automatic index creation and document indexing with search over subject, recipient, body, and status (with graceful Postgres fallback).
- [x] **Live BullMQ Queue Dashboard**: Embedded Bull Board UI hosted at `/admin/queues`.
- [x] **Next.js + Tailwind Dashboard**: Scheduled / Sent / Rate Limited tabs, live polling, instant search bar, single & CSV lead batch campaign compose modal.

---

## 🏗️ Technical Architecture & Trade-Offs

### 1. Scheduling Loop (BullMQ + Postgres)
```
           ┌──────────────────────────────────────────────┐
           │ POST /api/emails/schedule                   │
           └──────────────────────┬───────────────────────┘
                                  │
                   ┌──────────────┴──────────────┐
                   │ Write Email Row to Postgres │ (status = 'SCHEDULED')
                   └──────────────┬──────────────┘
                                  │
                   ┌──────────────┴──────────────┐
                   │ Enqueue Delayed Job to      │ payload: { emailId }
                   │ BullMQ Queue                │ delay = max(0, targetTime - now)
                   └──────────────┬──────────────┘
                                  │
                   ┌──────────────┴──────────────┐
                   │ Update bullmqJobId in DB    │
                   └─────────────────────────────┘
```

### 2. Idempotent Worker Processing
When a BullMQ worker picks up a job:
1. Fetches DB row by `emailId`.
2. **Idempotency Check**: If `status === 'SENT'` or `status === 'FAILED'`, skips cleanly.
3. Updates status to `PROCESSING`.
4. **Rate Limit Check**: Atomically increments Redis sender counter. If limit hit, updates status to `RESCHEDULED`, fires Slack alert, and enqueues delayed job for next hour window.
5. **SMTP Delivery**: Sends via Ethereal Email. Updates status to `SENT` with `sentAt = now()`.

### 3. Restart Safety & Boot Reconciliation
* **Trade-Off**: Relying on Redis persistence (AOF) alone leaves a 1-second data loss window during hard crashes (`kill -9`).
* **Our Solution**: On boot, `reconcileJobsOnBoot()` scans PostgreSQL for `SCHEDULED` emails, checks `queue.getJob()`, and re-enqueues missing jobs into BullMQ. If `scheduledAt` passed while the server was down, `delay = 0` fires the job immediately.

---

## 🛠️ Quick Start & Setup

### Prerequisites
- Node.js (v18+)
- Docker & Docker Compose

### 1. Start Infrastructure Services (Redis, Postgres, Elasticsearch)
```bash
docker compose up -d
```

### 2. Backend Setup
```bash
cd backend
npm install
npm run prisma:db:push # Push PostgreSQL schema
npm run dev
```
* Backend API: `http://localhost:4000/api`
* Bull Board Live Dashboard: `http://localhost:4000/admin/queues`

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
* Dashboard URL: `http://localhost:3000`

---

## 🧪 Manual Restart Test Script

To verify that future jobs survive server termination and resume without duplicating:

1. **Schedule a Delayed Job (30 Seconds in Future)**:
   ```powershell
   Invoke-RestMethod -Uri "http://localhost:4000/api/emails/schedule" -Method Post -ContentType "application/json" -Body '{"sender":"alice@company.com","recipient":"bob@lead.com","subject":"Restart Test","body":"Checking restart safety","delayMs":30000}'
   ```

2. **Kill the Backend Server immediately** (`Ctrl + C` or process kill).
3. Observe that the email remains in Postgres with status `SCHEDULED`.
4. **Restart the Backend Server** (`npm run dev`).
5. Observe the boot log:
   `⚠️ [Reconciliation] Email ID ... missing in Redis. Re-enqueueing with delay...`
6. Wait for the remaining seconds: observe worker picks up job, sends email via Ethereal, and marks DB status `SENT` cleanly!
