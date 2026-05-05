# SQLite Database Setup - Complete

## Database Created ?

Your SQLite database `cppstudrecord_db.sqlite` has been successfully initialized!

### Database Location
```
d:\LEX FILES\plv 3rdyr\2er\integ\cpp-student-record\cppstudrecord_db.sqlite
```

---

## Quick Commands

### Initialize Database
If you need to recreate the database from scratch:
```bash
npm run db:init
```

### Seed with Test Data
Add sample data for testing:
```bash
npm run db:seed
```

### Start the App
```bash
npm run dev
```
The app will be available at http://localhost:3001 (or next available port)

---

## Database Schema

### Table 1: `users`
Stores all user accounts (students and teachers)

| Field | Type | Notes |
|-------|------|-------|
| `id` | INTEGER | Auto-incremented primary key |
| `is_teacher` | BOOLEAN | 1 = teacher, 0 = student |
| `stud_id` | TEXT | Unique student/teacher ID (e.g., "2024-0012") |
| `first_name` | TEXT | User''s first name |
| `last_name` | TEXT | User''s last name |
| `year` | INTEGER | Year of study (optional, for students) |
| `section` | INTEGER | Section/class number (optional) |
| `group_name` | TEXT | Group or faculty name (optional) |
| `password` | TEXT | Bcrypt hashed password (never plain text!) |
| `created_at` | TIMESTAMP | Account creation time |
| `updated_at` | TIMESTAMP | Last update time |

### Table 2: `record`
Stores academic records and undertakings for students

| Field | Type | Notes |
|-------|------|-------|
| `id` | INTEGER | Auto-incremented primary key |
| `stud_id` | TEXT | Foreign key to users.stud_id |
| `date` | TIMESTAMP | Date of the record |
| `type_of_undertaking` | TEXT | Course name or activity description |
| `total_score` | REAL | Maximum possible score (optional) |
| `score` | REAL | Actual score obtained |
| `remarks` | TEXT | Comments or notes (optional) |
| `created_at` | TIMESTAMP | Record creation time |
| `updated_at` | TIMESTAMP | Last update time |

---

## Using the Database in Your App

### Import the Database Module
```javascript
const { 
  getUserById, 
  getUserByStudId, 
  createUser, 
  verifyPassword,
  createRecord,
  getStudentRecords,
  getAllStudents,
  getAllTeachers 
} = require('./src/db');
```

### Create a User
```javascript
const userId = await createUser({
  isTeacher: false,
  studId: '2024-0012',
  firstName: 'Elena',
  lastName: 'Garcia',
  year: 3,
  section: 1,
  groupName: 'Group A',
  password: 'student123' // will be hashed automatically
});
```

### Get User Information
```javascript
// By user ID
const user = await getUserById(1);

// By student ID
const user = await getUserByStudId('2024-0012');

// Get all students
const students = await getAllStudents();

// Get all teachers
const teachers = await getAllTeachers();
```

### Verify Password
```javascript
const isPasswordValid = await verifyPassword(userId, 'student123');
if (isPasswordValid) {
  console.log('Password is correct!');
}
```

### Create a Record
```javascript
const recordId = await createRecord({
  studId: '2024-0012',
  date: new Date().toISOString(),
  typeOfUndertaking: 'CS101 - Introduction to Computer Science',
  totalScore: 100,
  score: 92,
  remarks: 'Excellent performance'
});
```

### Get Student Records
```javascript
const records = await getStudentRecords('2024-0012');
records.forEach(record => {
  console.log(`${record.type_of_undertaking}: ${record.score}/${record.total_score}`);
});
```

### Update a Record
```javascript
await updateRecord(recordId, {
  date: new Date().toISOString(),
  typeOfUndertaking: 'CS101 - Introduction to Computer Science',
  totalScore: 100,
  score: 95,
  remarks: 'Updated score - excellent work!'
});
```

---

## File Structure

```
cpp-student-record/
+-- cppstudrecord_db.sqlite      ? Your database file
+-- src/
¦   +-- db.js                     ? Database API
¦   +-- input.css
¦   +-- output.css
¦   +-- ...
+-- scripts/
¦   +-- init-db.js                ? Database initialization
¦   +-- seed-db.js                ? Test data seeding
+-- DATABASE.md                   ? Full database documentation
+-- app.js                         ? Express server
+-- package.json
+-- ...
```

---

## Security Notes

? **Passwords:** All passwords are automatically hashed using bcryptjs (10 salt rounds)
? **SQL Injection:** All queries use parameterized statements
? **Foreign Keys:** Database enforces referential integrity
? **Data Validation:** Implement validation on the application layer

---

## Test Credentials (After Seeding)

If you run `npm run db:seed`, these test accounts will be available:

**Students:**
- ID: 2024-0012, Name: Elena Garcia, Password: student123
- ID: 2024-0089, Name: Michael Torres, Password: student456

**Teacher:**
- Name: Sarah Jenkins, Password: teacher123

---

## Next Steps

1. **Integrate with Forms:** Wire your HTML forms to use the database
2. **Add Authentication:** Create login/logout endpoints using password verification
3. **Populate Records:** Add API endpoints to create and retrieve student records
4. **Generate Reports:** Create endpoints to query and report on student data

---

See DATABASE.md for complete API documentation.
