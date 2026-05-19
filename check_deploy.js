#!/usr/bin/env node
/**
 * Preflight checks before deploying cpp-student-record to Railway.
 * Usage: node check_deploy.js
 */
require('dotenv').config();

const http = require('http');
const https = require('https');
const { URL } = require('url');

const required = ['FLASK_BACKEND_URL', 'DATABASE_URL', 'SESSION_SECRET'];
const recommended = ['NODE_ENV'];

let exitCode = 0;

function ok(msg) {
  console.log(`OK  ${msg}`);
}

function warn(msg) {
  console.log(`WARN ${msg}`);
}

function fail(msg) {
  console.log(`FAIL ${msg}`);
  exitCode = 1;
}

console.log('CPP web app — deploy preflight\n');

for (const key of required) {
  if (!process.env[key]) {
    fail(`${key} is not set`);
  } else {
    ok(`${key} is set`);
  }
}

if (process.env.SESSION_SECRET === 'change-me-in-production'
    || process.env.SESSION_SECRET === 'your-secret-key-change-this') {
  fail('SESSION_SECRET is still the default placeholder');
}

// Check Email service configuration
if (process.env.RESEND_API_KEY) {
  ok('RESEND_API_KEY is set (using Resend HTTP API for emails)');
} else if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  ok('SMTP credentials (SMTP_USER/SMTP_PASS) are set (using SMTP for emails)');
} else {
  warn('Neither RESEND_API_KEY nor SMTP credentials (SMTP_USER/SMTP_PASS) are set (student email login may not work)');
}

for (const key of recommended) {
  if (!process.env[key]) {
    warn(`${key} is not set`);
  }
}

const flaskUrl = process.env.FLASK_BACKEND_URL;
if (flaskUrl && flaskUrl.startsWith('http://') && process.env.NODE_ENV === 'production') {
  warn('FLASK_BACKEND_URL uses http:// in production — prefer https://');
}

function get(urlString) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(url, (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('timeout')));
  });
}

(async () => {
  if (!flaskUrl) {
    process.exit(exitCode);
  }

  try {
    const healthUrl = `${flaskUrl.replace(/\/$/, '')}/api/v1/health`;
    const result = await get(healthUrl);
    if (result.status === 200 && result.body?.database === 'pg') {
      ok(`Flask backend reachable (${healthUrl}) — database: pg`);
    } else if (result.status === 200) {
      ok(`Flask backend reachable (${healthUrl})`);
      warn(`Unexpected health response: ${JSON.stringify(result.body)}`);
    } else {
      fail(`Flask health returned ${result.status}: ${JSON.stringify(result.body)}`);
    }
  } catch (err) {
    fail(`Cannot reach Flask backend: ${err.message}`);
  }

  process.exit(exitCode);
})();
