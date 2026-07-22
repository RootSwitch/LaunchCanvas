'use strict';
// All /api/* handlers. Routes are (method, regex) pairs dispatched by
// server.js; bodies are JSON in and JSON out. Mutating routes require
// Content-Type: application/json (cross-site forms can't send it - CSRF belt
// on top of the SameSite=Lax cookie).

const fs = require('node:fs');
const path = require('node:path');
const { db, DEFAULTS, getSetting, setSetting } = require('./db');
const auth = require('./auth');
const token = require('./token');

// Board uploads land in BOARD_DIR (the suite points this at the shared data
// root PingCanvas serves). No BOARD_DIR that exists = the upload UI disables
// itself rather than failing at the last step.
const BOARD_DIR = process.env.BOARD_DIR || '/boards';
const BOARD_NAME = 'board.xcanvas';
const BOARD_MAX_BYTES = 25 * 1024 * 1024;

// --- tiny helpers ---
function json(res, status, body) {
    const buf = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(buf);
    // Truthy so handle()'s early exits (auth 401, 415, body errors) read as
    // "handled" - the server's 404 fallback must never double-write a reply.
    return true;
}
const ok = (res, body = { ok: true }) => json(res, 200, body);
const bad = (res, msg) => json(res, 400, { error: msg });

function clientIp(req) {
    if (process.env.TRUST_PROXY === '1') {
        const xff = req.headers['x-forwarded-for'];
        if (xff) {
            const first = String(xff).split(',')[0].trim();
            if (first) { return first; }
        }
    }
    return req.socket.remoteAddress || 'unknown';
}

// Both cookies on login: the local portal session plus (when SUITE_SECRET is
// set) the host-wide SSO token every sibling accepts - carrying the username,
// so per-user identity travels the suite.
function setAuthCookies(res, sessionToken, username) {
    const cookies = [auth.sessionCookie(sessionToken)];
    const t = token.mint(username);
    if (t) cookies.push(token.cookie(t));
    res.setHeader('Set-Cookie', cookies);
}

function boardInfo() {
    const out = { enabled: false, exists: false, dir: BOARD_DIR };
    try {
        if (!fs.statSync(BOARD_DIR).isDirectory()) return out;
    } catch (_) { return out; }
    out.enabled = true;
    try {
        const st = fs.statSync(path.join(BOARD_DIR, BOARD_NAME));
        out.exists = true;
        out.size = st.size;
        out.modifiedAt = new Date(st.mtimeMs).toISOString();
    } catch (_) { /* no board yet */ }
    try { fs.statSync(path.join(BOARD_DIR, BOARD_NAME + '.bak')); out.backupExists = true; }
    catch (_) { out.backupExists = false; }
    return out;
}

// --- route table ---
const routes = [
    { method: 'GET', path: /^\/api\/health$/, authRequired: false, handler: (req, res) =>
        ok(res, { ok: true, version: require('../package.json').version, sso: token.enabled() }) },

    { method: 'GET', path: /^\/api\/session$/, authRequired: false, handler: (req, res) => {
        const user = auth.validateSession(auth.tokenFromRequest(req));
        // Re-mint the SSO token on every authenticated visit so it slides
        // with use instead of dying mid-week.
        if (user) {
            const t = token.mint(user);
            if (t) res.setHeader('Set-Cookie', token.cookie(t));
        }
        ok(res, { authenticated: !!user, user: user || null, needsSetup: !auth.anyUsers(), sso: token.enabled() });
    } },

    { method: 'POST', path: /^\/api\/setup$/, authRequired: false, handler: (req, res, p, body) => {
        if (auth.anyUsers()) return json(res, 409, { error: 'already configured' });
        if (!body.password || String(body.password).length < 8) return bad(res, 'Password must be at least 8 characters.');
        let name;
        try { name = auth.createUser(String(body.username || 'admin'), String(body.password)); }
        catch (err) { return bad(res, err.message); }
        setAuthCookies(res, auth.createSession(name), name);
        ok(res, { user: name });
    } },

    { method: 'POST', path: /^\/api\/login$/, authRequired: false, handler: (req, res, p, body) => {
        const ip = clientIp(req);
        if (!auth.loginAllowed(ip)) return json(res, 429, { error: 'Too many attempts - wait a minute.' });
        const name = auth.checkLogin(body.username, body.password);
        if (!name) {
            auth.recordLoginFailure(ip);
            return json(res, 401, { error: 'Wrong username or password.' });
        }
        auth.recordLoginSuccess(ip);
        setAuthCookies(res, auth.createSession(name), name);
        ok(res, { user: name });
    } },

    { method: 'POST', path: /^\/api\/logout$/, authRequired: false, handler: (req, res) => {
        auth.destroySession(auth.tokenFromRequest(req));
        // Logging out here is the suite-wide logout: drop the SSO token too.
        res.setHeader('Set-Cookie', [auth.clearCookie(), token.clearCookie()]);
        ok(res);
    } },

    { method: 'GET', path: /^\/api\/settings$/, handler: (req, res) => {
        const out = {};
        for (const key of Object.keys(DEFAULTS)) out[key] = getSetting(key);
        out.sso = token.enabled();
        out.board = boardInfo();
        ok(res, out);
    } },

    { method: 'PATCH', path: /^\/api\/settings$/, handler: (req, res, p, body) => {
        for (const key of Object.keys(DEFAULTS)) {
            if (body[key] === undefined) continue;
            const v = String(body[key]).trim();
            if (v && !/^https?:\/\//i.test(v)) return bad(res, `${key}: must be empty (auto) or start with http:// or https://`);
            setSetting(key, v);
        }
        ok(res);
    } },

    { method: 'POST', path: /^\/api\/settings\/password$/, handler: (req, res, p, body) => {
        const me = auth.validateSession(auth.tokenFromRequest(req));
        if (!auth.checkLogin(me, String(body.current || ''))) return json(res, 401, { error: 'Current password is wrong.' });
        if (!body.next || String(body.next).length < 8) return bad(res, 'New password must be at least 8 characters.');
        auth.setUserPassword(me, String(body.next));
        auth.destroyUserSessions(me, auth.tokenFromRequest(req));
        ok(res);
    } },

    // --- users (no roles: any signed-in account manages accounts; the guard
    // rails are "no deleting the last user" and "no deleting yourself") ---
    { method: 'GET', path: /^\/api\/users$/, handler: (req, res) => {
        const me = auth.validateSession(auth.tokenFromRequest(req));
        ok(res, { users: auth.listUsers().map((u) => ({
            id: u.id, username: u.username,
            createdAt: new Date(u.created_ts * 1000).toISOString(),
            self: u.username === me
        })) });
    } },

    { method: 'POST', path: /^\/api\/users$/, handler: (req, res, p, body) => {
        if (!body.password || String(body.password).length < 8) return bad(res, 'Password must be at least 8 characters.');
        try { ok(res, { user: auth.createUser(body.username, String(body.password)) }); }
        catch (err) { bad(res, err.message); }
    } },

    { method: 'DELETE', path: /^\/api\/users\/(\d+)$/, handler: (req, res, p) => {
        const me = auth.validateSession(auth.tokenFromRequest(req));
        const target = auth.listUsers().find((u) => u.id === Number(p[0]));
        if (target && target.username === me) return bad(res, 'You cannot delete the account you are signed in with.');
        try { auth.deleteUser(Number(p[0])); ok(res); }
        catch (err) { bad(res, err.message); }
    } },

    { method: 'POST', path: /^\/api\/users\/(\d+)\/password$/, handler: (req, res, p, body) => {
        if (!body.password || String(body.password).length < 8) return bad(res, 'Password must be at least 8 characters.');
        const target = auth.listUsers().find((u) => u.id === Number(p[0]));
        if (!target) return bad(res, 'No such user.');
        auth.setUserPassword(target.username, String(body.password));
        auth.destroyUserSessions(target.username, null);   // reset = evict their sessions
        ok(res);
    } },

    { method: 'GET', path: /^\/api\/board$/, handler: (req, res) => ok(res, boardInfo()) },

    // The one server-side thing the suite's editor philosophically can't do:
    // put a board where the wall reads it, without SCP. Body is the raw
    // .xcanvas (which is JSON); validated, size-capped, written atomically,
    // previous board kept as .bak.
    { method: 'POST', path: /^\/api\/board$/, rawBody: true, handler: (req, res, p, body) => {
        const info = boardInfo();
        if (!info.enabled) return bad(res, `Board directory not available (${BOARD_DIR} is not mounted).`);
        let doc;
        try { doc = JSON.parse(body.toString('utf8')); } catch (_) {
            return bad(res, 'Not a valid .xcanvas file (JSON parse failed).');
        }
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return bad(res, 'Not a valid .xcanvas file (not an object).');
        const target = path.join(BOARD_DIR, BOARD_NAME);
        const tmp = path.join(BOARD_DIR, `.${BOARD_NAME}.tmp`);
        try {
            fs.writeFileSync(tmp, body);
            try { fs.copyFileSync(target, target + '.bak'); } catch (_) { /* first board: nothing to back up */ }
            fs.renameSync(tmp, target);
        } catch (err) {
            try { fs.unlinkSync(tmp); } catch (_) { /* best effort */ }
            return json(res, 500, { error: `Write failed: ${err.message}` });
        }
        ok(res, boardInfo());
    } },

    { method: 'POST', path: /^\/api\/board\/restore$/, handler: (req, res) => {
        const info = boardInfo();
        if (!info.enabled) return bad(res, `Board directory not available (${BOARD_DIR} is not mounted).`);
        if (!info.backupExists) return bad(res, 'No backup to restore.');
        const target = path.join(BOARD_DIR, BOARD_NAME);
        try { fs.copyFileSync(target + '.bak', target); } catch (err) {
            return json(res, 500, { error: `Restore failed: ${err.message}` });
        }
        ok(res, boardInfo());
    } }
];

function readJson(req, limit = 1024 * 1024) {
    return readRaw(req, limit).then((buf) => {
        try { return JSON.parse(buf.toString('utf8') || '{}'); }
        catch (_) { throw new Error('invalid JSON body'); }
    });
}

function readRaw(req, limit) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on('data', (c) => {
            size += c.length;
            if (size > limit) { reject(new Error(`body too large (limit ${limit} bytes)`)); req.destroy(); return; }
            chunks.push(c);
        });
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

async function handle(req, res, pathname, query) {
    for (const route of routes) {
        if (route.method !== req.method) continue;
        const m = route.path.exec(pathname);
        if (!m) continue;

        if (route.authRequired !== false && !auth.validateSession(auth.tokenFromRequest(req))) {
            return json(res, 401, { error: 'authentication required' });
        }

        let body = {};
        if (req.method === 'POST' || req.method === 'PATCH' || req.method === 'DELETE') {
            // CSRF belt over the SameSite=Lax cookie: a cross-site HTML form
            // cannot set Content-Type: application/json, so requiring it on
            // every mutating route blocks form-driven forgery. A body-less
            // DELETE is allowed through (nothing to read).
            const ct = String(req.headers['content-type'] || '');
            const hasBody = req.headers['transfer-encoding'] !== undefined ||
                (req.headers['content-length'] && req.headers['content-length'] !== '0');
            if (hasBody && !ct.includes('application/json')) return json(res, 415, { error: 'expected application/json' });
            if (hasBody) {
                try {
                    body = route.rawBody ? await readRaw(req, BOARD_MAX_BYTES) : await readJson(req);
                } catch (err) {
                    return bad(res, err.message);
                }
            } else if (req.method !== 'DELETE' && !ct.includes('application/json')) {
                return json(res, 415, { error: 'expected application/json' });
            }
        }
        try {
            await route.handler(req, res, m.slice(1), body, query);
        } catch (err) {
            console.error(new Date().toISOString(), '[api]', req.method, pathname, err);
            if (!res.headersSent) json(res, 500, { error: 'internal error' });
        }
        return true;
    }
    return false;
}

module.exports = { handle };
