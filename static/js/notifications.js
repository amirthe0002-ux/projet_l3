/**
 * notifications.js
 * Include this on EVERY page (base template).
 *
 * FIX: WebSocket URL now always points to the Django backend (port 8000),
 * not location.host — which was giving a mangled URL when opening HTML
 * files directly or via Live Server on a different port.
 */

(function () {
    'use strict';

    // ── CONFIG ───────────────────────────────────────────────────────────────
    // Always connect to the Django dev server.
    // In production set this to '' (empty string) so it uses the same host.
    const DJANGO_HOST = window.DJANGO_HOST || '127.0.0.1:8000';
    const API_URL     = `http://${DJANGO_HOST}/api`;

    let ws             = null;
    let reconnectTimer = null;
    let reconnectDelay = 3000;

    // ── Auth ─────────────────────────────────────────────────────────────────
    function getToken() {
        return (
            localStorage.getItem('access') ||
            sessionStorage.getItem('access') ||
            localStorage.getItem('access_token') ||
            sessionStorage.getItem('access_token') ||
            null
        );
    }

    // ── WebSocket connection ──────────────────────────────────────────────────
    function connect() {
        const token = getToken();
        if (!token) return; // not logged in

        // FIX: always use DJANGO_HOST, never location.host
        // location.host gives wrong value when page is served from a different port
        const proto = DJANGO_HOST.startsWith('localhost') || DJANGO_HOST.startsWith('127')
            ? 'ws'
            : 'wss';

        const url = `${proto}://${DJANGO_HOST}/ws/notifications/?token=${token}`;
        console.log('[Notif] Connecting to', url);

        ws = new WebSocket(url);

        ws.onopen = () => {
            reconnectDelay = 3000;
            console.log('[Notif] WebSocket connected');
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleMessage(data);
            } catch (_) {}
        };

        ws.onclose = (event) => {
            if (event.code === 4001) {
                console.warn('[Notif] Auth failed (4001), not retrying');
                return;
            }
            console.log('[Notif] WS closed, reconnecting in', reconnectDelay, 'ms');
            clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => {
                reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
                connect();
            }, reconnectDelay);
        };

        ws.onerror = (err) => {
            console.error('[Notif] WS error', err);
            ws.close();
        };
    }

    // ── Handle incoming messages ──────────────────────────────────────────────
    function handleMessage(data) {
        switch (data.type) {
            case 'notification':
                showToastNotification(data);
                updateBadge(null, '+1');
                addToDropdown(data);
                break;
            case 'unread_count':
                updateBadge(data.count);
                break;
            case 'pong':
                break;
        }
    }

    // ── Badge ─────────────────────────────────────────────────────────────────
    function updateBadge(count, mode = 'set') {
        const badge = document.getElementById('notif-badge');
        if (!badge) return;

        if (mode === '+1') {
            const current = parseInt(badge.textContent) || 0;
            count = current + 1;
        }

        if (count === 0) {
            badge.style.display = 'none';
        } else {
            badge.textContent   = count > 99 ? '99+' : count;
            badge.style.display = 'flex';
            badge.classList.add('notif-badge-bump');
            setTimeout(() => badge.classList.remove('notif-badge-bump'), 400);
        }
    }

    // ── Toast popup ───────────────────────────────────────────────────────────
    function showToastNotification(data) {
        const typeColors = {
            'Note':     '#6366f1',
            'Absence':  '#f59e0b',
            'Paiement': '#059669',
            'Message':  '#3b82f6',
            'Info':     '#0284c7',
            'Urgent':   '#dc2626',
        };
        const typeIcons = {
            'Note':     '📝',
            'Absence':  '⚠️',
            'Paiement': '💰',
            'Message':  '✉️',
            'Info':     'ℹ️',
            'Urgent':   '🚨',
        };

        const color = data.urgent ? '#dc2626' : (typeColors[data.notif_type] || '#0284c7');
        const icon  = typeIcons[data.notif_type] || 'ℹ️';

        const toast = document.createElement('div');
        toast.className = 'notif-toast';
        toast.innerHTML = `
            <div class="notif-toast-icon">${icon}</div>
            <div class="notif-toast-body">
                <div class="notif-toast-title">${escapeHtml(data.titre)}</div>
                <div class="notif-toast-text">${escapeHtml(data.contenu)}</div>
            </div>
            <button class="notif-toast-close" onclick="this.closest('.notif-toast').remove()">×</button>`;
        toast.style.setProperty('--notif-color', color);

        if (data.lien) {
            toast.style.cursor = 'pointer';
            toast.addEventListener('click', (e) => {
                if (!e.target.classList.contains('notif-toast-close')) {
                    window.location.href = data.lien;
                }
            });
        }

        let container = document.getElementById('notif-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'notif-toast-container';
            document.body.appendChild(container);
        }
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('notif-toast-out');
            setTimeout(() => toast.remove(), 400);
        }, 6000);
    }

    // ── Bell icon + dropdown ──────────────────────────────────────────────────
    function injectBell() {
        // FIX: the dashboard HTML had TWO elements with id="notif-bell-container"
        // (one in sidebar, one in header). We inject into the FIRST one found
        // and remove duplicates.
        const containers = document.querySelectorAll('#notif-bell-container');
        if (!containers.length) return;

        // Remove extra duplicates, keep only the first
        for (let i = 1; i < containers.length; i++) {
            containers[i].removeAttribute('id');
        }

        const container = containers[0];
        container.innerHTML = `
            <div class="notif-bell-wrap" id="notifBellWrap">
                <button class="notif-bell-btn" id="notifBellBtn" onclick="toggleNotifDropdown()">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                         stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    <span id="notif-badge" class="notif-badge" style="display:none;">0</span>
                </button>
                <div class="notif-dropdown" id="notifDropdown" style="display:none;">
                    <div class="notif-dropdown-header">
                        <h4>Notifications</h4>
                        <button onclick="markAllRead()" class="notif-mark-all">Tout marquer lu</button>
                    </div>
                    <div class="notif-list" id="notifList">
                        <div class="notif-loading"><span>Chargement...</span></div>
                    </div>
                    <a href="/notifications/" class="notif-see-all">Voir toutes les notifications →</a>
                </div>
            </div>`;

        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('notifBellWrap');
            if (wrap && !wrap.contains(e.target)) {
                const dd = document.getElementById('notifDropdown');
                if (dd) dd.style.display = 'none';
            }
        });
    }

    // ── Dropdown toggle ───────────────────────────────────────────────────────
    window.toggleNotifDropdown = function () {
        const dd = document.getElementById('notifDropdown');
        if (!dd) return;
        const isOpen = dd.style.display !== 'none';
        dd.style.display = isOpen ? 'none' : 'block';
        if (!isOpen) loadRecentNotifications();
    };

    // ── Add notification to dropdown ──────────────────────────────────────────
    function addToDropdown(data) {
        const list = document.getElementById('notifList');
        if (!list) return;
        list.querySelector('.notif-empty')?.remove();
        list.querySelector('.notif-loading')?.remove();

        const item = buildNotifItem({
            id:                  data.id,
            titre:               data.titre,
            contenu:             data.contenu,
            type_notification:   data.notif_type,
            urgent:              data.urgent,
            lien_action:         data.lien,
            date_creation:       data.date,
            statut_notification: 'Non_lu',
        });
        list.insertBefore(item, list.firstChild);
    }

    // ── Load recent notifications from REST API ───────────────────────────────
    async function loadRecentNotifications() {
        const list = document.getElementById('notifList');
        if (!list) return;
        list.innerHTML = '<div class="notif-loading"><span>Chargement...</span></div>';

        try {
            const res = await fetch(`${API_URL}/notifications/?statut=Non_lu`, {
                headers: {
                    'Authorization': `Bearer ${getToken()}`,
                    'Content-Type':  'application/json',
                },
            });
            if (!res.ok) throw new Error('API error ' + res.status);
            const data   = await res.json();
            const notifs = Array.isArray(data) ? data : (data.results || []);

            list.innerHTML = '';

            if (!notifs.length) {
                list.innerHTML = '<div class="notif-empty">✅ Aucune nouvelle notification</div>';
                return;
            }

            notifs.slice(0, 10).forEach(n => list.appendChild(buildNotifItem(n)));

        } catch (err) {
            console.error('[Notif] loadRecentNotifications error:', err);
            list.innerHTML = '<div class="notif-empty">Erreur de chargement</div>';
        }
    }

    function buildNotifItem(n) {
        const typeIcons = {
            'Note':'📝','Absence':'⚠️','Paiement':'💰',
            'Message':'✉️','Info':'ℹ️','Urgent':'🚨'
        };
        const icon     = typeIcons[n.type_notification] || 'ℹ️';
        const isUnread = n.statut_notification === 'Non_lu';
        const date     = n.date_creation
            ? new Date(n.date_creation).toLocaleString('fr-FR', {
                day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'
              })
            : '';

        const item = document.createElement('div');
        item.className    = `notif-item ${isUnread ? 'notif-unread' : ''}`;
        item.dataset.id   = n.id;
        item.innerHTML = `
            <div class="notif-item-icon ${n.urgent ? 'notif-urgent' : ''}">${icon}</div>
            <div class="notif-item-body">
                <div class="notif-item-title">${escapeHtml(n.titre)}</div>
                <div class="notif-item-text">${escapeHtml(n.contenu)}</div>
                <div class="notif-item-date">${date}</div>
            </div>
            ${isUnread ? `<button class="notif-read-btn" onclick="markOneRead(${n.id}, this)" title="Marquer lu">✓</button>` : ''}`;

        if (n.lien_action) {
            item.style.cursor = 'pointer';
            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('notif-read-btn')) {
                    markOneRead(n.id);
                    window.location.href = n.lien_action;
                }
            });
        }

        return item;
    }

    // ── Mark read ─────────────────────────────────────────────────────────────
    window.markOneRead = function (id, btn) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'mark_read', id }));
        } else {
            fetch(`${API_URL}/notifications/${id}/lire/`, {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` },
            });
        }
        const item = document.querySelector(`.notif-item[data-id="${id}"]`);
        if (item) {
            item.classList.remove('notif-unread');
            item.querySelector('.notif-read-btn')?.remove();
        }
        if (btn) btn.remove();
    };

    window.markAllRead = function () {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'mark_all_read' }));
        }
        document.querySelectorAll('.notif-item').forEach(item => {
            item.classList.remove('notif-unread');
            item.querySelector('.notif-read-btn')?.remove();
        });
        updateBadge(0);
    };

    // ── Utility ───────────────────────────────────────────────────────────────
    function escapeHtml(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // ── Inject CSS ────────────────────────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('notif-styles')) return;
        const s = document.createElement('style');
        s.id = 'notif-styles';
        s.textContent = `
        #notif-toast-container {
            position:fixed; bottom:24px; right:24px; z-index:99999;
            display:flex; flex-direction:column; gap:10px; pointer-events:none;
        }
        .notif-toast {
            display:flex; align-items:flex-start; gap:12px;
            background:#fff; border-radius:14px; padding:14px 16px;
            box-shadow:0 8px 32px rgba(0,0,0,.18);
            border-left:4px solid var(--notif-color,#6366f1);
            min-width:300px; max-width:400px;
            pointer-events:all; cursor:default;
            animation:notifSlideIn .35s cubic-bezier(.34,1.56,.64,1);
        }
        .notif-toast-out { animation:notifSlideOut .3s ease forwards; }
        .notif-toast-icon { font-size:1.4rem; flex-shrink:0; margin-top:1px; }
        .notif-toast-body { flex:1; min-width:0; }
        .notif-toast-title { font-weight:700; font-size:.9rem; color:#1e293b; margin-bottom:3px; }
        .notif-toast-text  { font-size:.82rem; color:#64748b; line-height:1.4;
                             white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .notif-toast-close {
            background:none; border:none; color:#94a3b8; cursor:pointer;
            font-size:1.2rem; padding:0; line-height:1; flex-shrink:0;
        }
        .notif-toast-close:hover { color:#374151; }
        .notif-bell-wrap { position:relative; display:inline-block; }
        .notif-bell-btn {
            background:none; border:none; cursor:pointer; padding:8px;
            color:#64748b; border-radius:10px; transition:all .2s;
            display:flex; align-items:center; justify-content:center; position:relative;
        }
        .notif-bell-btn:hover { background:#f1f5f9; color:#1e293b; }
        .notif-badge {
            position:absolute; top:2px; right:2px;
            background:#ef4444; color:#fff; border-radius:99px;
            font-size:.65rem; font-weight:700; min-width:18px; height:18px;
            display:flex; align-items:center; justify-content:center; padding:0 4px;
            border:2px solid #fff;
        }
        @keyframes notif-badge-bump {
            0%,100% { transform:scale(1); }
            50%      { transform:scale(1.4); }
        }
        .notif-badge-bump { animation:notif-badge-bump .3s ease; }
        .notif-dropdown {
            position:absolute; top:calc(100% + 8px); right:0;
            width:340px; background:#fff; border-radius:16px;
            box-shadow:0 16px 48px rgba(0,0,0,.16); z-index:9998;
            overflow:hidden; animation:notifDropIn .2s ease;
        }
        .notif-dropdown-header {
            display:flex; justify-content:space-between; align-items:center;
            padding:14px 16px; border-bottom:1px solid #f1f5f9;
        }
        .notif-dropdown-header h4 { margin:0; font-size:.95rem; font-weight:700; color:#1e293b; }
        .notif-mark-all {
            background:none; border:none; color:#6366f1; font-size:.8rem;
            cursor:pointer; font-weight:600; padding:0;
        }
        .notif-mark-all:hover { text-decoration:underline; }
        .notif-list { max-height:360px; overflow-y:auto; }
        .notif-loading, .notif-empty {
            padding:2rem; text-align:center; color:#94a3b8; font-size:.875rem;
        }
        .notif-item {
            display:flex; align-items:flex-start; gap:10px;
            padding:12px 16px; border-bottom:1px solid #f8fafc;
            transition:background .15s; cursor:default;
        }
        .notif-item:hover { background:#f8fafc; }
        .notif-unread { background:#eff6ff; }
        .notif-unread:hover { background:#dbeafe; }
        .notif-item-icon {
            font-size:1.2rem; width:32px; height:32px; border-radius:8px;
            background:#f1f5f9; display:flex; align-items:center;
            justify-content:center; flex-shrink:0;
        }
        .notif-urgent { background:#fef2f2; }
        .notif-item-body { flex:1; min-width:0; }
        .notif-item-title {
            font-size:.85rem; font-weight:600; color:#1e293b;
            white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .notif-item-text {
            font-size:.78rem; color:#64748b; margin-top:2px;
            display:-webkit-box; -webkit-line-clamp:2;
            -webkit-box-orient:vertical; overflow:hidden;
        }
        .notif-item-date { font-size:.72rem; color:#94a3b8; margin-top:4px; }
        .notif-read-btn {
            background:none; border:none; color:#6366f1; cursor:pointer;
            font-size:.9rem; padding:4px; flex-shrink:0;
            border-radius:4px; transition:background .15s;
        }
        .notif-read-btn:hover { background:#ede9fe; }
        .notif-see-all {
            display:block; text-align:center; padding:10px;
            font-size:.82rem; color:#6366f1; font-weight:600;
            text-decoration:none; border-top:1px solid #f1f5f9;
            transition:background .15s;
        }
        .notif-see-all:hover { background:#f5f3ff; }
        @keyframes notifSlideIn {
            from { opacity:0; transform:translateX(40px) scale(.95); }
            to   { opacity:1; transform:translateX(0)   scale(1); }
        }
        @keyframes notifSlideOut {
            from { opacity:1; transform:translateX(0); }
            to   { opacity:0; transform:translateX(40px); }
        }
        @keyframes notifDropIn {
            from { opacity:0; transform:translateY(-8px) scale(.97); }
            to   { opacity:1; transform:translateY(0)   scale(1); }
        }`;
        document.head.appendChild(s);
    }

    // ── Keepalive ping every 25s ──────────────────────────────────────────────
    function startPing() {
        setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ action: 'ping' }));
            }
        }, 25000);
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        injectStyles();
        injectBell();
        connect();
        startPing();
    });

})();