'use strict';
// The suite SSO token: HMAC-SHA256 over a compact JSON payload, keyed by the
// SUITE_SECRET env var that the portal and every sibling share. The portal
// MINTS tokens; each sibling VERIFIES with a ~25-line copy of verify() in its
// own auth.js (kept dependency-free on purpose - no shared package).
//
// Format:  base64url(payload) "." base64url(hmac_sha256(payload, secret))
// Payload: { u: username, iat: seconds, exp: seconds }
//
// Cookies ignore ports, so one host-wide cookie reaches every app on the box.
// Revocation is by expiry (24 hours, re-minted on every authenticated portal
// visit) or by rotating SUITE_SECRET - the token is stateless by design.

const crypto = require('node:crypto');

const COOKIE_NAME = 'canvas_suite';
// 24h, re-minted on every authenticated portal visit. Short by design: the
// token is stateless, so deleting a portal user cannot reach into their
// browser to revoke it - the only cutoffs are this expiry and rotating
// SUITE_SECRET. A day bounds an off-boarded user's residual access; active
// users never notice (loading the portal refreshes it).
const TOKEN_TTL_S = 24 * 3600;

function secret() {
    return process.env.SUITE_SECRET || null;
}

function mint(username) {
    const s = secret();
    if (!s) return null;
    const now = Math.floor(Date.now() / 1000);
    const payload = Buffer.from(JSON.stringify({ u: String(username || 'admin'), iat: now, exp: now + TOKEN_TTL_S }));
    const sig = crypto.createHmac('sha256', s).update(payload).digest();
    return `${payload.toString('base64url')}.${sig.toString('base64url')}`;
}

function verify(token) {
    const s = secret();
    if (!s || !token) return null;
    const dot = token.indexOf('.');
    if (dot <= 0) return null;
    try {
        const payload = Buffer.from(token.slice(0, dot), 'base64url');
        const sig = Buffer.from(token.slice(dot + 1), 'base64url');
        const expect = crypto.createHmac('sha256', s).update(payload).digest();
        if (sig.length !== expect.length || !crypto.timingSafeEqual(sig, expect)) return null;
        const claims = JSON.parse(payload.toString('utf8'));
        const now = Math.floor(Date.now() / 1000);
        if (!claims || typeof claims.u !== 'string' || !(Number(claims.exp) > now)) return null;
        return claims;
    } catch (_) {
        return null;
    }
}

function cookie(token) {
    const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
    return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${TOKEN_TTL_S}${secure}`;
}
function clearCookie() {
    return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

module.exports = { COOKIE_NAME, TOKEN_TTL_S, mint, verify, cookie, clearCookie, enabled: () => !!secret() };
