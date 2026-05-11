const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('F:/lex all/LEX FILES/BACKUP/cpp/cpp-backend/cppstudrecord_db.sqlite');
db.serialize(() => {
  db.all("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name", (err, rows) => {
    if (err) { console.error(err); return; }
    rows.forEach(r => {
      console.log('\n=== TABLE:', r.name, '===');
      console.log(r.sql);
    });
    db.close();
  });
});
