require('dotenv').config();
const path = require('path');
// Reuse Neon DATABASE_URL from the Flask backend when not set locally
if (!process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.join(__dirname, '..', 'cpp-backend', '.env') });
}

const express = require('express');
const fs = require('fs');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const { URL } = require('url');

// ── Rate limiting store (in-memory, per IP) ───────────────────────────────────
const loginAttempts = new Map(); // ip -> { count, lockedUntil }
const RATE_LIMIT_MAX    = 5;               // max failed attempts
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minute lockout

function getRateLimit(ip) {
  return loginAttempts.get(ip) || { count: 0, lockedUntil: null };
}

function recordFailedAttempt(ip) {
  const entry = getRateLimit(ip);
  entry.count += 1;
  if (entry.count >= RATE_LIMIT_MAX) {
    entry.lockedUntil = Date.now() + RATE_LIMIT_WINDOW;
  }
  loginAttempts.set(ip, entry);
}

function clearRateLimit(ip) {
  loginAttempts.delete(ip);
}

function isRateLimited(ip) {
  const entry = getRateLimit(ip);
  if (!entry.lockedUntil) return false;
  if (Date.now() > entry.lockedUntil) { clearRateLimit(ip); return false; }
  return true;
}

function getRateLimitMinutes(ip) {
  const entry = getRateLimit(ip);
  if (!entry.lockedUntil) return 0;
  return Math.ceil((entry.lockedUntil - Date.now()) / 60000);
}

// ── Session token store (token -> sessionId) ──────────────────────────────────
// Maps a secure random token stored in the session to the session itself.
// This is a lightweight CSRF / session-fixation defense.
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getRememberToken(req) {
  if (!req.headers.cookie) return null;
  const cookies = req.headers.cookie.split(';').map((c) => c.trim());
  for (const cookie of cookies) {
    if (cookie.startsWith('remember_token=')) {
      return decodeURIComponent(cookie.substring('remember_token='.length));
    }
  }
  return null;
}

function applyUserToSession(req, user) {
  const studentId = user.studentId || user.student_id;
  const isTeacher = user.isTeacher !== undefined ? user.isTeacher : user.is_teacher;

  req.session.userId = user.id;
  req.session.sessionToken = generateSessionToken();
  if (studentId) req.session.studentId = studentId;

  req.session.user = {
    id: user.id,
    studentId,
    studId: user.studId || user.stud_id,
    fullName: user.fullName || user.full_name
      || `${user.firstName || user.first_name || ''} ${user.lastName || user.last_name || ''}`.trim(),
    firstName: user.firstName || user.first_name,
    lastName: user.lastName || user.last_name,
    email: user.email || '',
    isTeacher,
    isStudent: !isTeacher,
  };
}

function getPostLoginRedirect(user) {
  const isTeacher = user.isTeacher !== undefined ? user.isTeacher : user.is_teacher;
  const studentId = user.studentId || user.student_id;
  if (!isTeacher && studentId) return '/student';
  return '/dashboard';
}

async function tryRestoreSessionFromRememberToken(req) {
  const rememberToken = getRememberToken(req);
  if (!rememberToken) return false;

  try {
    const backendResult = await postJson(`${flaskBackendBaseUrl}/api/v1/verify_token`, { token: rememberToken });
    if (backendResult.statusCode === 200 && backendResult.body && backendResult.body.success) {
      applyUserToSession(req, backendResult.body.user);
      return true;
    }
  } catch (error) {
    console.error('Token verification error:', error);
  }
  return false;
}

const app = express();
const rootDir = __dirname;
const uiDir = path.join(rootDir, 'ui');
const srcDir = path.join(rootDir, 'src');
let currentPort = Number(process.env.PORT || 3001);
const flaskBackendBaseUrl = process.env.FLASK_BACKEND_URL || 'http://127.0.0.1:5000';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFile(filePath, replacements = {}) {
  let html = fs.readFileSync(filePath, 'utf8');

  for (const [token, replacement] of Object.entries(replacements)) {
    html = html.replaceAll(token, replacement);
  }

  return html;
}

function renderAuthPage(fileName, message) {
  const filePath = path.join(uiDir, fileName);
  const alert = message
    ? `<div class="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">${escapeHtml(message)}</div>`
    : '';

  return renderFile(filePath, {
    '<!-- AUTH_MESSAGE -->': alert,
  });
}

function sendHxRedirect(res, location) {
  res.set('HX-Redirect', location);
  return res.status(200).send('');
}

function sendFormError(req, res, redirectPath, message) {
  if (req.get('HX-Request') === 'true') {
    return res.status(200).send(
      `<div class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">${escapeHtml(message)}</div>`
    );
  }

  return res.redirect(`${redirectPath}?error=` + encodeURIComponent(message));
}

function getField(body, keys) {
  for (const key of keys) {
    const value = body[key];
    if (value !== undefined && value !== null) {
      const text = String(value).trim();
      if (text) {
        return text;
      }
    }
  }

  return '';
}

function isTruthy(value) {
  return ['1', 'true', 'on', 'yes'].includes(String(value).toLowerCase());
}

function postJson(urlString, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const body = JSON.stringify(payload);
    const client = url.protocol === 'https:' ? https : http;

    const request = client.request({
      method: 'POST',
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (response) => {
      let responseBody = '';

      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        let parsedBody = null;

        if (responseBody) {
          try {
            parsedBody = JSON.parse(responseBody);
          } catch (parseError) {
            parsedBody = responseBody;
          }
        }

        resolve({
          statusCode: response.statusCode || 0,
          body: parsedBody,
        });
      });
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Session configuration — persisted in Neon Postgres so logins survive server restarts
const sessionSecret = process.env.SESSION_SECRET || 'your-secret-key-change-this';
const sessionOptions = {
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
};

if (process.env.DATABASE_URL) {
  const pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('neon.tech') ? { rejectUnauthorized: false } : undefined,
  });
  sessionOptions.store = new pgSession({
    pool: pgPool,
    tableName: 'express_sessions',
    createTableIfMissing: true,
  });
  console.log('[session] Using Postgres session store (Neon)');
} else {
  console.warn('[session] DATABASE_URL not set — sessions will not survive server restarts');
}

app.use(session(sessionOptions));

// Static files
app.use('/src', express.static(srcDir));
app.use('/ui', express.static(uiDir));

// Routes map
const routes = new Map([
  ['dashboard', 'dashboard'],
  ['profile', 'profile'],
  ['records', 'records'],
  ['students', 'students'],
  ['records-student', 'students'],
  ['login', 'login'],
  ['register', 'register'],
  ['student-reg', 'student-reg'],
  ['teacher-reg', 'teacher-reg'],
]);

// Middleware to check authentication (teacher/admin)
async function requireAuth(req, res, next) {
  if (req.session.userId && req.session.sessionToken) {
    return next();
  }

  if (req.session.userId && !req.session.sessionToken) {
    req.session.sessionToken = generateSessionToken();
    return next();
  }

  if (await tryRestoreSessionFromRememberToken(req)) {
    return next();
  }

  res.redirect('/login');
}

// Middleware to check authentication for any logged-in user (teacher OR student)
async function requireAnyAuth(req, res, next) {
  if (req.session.userId) {
    return next();
  }

  if (await tryRestoreSessionFromRememberToken(req)) {
    return next();
  }

  // Determine redirect based on context
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  res.redirect('/login/student');
}

// Middleware to redirect if authenticated
async function redirectIfAuth(req, res, next) {
  if (req.session.userId) {
    return res.redirect(getPostLoginRedirect(req.session.user || {}));
  }

  if (await tryRestoreSessionFromRememberToken(req)) {
    return res.redirect(getPostLoginRedirect(req.session.user || {}));
  }

  next();
}

// Helper to render shell with content
function renderShell(initialView = 'dashboard') {
  let shell = fs.readFileSync(path.join(uiDir, 'shell.html'), 'utf8');

  shell = shell.replace(
    'hx-get="/partials/dashboard" hx-trigger="load" hx-swap="innerHTML"',
    `hx-get="/partials/${initialView}" hx-trigger="load" hx-swap="innerHTML"`
  );

  return shell;
}

// ============= AUTH ROUTES =============

async function handleTeacherLogin(req, res) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';

  // ── Rate limit check ───────────────────────────────────────────────────────
  if (isRateLimited(ip)) {
    const mins = getRateLimitMinutes(ip);
    const msg = `Too many failed attempts. Please wait ${mins} minute${mins !== 1 ? 's' : ''} before trying again.`;
    return sendFormError(req, res, '/login/teacher', msg);
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendFormError(req, res, '/login/teacher', 'Email and password are required');
    }

    const loginPayload = {
      email,
      password,
      remember: req.body.remember === 'on' || req.body.remember === true || req.body.remember === 'true'
    };

    const backendResult = await postJson(`${flaskBackendBaseUrl}/api/v2/login`, loginPayload);

    if (backendResult.statusCode < 200 || backendResult.statusCode >= 300 || !backendResult.body || backendResult.body.success !== true) {
      // Record failed attempt
      recordFailedAttempt(ip);
      const remaining = RATE_LIMIT_MAX - getRateLimit(ip).count;
      const errorMessage = backendResult.body && typeof backendResult.body === 'object'
        ? backendResult.body.error || backendResult.body.message || 'Invalid credentials'
        : 'Login failed';
      const lockMsg = getRateLimit(ip).lockedUntil
        ? ` Account temporarily locked for ${getRateLimitMinutes(ip)} minutes.`
        : (remaining > 0 ? ` ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.` : '');
      return sendFormError(req, res, '/login/teacher', errorMessage + lockMsg);
    }

    // Successful login — clear rate limit
    clearRateLimit(ip);

    const user = backendResult.body.user;

    // Store user in session with a secure token
    req.session.userId = user.id;
    req.session.sessionToken = generateSessionToken();
    req.session.user = {
      id: user.id,
      studId: user.studId || user.stud_id,
      fullName: user.fullName || user.full_name || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      firstName: user.firstName || user.first_name,
      lastName: user.lastName || user.last_name,
      email: user.email || '',
      isTeacher: user.isTeacher !== undefined ? user.isTeacher : user.is_teacher
    };

    if (backendResult.body.token) {
      res.cookie('remember_token', backendResult.body.token, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
    }

    if (req.get('HX-Request') === 'true') {
      return sendHxRedirect(res, '/dashboard');
    }

    res.redirect('/dashboard');
  } catch (error) {
    console.error('Login error:', error);
    const backendUnavailable = error && (error.code === 'ECONNREFUSED' || /connect/i.test(error.message || ''));
    return sendFormError(
      req,
      res,
      '/login/teacher',
      backendUnavailable ? 'Unable to reach the Flask backend' : 'Login failed'
    );
  }
}

// GET / - Landing page
app.get('/', redirectIfAuth, (req, res) => {
  res.sendFile(path.join(uiDir, 'landing.html'));
});

// GET /login, /login/teacher - Teacher login page
app.get(['/login', '/login/teacher', '/auth/login'], redirectIfAuth, (req, res) => {
  res.send(renderAuthPage('login.html', req.query.error));
});

// POST /login, /login/teacher - Handle teacher login
app.post(['/login', '/login/teacher', '/auth/login'], handleTeacherLogin);

// GET /register/teacher - Teacher registration page
app.get(['/register/teacher'], redirectIfAuth, (req, res) => {
  res.send(renderAuthPage('teacher-login.html', req.query.error));
});

// GET /register - Student registration page (existing)
app.get(['/register', '/auth/register'], redirectIfAuth, (req, res) => {
  res.send(renderAuthPage('register.html', req.query.error));
});

// POST /register/teacher - Handle teacher registration (split names)
app.post(['/register/teacher'], async (req, res) => {
  try {
    const firstName = getField(req.body, ['first_name']);
    const lastName = getField(req.body, ['last_name']);
    const email = getField(req.body, ['email']);
    const password = getField(req.body, ['password']);
    const passwordConfirm = getField(req.body, ['password_confirm', 'passwordConfirm']);

    if (!firstName || !lastName || !email || !password) {
      return sendFormError(req, res, '/register/teacher', 'First name, last name, email, and password are required');
    }

    if (!email.endsWith('@plv.edu.ph')) {
      return sendFormError(req, res, '/register/teacher', 'Email must be a @plv.edu.ph address');
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    if (passwordConfirm && passwordConfirm !== password) {
      return sendFormError(req, res, '/register/teacher', 'Passwords do not match');
    }

    const registrationPayload = {
      role: 'teacher',
      full_name: fullName,
      email,
      password,
    };

    const backendResult = await postJson(`${flaskBackendBaseUrl}/api/v1/register`, registrationPayload);

    if (backendResult.statusCode < 200 || backendResult.statusCode >= 300 || !backendResult.body || backendResult.body.success !== true) {
      const errorMessage = backendResult.body && typeof backendResult.body === 'object'
        ? backendResult.body.error || backendResult.body.message || 'Registration failed'
        : 'Registration failed';
      return sendFormError(req, res, '/register/teacher', errorMessage);
    }

    const createdUser = backendResult.body.user || {};
    req.session.userId = createdUser.id;
    req.session.user = {
      id: createdUser.id,
      studId: createdUser.studId || createdUser.stud_id || '',
      fullName: createdUser.fullName || createdUser.full_name || fullName,
      firstName: createdUser.firstName || createdUser.first_name || fullName.split(' ')[0],
      lastName: createdUser.lastName || createdUser.last_name || '',
      email: createdUser.email || email,
      isTeacher: true
    };

    if (req.get('HX-Request') === 'true') {
      return sendHxRedirect(res, '/dashboard');
    }
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Teacher registration error:', error);
    const backendUnavailable = error && (error.code === 'ECONNREFUSED' || /connect/i.test(error.message || ''));
    return sendFormError(
      req,
      res,
      '/register/teacher',
      backendUnavailable ? 'Unable to reach the Flask backend' : 'Registration failed'
    );
  }
});

// POST /register - Handle student registration
app.post(['/register', '/auth/register'], async (req, res) => {
  try {
    const role = getField(req.body, ['role', 'accountType']) || (isTruthy(req.body.isTeacher) ? 'teacher' : 'student');
    const isTeacher = role === 'teacher';
    const firstName = getField(req.body, ['first_name', 'firstName']);
    const lastName = getField(req.body, ['last_name', 'lastName']);
    const password = getField(req.body, ['password']);
    const passwordConfirm = getField(req.body, ['password_confirm', 'passwordConfirm']);

    if (!firstName || !lastName || !password) {
      return sendFormError(req, res, '/register', 'Please complete all required fields');
    }

    if (passwordConfirm && passwordConfirm !== password) {
      return sendFormError(req, res, '/register', 'Passwords do not match');
    }

    const registrationPayload = { role: 'student', first_name: firstName, last_name: lastName, password };

    const studId = getField(req.body, ['stud_id', 'studId']);
    const year = getField(req.body, ['year']);
    const section = getField(req.body, ['section']);
    const groupName = getField(req.body, ['group_name', 'groupName']);

    if (!studId || !year || !section || !groupName) {
      return sendFormError(req, res, '/register', 'Please complete all required fields');
    }

    registrationPayload.stud_id = studId;
    registrationPayload.year = year;
    registrationPayload.section = section;
    registrationPayload.group_name = groupName;

    const backendResult = await postJson(`${flaskBackendBaseUrl}/api/v1/register`, registrationPayload);

    if (backendResult.statusCode < 200 || backendResult.statusCode >= 300 || !backendResult.body || backendResult.body.success !== true) {
      const errorMessage = backendResult.body && typeof backendResult.body === 'object'
        ? backendResult.body.error || backendResult.body.message || 'Registration failed'
        : 'Registration failed';
      return sendFormError(req, res, '/register', errorMessage);
    }

    const createdUser = backendResult.body.user || {};
    req.session.userId = createdUser.id || req.session.userId;
    req.session.user = {
      id: createdUser.id || req.session.userId,
      studId: createdUser.studId || createdUser.stud_id || studId,
      firstName: createdUser.firstName || createdUser.first_name || firstName,
      lastName: createdUser.lastName || createdUser.last_name || lastName,
      isTeacher: false
    };

    if (req.get('HX-Request') === 'true') {
      return sendHxRedirect(res, '/dashboard');
    }
    res.redirect('/dashboard');
  } catch (error) {
    console.error('Registration error:', error);
    const backendUnavailable = error && (error.code === 'ECONNREFUSED' || /connect/i.test(error.message || ''));
    return sendFormError(
      req,
      res,
      '/register',
      backendUnavailable ? 'Unable to reach the Flask backend' : 'Registration failed'
    );
  }
});

// ── STUDENT AUTH ROUTES ──────────────────────────────────────────────────────

const nodemailer = require('nodemailer');

function getMailTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER || '', pass: process.env.SMTP_PASS || '' },
  });
}

// GET /login/student
app.get('/login/student', async (req, res) => {
  if (req.session.userId) {
    if (req.session.user && req.session.user.isTeacher === false) {
      if (req.session.studentId) return res.redirect('/student');
    } else {
      return res.redirect('/dashboard');
    }
  }

  if (await tryRestoreSessionFromRememberToken(req) && req.session.studentId) {
    return res.redirect('/student');
  }

  res.sendFile(path.join(uiDir, 'student-login.html'));
});

// POST /login/student/request — Step 1: look up temp password & email it
app.post('/login/student/request', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ success: false, error: 'Email is required' });
    const result = await flaskRequest('POST', '/api/v1/student/request-temp', { email });
    if (!result.body.success) return res.status(result.status).json(result.body);
    const { temp_password, student_name } = result.body;
    try {
      const transport = getMailTransport();
      await transport.sendMail({
        from: `"CPP Portal" <${process.env.SMTP_USER || 'noreply@cpp.edu'}>`,
        to: email,
        subject: 'Your CPP Portal Temporary Login Code',
        html: `<div style="font-family:Inter,sans-serif;max-width:480px;margin:auto;">
          <div style="background:linear-gradient(135deg,#00236f,#004942);padding:28px;border-radius:12px 12px 0 0;">
            <h1 style="color:#fff;font-size:20px;margin:0;">CPP Portal</h1>
          </div>
          <div style="background:#f7f9fb;padding:24px;border-radius:0 0 12px 12px;">
            <p style="color:#1e293b;">Hi <strong>${student_name}</strong>,</p>
            <p style="color:#475569;font-size:14px;">Your temporary login code:</p>
            <div style="background:#00236f;color:#fff;font-family:monospace;font-size:24px;font-weight:900;
                        letter-spacing:0.2em;text-align:center;padding:18px;border-radius:10px;margin:16px 0;">${temp_password}</div>
            <p style="color:#64748b;font-size:13px;">Enter this on the login page then create your permanent password.</p>
          </div></div>`,
      });
    } catch (mailErr) {
      console.warn('[SMTP] Email not sent:', mailErr.message);
      console.log('[DEV] Temp password for', email, '=', temp_password);
    }
    res.json({ success: true, message: 'Code sent. Check your email.' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /login/student/verify — Step 2: verify code
app.post('/login/student/verify', async (req, res) => {
  try {
    const result = await flaskRequest('POST', '/api/v1/student/verify-temp', req.body);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /login/student/set-password — Step 3: set password + create session
app.post('/login/student/set-password', async (req, res) => {
  try {
    const result = await flaskRequest('POST', '/api/v1/student/set-password', req.body);
    if (!result.body.success) return res.status(result.status).json(result.body);
    const student = result.body.student;
    req.session.userId = student.user_id;
    req.session.studentId = student.id;
    req.session.sessionToken = generateSessionToken();
    req.session.user = {
      id: student.user_id,
      studentId: student.id,
      email: student.email,
      fullName: `${student.first_name} ${student.surname}`,
      firstName: student.first_name,
      lastName: student.surname,
      isTeacher: false,
      isStudent: true,
    };
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /login/student/email — Student email+password login page (already-activated accounts)
app.get('/login/student/email', async (req, res) => {
  if (req.session.userId) {
    if (req.session.user && req.session.user.isTeacher === false) {
      if (req.session.studentId) return res.redirect('/student');
    } else {
      return res.redirect('/dashboard');
    }
  }

  if (await tryRestoreSessionFromRememberToken(req) && req.session.studentId) {
    return res.redirect('/student');
  }

  res.sendFile(path.join(uiDir, 'student-email-login.html'));
});

// POST /login/student/email — Handle student email+password authentication
app.post('/login/student/email', async (req, res) => {
  try {
    const { email, password, remember } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    const result = await flaskRequest('POST', '/api/v1/student/login', { email, password, remember });

    if (!result.body || !result.body.success) {
      return res.status(result.status || 401).json({
        success: false,
        error: (result.body && result.body.error) || 'Invalid email or password',
      });
    }

    if (result.body.token) {
      res.cookie('remember_token', result.body.token, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: true });
    }

    const student = result.body.student;
    req.session.userId = student.user_id;
    req.session.studentId = student.id;
    req.session.sessionToken = generateSessionToken();
    req.session.user = {
      id: student.user_id,
      studentId: student.id,
      email: student.email,
      fullName: `${student.first_name} ${student.surname}`,
      firstName: student.first_name,
      lastName: student.surname,
      isTeacher: false,
      isStudent: true,
    };

    return res.json({ success: true });
  } catch (e) {
    console.error('Student email login error:', e);
    return res.status(500).json({ success: false, error: 'Login failed. Please try again.' });
  }
});


const handleLogout = async (req, res) => {
  const rememberToken = getRememberToken(req);

  if (rememberToken) {
    res.clearCookie('remember_token');
    try {
      await postJson(`${flaskBackendBaseUrl}/api/v1/logout`, { token: rememberToken });
    } catch (err) {
      console.error('Flask logout error:', err);
    }
  }

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).send('Logout failed');
    }
    
    if (req.get('HX-Request') === 'true') {
      res.setHeader('HX-Redirect', '/');
      return res.status(200).send('');
    }
    
    res.redirect('/');
  });
};

app.post(['/logout', '/auth/logout'], handleLogout);

// ── STUDENT PORTAL ───────────────────────────────────────────────────────────

async function requireStudentAuth(req, res, next) {
  if (req.session.userId && req.session.studentId) return next();

  if (await tryRestoreSessionFromRememberToken(req) && req.session.studentId) {
    return next();
  }

  res.redirect('/login/student');
}

// GET /student — student read-only shell
app.get('/student', requireStudentAuth, (req, res) => {
  const html = fs.readFileSync(path.join(uiDir, 'student-shell.html'), 'utf8')
    .replace('{{STUDENT_ID}}', req.session.studentId);
  res.send(html);
});

// GET /student/profile — student profile page (standalone shell)
app.get('/student/profile', requireStudentAuth, (req, res) => {
  res.sendFile(path.join(uiDir, 'student-profile-shell.html'));
});

// GET /api/student/me — logged-in student's own data + records
app.get('/api/student/me', requireStudentAuth, async (req, res) => {
  try {
    const targetStudentId = req.query.enrollment_id || req.session.studentId;
    const result = await flaskGet(`/api/v1/users/${req.session.userId}/student_dashboard?enrollment_id=${targetStudentId}`);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// (handleLogout consolidated above)

// ============= PROFILE API ENDPOINTS =============

// GET /api/profile - Get current user profile (teacher or student)
app.get('/api/profile', requireAnyAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const result = await flaskGet('/api/profile', { 'X-User-Id': String(userId) });
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/profile - Update profile
app.put('/api/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const result = await flaskRequest('PUT', '/api/v2/profile', req.body, { 'X-User-Id': String(userId) });
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/profile/change-password - Change password (teacher or student)
app.post('/api/profile/change-password', requireAnyAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const result = await flaskRequest('POST', '/api/profile/change-password', req.body, { 'X-User-Id': String(userId) });
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/profile/upload-pic - Upload profile picture (teacher or student)
app.post('/api/profile/upload-pic', requireAnyAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const result = await flaskRequest('POST', '/api/profile/upload-pic', req.body, { 'X-User-Id': String(userId) });
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/profile - Delete account
app.delete('/api/profile', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const result = await flaskRequest('DELETE', '/api/v2/profile', {}, { 'X-User-Id': String(userId) });
    
    if (result.status === 200) {
      // Clear session on successful delete
      req.session.destroy();
    }
    
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ============= APP ROUTES =============

// (/ is handled above as the landing page)

// GET /dashboard - Main app shell (requires auth)
app.get(['/dashboard', '/app'], requireAuth, (req, res) => {
  if (req.session.user && !req.session.user.isTeacher) {
    return res.redirect('/student');
  }
  res.send(renderShell('dashboard'));
});

// GET /profile - User profile page
app.get('/profile', requireAuth, (req, res) => {
  if (req.session.user && !req.session.user.isTeacher) {
    return res.redirect('/student/profile');
  }
  res.send(renderShell('profile'));
});

// GET /records - Main app shell with records view (requires auth)
app.get('/records', requireAuth, (req, res) => {
  if (req.session.user && !req.session.user.isTeacher) {
    return res.redirect('/student');
  }
  res.send(renderShell('records'));
});

// GET /students - Main app shell with students view (requires auth)
app.get('/students', requireAuth, (req, res) => {
  if (req.session.user && !req.session.user.isTeacher) {
    return res.redirect('/student');
  }
  res.send(renderShell('students'));
});

// GET /partials/:view - Get fragment content (requires auth)
app.get('/partials/:view', async (req, res) => {
  const view = req.params.view;

  // If this is a direct browser navigation (not an HTMX request), redirect to the shell
  const isHtmx = req.get('HX-Request') === 'true';
  if (!isHtmx) {
    // Map partial view to its shell route
    const shellRoutes = {
      dashboard: '/dashboard',
      records:   '/records',
      students:  '/records',
      profile:   '/profile',
    };
    const shellPath = shellRoutes[view] || '/dashboard';
    return res.redirect(shellPath);
  }

  const fileName = routes.get(view) || 'dashboard';
  const filePath = path.join(uiDir, 'partials', `${fileName}.html`);

  const publicFragments = new Set(['login', 'register', 'student-reg', 'teacher-reg']);
  if (!publicFragments.has(view) && !req.session.userId) {
    res.redirect('/login');
    return;
  }

  if (!fs.existsSync(filePath)) {
    res.status(404).send('Fragment not found');
    return;
  }

  let fileContent = fs.readFileSync(filePath, 'utf8');

  if (fileName === 'dashboard') {
    try {
      // Request stats from Flask and include the logged-in teacher id so the backend can return teacher-specific counts
      const statsResponse = await flaskGet(`/api/v1/stats`, { 'X-User-Id': String(req.session.user ? req.session.user.id : req.session.userId) });

      if (statsResponse && statsResponse.body && statsResponse.body.success) {
        const stats = statsResponse.body;
        fileContent = fileContent.replace('{{TOTAL_ENROLLED}}', Number(stats.totalEnrolled || 0).toLocaleString());
        fileContent = fileContent.replace('{{PROCESSED_RECORDS}}', Number(stats.processedRecords || 0).toLocaleString());
        fileContent = fileContent.replace('{{TOTAL_SECTIONS}}', Number(stats.totalSections || 0).toLocaleString());
        fileContent = fileContent.replace('{{TOTAL_TEACHERS}}', Number(stats.totalTeachers || 0).toLocaleString());
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      fileContent = fileContent.replace('{{TOTAL_ENROLLED}}', '---');
      fileContent = fileContent.replace('{{PROCESSED_RECORDS}}', '---');
      fileContent = fileContent.replace('{{TOTAL_SECTIONS}}', '---');
      fileContent = fileContent.replace('{{TOTAL_TEACHERS}}', '---');
    }
  }

  res.send(fileContent);
});

// ============= API ROUTES =============

// GET /api/students - Get all students
app.get('/api/students', requireAuth, async (req, res) => {
  try {
    const result = await flaskGet('/api/v1/students');
    res.status(result.status).json(result.body && result.body.students ? result.body.students : []);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// GET /api/records/:studId - Get records for a student
app.get('/api/records/:studId', requireAuth, async (req, res) => {
  try {
    const result = await flaskGet(`/api/v1/records/by-stud-id/${encodeURIComponent(req.params.studId)}`);
    res.status(result.status).json(result.body && result.body.records ? result.body.records : []);
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// ============= PART 2 API PROXY ROUTES =============

const { pipeline } = require('stream');
const FormData = require('form-data');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

async function flaskGet(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const httpMod = flaskBackendBaseUrl.startsWith('https') ? require('https') : require('http');
    const req = httpMod.get(`${flaskBackendBaseUrl}${path}`, { headers }, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try { resolve({ status: resp.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
  });
}

async function flaskRequest(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${flaskBackendBaseUrl}${path}`);
    const httpMod = url.protocol === 'https:' ? require('https') : require('http');
    const bodyStr = JSON.stringify(body || {});
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: method.toUpperCase(),
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr), ...headers }
    };
    const req = httpMod.request(options, (resp) => {
      let data = '';
      resp.on('data', c => data += c);
      resp.on('end', () => {
        try { resolve({ status: resp.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

// GET /api/sections  — list teacher's sections
app.get('/api/sections', requireAuth, async (req, res) => {
  try {
    const teacherId = req.session.user.id;
    const result = await flaskGet(`/api/v1/sections?teacher_id=${teacherId}`);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/sections  — create a new section
app.post('/api/sections', requireAuth, async (req, res) => {
  try {
    const teacherId = req.session.user.id;
    const result = await flaskRequest('POST', '/api/v1/sections', { ...req.body, teacher_id: teacherId });
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/sections/:id  — section detail + groups
app.get('/api/sections/:id', requireAuth, async (req, res) => {
  try {
    const result = await flaskGet(`/api/v1/sections/${req.params.id}`);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/sections/:id  — delete a section
app.delete('/api/sections/:id', requireAuth, async (req, res) => {
  try {
    const result = await flaskRequest('DELETE', `/api/v1/sections/${req.params.id}`);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/sections/:id/import  — CSV import (multipart)
app.post('/api/sections/:id/import', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
    const form = new FormData();
    form.append('file', req.file.buffer, { filename: req.file.originalname, contentType: 'text/csv' });
    const url = new URL(`${flaskBackendBaseUrl}/api/v1/sections/${req.params.id}/import`);
    const httpMod = url.protocol === 'https:' ? require('https') : require('http');
    const options = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: form.getHeaders()
    };
    const flaskReq = httpMod.request(options, (flaskResp) => {
      let data = '';
      flaskResp.on('data', c => data += c);
      flaskResp.on('end', () => {
        try { res.status(flaskResp.statusCode).json(JSON.parse(data)); }
        catch (e) { res.status(500).json({ success: false, error: 'Parse error' }); }
      });
    });
    flaskReq.on('error', (e) => res.status(500).json({ success: false, error: e.message }));
    form.pipe(flaskReq);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/groups/:id  — group detail + members
app.get('/api/groups/:id', requireAuth, async (req, res) => {
  try {
    const result = await flaskGet(`/api/v1/groups/${req.params.id}`);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/sections/:id/groups  — create a new group
app.post('/api/sections/:id/groups', requireAuth, async (req, res) => {
  try {
    const result = await flaskRequest('POST', `/api/v1/sections/${req.params.id}/groups`, req.body);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/groups/:id  — delete a group and its members
app.delete('/api/groups/:id', requireAuth, async (req, res) => {
  try {
    const result = await flaskRequest('DELETE', `/api/v1/groups/${req.params.id}`);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/groups/:id/students  — add a single student to a group
app.post('/api/groups/:id/students', requireAuth, async (req, res) => {
  try {
    const result = await flaskRequest('POST', `/api/v1/groups/${req.params.id}/students`, req.body);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/students/:id  — remove a student from the system
app.delete('/api/students/:id', requireAuth, async (req, res) => {
  try {
    const result = await flaskRequest('DELETE', `/api/v1/students/${req.params.id}`);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/students/:id  — student detail (for index card)
app.get('/api/students/:id', requireAuth, async (req, res) => {
  try {
    const result = await flaskGet(`/api/v1/students/${req.params.id}`);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/students/:id/records  — get student records
app.get('/api/students/:id/records', requireAuth, async (req, res) => {
  try {
    const result = await flaskGet(`/api/v1/students/${req.params.id}/records`);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/students/:id/records  — add a record
app.post('/api/students/:id/records', requireAuth, async (req, res) => {
  try {
    const result = await flaskRequest('POST', `/api/v1/students/${req.params.id}/records`, req.body);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/records/:id  — update record
app.put('/api/records/:id', requireAuth, async (req, res) => {
  try {
    const result = await flaskRequest('PUT', `/api/v1/records/${req.params.id}`, req.body);
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/records/:id  — delete record
app.delete('/api/records/:id', requireAuth, async (req, res) => {
  try {
    const result = await flaskRequest('DELETE', `/api/v1/records/${req.params.id}`, {});
    res.status(result.status).json(result.body);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});



function listen(port) {
  const server = app.listen(port, () => {
    console.log(`CPP v0.6 running at http://localhost:${port}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is busy, trying ${port + 1}`);
      listen(port + 1);
    } else {
      throw error;
    }
  });
}

listen(currentPort);