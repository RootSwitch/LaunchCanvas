# Changelog

## 0.3.1 - 2026-07-22

- The suite docs join the launcher as a sixth full tile ("Suite Docs",
  opening in-app) - the topbar link was easy to miss on a large screen,
  and "where do I start" deserves the same visual weight as the apps it
  explains.
- Tiles reordered from release order to workflow order: the daily
  monitors first (SNMPCanvas, SyslogCanvas), the board pair together in
  draw-then-watch order (CrossCanvas, PingCanvas), then AlertCanvas and
  the docs. A first-time user reading the grid now meets the apps
  roughly in Quickstart order, and the kiosk is no longer the second
  thing clicked on a box that has no board yet.

## 0.3.0 - 2026-07-22

- In-app suite documentation, served by the portal with no login: a suite
  overview with the pipeline map (docs.html), a ten-minute quickstart
  covering both starting points - a device list (SNMPCanvas inventory ->
  CrossCanvas import) and an existing diagram (Visio/draw.io/Gliffy
  import) - and a one-pager per app with its port, first five minutes,
  and a link to the full README (apps.html). The portal's address is now
  the suite's starting point, not just its door.
- "Docs" in the top bar (visible logged out too) and a "New to the
  suite? Start here" link on the login card.
- The grouped theme-picker builder moved into themes.js (wirePicker) so
  the app and the docs pages share one copy.

## 0.2.1 - 2026-07-22

- Review pass before publication. Suite token TTL shortened to 24h (from 7
  days) so an off-boarded user's residual SSO access is bounded; active
  users never notice (loading the portal re-mints it). The user-removal
  dialog now spells out that a token already in their browser survives until
  expiry unless SUITE_SECRET is rotated.
- Security posture documented honestly: every account is a full suite admin
  (no roles), the SSO cookie is host-wide (visible to every service on the
  portal's hostname), and stateless-token revocation is coarse. Added an
  environment-variable reference (PORT, TRUST_PROXY, COOKIE_SECURE, ...).
- clientIp now takes the last (proxy-vouched) X-Forwarded-For hop, not the
  first (client-spoofable) one - matches the fix across the siblings.
- Copy-paste cleanup: gen-cert.sh and themes.js no longer say "AlertCanvas";
  removed a stray snmp-status.json .gitignore entry; corrected the tile
  count and the SSO diagram (CrossCanvas/PingCanvas have no login).

## 0.2.0 - 2026-07-21

- Multi-user accounts: usernames + passwords live at the portal, one
  account per human for the whole suite - the SSO token carries the
  username into every sibling, so nothing else grew a users table. No
  roles: every account is equal and can manage accounts, with two guard
  rails (the last account and your own cannot be deleted). Password resets
  evict that user's sessions. A 0.1.x database migrates its single shared
  password to the user "admin" automatically - same hash, nobody re-enters
  anything.
- The launcher tiles grew up: each now shows a live screenshot from that
  app's own hero image with the mark, name, and destination beneath -
  roughly two-up on a desktop.
- First-run page asks for the password twice (family pattern) and creates
  a named account.

## 0.1.0 - 2026-07-21

- First release: the suite's front door.
- Login page + tile launcher for all five siblings, family themes, tile
  URLs auto-derived from the portal's own address (override per app in
  Settings).
- Opt-in single sign-on: an HMAC-signed, expiring token (shared
  SUITE_SECRET) in one host-wide cookie; SNMPCanvas, SyslogCanvas, and
  AlertCanvas upgrade it to a local session transparently. Portal logout
  clears it suite-wide; rotate the secret to revoke everything.
- Board upload: an .xcanvas posted from the browser lands atomically where
  the PingCanvas kiosk reads it, previous board kept as a restorable
  backup.
- Family standards throughout: scrypt password, sessions, login rate
  limiting, automatic HTTPS on cert presence, charcheck, The Unlicense.
