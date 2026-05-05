const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'cppstudrecord_db.sqlite');
const dbExists = fs.existsSync(dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }

  db.run('PRAGMA foreign_keys = ON');

  if (!dbExists) {
    console.log('Creating database tables...');

    const createUsersTable = `
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        is_teacher BOOLEAN NOT NULL DEFAULT 0,
        stud_id TEXT UNIQUE,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        year INTEGER,
        section INTEGER,
        group_name TEXT,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createRecordTable = `
      CREATE TABLE record (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stud_id TEXT NOT NULL,
        date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        type_of_undertaking TEXT NOT NULL,
        total_score REAL,
        score REAL NOT NULL,
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (stud_id) REFERENCES users(stud_id) ON DELETE CASCADE
      )
    `;

    db.run(createUsersTable, (err) => {
      if (err) {
        console.error('Error creating users table:', err);
        process.exit(1);
      }
      console.log('? Created users table');

      db.run(createRecordTable, (err) => {
        if (err) {
          console.error('Error creating record table:', err);
          process.exit(1);
        }
        console.log('? Created record table');

        db.run('CREATE INDEX idx_users_stud_id ON users(stud_id)');
        db.run('CREATE INDEX idx_users_is_teacher ON users(is_teacher)');
        db.run('CREATE INDEX idx_record_stud_id ON record(stud_id)');
        db.run('CREATE INDEX idx_record_date ON record(date)', (err) => {
          if (!err) {
            console.log('? Created indexes');
            console.log('? Database initialized successfully');
            console.log('? Database file:', dbPath);
          }
          db.close();
        });
      });
    });
  } else {
    console.log('? Database already exists at:', dbPath);
    db.close();
  }
});
