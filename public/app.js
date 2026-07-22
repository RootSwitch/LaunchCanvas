'use strict';
// LaunchCanvas frontend: hash-routed views over the JSON API. Vanilla DOM, no
// framework, no build step - the file you read is the file that runs.

(function () {
    const $main = document.getElementById('main');
    const $nav = document.getElementById('nav');
    const $logout = document.getElementById('logout-btn');

    function esc(s) {
        return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async function api(method, path, body) {
        const opts = { method, headers: {} };
        if (body !== undefined) {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = typeof body === 'string' ? body : JSON.stringify(body);
        }
        const res = await fetch(path, opts);
        if (res.status === 401 && !path.startsWith('/api/session') && !path.startsWith('/api/login')) {
            renderLogin(false);
            throw new Error('authentication required');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `${res.status}`);
        return data;
    }
    const GET = (p) => api('GET', p);

    // ===== the fleet: what each tile is, and where it lives by default =====
    // A blank Settings value means "derive from this page's own location":
    // same hostname, each app's stock port, protocol matched to the portal's
    // (the suite's TLS setup is all-or-nothing, so that guess holds).
    function autoUrl(app) {
        const h = location.hostname;
        const https = location.protocol === 'https:';
        const ping = https ? `https://${h}:8443` : `http://${h}:8080`;
        const node = (port) => `${https ? 'https' : 'http'}://${h}:${port}/`;
        switch (app) {
            case 'crosscanvas': return `${ping}/index.html`;
            case 'pingcanvas': return `${ping}/kiosk.html?board=data/board.xcanvas&status=data/status.json&snmp=data/snmp-status.json`;
            case 'snmpcanvas': return node(9161);
            case 'syslogcanvas': return node(9514);
            case 'alertcanvas': return node(9162);
        }
    }

    // Tile order is workflow/daily-use, not release date: the monitors you
    // check every day first, the board pair together in draw->watch order,
    // then configure-once alerting and the in-app docs.
    const APPS = [
        { key: 'snmpcanvas', name: 'SNMPCanvas', icon: 'icons/snmpcanvas.svg',
          desc: 'Poll, graph, and export device health' },
        { key: 'syslogcanvas', name: 'SyslogCanvas', icon: 'icons/syslogcanvas.svg',
          desc: 'Catch what your devices say - syslog and traps' },
        { key: 'crosscanvas', name: 'CrossCanvas', icon: 'icons/crosscanvas.svg',
          desc: 'Draw the network - diagram editor' },
        { key: 'pingcanvas', name: 'PingCanvas', icon: 'icons/pingcanvas.svg',
          desc: 'The wall - live reachability kiosk' },
        { key: 'alertcanvas', name: 'AlertCanvas', icon: 'icons/alertcanvas.svg',
          desc: 'Thresholds to notifications - email, ntfy, syslog' },
        // The suite docs ride the launcher as a full tile - a topbar link is
        // easy to miss on a big screen, and "where do I start" deserves the
        // same visual weight as the apps it explains. No URL override; it is
        // this portal's own page (docs: true is skipped by Settings).
        { key: 'docs', name: 'Suite Docs', icon: 'favicon.svg',
          desc: 'Quickstart + how the six apps fit together', docs: true }
    ];

    // ===== theme picker (grouped, family standard - built in themes.js) =====
    Themes.wirePicker(document.getElementById('theme-select'));

    $logout.addEventListener('click', async () => {
        await api('POST', '/api/logout', {});
        location.hash = '#/launch';
        route();
    });

    function setNav(active, visible) {
        $nav.style.display = visible ? '' : 'none';
        $logout.style.display = visible ? '' : 'none';
        for (const a of $nav.querySelectorAll('a')) a.classList.toggle('active', a.dataset.nav === active);
    }

    // ===== router =====
    window.addEventListener('hashchange', route);
    const $whoami = document.getElementById('whoami');

    async function route() {
        const session = await GET('/api/session');
        if (!session.authenticated) { $whoami.textContent = ''; renderLogin(session.needsSetup); return; }
        $whoami.textContent = session.user || '';
        const hash = location.hash || '#/launch';
        if (hash.startsWith('#/settings')) return renderSettings();
        return renderLaunch();
    }

    // ===== login / first-run =====
    function renderLogin(needsSetup) {
        setNav(null, false);
        $main.innerHTML = `
        <div class="login-wrap"><div class="login-card">
            <h1><svg width="20" height="20" viewBox="0 0 64 64" fill="none" stroke="var(--se-accent)">
                <path d="M32 5 L32 12" stroke-width="5" stroke-linecap="round"/>
                <path d="M18 45 L12 59 M46 45 L52 59 M32 45 L32 59" stroke-width="5" stroke-linecap="round"/>
                <rect x="9" y="12" width="46" height="34" rx="3" fill="#f4f1ea" stroke-width="4"/>
                <g stroke="var(--se-logo-b)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none">
                    <path d="M25 40 L25 19 L39 19 L39 40"/>
                    <path d="M39 19 L33 22.5 L33 43.5 L39 40"/>
                </g>
            </svg> LaunchCanvas</h1>
            <div class="sub">${needsSetup ? 'First run - create the first account (password 8+ characters).' : 'One login for the whole suite.'}</div>
            <form id="login-form">
                <input type="text" id="username" placeholder="Username" autocomplete="username" ${needsSetup ? 'value="admin"' : 'autofocus'}>
                <input type="password" id="password" placeholder="Password" autocomplete="${needsSetup ? 'new-password' : 'current-password'}" ${needsSetup ? 'autofocus' : ''}>
                ${needsSetup ? '<input type="password" id="password2" placeholder="Confirm password" autocomplete="new-password">' : ''}
                <button type="submit">${needsSetup ? 'Create account' : 'Log in'}</button>
                <div id="login-error" class="error-text"></div>
            </form>
            <div class="small" style="margin-top:12px"><a href="docs.html" title="What the suite is and how the six apps fit together">New to the suite? Start here</a></div>
        </div></div>`;
        document.getElementById('login-form').addEventListener('submit', async (ev) => {
            ev.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            if (needsSetup && password !== document.getElementById('password2').value) {
                document.getElementById('login-error').textContent = 'Passwords do not match.';
                return;
            }
            try {
                await api('POST', needsSetup ? '/api/setup' : '/api/login', { username, password });
                location.hash = '#/launch';
                route();
            } catch (err) {
                document.getElementById('login-error').textContent = err.message;
            }
        });
    }

    // ===== the launcher =====
    async function renderLaunch() {
        setNav('launch', true);
        let s;
        try { s = await GET('/api/settings'); } catch (e) { return; }

        const tiles = APPS.map((a) => {
            if (a.docs) {
                // In-app page: same tab (back returns to the launcher), no
                // override, no external URL line.
                return `
            <a class="tile" href="docs.html">
                <img class="tile-shot" src="tiles/${esc(a.key)}.jpg" alt="">
                <span class="tile-body">
                    <img class="tile-icon" src="${esc(a.icon)}" alt="">
                    <span class="tile-text">
                        <span class="tile-name">${esc(a.name)}</span>
                        <span class="tile-desc">${esc(a.desc)}</span>
                        <span class="tile-url">this portal - no login needed</span>
                    </span>
                </span>
            </a>`;
            }
            const url = (s[`url_${a.key}`] || '').trim() || autoUrl(a.key);
            return `
            <a class="tile" href="${esc(url)}" target="_blank" rel="noopener">
                <img class="tile-shot" src="tiles/${esc(a.key)}.jpg" alt="">
                <span class="tile-body">
                    <img class="tile-icon" src="${esc(a.icon)}" alt="">
                    <span class="tile-text">
                        <span class="tile-name">${esc(a.name)}</span>
                        <span class="tile-desc">${esc(a.desc)}</span>
                        <span class="tile-url">${esc(url.replace(/^https?:\/\//, '').replace(/\/(index\.html|kiosk\.html).*$/, '').replace(/\/$/, ''))}</span>
                    </span>
                </span>
            </a>`;
        }).join('');

        const b = s.board || {};
        const boardBlock = b.enabled ? `
            <div class="panel" id="board-panel">
                <h2>Wall board</h2>
                <div class="section-note">Put a board where the wall reads it - upload an .xcanvas exported
                    from CrossCanvas and the kiosk picks it up on its next refresh. The previous board is
                    kept as a one-step backup.</div>
                <div class="board-row">
                    <span id="board-state" class="muted">${b.exists
                        ? `board.xcanvas - ${(b.size / 1024).toFixed(1)} KB, updated ${esc((b.modifiedAt || '').replace('T', ' ').slice(0, 16))}Z`
                        : 'No board uploaded yet.'}</span>
                    <span class="spacer"></span>
                    <input type="file" id="board-file" accept=".xcanvas,.netdraw,application/json" style="display:none">
                    <button id="board-upload">Upload board</button>
                    ${b.backupExists ? '<button id="board-restore" title="Restore the previous board">Restore backup</button>' : ''}
                </div>
                <div id="board-msg" class="muted small"></div>
            </div>` : `
            <div class="panel">
                <h2>Wall board</h2>
                <div class="section-note">Board uploads are disabled: no board directory is mounted
                    (set BOARD_DIR / mount the shared data folder - see the README).</div>
            </div>`;

        $main.innerHTML = `
        <div class="page-head"><h1>Launch</h1>
            <span class="sub">${s.sso ? 'Single sign-on is active - tiles open already logged in.' : 'SSO is off (set SUITE_SECRET on the suite to log in everywhere at once).'}</span>
        </div>
        <div class="tile-grid">${tiles}</div>
        ${boardBlock}`;

        const fileInput = document.getElementById('board-file');
        const msg = document.getElementById('board-msg');
        document.getElementById('board-upload')?.addEventListener('click', () => fileInput.click());
        fileInput?.addEventListener('change', () => {
            const f = fileInput.files[0];
            if (!f) return;
            msg.textContent = `Uploading ${f.name}...`;
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    await api('POST', '/api/board', reader.result);
                    msg.textContent = 'Board updated. The kiosk shows it on its next poll.';
                    renderLaunch();
                } catch (err) {
                    msg.textContent = `Upload failed: ${err.message}`;
                }
            };
            reader.readAsText(f);
        });
        document.getElementById('board-restore')?.addEventListener('click', async () => {
            try {
                await api('POST', '/api/board/restore', {});
                renderLaunch();
            } catch (err) { msg.textContent = `Restore failed: ${err.message}`; }
        });
    }

    // ===== settings =====
    async function renderSettings() {
        setNav('settings', true);
        let s, usersResp;
        try {
            s = await GET('/api/settings');
            usersResp = await GET('/api/users');
        } catch (e) { return; }
        const users = usersResp.users || [];

        const rows = APPS.filter((a) => !a.docs).map((a) => `
            <label>${esc(a.name)} URL</label>
            <input type="text" data-url="url_${a.key}" value="${esc(s[`url_${a.key}`] || '')}"
                placeholder="auto: ${esc(autoUrl(a.key))}">`).join('');

        $main.innerHTML = `
        <div class="page-head"><h1>Settings</h1></div>
        <div class="panel">
            <h2>Tile destinations</h2>
            <div class="section-note">Blank = automatic: this host, each app's stock port, the portal's
                protocol. Set a URL only when an app lives somewhere else.</div>
            <div class="form-grid">${rows}</div>
            <div class="form-actions"><button class="btn-primary" id="save-urls">Save</button><span id="urls-msg" class="muted"></span></div>
        </div>
        <div class="panel">
            <h2>Single sign-on</h2>
            <div class="section-note">${s.sso
                ? 'Active. Logging in here also signs you into SNMPCanvas, SyslogCanvas, and AlertCanvas (they share this deployment\'s SUITE_SECRET). Tokens live 24 hours and re-mint on every portal visit; rotate SUITE_SECRET to revoke everything at once. Log out here to log out suite-wide.'
                : 'Off. Set the same SUITE_SECRET environment variable on LaunchCanvas, SNMPCanvas, SyslogCanvas, and AlertCanvas to make one login cover the suite.'}</div>
        </div>
        <div class="panel">
            <h2>Users</h2>
            <div class="section-note">One account per human, suite-wide: the SSO token carries the
                username into every app. No roles - every account is equal, can manage accounts,
                and sees the same suite. Guard rails: the last account and your own account
                cannot be deleted.</div>
            <table class="list">
                <thead><tr><th>Username</th><th>Created</th><th></th><th></th></tr></thead>
                <tbody>${users.map((u) => `
                    <tr>
                        <td>${esc(u.username)}${u.self ? ' <span class="muted small">(you)</span>' : ''}</td>
                        <td class="muted small">${esc((u.createdAt || '').slice(0, 10))}</td>
                        <td><button data-reset="${u.id}" data-name="${esc(u.username)}" title="Set a new password; their other sessions are logged out">Reset password</button></td>
                        <td>${u.self ? '' : `<button class="btn-danger" data-del="${u.id}" data-name="${esc(u.username)}">Remove</button>`}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div class="form-grid" style="margin-top:12px">
                <label>New username</label><input type="text" id="nu-name" autocomplete="off">
                <label>Password</label><input type="password" id="nu-pass" autocomplete="new-password">
            </div>
            <div class="form-actions"><button class="btn-primary" id="add-user">Add user</button><span id="users-msg" class="muted"></span></div>
        </div>
        <div class="panel">
            <h2>Change my password</h2>
            <div class="form-grid">
                <label>Current password</label><input type="password" id="pw-current" autocomplete="current-password">
                <label>New password</label><input type="password" id="pw-next" autocomplete="new-password">
            </div>
            <div class="form-actions"><button class="btn-primary" id="save-pw">Change</button><span id="pw-msg" class="muted"></span></div>
        </div>`;

        document.getElementById('save-urls').addEventListener('click', async () => {
            const body = {};
            for (const inp of $main.querySelectorAll('[data-url]')) body[inp.dataset.url] = inp.value;
            const m = document.getElementById('urls-msg');
            try { await api('PATCH', '/api/settings', body); m.textContent = 'Saved.'; }
            catch (err) { m.textContent = err.message; }
        });
        const usersMsg = document.getElementById('users-msg');
        document.getElementById('add-user').addEventListener('click', async () => {
            try {
                await api('POST', '/api/users', {
                    username: document.getElementById('nu-name').value,
                    password: document.getElementById('nu-pass').value
                });
                renderSettings();
            } catch (err) { usersMsg.textContent = err.message; }
        });
        for (const b of $main.querySelectorAll('[data-del]')) {
            b.addEventListener('click', async () => {
                if (!confirm(`Remove user "${b.dataset.name}"?\n\nTheir portal sessions end immediately. If single sign-on is on, a suite token already in their browser keeps working on the other apps until it expires (up to 24h) - to cut that off now, rotate SUITE_SECRET (which signs everyone out).`)) return;
                try { await api('DELETE', `/api/users/${b.dataset.del}`); renderSettings(); }
                catch (err) { usersMsg.textContent = err.message; }
            });
        }
        for (const b of $main.querySelectorAll('[data-reset]')) {
            b.addEventListener('click', async () => {
                const pw = prompt(`New password for "${b.dataset.name}" (8+ characters):`);
                if (pw === null) return;
                try { await api('POST', `/api/users/${b.dataset.reset}/password`, { password: pw }); usersMsg.textContent = `Password reset for ${b.dataset.name}.`; }
                catch (err) { usersMsg.textContent = err.message; }
            });
        }
        document.getElementById('save-pw').addEventListener('click', async () => {
            const m = document.getElementById('pw-msg');
            try {
                await api('POST', '/api/settings/password', {
                    current: document.getElementById('pw-current').value,
                    next: document.getElementById('pw-next').value
                });
                m.textContent = 'Changed.';
            } catch (err) { m.textContent = err.message; }
        });
    }

    route();
})();
