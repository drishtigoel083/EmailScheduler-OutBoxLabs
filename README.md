# 📧 Email Job Scheduler — ReachInbox Assignment

A production-style email scheduling service: schedule emails via API or dashboard, backed by
BullMQ + Redis (no cron), with Postgres persistence, Elasticsearch search, Slack alerts, and
real Google OAuth login.

---

## 🧱 Tech Stack

| Layer | Tech |
|---|---|
| Backend | TypeScript, Express.js, BullMQ, Redis, Prisma ORM |
| Database | PostgreSQL |
| Search | Elasticsearch |
| Email | Ethereal (fake SMTP for testing) |
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS |
| Auth | NextAuth.js (Google OAuth) |
| Notifications | Slack OAuth 2.0 + `chat.postMessage` |
| Infra | Docker Compose (Redis, Postgres, Elasticsearch) |

---

## 🚀 Quick Start

### 1. Start infrastructure

```bash
docker compose up -d
```
Starts Redis, Postgres, and Elasticsearch. Confirm all three are healthy:
```bash
docker compose ps
```

### 2. Backend setup

```bash
cd backend
npm install
cp .env.example .env   # fill in real values — see table below
npx prisma migrate dev
npm run dev
```
Runs on `http://localhost:4000`. Bull Board (live queue dashboard): `http://localhost:4000/admin/queues`

### 3. Frontend setup

```bash
cd frontend
npm install
cp .env.example .env.local   # fill in real values — see table below
npm run dev
```
Runs on `http://localhost:3000`

---

## 🔑 Environment Variables

### Backend (`backend/.env`)

| Variable | Purpose | Example |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | `postgresql://postgres:postgres@localhost:5432/email_scheduler` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `ELASTICSEARCH_NODE` | Elasticsearch URL | `http://localhost:9200` |
| `WORKER_CONCURRENCY` | Parallel jobs per worker | `5` |
| `MIN_DELAY_MS_BETWEEN_SENDS` | Floor delay between sends | `1000` |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | Per-sender hourly cap | `50` |
| `MAX_EMAILS_PER_HOUR_GLOBAL` | Optional global cap | `200` (or leave blank to disable) |
| `ETHEREAL_EMAIL` / `ETHEREAL_PASSWORD` | Fake SMTP creds | Get from [ethereal.email](https://ethereal.email) → "Create Ethereal Account" |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | Real Slack app creds | From [api.slack.com/apps](https://api.slack.com/apps) |
| `SLACK_REDIRECT_URI` | OAuth callback | `http://localhost:4000/api/slack/callback` |

### Frontend (`frontend/.env.local`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Backend base URL (`http://localhost:4000/api`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Real Google OAuth creds (Google Cloud Console) |
| `NEXTAUTH_SECRET` | Any random string |
| `NEXTAUTH_URL` | `http://localhost:3000` |

### Setting up Ethereal Email

1. Go to [ethereal.email](https://ethereal.email)
2. Click **"Create Ethereal Account"** (instant, no signup)
3. Copy the generated email + password into `ETHEREAL_EMAIL` / `ETHEREAL_PASSWORD`
4. Sent emails can be viewed via the preview URL printed in backend logs on each send

---

## 🏗️ Architecture Overview

### Scheduling flow

```mermaid
sequenceDiagram
    participant User
    participant API as Express API
    participant DB as Postgres
    participant Queue as BullMQ (Redis)
    participant Worker
    participant SMTP as Ethereal

    User->>API: POST /emails/schedule
    API->>DB: Insert Email row (status=SCHEDULED)
    API->>Queue: Add delayed job (by Email ID)
    Queue-->>Worker: Job fires at scheduled time
    Worker->>DB: Fetch Email by ID
    Worker->>Worker: Idempotency check (skip if already SENT)
    Worker->>SMTP: Send email
    Worker->>DB: Update status=SENT, sentAt=now
```

**Key design choice:** BullMQ jobs only carry the Email's ID — Postgres stays the single source
of truth for all email data and status.

### Restart persistence

```mermaid
flowchart TD
    A[Backend starts] --> B[Query DB for status=SCHEDULED]
    B --> C{Job still in BullMQ/Redis?}
    C -->|Yes| D[Do nothing — Redis persistence already covers it]
    C -->|No| E[Re-enqueue job with correct remaining delay]
    D --> F[Worker resumes normally]
    E --> F
```

Two independent layers protect against lost jobs on restart:
- **Redis's own persistence** keeps BullMQ jobs alive across a backend restart
- **Boot-time reconciliation** (above) is the fallback — Postgres is authoritative, so even if
  Redis ever lost a job, it gets rebuilt from the DB automatically

### Rate limiting & concurrency

```mermaid
flowchart LR
    A[Worker picks up job] --> B{Under hourly limit?}
    B -->|Yes, Redis atomic INCR| C[Send email]
    B -->|No, limit hit| D[Move job to DELAYED<br/>next hour + stagger offset]
    D --> E[Fire Slack alert<br/>if connected]
    E --> F[Job resurfaces next hour,<br/>re-checked automatically]
```

| Mechanism | Implementation |
|---|---|
| Worker concurrency | Configurable via `WORKER_CONCURRENCY`, passed to BullMQ `Worker` |
| Min delay between sends | BullMQ `limiter: { max: 1, duration: MIN_DELAY_MS_BETWEEN_SENDS }` |
| Hourly rate limit | Redis Lua script — atomic `INCR` + conditional `EXPIRE`, keyed by `userId:sender:hourWindow` |
| Multi-worker safety | Atomic Redis ops (not in-memory counters) — safe under concurrency or multiple instances |
| On limit hit | Job moved to `DELAYED` (not dropped/failed) via `job.moveToDelayed()`, re-checked at the next hour boundary |
| Order preservation | Each rejected job gets a sequence number; delay = `timeToNextHour + (sequence-1) × minDelay`, staggering retries |
| Slack alert | Real OAuth token → live `chat.postMessage` call the moment a limit is hit; deduped to one alert per user/sender/hour |

**Trade-off:** rate-limit windows are aligned to the clock hour (resets at `:00`), not a rolling
60-minute window from each send. This is a deliberate, standard pattern (same approach many
public APIs use) — it means a limit hit early in the hour waits longer than one hit late in the
hour.

**Trade-off:** if Redis is temporarily unreachable, the rate limiter fails **open** (allows the
send) rather than blocking all traffic — prioritizing availability over strict enforcement in
that edge case.

---

## ✅ Features Implemented

### Backend

| Feature | Status |
|---|---|
| Schedule email via API | ✅ |
| BullMQ delayed jobs (no cron) | ✅ |
| Ethereal SMTP sending | ✅ |
| Restart-safe persistence (reconciliation) | ✅ |
| Idempotency (no duplicate sends) | ✅ |
| Configurable worker concurrency | ✅ |
| Configurable min delay between sends | ✅ |
| Per-sender hourly rate limit | ✅ |
| Optional global hourly rate limit | ✅ |
| Redis-backed atomic counters (multi-worker safe) | ✅ |
| Reschedule (not drop) on rate limit | ✅ |
| Real Slack OAuth + live alert on rate limit | ✅ |
| Slack disconnect/reconnect handling | ✅ |
| Elasticsearch indexing | ✅ |
| Elasticsearch search endpoint | ✅ |
| Live BullMQ dashboard (Bull Board) | ✅ |
| Behavior under 1000+ simultaneous jobs | ✅ (enqueue path load-tested) |

### Frontend

| Feature | Status |
|---|---|
| Real Google OAuth login (NextAuth) | ✅ |
| Header shows name/email/avatar | ✅ |
| Logout | ✅ |
| Dashboard: Scheduled / Sent tabs | ✅ |
| Compose modal: subject, body, recipients | ✅ |
| CSV upload + lead parsing (Papaparse) | ✅ |
| Per-batch delay + start time controls | ✅ |
| Connect Slack button (real OAuth) | ✅ |
| Loading + empty states | ✅ |
| Search/filter emails | ✅ |

---

## 📝 Assumptions, Shortcuts & Trade-offs

- Rate-limit windows are calendar-hour-aligned, not rolling — see Architecture section above.
- Redis connection failures fail-open on rate limiting (availability over strict enforcement).
- A `User` row is created/matched by email at schedule time; full profile sync from Google login
  happens on first schedule or Slack connect, not immediately at login.
- Elasticsearch indexing is fire-and-forget (non-blocking) — a failed index doesn't fail the
  schedule request, it's logged and retried on the next status update.
- 1000+ concurrent job behavior was verified via the enqueue path (DB + Redis writes), not by
  actually sending 1000 real emails through Ethereal, per the assignment's guidance.

---

## 🎥 Demo Video

[Link to demo video] — covers:
1. Scheduling emails (frontend + Postman)
2. Dashboard: Scheduled and Sent tabs
3. Restart scenario: stop → restart → future email still sends correctly
4. Rate limiting + Slack alert live demo
