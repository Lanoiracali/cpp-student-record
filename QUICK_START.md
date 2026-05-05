# Quick Start Guide - Registrar Pro

## 30-Second Setup

```bash
cd "d:\LEX FILES\plv 3rdyr\2er\integ\cpp-student-record"
npm install                  # ~30 seconds
npm run db:init              # Create database
npm run db:seed              # Add test users
npm run dev                  # Start server
```

## Go to: http://localhost:3003

---

## Test Credentials

**Student:**
- ID: `2024-0012`
- Password: `student123`

**OR Register** - Create new account

---

## That''s it! ??

You now have:
? Login page
? Registration 
? Secure authentication
? Dashboard access
? Records management
? Student directory

---

## Inside the App

**Sidebar Navigation:**
- Dashboard - Overview
- Records - Manage records
- Students - Browse students
- New Record - Add record
- Logout - Sign out

**What you can do:**
1. View dashboard metrics
2. Search and manage records
3. Browse student information
4. Create new academic records
5. Safely logout

---

## Need Help?

See documentation:
- `AUTHENTICATION.md` - How login works
- `WEB_FLOW.md` - User journey
- `DATABASE.md` - Database info
- `DATABASE_SETUP.md` - DB setup details

---

## Running Server Again Later

From project directory:
```bash
npm run dev
```

Server will auto-find an available port.

---

## Key Features

? User authentication with password hashing
? Session management (24 hours)
? SQLite database for persistence
? Protected routes
? Responsive UI with HTMX
? Beautiful Tailwind styling
? Student record management

---

## Architecture

Browser ? Express Server ? Database (SQLite)
                ?
        Session Management
                ?
        Route Protection
                ?
        UI Fragments (HTMX)

