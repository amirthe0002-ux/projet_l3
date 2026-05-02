/**
 * dash_ens.js — Tableau de Bord Enseignant
 *
 * Fixes:
 *  1. Bell button (#notifBtn) wired to the notification dropdown
 *     instead of relying on notifications.js to inject its own bell
 *     (the HTML already has a custom bell, so we reuse it)
 *  2. Notification badge uses #notifBadge (the HTML's own badge element)
 *     AND keeps the notifications.js badge in sync
 *  3. JWT auth check + sidebar user info
 *  4. KPI cards loaded from API
 *  5. Message badge (unread messages count)
 *  6. Logout
 */

document.addEventListener('DOMContentLoaded', async () => {

    // ── 1. AUTH ───────────────────────────────────────────────────────────────
    const TOKEN = (
        localStorage.getItem('access') ||
        sessionStorage.getItem('access') ||
        localStorage.getItem('access_token') ||
        sessionStorage.getItem('access_token') ||
        null
    );
    const USER = (() => {
        try {
            const r = localStorage.getItem('user') || sessionStorage.getItem('user');
            return r ? JSON.parse(r) : null;
        } catch { return null; }
    })();

    if (!TOKEN || !USER) { window.location.href = '/login/'; return; }
    if (USER.role !== 'Enseignant') { window.location.href = '/login/'; return; }

    const API = '/api';
    function authHeaders() {
        return { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
    }
    async function apiFetch(endpoint, opts = {}) {
        try {
            const res = await fetch(`${API}${endpoint}`, {
                ...opts, headers: { ...authHeaders(), ...opts.headers }
            });
            if (res.status === 401) { window.location.href = '/login/'; return { error: true }; }
            if (res.status === 204) return { success: true };
            const data = await res.json();
            if (!res.ok) return { error: true, message: data.detail || data.error || '' };
            return data;
        } catch (e) { return { error: true, message: 'Réseau inaccessible.' }; }
    }

    // ── 2. SIDEBAR USER INFO ──────────────────────────────────────────────────
    const fullName = USER.nom_complet ||
        `${USER.first_name || ''} ${USER.last_name || ''}`.trim() || 'Enseignant';

    const nameEl     = document.getElementById('userName');
    const subtitleEl = document.getElementById('userSubtitle');
    if (nameEl)     nameEl.textContent     = fullName;
    if (subtitleEl) subtitleEl.textContent = USER.email || 'Enseignant';

    // ── 3. KPI CARDS ──────────────────────────────────────────────────────────
    async function loadKPIs() {
        // Load teacher's own groups
        const groupesData = await apiFetch('/groupes/');
        const groupes = Array.isArray(groupesData) ? groupesData : (groupesData.results || []);

        // Count students across all teacher's groups
        let totalEtudiants = 0;
        groupes.forEach(g => { totalEtudiants += g.nombre_etudiants || 0; });

        const elEtu = document.getElementById('statEtudiants');
        const elGrp = document.getElementById('statGroupes');
        if (elEtu) elEtu.textContent = totalEtudiants;
        if (elGrp) elGrp.textContent = groupes.length;

        // Load teacher's own bulletin for hours this month
        const bulletinsData = await apiFetch('/bulletins/');
        const bulletins = Array.isArray(bulletinsData) ? bulletinsData : (bulletinsData.results || []);
        const currentMonth = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        // Try to find this month's bulletin
        const thisMonth = bulletins.find(b =>
            b.periode && b.periode.toLowerCase().includes(
                new Date().toLocaleDateString('fr-FR', { month: 'long' }).toLowerCase()
            )
        );
        const elHrs = document.getElementById('statHeures');
        if (elHrs) elHrs.textContent = thisMonth ? `${thisMonth.heures_travaillees}h` : '—';

        // Load notes to compute average
        const notesData = await apiFetch('/notes/');
        const notes = Array.isArray(notesData) ? notesData : (notesData.results || []);
        if (notes.length) {
            const avg = notes.reduce((s, n) => s + parseFloat(n.note_obtenue || 0), 0) / notes.length;
            const elMoy = document.getElementById('statMoyenne');
            if (elMoy) elMoy.textContent = avg.toFixed(1) + '/20';
        } else {
            const elMoy = document.getElementById('statMoyenne');
            if (elMoy) elMoy.textContent = '—';
        }
    }

    // ── 4. BELL NOTIFICATION DROPDOWN ────────────────────────────────────────
    // The HTML has its own bell (#notifBtn) and badge (#notifBadge).
    // notifications.js looks for #notif-bell-container to inject ITS bell.
    // FIX: we build the dropdown ourselves and attach it to the existing bell.

    // Inject the dropdown HTML next to the bell button
    const notifBtn = document.getElementById('notifBtn');
    if (notifBtn) {
        // Wrap the button so we can position the dropdown relative to it
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:inline-block;';
        notifBtn.parentNode.insertBefore(wrap, notifBtn);
        wrap.appendChild(notifBtn);

        // Create dropdown
        const dropdown = document.createElement('div');
        dropdown.id = 'notif-dropdown-custom';
        dropdown.style.cssText = `
            display:none;
            position:absolute;top:calc(100% + 8px);right:0;
            width:340px;background:#fff;border-radius:16px;
            box-shadow:0 16px 48px rgba(0,0,0,.2);z-index:9998;
            overflow:hidden;animation:notifDropIn .2s ease;`;
        dropdown.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;
                        padding:14px 16px;border-bottom:1px solid #f1f5f9;">
                <h4 style="margin:0;font-size:.95rem;font-weight:700;color:#1e293b;">Notifications</h4>
                <button id="mark-all-btn"
                    style="background:none;border:none;color:#6366f1;font-size:.8rem;
                           cursor:pointer;font-weight:600;padding:0;">
                    Tout marquer lu
                </button>
            </div>
            <div id="notif-list-custom" style="max-height:360px;overflow-y:auto;">
                <div style="padding:2rem;text-align:center;color:#94a3b8;font-size:.875rem;">
                    Chargement...
                </div>
            </div>
            <a href="/notifications/"
               style="display:block;text-align:center;padding:10px;font-size:.82rem;
                      color:#6366f1;font-weight:600;text-decoration:none;
                      border-top:1px solid #f1f5f9;">
                Voir toutes les notifications →
            </a>`;
        wrap.appendChild(dropdown);

        // Inject keyframe animation once
        if (!document.getElementById('notif-drop-anim')) {
            const s = document.createElement('style');
            s.id = 'notif-drop-anim';
            s.textContent = `@keyframes notifDropIn {
                from { opacity:0;transform:translateY(-8px) scale(.97); }
                to   { opacity:1;transform:translateY(0) scale(1); }
            }`;
            document.head.appendChild(s);
        }

        // Toggle on bell click
        notifBtn.addEventListener('click', e => {
            e.stopPropagation();
            const isOpen = dropdown.style.display !== 'none';
            dropdown.style.display = isOpen ? 'none' : 'block';
            if (!isOpen) loadDropdownNotifs();
        });

        // Close on outside click
        document.addEventListener('click', e => {
            if (!wrap.contains(e.target)) dropdown.style.display = 'none';
        });

        // Mark all read
        document.getElementById('mark-all-btn').addEventListener('click', async () => {
            await apiFetch('/notifications/', { method: 'GET' }); // just a ping
            // Use notifications.js WS if available
            if (window.markAllRead) {
                window.markAllRead();
            } else {
                // REST fallback: mark each unread notif
                const data = await apiFetch('/notifications/?statut=Non_lu');
                const list = Array.isArray(data) ? data : (data.results || []);
                for (const n of list) {
                    await apiFetch(`/notifications/${n.id}/lire/`, { method: 'POST' });
                }
            }
            updateNotifBadge(0);
            dropdown.style.display = 'none';
            loadDropdownNotifs();
        });
    }

    // ── 5. LOAD DROPDOWN NOTIFICATIONS ───────────────────────────────────────
    async function loadDropdownNotifs() {
        const list = document.getElementById('notif-list-custom');
        if (!list) return;
        list.innerHTML = '<div style="padding:2rem;text-align:center;color:#94a3b8;">Chargement...</div>';

        const data = await apiFetch('/notifications/?statut=Non_lu');
        if (data?.error) {
            list.innerHTML = '<div style="padding:2rem;text-align:center;color:#94a3b8;">Erreur de chargement</div>';
            return;
        }

        const notifs = Array.isArray(data) ? data : (data.results || []);

        // Update badge
        updateNotifBadge(notifs.length);

        if (!notifs.length) {
            list.innerHTML = '<div style="padding:2rem;text-align:center;color:#94a3b8;">✅ Aucune nouvelle notification</div>';
            return;
        }

        const typeIcons = {
            'Notes':          '📝',
            'Absence':        '⚠️',
            'Paiement':       '💰',
            'Message':        '✉️',
            'Passage_Niveau': '🎓',
            'Planning':       '📅',
            'Alerte':         '🚨',
            'Autre':          'ℹ️',
        };

        list.innerHTML = '';
        notifs.slice(0, 10).forEach(n => {
            const icon = typeIcons[n.type_notification] || 'ℹ️';
            const date = n.date_creation
                ? new Date(n.date_creation).toLocaleString('fr-FR', {
                    day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'
                  })
                : '';

            const item = document.createElement('div');
            item.style.cssText = `
                display:flex;align-items:flex-start;gap:10px;
                padding:12px 16px;border-bottom:1px solid #f8fafc;
                background:#eff6ff;cursor:default;transition:background .15s;`;
            item.innerHTML = `
                <div style="font-size:1.1rem;width:30px;height:30px;border-radius:8px;
                            background:#f1f5f9;display:flex;align-items:center;
                            justify-content:center;flex-shrink:0;">
                    ${icon}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:.85rem;font-weight:600;color:#1e293b;
                                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${escHtml(n.titre)}
                    </div>
                    <div style="font-size:.78rem;color:#64748b;margin-top:2px;
                                display:-webkit-box;-webkit-line-clamp:2;
                                -webkit-box-orient:vertical;overflow:hidden;">
                        ${escHtml(n.contenu)}
                    </div>
                    <div style="font-size:.72rem;color:#94a3b8;margin-top:3px;">${date}</div>
                </div>
                <button data-notif-id="${n.id}"
                    style="background:none;border:none;color:#6366f1;cursor:pointer;
                           font-size:.85rem;padding:4px;border-radius:4px;flex-shrink:0;"
                    title="Marquer lu">✓</button>`;

            // Mark single read
            item.querySelector('button').addEventListener('click', async e => {
                e.stopPropagation();
                const id = parseInt(e.currentTarget.dataset.notifId);
                await apiFetch(`/notifications/${id}/lire/`, { method: 'POST' });
                item.remove();
                const remaining = list.querySelectorAll('[data-notif-id]').length - 1;
                updateNotifBadge(Math.max(0, remaining));
                if (!list.querySelector('[data-notif-id]')) {
                    list.innerHTML = '<div style="padding:2rem;text-align:center;color:#94a3b8;">✅ Tout est lu</div>';
                }
            });

            // Navigate on click (if lien_action)
            if (n.lien_action) {
                item.style.cursor = 'pointer';
                item.addEventListener('click', e => {
                    if (!e.target.closest('button')) window.location.href = n.lien_action;
                });
            }

            list.appendChild(item);
        });
    }

    // ── 6. UPDATE BADGE ───────────────────────────────────────────────────────
    // Updates BOTH the HTML's own badge (#notifBadge) AND
    // notifications.js's badge (#notif-badge) so they stay in sync.
    function updateNotifBadge(count) {
        // HTML's own badge
        const htmlBadge = document.getElementById('notifBadge');
        if (htmlBadge) {
            if (count === 0) {
                htmlBadge.style.display = 'none';
            } else {
                htmlBadge.textContent   = count > 99 ? '99+' : count;
                htmlBadge.style.display = 'flex';
            }
        }
        // notifications.js badge (if it was also injected somewhere)
        const jsBadge = document.getElementById('notif-badge');
        if (jsBadge) {
            if (count === 0) {
                jsBadge.style.display = 'none';
            } else {
                jsBadge.textContent   = count > 99 ? '99+' : count;
                jsBadge.style.display = 'flex';
            }
        }
    }

    // ── 7. MESSAGE BADGE ──────────────────────────────────────────────────────
    async function loadMessageBadge() {
        const data = await apiFetch('/messages/');
        const msgs = Array.isArray(data) ? data : (data.results || []);
        // Count unread messages where we are the recipient
        const unread = msgs.filter(m => !m.lu && m.destinataire === USER.id).length;
        const badge  = document.getElementById('msgBadge');
        if (badge) {
            badge.textContent   = unread > 99 ? '99+' : unread;
            badge.style.display = unread > 0 ? 'flex' : 'none';
        }
    }

    // ── 8. REAL-TIME: LISTEN FOR NEW NOTIFICATIONS FROM notifications.js ─────
    // notifications.js pushes events via WebSocket. When it updates its own
    // badge we mirror it to #notifBadge using a MutationObserver.
    function mirrorNotifJsBadge() {
        const jsBadge = document.getElementById('notif-badge');
        if (!jsBadge) return;
        const observer = new MutationObserver(() => {
            const count = parseInt(jsBadge.textContent) || 0;
            const show  = jsBadge.style.display !== 'none';
            updateNotifBadge(show ? count : 0);
        });
        observer.observe(jsBadge, { characterData: true, childList: true, attributes: true });
    }

    // ── 9. LOGOUT ─────────────────────────────────────────────────────────────
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        const refresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh');
        if (refresh) {
            await fetch(`${API}/auth/logout/`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ refresh }),
            }).catch(() => {});
        }
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/login/';
    });

    // ── 10. UTILS ─────────────────────────────────────────────────────────────
    function escHtml(s) {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    // ── 11. BOOT ──────────────────────────────────────────────────────────────
    await Promise.all([loadKPIs(), loadDropdownNotifs(), loadMessageBadge()]);

    // After notifications.js has loaded and possibly injected #notif-badge,
    // start mirroring it (small delay so notifications.js finishes its DOMContentLoaded)
    setTimeout(mirrorNotifJsBadge, 500);
});