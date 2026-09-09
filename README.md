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

<<<<<<< HEAD
=======
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

## ⏱️ Rate Limiting (Redis-Backed, Multi-Worker Safe)

### Configuration (Environment Variables)

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `50` | Per-sender hourly cap. Each sender (email address) gets its own counter. |
| `MAX_EMAILS_PER_HOUR` | — | Legacy alias; used only if `MAX_EMAILS_PER_HOUR_PER_SENDER` is unset. |
| `MAX_EMAILS_PER_HOUR_GLOBAL` | *(disabled)* | Optional global cap across **all** senders combined. |
| `MIN_DELAY_MS_BETWEEN_SENDS` | `1000` | Minimum gap between SMTP sends (BullMQ worker limiter). |
| `WORKER_CONCURRENCY` | `5` | Parallel worker threads. |

All limits are read from env at startup — **no hardcoded values in code**.

### How It Works

1. **Redis atomic counters** — When a worker picks up a job, it runs a Lua script (`INCR` + `EXPIRE`) on key `rate_limit:{sender}:{hourTimestamp}`. This is atomic and safe across multiple worker processes/instances.
2. **Optional global counter** — If `MAX_EMAILS_PER_HOUR_GLOBAL` is set, a second key `rate_limit:__global__:{hourTimestamp}` is checked. If the global cap is hit, the per-sender increment is rolled back.
3. **Fixed hourly windows** — Windows align to UTC epoch hours (`floor(now / 3600000) * 3600000`). Keys expire after 2 hours via Redis TTL.
4. **Never drop jobs** — When a limit is hit, the job is **not failed or discarded**. Instead:
   - DB status briefly set to `RESCHEDULED` with `failReason` explaining the delay
   - A new BullMQ delayed job is enqueued for the **next hour window**
   - Status returns to `SCHEDULED` with updated `scheduledAt`
5. **Order preservation under load** — When 1000+ emails fire at the same instant and exceed the limit, blocked jobs receive a monotonic sequence number via Redis (`rate_limit_reschedule_seq:{sender}:{nextHour}`). Delay = `timeToNextHour + (sequence - 1) * MIN_DELAY_MS_BETWEEN_SENDS`, spreading jobs across the next hour in FIFO order.

### Behavior Under Load (1000+ Emails at Once)

```
Hour 1 (limit = 50):
  Jobs 1–50   → sent immediately (counter = 50)
  Jobs 51–1000 → rate-limited, staggered into Hour 2

Hour 2:
  Job 51  → fires at T+0ms
  Job 52  → fires at T+1000ms  (MIN_DELAY_MS_BETWEEN_SENDS)
  Job 53  → fires at T+2000ms
  ...
  Job 100 → fires at T+49s
  Jobs 101–1000 → rate-limited again, staggered into Hour 3
  (continues until all sent — zero dropped)
```

### Trade-Offs

| Approach | Pros | Cons |
|----------|------|------|
| **Redis Lua counters (chosen)** | Atomic, fast, works across N workers | Requires Redis; fail-open if Redis down |
| **BullMQ limiter alone** | Built-in | Only throttles throughput, not hourly caps |
| **In-memory counters** | Simple | Breaks with multiple worker instances |
| **DB row locks** | No Redis needed | Slower under high concurrency |

### Slack Notification on Rate Limit Hit

1. User clicks **Connect Slack** in the dashboard → OAuth v2 authorize flow → backend stores `accessToken` + `channelId` in `SlackToken` table per user.
2. When a sender's hourly limit is reached, the worker calls Slack `chat.postMessage` with a formatted alert (sender, usage, limit type).
3. **Alert deduplication** — At most **one Slack message per user + sender + hour window** (Redis key `slack_alert_sent:{userId}:{sender}:{hour}`).
4. **Graceful no-op** — If Slack is not connected, the alert is silently skipped (no crash). Reconnecting via OAuth starts notifications immediately without redeploy.
5. **Disconnect** — `DELETE /api/slack/disconnect?userId=...` removes stored tokens.

---

## 🛠️ Quick Start & Setup

### Prerequisites
- Node.js (v18+)
- Docker & Docker Compose

### 1. Start Infrastructure Services (Redis, Postgres, Elasticsearch)
>>>>>>> 2edc268 (feat: add hourly email rate limiting with Slack alerts)
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

<<<<<<< HEAD
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
=======
2. **Kill the Backend Server immediately** (`Ctrl + C` or process kill).
3. Observe that the email remains in Postgres with status `SCHEDULED`.
4. **Restart the Backend Server** (`npm run dev`).
5. Observe the boot log:
   `⚠️ [Reconciliation] Email ID ... missing in Redis. Re-enqueueing with delay...`
6. Wait for the remaining seconds: observe worker picks up job, sends email via Ethereal, and marks DB status `SENT` cleanly!

---

## 🧪 Rate Limit & Slack Alert Test

1. **Set a low limit** in `.env`:
   ```
   MAX_EMAILS_PER_HOUR_PER_SENDER=3
   MIN_DELAY_MS_BETWEEN_SENDS=500
   ```

2. **Connect Slack** via the dashboard sidebar (requires `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` in `.env`).

3. **Schedule 10 emails** for immediate delivery (via Compose or API):
   ```powershell
   1..10 | ForEach-Object {
     Invoke-RestMethod -Uri "http://localhost:4000/api/emails/schedule" -Method Post -ContentType "application/json" -Body "{`"sender`":`"you@gmail.com`",`"recipient`":`"lead$_@test.com`",`"subject`":`"Rate test $_`",`"body`":`"Hello`",`"delayMs`":0}"
   }
   ```

4. **Observe**:
   - First 3 emails sent in the current hour window
   - Remaining 7 appear in the **Rate Limited** tab with staggered `scheduledAt` times
   - **One Slack alert** posted (deduplicated per hour window)
   - Bull Board at `/admin/queues` shows delayed jobs for the next hour
   - Zero jobs dropped or permanently failed
>>>>>>> 2edc268 (feat: add hourly email rate limiting with Slack alerts)
