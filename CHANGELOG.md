# Changelog

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
