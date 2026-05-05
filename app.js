const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const session = require('express-session');
const { URL } = require('url');
const { getUserByStudId, verifyPassword, getAllStudents, getStudentRecords } = require('./src/db');

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: 'your-secret-key-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Static files
app.use('/src', express.static(srcDir));
app.use('/ui', express.static(uiDir));

// Routes map
const routes = new Map([
  ['dashboard', 'dashboard'],
  ['records', 'records'],
  ['students', 'students'],
  ['records-student', 'students'],
  ['login', 'login'],
  ['register', 'register'],
  ['student-reg', 'student-reg'],
  ['teacher-reg', 'teacher-reg'],
]);

// Middleware to check authentication
async function requireAuth(req, res, next) {
  if (req.session.userId) {
    return next();
  }

  // Try to use remember_token
  let rememberToken = null;
  if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('remember_token=')) {
        rememberToken = cookie.substring('remember_token='.length);
        break;
      }
    }
  }

  if (rememberToken) {
    try {
      const backendResult = await postJson(`${flaskBackendBaseUrl}/api/v1/verify_token`, { token: rememberToken });
      if (backendResult.statusCode === 200 && backendResult.body && backendResult.body.success) {
        const user = backendResult.body.user;
        req.session.userId = user.id;
        req.session.user = {
          id: user.id,
          studId: user.studId || user.stud_id,
          firstName: user.firstName || user.first_name,
          lastName: user.lastName || user.last_name,
          isTeacher: user.isTeacher !== undefined ? user.isTeacher : user.is_teacher
        };
        return next();
      }
    } catch (error) {
      console.error('Token verification error:', error);
    }
  }

  res.redirect('/login');
}

// Middleware to redirect if authenticated
async function redirectIfAuth(req, res, next) {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }

  if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').map(c => c.trim());
    let rememberToken = null;
    for (const cookie of cookies) {
      if (cookie.startsWith('remember_token=')) {
        rememberToken = cookie.substring('remember_token='.length);
        break;
      }
    }

    if (rememberToken) {
      try {
        const verifyResult = await postJson(`${flaskBackendBaseUrl}/api/v1/verify_token`, { token: rememberToken });
        if (verifyResult.statusCode === 200 && verifyResult.body && verifyResult.body.success) {
          const user = verifyResult.body.user;
          req.session.userId = user.id;
          req.session.user = user;
          return res.redirect('/dashboard');
        }
      } catch (error) {
        // Token verification failed, proceed to unauthenticated route
      }
    }
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

async function handleLogin(req, res) {
  try {
    const { firstName, lastName, password } = req.body;

    if (!firstName || !lastName || !password) {
      return sendFormError(req, res, '/login', 'First name, last name, and password are required');
    }

    const loginPayload = {
      first_name: firstName,
      last_name: lastName,
      password: password,
      remember: req.body.remember === 'on' || req.body.remember === true || req.body.remember === 'true'
    };

    const backendResult = await postJson(`${flaskBackendBaseUrl}/api/v1/login`, loginPayload);

    if (backendResult.statusCode < 200 || backendResult.statusCode >= 300 || !backendResult.body || backendResult.body.success !== true) {
      const errorMessage = backendResult.body && typeof backendResult.body === 'object'
        ? backendResult.body.error || backendResult.body.message || 'Invalid credentials'
        : 'Login failed';
      return sendFormError(req, res, '/login', errorMessage);
    }

    const user = backendResult.body.user;

    // Store user in session
    req.session.userId = user.id;
    req.session.user = {
      id: user.id,
      studId: user.studId || user.stud_id,
      firstName: user.firstName || user.first_name,
      lastName: user.lastName || user.last_name,
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
      '/login',
      backendUnavailable ? 'Unable to reach the Flask backend' : 'Login failed'
    );
  }
}

// GET /login - Show login page
app.get(['/login', '/auth/login'], redirectIfAuth, (req, res) => {
  res.send(renderAuthPage('login.html', req.query.error));
});

// POST /login - Handle login
app.post(['/login', '/auth/login'], handleLogin);

// GET /register - Show registration page
app.get(['/register', '/auth/register'], redirectIfAuth, (req, res) => {
  res.send(renderAuthPage('register.html', req.query.error));
});

// POST /register - Handle registration
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

    const registrationPayload = {
      role: isTeacher ? 'teacher' : 'student',
      first_name: firstName,
      last_name: lastName,
      password,
    };

    if (isTeacher) {
      const teacherStudId = getField(req.body, ['stud_id', 'studId']);
      if (teacherStudId) {
        registrationPayload.stud_id = teacherStudId;
      }
    } else {
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
    }

    const backendResult = await postJson(`${flaskBackendBaseUrl}/api/v1/register`, registrationPayload);

    if (backendResult.statusCode < 200 || backendResult.statusCode >= 300 || !backendResult.body || backendResult.body.success !== true) {
      const errorMessage = backendResult.body && typeof backendResult.body === 'object'
        ? backendResult.body.error || backendResult.body.message || 'Registration failed'
        : 'Registration failed';

      return sendFormError(req, res, '/register', errorMessage);
    }

    const createdUser = backendResult.body.user || {};
    const resolvedStudId = createdUser.studId || createdUser.stud_id || registrationPayload.stud_id || '';
    const resolvedFirstName = createdUser.firstName || createdUser.first_name || firstName;
    const resolvedLastName = createdUser.lastName || createdUser.last_name || lastName;
    const resolvedIsTeacher = typeof createdUser.isTeacher === 'boolean'
      ? createdUser.isTeacher
      : typeof createdUser.is_teacher === 'boolean'
        ? createdUser.is_teacher
        : isTeacher;

    // Auto-login after registration
    req.session.userId = createdUser.id || req.session.userId;
    req.session.user = {
      id: createdUser.id || req.session.userId,
      studId: resolvedStudId,
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      isTeacher: resolvedIsTeacher
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

// POST /auth/logout - Handle logout
app.post('/auth/logout', async (req, res) => {
  let rememberToken = null;
  if (req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').map(c => c.trim());
    for (const cookie of cookies) {
      if (cookie.startsWith('remember_token=')) {
        rememberToken = cookie.substring('remember_token='.length);
        break;
      }
    }
  }

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
      res.setHeader('HX-Redirect', '/login');
      return res.status(200).send('');
    }
    
    res.redirect('/login');
  });
});

// ============= APP ROUTES =============

// GET / - Redirect to login
app.get('/', redirectIfAuth, (req, res) => {
  res.redirect('/login');
});

// GET /dashboard - Main app shell (requires auth)
app.get(['/dashboard', '/app'], requireAuth, (req, res) => {
  res.send(renderShell('dashboard'));
});

// GET /records - Main app shell with records view (requires auth)
app.get('/records', requireAuth, (req, res) => {
  res.send(renderShell('records'));
});

// GET /students - Main app shell with students view (requires auth)
app.get('/students', requireAuth, (req, res) => {
  res.send(renderShell('students'));
});

// GET /partials/:view - Get fragment content (requires auth)
app.get('/partials/:view', async (req, res) => {
  const view = req.params.view;
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
      const statsResponse = await new Promise((resolve, reject) => {
        const httpModule = flaskBackendBaseUrl.startsWith('https') ? require('https') : require('http');
        const request = httpModule.get(`${flaskBackendBaseUrl}/api/v1/stats`, (response) => {
          let data = '';
          response.on('data', chunk => data += chunk);
          response.on('end', () => resolve(JSON.parse(data)));
        });
        request.on('error', reject);
      });

      if (statsResponse.success) {
        fileContent = fileContent.replace('{{TOTAL_ENROLLED}}', statsResponse.totalEnrolled.toLocaleString());
        fileContent = fileContent.replace('{{PROCESSED_RECORDS}}', statsResponse.processedRecords.toLocaleString());
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
      fileContent = fileContent.replace('{{TOTAL_ENROLLED}}', '---');
      fileContent = fileContent.replace('{{PROCESSED_RECORDS}}', '---');
    }
  }

  res.send(fileContent);
});

// ============= API ROUTES =============

// GET /api/students - Get all students
app.get('/api/students', requireAuth, async (req, res) => {
  try {
    const students = await getAllStudents();
    res.json(students);
  } catch (error) {
    console.error('Error fetching students:', error);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
});

// GET /api/records/:studId - Get records for a student
app.get('/api/records/:studId', requireAuth, async (req, res) => {
  try {
    const records = await getStudentRecords(req.params.studId);
    res.json(records);
  } catch (error) {
    console.error('Error fetching records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// ============= SERVER START =============

function listen(port) {
  const server = app.listen(port, () => {
    console.log(`Registrar Pro running at http://localhost:${port}`);
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