# CPP Institutional Records Management System

Node.js/Express gateway and UI for the CPP application. Serves HTML/HTMX pages, manages sessions (stored in Neon Postgres), and proxies API calls to the Flask backend.

## Requirements

- Node.js 18+
- Running Flask backend (`cpp-backend`) — local or on Railway
- Neon Postgres (sessions + shared with Flask)
- SMTP credentials (for student email login codes)

## Local setup

1. Install dependencies:
   ```bash
   npm install
   npm run build:css
   ```

2. Configure environment:
   ```bash
   copy .env.example .env    # Windows
   cp .env.example .env      # macOS/Linux
   ```

   | Variable | Description |
   |----------|-------------|
   | `FLASK_BACKEND_URL` | Flask API URL (default `http://127.0.0.1:5000`) |
   | `DATABASE_URL` | Neon connection string (same as `cpp-backend`) |
   | `SESSION_SECRET` | Random string for session signing |
   | `SMTP_*` | Gmail or other SMTP for student temp codes |

3. Start Flask backend first, then the web app:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3001`

## Deploy to Railway

Deploy **after** the Flask backend is live on Railway. You need two Railway services in one project (or two projects).

### Step 1 — Backend (cpp-backend)

Repo: `github.com/Lanoiracali/cpp-backend`

1. [railway.com/new](https://railway.com/new) → Deploy from GitHub → `cpp-backend`
2. **Variables:** `DATABASE_URL` = Neon connection string
3. **Networking → Generate Domain** → copy URL, e.g. `https://cpp-backend-production.up.railway.app`
4. Verify: `curl https://YOUR-BACKEND.up.railway.app/api/v1/health`

### Step 2 — Web app (this repo)

Repo: `github.com/Lanoiracali/cpp-student-record`

1. **New service** in the same Railway project → Deploy from GitHub → `cpp-student-record`
2. **Variables:**

   | Variable | Value |
   |----------|-------|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | Same Neon URL as backend |
   | `FLASK_BACKEND_URL` | `https://YOUR-BACKEND.up.railway.app` |
   | `SESSION_SECRET` | Random 32+ char string (`openssl rand -hex 32`) |
   | `SMTP_HOST` | `smtp.gmail.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_SECURE` | `false` |
   | `SMTP_USER` | Your email |
   | `SMTP_PASS` | Gmail App Password |

3. **Networking → Generate Domain** for the public portal URL
4. Railway builds with `npm install && npm run build:css` and starts `npm start` (see `railway.json`)

### Step 3 — Verify

```bash
# Web app health (also checks Flask)
curl https://YOUR-WEBAPP.up.railway.app/health

# Expected:
# { "success": true, "status": "ok", "flask": { "reachable": true, "database": "pg" }, ... }
```

Open the web app URL in a browser and test teacher login / student registration.

### Preflight (before pushing)

With production values in `.env`:

```bash
npm run check:deploy
```

## Architecture (production)

```
Browser  →  Railway (cpp-student-record)  →  Railway (cpp-backend)  →  Neon Postgres
              Express + sessions                    Flask API
```

- Users only visit the **web app** URL.
- `FLASK_BACKEND_URL` is server-side only (not exposed to the browser).
- Sessions persist in Neon via `connect-pg-simple` (`express_sessions` table).

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | Auto | Set by Railway |
| `NODE_ENV` | Prod | Set to `production` on Railway |
| `FLASK_BACKEND_URL` | Yes | Public HTTPS URL of Flask service |
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `SESSION_SECRET` | Yes (prod) | Session signing key |
| `SMTP_*` | For email login | Nodemailer config |

## Production notes

- `SESSION_SECRET` must be set in production or the app will refuse to start.
- Cookies use `secure: true` when `NODE_ENV=production` (requires HTTPS — Railway provides this).
- Do not commit `.env` — it contains secrets.
- If student email login fails, check SMTP variables and Railway deploy logs.

## Features

- Express gateway, HTMX partials, Tailwind CSS
- Teacher/student auth via Flask API
- Nodemailer for student temporary login codes
- Postgres-backed sessions (survive restarts)
