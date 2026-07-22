'use strict';
// Tests for multi-user auth (server/auth.js + the db migration). Runs against
// a throwaway data dir; plain node + assert, family style.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; }
    catch (err) { console.error(`FAIL: ${name}`); console.error(err.message); process.exit(1); }
}

// Point the app at a scratch dir, and pre-seed a 0.1.x-style database (single
// shared password in settings) so requiring db.js exercises the migration.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'launchc-test-'));
process.env.LAUNCHCANVAS_DATA = scratch;

const Database = require('better-sqlite3');
{
    const raw = new Database(path.join(scratch, 'launchcanvas.db'));
    raw.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    // A real scrypt hash for password "legacy-pass-123", minted with the same code.
    const crypto = require('node:crypto');
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync('legacy-pass-123', salt, 32, { N: 16384, r: 8, p: 1 });
    raw.prepare("INSERT INTO settings (key, value) VALUES ('password', ?)")
        .run(`scrypt$N=16384,r=8,p=1$${salt.toString('base64')}$${hash.toString('base64')}`);
    raw.close();
}

const auth = require('../server/auth');

test('0.1.x single password migrates to user admin, old login still works', () => {
    assert.strictEqual(auth.userCount(), 1);
    assert.strictEqual(auth.checkLogin('admin', 'legacy-pass-123'), 'admin');
    assert.strictEqual(auth.checkLogin('admin', 'wrong'), null);
});

test('create, list, case-insensitive uniqueness', () => {
    assert.strictEqual(auth.createUser('alice', 'password-eight'), 'alice');
    assert.throws(() => auth.createUser('ALICE', 'password-eight'), /already exists/);
    assert.throws(() => auth.createUser('x', 'password-eight'), /2-32/);
    assert.throws(() => auth.createUser('has spaces', 'password-eight'), /2-32/);
    assert.deepStrictEqual(auth.listUsers().map((u) => u.username).sort(), ['admin', 'alice']);
});

test('login returns canonical casing; unknown user fails like wrong password', () => {
    assert.strictEqual(auth.checkLogin('ALICE', 'password-eight'), 'alice');
    assert.strictEqual(auth.checkLogin('nobody', 'password-eight'), null);
});

test('sessions carry their owner', () => {
    const t = auth.createSession('alice');
    assert.strictEqual(auth.validateSession(t), 'alice');
    auth.destroySession(t);
    assert.strictEqual(auth.validateSession(t), null);
});

test('password reset evicts that user\'s sessions only', () => {
    const ta = auth.createSession('alice');
    const tb = auth.createSession('admin');
    auth.setUserPassword('alice', 'new-password-1');
    auth.destroyUserSessions('alice', null);
    assert.strictEqual(auth.validateSession(ta), null, 'alice evicted');
    assert.strictEqual(auth.validateSession(tb), 'admin', 'admin untouched');
    assert.strictEqual(auth.checkLogin('alice', 'new-password-1'), 'alice');
});

test('a pre-migration null-username session is rejected, not treated as admin', () => {
    const crypto = require('node:crypto');
    const raw = 'x'.repeat(43);
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const now = Math.floor(Date.now() / 1000);
    // Simulate a 0.1.x session row: no username.
    new Database(path.join(scratch, 'launchcanvas.db'))
        .prepare('INSERT INTO sessions (token_hash, username, created_ts, expires_ts) VALUES (?, NULL, ?, ?)')
        .run(hash, now, now + 3600);
    assert.strictEqual(auth.validateSession(raw), null);
    // and it is cleaned up on the way out
    const still = new Database(path.join(scratch, 'launchcanvas.db'))
        .prepare('SELECT 1 FROM sessions WHERE token_hash = ?').get(hash);
    assert.strictEqual(still, undefined);
});

test('deleting a user evicts them; the last user is protected', () => {
    const alice = auth.listUsers().find((u) => u.username === 'alice');
    const t = auth.createSession('alice');
    auth.deleteUser(alice.id);
    assert.strictEqual(auth.validateSession(t), null);
    const admin = auth.listUsers().find((u) => u.username === 'admin');
    assert.throws(() => auth.deleteUser(admin.id), /last user/);
});

console.log(`ok - ${passed} tests passed`);
process.exit(0);
