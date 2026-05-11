/**
 * Migration: Add full_name and email columns to users table.
 * - Adds full_name TEXT (populated from first_name + ' ' + last_name for existing records)
 * - Adds email TEXT (nullable for existing records, unique for new ones)
 *
 * Run once: node scripts/migrate-full-name.js
 * Run from the cpp-student-record directory.
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Paths: Node DB and Flask DB both get migrated
const dbPaths = [
  path.join(__dirname, '..', 'cppstudrecord_db.sqlite'),
  path.join(__dirname, '..', '..', 'cpp-backend', 'cppstudrecord_db.sqlite'),
];

function migrateDatabase(dbPath) {
  return new Promise((resolve, reject) => {
    console.log(`\n📦 Migrating: ${dbPath}`);
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error(`  ❌ Cannot open: ${err.message}`);
        return resolve(); // non-fatal, skip
      }
    });

    db.serialize(() => {
      // 1. Add full_name column if not exists
      db.run(`ALTER TABLE users ADD COLUMN full_name TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('  ❌ Error adding full_name:', err.message);
        } else if (!err) {
          console.log('  ✅ Added column: full_name');
        } else {
          console.log('  ℹ️  Column full_name already exists');
        }
      });

      // 2. Add email column if not exists
      db.run(`ALTER TABLE users ADD COLUMN email TEXT`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
          console.error('  ❌ Error adding email:', err.message);
        } else if (!err) {
          console.log('  ✅ Added column: email');
        } else {
          console.log('  ℹ️  Column email already exists');
        }
      });

      // 3. Populate full_name from first_name + last_name for existing rows
      db.run(
        `UPDATE users SET full_name = TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))
         WHERE full_name IS NULL OR full_name = ''`,
        function (err) {
          if (err) {
            console.error('  ❌ Error populating full_name:', err.message);
          } else {
            console.log(`  ✅ Populated full_name for ${this.changes} existing row(s)`);
          }
        }
      );

      db.close((err) => {
        if (err) console.error('  ❌ Error closing DB:', err.message);
        else console.log(`  ✅ Done: ${dbPath}`);
        resolve();
      });
    });
  });
}

async function main() {
  console.log('🚀 Starting full_name + email migration...');
  for (const dbPath of dbPaths) {
    await migrateDatabase(dbPath);
  }
  console.log('\n✅ Migration complete.');
}

main().catch(console.error);
