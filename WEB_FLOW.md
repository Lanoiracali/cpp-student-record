# Web Flow - Quick Reference

## New Application Flow

+-----------------------------------------+
¦          User Visits App                ¦
¦      http://localhost:3003/             ¦
+-----------------------------------------+
                  ¦
                  ?
        +---------------------+
        ¦ Authenticated?      ¦
        +---------------------+
                  ¦     ¦
            YES   ¦     ¦   NO
                  ?     ?
            +------+  +----------+
            ¦ /app ¦  ¦/auth/... ¦
            +------+  +----------+
                ¦          ¦
                ?          ?
            +--------+ +-------------+
            ¦ Shell  ¦ ¦   LOGIN     ¦
            ¦ + UI   ¦ ¦   PAGE      ¦
            +--------+ +-------------+
                           ¦
                    +-------------+
                    ¦             ¦
                ?               ?
            [Login]         [Register]
              ¦                 ¦
              ?                 ?
         Verify Creds    Create Account
              ¦                 ¦
              +-----------------+
                        ?
                  Authenticated
                        ¦
                        ?
                    Redirect
                    to /app

---

## Key Pages and Routes

### Public (No Login Required)
- `GET /` - Shows login page
- `GET /auth/login` - Login form
- `POST /auth/login` - Login submission
- `GET /auth/register` - Registration form
- `POST /auth/register` - Registration submission

### Protected (Login Required)
- `GET /app` - Main application
  - Sidebar navigation
  - Header with search
  - Content area (dashboard/records/students)
  
- `GET /partials/dashboard` - Dashboard overview
- `GET /partials/records` - Records management
- `GET /partials/students` - Student directory
- `GET /partials/login` - Login form (fragment)
- `GET /partials/register` - Register form (fragment)

### API Endpoints (Login Required)
- `GET /api/students` - Get all students (JSON)
- `GET /api/records/:studId` - Get student records (JSON)

### Logout
- `POST /auth/logout` - Logout and redirect to login

---

## User Actions

### 1. New User Registration
1. Visit http://localhost:3003/
2. Click "Create account" link
3. Fill in registration form
4. Click "Create Account"
5. Automatically logged in
6. Redirected to Dashboard

### 2. Returning User Login
1. Visit http://localhost:3003/
2. Enter Student ID (e.g., 2024-0012)
3. Enter Password
4. Click "Sign In"
5. Redirected to Dashboard

### 3. Logout
1. While in app
2. Click "Logout" button in sidebar
3. Confirm logout
4. Redirected to login page

### 4. Navigate App
Once logged in, use sidebar to navigate:
- Dashboard - Overview and quick actions
- Records - Manage/view records
- Students - View student directory

---

## Database Integration

All authentication is tied to the SQLite database:

```
users table:
+-- id
+-- is_teacher
+-- stud_id (unique)
+-- first_name
+-- last_name
+-- year
+-- section
+-- group_name
+-- password (hashed)
+-- created_at

record table:
+-- id
+-- stud_id (foreign key)
+-- date
+-- type_of_undertaking
+-- total_score
+-- score
+-- remarks
+-- created_at
```

---

## Test Credentials (After npm run db:seed)

| User | ID | Password | Type |
|------|----|-----------| -----|
| Elena Garcia | 2024-0012 | student123 | Student |
| Michael Torres | 2024-0089 | student456 | Student |
| Sarah Jenkins | (any) | teacher123 | Teacher |

---

## Commands

```bash
# Install dependencies
npm install

# Initialize database
npm run db:init

# Seed with test data
npm run db:seed

# Start application
npm run dev

# App will run on http://localhost:3003 (or next available port)
```

---

## Current Status

? Login/Register authentication
? Session management
? Protected routes
? Database integration
? Dashboard access after login
? Logout functionality

---

## What Happens Next

1. **Login Page** - User sees login form
2. **Database Check** - Credentials verified against users table
3. **Session Creation** - User session stored in memory
4. **Dashboard Load** - Main app interface displayed
5. **Navigation** - User can access Records, Students
6. **Data Loading** - HTMX swaps content without page reloads
7. **Logout** - Session destroyed, back to login

