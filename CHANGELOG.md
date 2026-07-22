# Changelog

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
