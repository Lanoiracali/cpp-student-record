# Authentication Flow Guide

## Overview

Registrar Pro now implements a complete authentication system with:
- User registration
- Secure login with password hashing
- Session management
- Protected routes

---

## Authentication Flow

### 1. Initial Access
User visits `http://localhost:3003/`
?
Shows login page (if not authenticated)

### 2. Login
User enters:
- Student ID (e.g., `2024-0012`)
- Password

System verifies credentials against database
?
If valid: Creates session and redirects to `/app`
If invalid: Shows error message

### 3. Main Interface
User is now authenticated and can access:
- Dashboard
- Records Management
- Student Directory
- Full application features

### 4. Logout
User clicks "Logout" button in sidebar
?
POST to `/auth/logout`
?
Session destroyed
?
Redirects to login page

---

## Authentication Routes

### GET /
- **Purpose:** Entry point
- **Behavior:** 
  - If authenticated ? redirects to `/app`
  - If not authenticated ? shows login page

### GET /auth/login
- **Purpose:** Show login form
- **Access:** Public
- **Returns:** Login page HTML

### POST /auth/login
- **Purpose:** Handle login submission
- **Access:** Public
- **Required Fields:**
  - `studId` - Student ID
  - `password` - Password
- **Response:** 
  - Success: Redirect to `/app`
  - Failure: Error message

### GET /auth/register
- **Purpose:** Show registration form
- **Access:** Public
- **Returns:** Registration page HTML

### POST /auth/register
- **Purpose:** Handle registration submission
- **Access:** Public
- **Required Fields:**
  - `firstName` - First name
  - `lastName` - Last name
  - `studId` - Student ID (must be unique)
  - `password` - Password
  - `passwordConfirm` - Confirm password
- **Optional Fields:**
  - `year` - Year of study
  - `section` - Section number
- **Response:**
  - Success: Auto-login and redirect to `/app`
  - Failure: Error message

### POST /auth/logout
- **Purpose:** Logout user
- **Access:** Authenticated users only
- **Response:** Redirect to `/`

---

## Protected Routes

These routes require authentication (will redirect to login if accessed without session):

### GET /app
- **Purpose:** Main application shell
- **Returns:** Full page with sidebar, header, and content area

### GET /partials/:view
- **Purpose:** Load page fragments
- **Views Available:**
  - `dashboard` - Dashboard overview
  - `records` - Records management
  - `students` - Student directory
- **Returns:** HTML fragment

### GET /api/students
- **Purpose:** Get list of all students
- **Returns:** JSON array of students

### GET /api/records/:studId
- **Purpose:** Get records for a specific student
- **Returns:** JSON array of records

---

## Session Management

### Session Storage
Sessions are stored in memory (default behavior).

**For Production:**
Consider using:
- `connect-mongo` for MongoDB
- `connect-redis` for Redis
- Database-backed sessions

### Session Configuration
```javascript
session({
  secret: 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,  // Set true for HTTPS
    httpOnly: true, // Prevent JS access
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
})
```

### Session Data
When logged in, `req.session` contains:
```javascript
{
  userId: 1,
  user: {
    id: 1,
    studId: "2024-0012",
    firstName: "Elena",
    lastName: "Garcia",
    isTeacher: false
  }
}
```

---

## Test Credentials

After running `npm run db:seed`, use:

**Student 1:**
- Student ID: `2024-0012`
- Password: `student123`
- Name: Elena Garcia

**Student 2:**
- Student ID: `2024-0089`
- Password: `student456`
- Name: Michael Torres

**Teacher:**
- Password: `teacher123`
- Name: Sarah Jenkins

---

## Security Features

? **Password Hashing:** Bcryptjs (10 salt rounds)
? **Session Security:** HttpOnly cookies
? **SQL Injection Protection:** Parameterized queries
? **CSRF Protection:** Session tokens
? **Authentication Check:** All protected routes verified

---

## Common Issues

### "Invalid student ID or password"
- Verify Student ID matches database exactly (case-sensitive)
- Check password is correct
- Ensure user exists in database (run `npm run db:seed`)

### Session expires
- Default: 24 hours
- Adjust `cookie.maxAge` in app.js to change

### Login redirects in a loop
- Check session secret is set
- Verify database connection is working
- Check browser cookies are enabled

---

## Next Steps

1. **Customize session secret:**
   Edit `app.js` line ~20 to use a secure random string

2. **Add session persistence:**
   Implement MongoDB or Redis session store

3. **Add email verification:**
   Send verification email during registration

4. **Add password recovery:**
   Implement forgot password flow

5. **Add role-based access:**
   Extend authentication to support teacher and admin roles

---

## Usage Examples

### Programmatic Login
```javascript
// In a backend function
const user = await getUserByStudId('2024-0012');
const isValid = await verifyPassword(user.id, 'student123');
if (isValid) {
  req.session.userId = user.id;
  req.session.user = { ... };
}
```

### Check Authentication in Middleware
```javascript
function requireAuth(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/');
  }
}
```

### Get Current User
```javascript
const currentUserId = req.session.userId;
const currentUser = req.session.user;
```

