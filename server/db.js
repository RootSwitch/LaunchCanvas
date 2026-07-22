'use strict';
// SQLite via better-sqlite3, same shape as the rest of the family - but the
// portal barely needs it: settings (password hash, tile URL overrides) and
// sessions. No history, no pruning jobs.

const path = require('node:path');
const fs = require('node:fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.LAUNCHCANVAS_DATA || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'launchcanvas.db'));
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  username   TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password   TEXT NOT NULL,
  created_ts INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  username   TEXT,
  created_ts INTEGER NOT NULL,
  expires_ts INTEGER NOT NULL
);
`);

// --- lightweight migrations for databases created by earlier versions ---
const sessionCols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
if (!sessionCols.includes('username')) db.exec('ALTER TABLE sessions ADD COLUMN username TEXT');

// 0.1.x stored ONE shared password in settings. It becomes the first user,
// named admin, keeping the same hash - nobody re-enters anything.
(function migrateSinglePassword() {
    const legacy = db.prepare("SELECT value FROM settings WHERE key = 'password'").get();
    if (!legacy) return;
    const count = db.prepare('SELECT count(*) AS c FROM users').get().c;
    if (count === 0) {
        db.prepare('INSERT INTO users (username, password, created_ts) VALUES (?, ?, ?)')
            .run('admin', legacy.value, Math.floor(Date.now() / 1000));
    }
    db.prepare("DELETE FROM settings WHERE key = 'password'").run();
})();

// Tile URL overrides: empty string = derive from the browser's own location
// (portal hostname + each app's stock port). Set a value only when an app
// lives somewhere unusual.
const DEFAULTS = {
    url_crosscanvas: '',
    url_pingcanvas: '',
    url_snmpcanvas: '',
    url_syslogcanvas: '',
    url_alertcanvas: ''
};

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

function getSetting(key) {
    const row = getSettingStmt.get(key);
    if (row) return row.value;
    return DEFAULTS[key] !== undefined ? String(DEFAULTS[key]) : null;
}
function setSetting(key, value) { setSettingStmt.run(key, String(value)); }

module.exports = { db, DATA_DIR, DEFAULTS, getSetting, setSetting };
