const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'cppstudrecord_db.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('Connected to database');
    db.run('PRAGMA foreign_keys = ON');
  }
});

// Promisify database methods
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
}

/**
 * Get a user by ID
 */
async function getUserById(id) {
  return get('SELECT * FROM users WHERE id = ?', [id]);
}

/**
 * Get a user by student ID
 */
async function getUserByStudId(studId) {
  return get('SELECT * FROM users WHERE stud_id = ?', [studId]);
}

/**
 * Create a new user
 */
async function createUser(userData) {
  const {
    isTeacher,
    studId,
    firstName,
    lastName,
    year,
    section,
    groupName,
    password,
  } = userData;

  const hashedPassword = bcrypt.hashSync(password, 10);

  const sql = `INSERT INTO users (is_teacher, stud_id, first_name, last_name, year, section, group_name, password)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  
  const result = await run(sql, [
    isTeacher ? 1 : 0,
    studId || null,
    firstName,
    lastName,
    year || null,
    section || null,
    groupName || null,
    hashedPassword,
  ]);

  return result.lastID;
}

/**
 * Verify password for a user
 */
async function verifyPassword(userId, password) {
  const user = await getUserById(userId);
  if (!user) return false;
  return bcrypt.compareSync(password, user.password);
}

/**
 * Create a new record
 */
async function createRecord(recordData) {
  const { studId, date, typeOfUndertaking, totalScore, score, remarks } = recordData;

  const sql = `INSERT INTO record (stud_id, date, type_of_undertaking, total_score, score, remarks)
     VALUES (?, ?, ?, ?, ?, ?)`;

  const result = await run(sql, [studId, date, typeOfUndertaking, totalScore, score, remarks || null]);

  return result.lastID;
}

/**
 * Get all records for a student
 */
async function getStudentRecords(studId) {
  return all('SELECT * FROM record WHERE stud_id = ? ORDER BY date DESC', [studId]);
}

/**
 * Get a single record by ID
 */
async function getRecordById(id) {
  return get('SELECT * FROM record WHERE id = ?', [id]);
}

/**
 * Update a record
 */
async function updateRecord(id, recordData) {
  const { date, typeOfUndertaking, totalScore, score, remarks } = recordData;

  const sql = `UPDATE record SET date = ?, type_of_undertaking = ?, total_score = ?, score = ?, remarks = ? WHERE id = ?`;

  return run(sql, [date, typeOfUndertaking, totalScore, score, remarks || null, id]);
}

/**
 * Get all students
 */
async function getAllStudents() {
  return all(
    'SELECT * FROM users WHERE is_teacher = 0 ORDER BY last_name, first_name'
  );
}

/**
 * Get all teachers
 */
async function getAllTeachers() {
  return all(
    'SELECT * FROM users WHERE is_teacher = 1 ORDER BY last_name, first_name'
  );
}

module.exports = {
  db,
  getUserById,
  getUserByStudId,
  createUser,
  verifyPassword,
  createRecord,
  getStudentRecords,
  getRecordById,
  updateRecord,
  getAllStudents,
  getAllTeachers,
};
