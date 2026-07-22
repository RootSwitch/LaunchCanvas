# LaunchCanvas - The Suite's Front Door

> One login, every Canvas app. A small, self-hostable portal that signs you
> into the whole suite, launches each sibling from one tile page, and puts
> board files where the wall can read them - no ports memorized, no SCP.

LaunchCanvas is the sixth member of the Canvas family:
[**CrossCanvas**](https://github.com/RootSwitch/CrossCanvas) draws your
network, [**PingCanvas**](https://github.com/RootSwitch/PingCanvas) turns
those diagrams into a live reachability wall,
[**SNMPCanvas**](https://github.com/RootSwitch/SNMPCanvas) graphs the
performance history,
[**SyslogCanvas**](https://github.com/RootSwitch/SyslogCanvas) remembers
what your devices said, and
[**AlertCanvas**](https://github.com/RootSwitch/AlertCanvas) turns readings
into notifications. LaunchCanvas is the door you walk in through: log in
once, see six rooms.

<!-- hero image placeholder: docs/hero-quadrants.png -->

## How it works

```
you ──login──► LaunchCanvas ──sets one host-wide signed token──┐
                    │                                          ▼
                    └──tiles──► CrossCanvas / PingCanvas / SNMPCanvas /
                                SyslogCanvas / AlertCanvas (already logged in)
```

One Node process: a login page, a tile launcher, and a couple of small
conveniences. On login it mints an HMAC-signed token (shared `SUITE_SECRET`)
into a host-wide cookie - browsers scope cookies by host, not port, so every
sibling on the box receives it, verifies the signature with the same secret,
and silently upgrades you to a normal local session. No proxy, no rewritten
URLs, no per-app password vault: the apps simply trust the portal's
signature. Remove `SUITE_SECRET` and the portal degrades gracefully into a
plain launcher with per-app logins.

## Features

- **One login for the suite** - opt-in single sign-on across SNMPCanvas,
  SyslogCanvas, and AlertCanvas via a signed, expiring token (7 days,
  re-minted on every portal visit). Logging out at the portal is the
  suite-wide logout. Rotate `SUITE_SECRET` to revoke every token at once.
- **The launcher** - a tile per app, in the family style, each linking to
  the right host and port so nobody keeps a bookmark folder of five ports.
  Tile URLs derive automatically from the portal's own address and each
  app's stock port; override any of them in Settings when an app lives
  somewhere unusual.
- **Board upload** - send an `.xcanvas` exported from CrossCanvas straight
  to the directory the PingCanvas kiosk reads, from the browser. Validated,
  size-capped, written atomically, and the previous board is kept as a
  one-click backup. The SCP step is gone.
- **Single shared password** for the portal (scrypt-hashed), sessions,
  login rate limiting, automatic HTTPS when a certificate exists - the
  family standard. The username claim is already in the token, so per-user
  logins are a portal-side addition when that day comes, not a five-app
  rework.
- **29 themes** carried over from CrossCanvas's palette family, grouped the
  same way (Paper / Warm / Cool / Night / Screen).

## Small on purpose

LaunchCanvas is a door, not a dashboard. It does not proxy traffic, embed
the apps in frames, aggregate their data, or watch anything - the siblings
are already good at being themselves, and the kiosk stays a wall display
that needs no login at all. Keeping the moving parts few is a design
choice - and if you want it to become something bigger, the license makes
forking genuinely easy.

## Quick start (Docker)

```yaml
# docker-compose.yml (in the repo; abridged)
services:
  launchcanvas:
    build: .
    ports: ["9160:9160"]
    volumes:
      - ./data:/data:z
      - ../pingcanvas/data:/boards:z   # where board uploads land
    environment:
      - TZ=Etc/UTC
      #- SUITE_SECRET=a-long-random-string   # enables SSO - see below
```

```
mkdir -p data && sudo chown 1000:1000 data   # container runs as uid 1000
docker compose up -d --build
```

Open `http://host:9160`, set the admin password on the first-run page, and
you have a launcher. (The default port sits one door down from SNMPCanvas's
9161 - the 916x row reads portal, poller, alerter.)

One first-run note: the setup page belongs to whoever reaches the port
first, so on anything but a trusted segment either set `ADMIN_PASSWORD` in
the compose file or claim the page immediately after `up -d`.

### Enabling single sign-on

Generate one secret and give it to the portal **and** each Node sibling
(compose `environment:` or an override file):

```
openssl rand -base64 32
```

```yaml
# on launchcanvas, snmpcanvas, syslogcanvas, alertcanvas alike:
    environment:
      - SUITE_SECRET=<that value>
```

Restart the four containers. Log into the portal; the tiles now open the
siblings already authenticated. Notes:

- Apps without the secret keep their own login - SSO is per-app opt-in.
- PingCanvas's kiosk and editor have no login at all; nothing changes there.
- Mixed HTTP/HTTPS weakens this: a `Secure` cookie set by an HTTPS portal
  is not sent to plain-HTTP siblings. Run the suite all-HTTP or all-HTTPS
  (the suite setup script does the latter by default).
- Logging out of a sibling while the portal token is valid signs you
  straight back in on the next request - by design, that is what SSO means.
  Log out at the portal to log out everywhere.

### Board uploads

Mount the directory your PingCanvas kiosk reads boards from at `/boards`
(the stock compose assumes the sibling-checkout layout; the suite's shared
data root works the same with an override). Uploads replace
`board.xcanvas` atomically and keep the previous file as
`board.xcanvas.bak`, restorable from the UI. No mount, no upload UI - the
feature disables itself.

### HTTPS

Run the included script once on the docker host, then restart:

```
./tools/gen-cert.sh 192.168.1.50 nas.lan    # your host's IPs / names
docker compose restart
```

It writes a self-signed cert to `data/certs/server.crt` + `server.key`; the
server detects the pair at startup and switches to HTTPS on the same port
(session cookies become `Secure` automatically).

## Security posture

Same trusted-LAN posture as the family: one shared password, no public
exposure, TLS optional but one script away. The SSO token adds two facts
worth knowing. First, possession of `SUITE_SECRET` is possession of the
suite - treat it like the other suite secrets (it lives only in compose
override files). Second, tokens are stateless: revocation is expiry (7
days) or secret rotation, and a portal password change does not invalidate
tokens already minted - rotate the secret when it matters.

## Development

```
npm install
npm start             # UI on http://localhost:9160, data in ./data
npm test              # token tests + the family charcheck
```

Board uploads in dev: `BOARD_DIR=./boards npm start` (any writable dir).
`SUITE_SECRET=dev-secret npm start` to exercise SSO against locally-run
siblings started with the same value.

### Project layout

```
server/server.js   http(s) + static + /api dispatch
server/api.js      routes: session, settings, board upload, password
server/auth.js     scrypt password, sessions, rate limiting (family standard)
server/token.js    the SSO token: mint + verify (HMAC-SHA256, SUITE_SECRET)
server/db.js       SQLite: settings + sessions, nothing else
public/            login + launcher + settings, themes.js, app icons
tools/             gen-cert.sh, charcheck.js, test-token.js
```

## Credits

LaunchCanvas stands on one excellent library:
[better-sqlite3](https://github.com/WiseLibs/better-sqlite3) (MIT).
Everything else is Node's standard library and plain HTML/CSS/JS.

## License

[The Unlicense](LICENSE) - public domain, same as CrossCanvas, PingCanvas,
SNMPCanvas, SyslogCanvas, and AlertCanvas. Use it, fork it, ship it at
work, no attribution required. (Dependencies keep their own licenses in
`node_modules/` when you install or ship an image.)
