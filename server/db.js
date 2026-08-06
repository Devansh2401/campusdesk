const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

let db = null;

async function getDb() {
  if (!db) {
    db = await open({
      filename: path.join(__dirname, 'campusdesk.db'),
      driver: sqlite3.Database
    });
    
    await db.exec('PRAGMA foreign_keys = ON;');
  }
  return db;
}

async function initDb() {
  const database = await getDb();

  await database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT CHECK(role IN ('student', 'admin')) NOT NULL DEFAULT 'student',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      location TEXT NOT NULL,
      category TEXT CHECK(category IN ('hall', 'equipment', 'room', 'other')) NOT NULL,
      openTime TEXT NOT NULL, -- Format: HH:MM, e.g. "09:00"
      closeTime TEXT NOT NULL, -- Format: HH:MM, e.g. "21:00"
      availableDays TEXT DEFAULT '0,1,2,3,4,5,6', -- Comma-separated day indices (0=Sun, 1=Mon, ..., 6=Sat)
      shifts TEXT DEFAULT '09:00-21:00', -- Comma-separated shift windows
      isActive INTEGER DEFAULT 1 -- 1 for active, 0 for soft-deleted
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      resourceId INTEGER NOT NULL,
      startTime TEXT NOT NULL, -- Format: ISO8601 string, e.g. "2026-08-06T10:00:00"
      endTime TEXT NOT NULL,
      purpose TEXT NOT NULL,
      status TEXT CHECK(status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'completed')) NOT NULL DEFAULT 'pending',
      reminderSent INTEGER DEFAULT 0, -- 1 if sent, 0 otherwise
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(resourceId) REFERENCES resources(id) ON DELETE CASCADE
    );
  `);

  const resourceColumns = await database.all("PRAGMA table_info(resources)");
  
  const hasAvailableDays = resourceColumns.some(col => col.name === 'availableDays');
  if (!hasAvailableDays) {
    await database.exec("ALTER TABLE resources ADD COLUMN availableDays TEXT DEFAULT '0,1,2,3,4,5,6';");
    console.log('[MIGRATION] Added availableDays column to resources table.');
  }

  const hasShifts = resourceColumns.some(col => col.name === 'shifts');
  if (!hasShifts) {
    await database.exec("ALTER TABLE resources ADD COLUMN shifts TEXT DEFAULT '09:00-21:00';");
    console.log('[MIGRATION] Added shifts column to resources table.');
  }

  const bookingSqlRow = await database.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='bookings'");
  if (bookingSqlRow && !bookingSqlRow.sql.includes('pending')) {
    console.log('[MIGRATION] Old bookings status constraint detected. Rebuilding bookings table...');

    await database.exec('PRAGMA foreign_keys = OFF;');

    await database.exec('ALTER TABLE bookings RENAME TO bookings_old;');

    await database.exec(`
      CREATE TABLE bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER NOT NULL,
        resourceId INTEGER NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        purpose TEXT NOT NULL,
        status TEXT CHECK(status IN ('pending', 'confirmed', 'rejected', 'cancelled', 'completed')) NOT NULL DEFAULT 'pending',
        reminderSent INTEGER DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(resourceId) REFERENCES resources(id) ON DELETE CASCADE
      );
    `);

    await database.exec(`
      INSERT INTO bookings (id, userId, resourceId, startTime, endTime, purpose, status, reminderSent, createdAt)
      SELECT id, userId, resourceId, startTime, endTime, purpose, 
             CASE WHEN status = 'confirmed' THEN 'confirmed' ELSE status END,
             reminderSent, createdAt 
      FROM bookings_old;
    `);

    await database.exec('DROP TABLE bookings_old;');

    await database.exec('PRAGMA foreign_keys = ON;');
    console.log('[MIGRATION] Rebuilt bookings table successfully.');
  }

  await database.exec(`
    CREATE TABLE IF NOT EXISTS otp_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      requestedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await database.exec(`
    CREATE TABLE IF NOT EXISTS otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      name TEXT,
      otp TEXT NOT NULL,
      expiresAt TEXT NOT NULL,
      used INTEGER DEFAULT 0
    );
  `);

  console.log('Database initialized successfully.');
}

module.exports = {
  getDb,
  initDb
};
