# Changelog

## Unreleased

- **The database is owner-only, as its three siblings already were.**
  `launchcanvas.db` holds every portal account's scrypt password hash and its live
  session tokens. The suite deliberately leaves the shared data directory
  world-readable so the kiosk's web tier - running as a different uid - can serve
  boards out of it, which means the directory cannot protect the file. That is why
  SNMPCanvas, SyslogCanvas and AlertCanvas each narrow their database to 0600 on
  open. The portal, the one app of the four actually holding credentials, was the
  one that missed it.

  Hashes are not plaintext, so this was exposure to offline attack by a local user
  rather than a compromise. Verified on `node:22-alpine`, the image the app ships
  in: 644 before, 600 after, and SQLite's `-wal` file inherits the mode as claimed.
  A Windows development box cannot demonstrate this at all - `fs.chmodSync` there
  only toggles the read-only bit and reports 666 either way, which is part of why
  it went unnoticed.

  `foreign_keys = ON` is set at the same time for consistency with the family
  shape. The schema has no foreign keys today, so nothing changes yet.

- **Bring your own theme, without a rebuild.** A `theme.json` in the data
  directory adds a thirtieth entry to the picker, above the twenty-nine shipped
  ones. Same fifteen `--se-*` variables, hex only, and partial files are fine -
  anything left out inherits Classic, so changing two colours takes a two-line
  file. Because the data directory is a bind mount, editing it is a browser
  refresh rather than a rebuild; delete the file and the entry goes away. Point
  several apps at one shared data directory and a single file themes all of them.

  The shipped themes were deliberately left alone: they are duplicated across
  six repos, the style guide and the demo, so every addition is drift - which is
  exactly why a user's palette should not join that set. `tools/export-theme.js`
  prints any shipped theme as a starting file so nobody has to learn the format
  from documentation.

  `tools/check-theme.js` validates a file before you restart anything, and calls
  the same loader the server calls, so it cannot accept what the app would
  reject. It also audits readability: text contrast against WCAG AA, plus hue
  separation and saturation on `--se-up`/`--se-down`/`--se-warn`, because a
  palette where healthy and failed do not separate at a glance is a different
  problem from one that is merely ugly. It reports and never refuses.

  The endpoint serving it is deliberately public. The login page is themed too,
  and gating this would leave the first page every user sees stuck on Classic
  while their palette waited behind a session. The loader rebuilds the theme
  from validated values rather than passing the file through, so unknown keys
  and non-hex values never reach a browser.

- **The container healthcheck no longer leaks zombies onto the host.** The
  image runs `node` as PID 1, and Node does not reap processes it did not
  spawn - so the HEALTHCHECK's `wget` left an `ssl_client` behind on every
  HTTPS probe and nothing collected it. One a minute, indefinitely. A zombie
  still holds a process slot against the `nproc` limit of the HOST uid the
  container runs as (1000), so after roughly a day that user could no longer
  fork: its SSH logins failed with "Server refused to start a shell/command"
  while root connected fine, and only a reboot cleared it. The symptom points
  nowhere near the portal, which is why it went unexplained for a while.
  `docker-compose.yml` now sets `init: true`, putting tini at PID 1 to reap
  orphans. No image rebuild needed - `docker compose up -d` recreates the
  container with the init in place, and that also clears the existing zombies.

- **Passwords hash and verify off the event loop.** `crypto.scryptSync` in
  `server/auth.js` serialised concurrent logins into one unbroken stall (8 at
  once measured ~218ms in which every other request waited - and the portal's
  login page is the suite's front door), while each single call sat under
  per-call blocking thresholds - the burst is the cost, so a blocking sweep
  cannot see it. Now the async `crypto.scrypt` through `createUser`,
  `checkLogin` and `setUserPassword`, awaited in their handlers; the
  unknown-username timing pad is minted lazily on first use, and the server
  waits for the `ADMIN_PASSWORD` seed before listening. The stored hash format
  is unchanged - `tools/test-users.js` still proves a hash minted by the old
  synchronous code (the 0.1.x migration path) verifies.

- **`tools/charcheck.js` now checks itself.** The checker banned em/en dashes
  and curly quotes while containing all six as literals - and never flagged
  itself, because its binary guard was a literal NUL byte embedded in the
  source, which made charcheck.js a tracked file matching its own binary
  test. The banned set is now built from code points, the NUL is constructed
  with `String.fromCharCode(0)`, and files skipped as binary are logged by
  name instead of passed over silently. That logging immediately caught a
  second casualty: `tools/test-token.js` embedded two raw NUL bytes in a
  junk-input literal and had been invisibly exempt from the style check;
  they are now constructed too.

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
