# Database Setup Guide

## Database: `cppstudrecord_db`

SQLite3 database for the Registrar Pro student record management system.

### Quick Start

1. **Initialize the database:**
   ```bash
   npm run db:init
   ```

2. **Seed with test data (optional):**
   ```bash
   npm run db:seed
   ```

3. **Run the application:**
   ```bash
   npm run dev
   ```

---

## Schema

### Table: `users`

Stores user accounts (students and teachers).

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique user identifier |
| `is_teacher` | BOOLEAN | NOT NULL, DEFAULT 0 | 1 = teacher, 0 = student |
| `stud_id` | TEXT | UNIQUE, NULLABLE | Student/Teacher ID (e.g., "2024-0012") |
| `first_name` | TEXT | NOT NULL | User''s first name |
| `last_name` | TEXT | NOT NULL | User''s last name |
| `year` | INTEGER | NULLABLE | Year of study (for students) |
| `section` | INTEGER | NULLABLE | Section/Class number |
| `group_name` | TEXT | NULLABLE | Group/Faculty name |
| `password` | TEXT | NOT NULL | Bcrypt hashed password |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Account creation time |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update time |

**Example:**
```sql
INSERT INTO users (is_teacher, stud_id, first_name, last_name, year, section, password)
VALUES (0, ''2024-0012'', ''Elena'', ''Garcia'', 3, 1, ''$2a$10$...'');
```

---

### Table: `record`

Stores academic records and undertakings for students.

| Column | Type | Constraints | Notes |
|--------|------|-----------|-------|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Record identifier |
| `stud_id` | TEXT | NOT NULL, FK | References `users.stud_id` |
| `date` | TIMESTAMP | NOT NULL, DEFAULT CURRENT_TIMESTAMP | Record date |
| `type_of_undertaking` | TEXT | NOT NULL | Course/Activity name |
| `total_score` | REAL | NULLABLE | Maximum possible score |
| `score` | REAL | NOT NULL | Actual score obtained |
| `remarks` | TEXT | NULLABLE | Additional notes/comments |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update time |

**Foreign Key:**
- `stud_id` ? `users.stud_id` (ON DELETE CASCADE)

**Example:**
```sql
INSERT INTO record (stud_id, type_of_undertaking, total_score, score, remarks)
VALUES (''2024-0012'', ''CS101 - Intro to CS'', 100, 92, ''Excellent performance'');
```

---

## Indexes

For optimal query performance, the following indexes are created:

```sql
CREATE INDEX idx_users_stud_id ON users(stud_id);
CREATE INDEX idx_users_is_teacher ON users(is_teacher);
CREATE INDEX idx_record_stud_id ON record(stud_id);
CREATE INDEX idx_record_date ON record(date);
```

---

## Database API (`src/db.js`)

### User Operations

**Get user by ID:**
```javascript
const user = await getUserById(1);
```

**Get user by Student ID:**
```javascript
const user = await getUserByStudId(''2024-0012'');
```

**Create a new user:**
```javascript
const userId = await createUser({
  isTeacher: false,
  studId: ''2024-0012'',
  firstName: ''Elena'',
  lastName: ''Garcia'',
  year: 3,
  section: 1,
  groupName: ''Group A'',
  password: ''student123'' // will be hashed
});
```

**Verify password:**
```javascript
const isValid = await verifyPassword(userId, ''student123'');
```

**Get all students:**
```javascript
const students = await getAllStudents();
```

**Get all teachers:**
```javascript
const teachers = await getAllTeachers();
```

---

### Record Operations

**Create a record:**
```javascript
const recordId = await createRecord({
  studId: ''2024-0012'',
  date: new Date().toISOString(),
  typeOfUndertaking: ''CS101 - Introduction to CS'',
  totalScore: 100,
  score: 92,
  remarks: ''Excellent performance''
});
```

**Get all records for a student:**
```javascript
const records = await getStudentRecords(''2024-0012'');
```

**Get a single record:**
```javascript
const record = await getRecordById(1);
```

**Update a record:**
```javascript
await updateRecord(1, {
  date: new Date().toISOString(),
  typeOfUndertaking: ''CS101 - Introduction to CS'',
  totalScore: 100,
  score: 95,
  remarks: ''Updated score''
});
```

---

## Security

- **Passwords:** Hashed using bcryptjs (10 salt rounds)
- **Foreign Keys:** Enabled to maintain referential integrity
- **Parameterized Queries:** All queries use parameterized statements to prevent SQL injection

---

## File Location

Database file: `cppstudrecord_db.sqlite`

Located in the project root directory.

---

## Troubleshooting

### Database already exists error
The initialization script checks if the database exists before creating it. Delete `cppstudrecord_db.sqlite` to reinitialize:
```bash
rm cppstudrecord_db.sqlite
npm run db:init
```

### Foreign key constraint failed
Ensure `stud_id` in the `record` table exists in the `users` table with the same value.

### Cannot find module error
Make sure all dependencies are installed:
```bash
npm install
```

