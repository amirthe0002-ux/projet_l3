/**
 * dash_ens.js — Tableau de Bord Enseignant (Enhanced v2)
 *
 * FIXES:
 *  - Real student count fetched live from /etudiants/?groupe=X (not stale cached field)
 *
 * IMPROVEMENTS:
 *  - KPI cards animate on load (count-up effect)
 *  - Upcoming classes: richer layout with salle + level badge
 *  - Recent notes: color-coded score ring + evaluation type
 *  - Absence alerts: severity color tiers (orange / red)
 *  - Quick actions: hover gradient effect
 *  - Notification dropdown: improved item style
 *  - Global loading skeleton while data fetches
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

    // ── 2. UTILS ──────────────────────────────────────────────────────────────
    function escHtml(s) {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    /** Animate a number counting up from 0 to target */
    function countUp(el, target, suffix = '', duration = 900) {
        if (!el) return;
        const isFloat = String(target).includes('.');
        const start   = performance.now();
        function step(now) {
            const progress = Math.min((now - start) / duration, 1);
            const eased    = 1 - Math.pow(1 - progress, 3);
            const value    = eased * target;
            el.textContent = (isFloat ? value.toFixed(1) : Math.round(value)) + suffix;
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    /** Skeleton loader HTML for a widget body */
    function skeletonRows(n = 3) {
        return Array.from({ length: n }, () => `
            <div style="display:flex;align-items:center;gap:12px;padding:12px 0;
                        border-bottom:1px solid #f1f5f9;">
                <div style="width:40px;height:40px;border-radius:10px;
                            background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);
                            background-size:200% 100%;animation:shimmer 1.4s infinite;
                            flex-shrink:0;"></div>
                <div style="flex:1;display:flex;flex-direction:column;gap:6px;">
                    <div style="height:12px;border-radius:6px;width:60%;
                                background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);
                                background-size:200% 100%;animation:shimmer 1.4s infinite;"></div>
                    <div style="height:10px;border-radius:6px;width:40%;
                                background:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);
                                background-size:200% 100%;animation:shimmer 1.4s infinite;"></div>
                </div>
            </div>`).join('');
    }

    // Inject shimmer keyframe once
    if (!document.getElementById('dash-shimmer-style')) {
        const s = document.createElement('style');
        s.id = 'dash-shimmer-style';
        s.textContent = `
            @keyframes shimmer {
                0%   { background-position: 200% 0; }
                100% { background-position: -200% 0; }
            }
            @keyframes notifDropIn {
                from { opacity:0;transform:translateY(-8px) scale(.97); }
                to   { opacity:1;transform:translateY(0) scale(1); }
            }
            @keyframes fadeInUp {
                from { opacity:0;transform:translateY(16px); }
                to   { opacity:1;transform:translateY(0); }
            }
            .dash-widget-anim {
                animation: fadeInUp .4s ease both;
            }
        `;
        document.head.appendChild(s);
    }

    // ── 3. SIDEBAR USER INFO ──────────────────────────────────────────────────
    const fullName = USER.nom_complet ||
        `${USER.first_name || ''} ${USER.last_name || ''}`.trim() || 'Enseignant';

    const nameEl     = document.getElementById('userName');
    const subtitleEl = document.getElementById('userSubtitle');
    if (nameEl)     nameEl.textContent     = fullName;
    if (subtitleEl) subtitleEl.textContent = USER.email || 'Enseignant';

    // ── 4. SKELETON: show while loading ──────────────────────────────────────
    ['upcomingClasses', 'recentNotes', 'absenceAlerts'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = skeletonRows(3);
    });
    ['statEtudiants', 'statGroupes', 'statHeures', 'statPresence'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '…';
    });

    // ── 5. KPI CARDS ──────────────────────────────────────────────────────────
    async function loadKPIs() {
        // Load teacher's groups
        const groupesData = await apiFetch('/groupes/');
        const groupes = Array.isArray(groupesData)
            ? groupesData : (groupesData.results || []);

        // ── FIX: Fetch real student counts live from /etudiants/?groupe=X ──
        const countResults = await Promise.all(
            groupes.map(g => apiFetch(`/etudiants/?groupe=${g.id}`))
        );
        let totalEtudiants = 0;
        countResults.forEach(res => {
            if (!res?.error) {
                totalEtudiants += Array.isArray(res)
                    ? res.length
                    : (res?.results?.length ?? 0);
            }
        });

        countUp(document.getElementById('statEtudiants'), totalEtudiants);
        countUp(document.getElementById('statGroupes'),   groupes.length);

        // Hours this month from bulletins
        const bulletinsData = await apiFetch('/bulletins/');
        const bulletins = Array.isArray(bulletinsData)
            ? bulletinsData : (bulletinsData.results || []);
        const currentMonthName = new Date()
            .toLocaleDateString('fr-FR', { month: 'long' }).toLowerCase();
        const thisMonth = bulletins.find(b =>
            b.periode && b.periode.toLowerCase().includes(currentMonthName)
        );
        const elHrs = document.getElementById('statHeures');
        if (elHrs) {
            if (thisMonth?.heures_travaillees) {
                countUp(elHrs, parseFloat(thisMonth.heures_travaillees), 'h');
            } else {
                elHrs.textContent = '—';
            }
        }

        // Attendance rate from absences
        const absencesData = await apiFetch('/absences/');
        const absences = Array.isArray(absencesData)
            ? absencesData : (absencesData.results || []);

        const now          = new Date();
        const monthAbsences = absences.filter(a => {
            if (!a.date) return false;
            const d = new Date(a.date);
            return d.getMonth() === now.getMonth() &&
                   d.getFullYear() === now.getFullYear();
        });

        const uniqueDates = new Set(monthAbsences.map(a => a.date)).size;
        const elPres      = document.getElementById('statPresence');

        if (!elPres) return;

        if (monthAbsences.length === 0 || uniqueDates === 0 || totalEtudiants === 0) {
            elPres.textContent = '—';
            return;
        }

        const totalPossible = totalEtudiants * uniqueDates;
        const rate = Math.max(0, Math.min(100,
            ((totalPossible - monthAbsences.length) / totalPossible) * 100
        ));

        countUp(elPres, rate, '%');

        // Color code
        const color = rate >= 90 ? '#059669' : rate >= 75 ? '#d97706' : '#dc2626';
        elPres.style.color = color;

        // Inject mini progress bar under presence card if card has .stat-card parent
        const card = elPres.closest?.('.stat-card');
        if (card && !card.querySelector('.presence-bar')) {
            const bar = document.createElement('div');
            bar.className = 'presence-bar';
            bar.style.cssText = `
                height:4px;border-radius:2px;background:#e2e8f0;
                margin-top:8px;overflow:hidden;`;
            const fill = document.createElement('div');
            fill.style.cssText = `
                height:100%;border-radius:2px;
                background:${color};width:0;transition:width 1s ease;`;
            bar.appendChild(fill);
            card.appendChild(bar);
            setTimeout(() => { fill.style.width = `${rate}%`; }, 100);
        }
    }

    // ── 6. UPCOMING CLASSES WIDGET ────────────────────────────────────────────
    async function loadUpcomingClasses() {
        const container = document.getElementById('upcomingClasses');
        if (!container) return;

        const seancesData = await apiFetch('/seances/');
        const seances = Array.isArray(seancesData)
            ? seancesData : (seancesData.results || []);

        const now      = new Date();
        const upcoming = seances
            .filter(s => s.date && new Date(s.date) >= now)
            .sort((a, b) => new Date(a.date) - new Date(b.date))
            .slice(0, 5);

        if (!upcoming.length) {
            container.innerHTML = `
                <div style="text-align:center;padding:32px 16px;color:#94a3b8;">
                    <div style="font-size:2rem;margin-bottom:8px;">📅</div>
                    <div style="font-weight:500;">Aucun cours à venir</div>
                </div>`;
            return;
        }

        const levelColors = {
            A1:'#fee2e2,#991b1b', A2:'#ffedd5,#9a3412',
            B1:'#fef9c3,#854d0e', B2:'#dcfce7,#166534', C1:'#dbeafe,#1e40af',
        };

        container.innerHTML = '';
        upcoming.forEach((s, i) => {
            const date     = new Date(s.date);
            const today    = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);

            const isToday    = date.toDateString() === today.toDateString();
            const isTomorrow = date.toDateString() === tomorrow.toDateString();

            const badgeBg   = isToday ? '#667eea' : isTomorrow ? '#f59e0b' : '#e2e8f0';
            const badgeText = isToday ? '#fff'     : isTomorrow ? '#fff'    : '#64748b';
            const badgeLabel = isToday ? "Aujourd'hui" : isTomorrow ? 'Demain'
                : date.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });

            const timeStr = s.heure_debut ? s.heure_debut.substring(0, 5) : '';
            const timeEnd = s.heure_fin   ? s.heure_fin.substring(0, 5)   : '';

            const niveau = s.niveau || s.groupe_niveau || '';
            const [lvlBg, lvlTx] = (levelColors[niveau] || '').split(',');

            const item = document.createElement('div');
            item.className = 'dash-widget-anim';
            item.style.cssText = `
                display:flex;align-items:center;gap:14px;
                padding:14px 0;border-bottom:1px solid #f1f5f9;
                animation-delay:${i * 60}ms;`;
            item.innerHTML = `
                <!-- Date block -->
                <div style="width:48px;height:54px;border-radius:12px;flex-shrink:0;
                            background:linear-gradient(135deg,#667eea,#764ba2);
                            display:flex;flex-direction:column;align-items:center;
                            justify-content:center;box-shadow:0 4px 10px rgba(102,126,234,.3);">
                    <span style="font-size:1.2rem;font-weight:800;color:white;line-height:1;">
                        ${date.getDate()}
                    </span>
                    <span style="font-size:0.65rem;color:rgba(255,255,255,.8);text-transform:uppercase;">
                        ${date.toLocaleDateString('fr-FR', { month: 'short' })}
                    </span>
                </div>

                <!-- Info -->
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                        <span style="font-weight:700;color:#1e293b;font-size:.9rem;
                                     white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                            ${escHtml(s.groupe_nom || s.groupe || 'Groupe')}
                        </span>
                        ${niveau ? `
                        <span style="padding:2px 7px;border-radius:20px;font-size:.65rem;
                                     font-weight:700;flex-shrink:0;
                                     background:${lvlBg||'#f1f5f9'};
                                     color:${lvlTx||'#475569'};">
                            ${niveau}
                        </span>` : ''}
                    </div>
                    <div style="font-size:.78rem;color:#64748b;display:flex;
                                align-items:center;gap:6px;flex-wrap:wrap;">
                        ${timeStr ? `<span>🕐 ${timeStr}${timeEnd ? ' – ' + timeEnd : ''}</span>` : ''}
                        ${s.salle ? `<span>📍 ${escHtml(s.salle)}</span>` : ''}
                    </div>
                </div>

                <!-- Badge -->
                <span style="padding:5px 10px;border-radius:20px;font-size:.72rem;
                             font-weight:700;flex-shrink:0;
                             background:${badgeBg};color:${badgeText};">
                    ${badgeLabel}
                </span>`;
            container.appendChild(item);
        });
    }

    // ── 7. RECENT NOTES WIDGET ────────────────────────────────────────────────
    async function loadRecentNotes() {
        const container = document.getElementById('recentNotes');
        if (!container) return;

        const notesData = await apiFetch('/notes/');
        const notes = Array.isArray(notesData)
            ? notesData : (notesData.results || []);

        if (!notes.length) {
            container.innerHTML = `
                <div style="text-align:center;padding:32px 16px;color:#94a3b8;">
                    <div style="font-size:2rem;margin-bottom:8px;">📝</div>
                    <div style="font-weight:500;">Aucune note enregistrée</div>
                </div>`;
            return;
        }

        const recent = notes
            .filter(n => n.date_saisie || n.date)
            .sort((a, b) =>
                new Date(b.date_saisie || b.date) - new Date(a.date_saisie || a.date)
            )
            .slice(0, 5);

        if (!recent.length) {
            container.innerHTML = `
                <div style="text-align:center;padding:32px 16px;color:#94a3b8;">
                    <div style="font-size:2rem;margin-bottom:8px;">📝</div>
                    <div>Aucune note récente</div>
                </div>`;
            return;
        }

        const typeColors = {
            Ecrit:         { bg:'#dbeafe', tx:'#1e40af' },
            Oral:          { bg:'#dcfce7', tx:'#166534' },
            Comprehension: { bg:'#f3e8ff', tx:'#7c3aed' },
            Participation: { bg:'#ffedd5', tx:'#9a3412' },
        };

        container.innerHTML = '';
        recent.forEach((n, i) => {
            const note      = parseFloat(n.note_obtenue || 0);
            const max       = parseFloat(n.note_max || 20);
            const pct       = max > 0 ? (note / max) * 100 : 0;

            const scoreColor = note >= (max * 0.7) ? '#059669'
                             : note >= (max * 0.5) ? '#d97706'
                             : '#dc2626';

            const tc = typeColors[n.type_evaluation] || typeColors.Ecrit;

            const studentName = n.etudiant_nom_complet
                || `${n.etudiant_prenom || ''} ${n.etudiant_nom || ''}`.trim()
                || 'Étudiant';
            const initials = studentName.split(' ')
                .map(w => w[0]).join('').toUpperCase().slice(0, 2);

            const dateStr = (n.date_saisie || n.date)
                ? new Date(n.date_saisie || n.date)
                    .toLocaleDateString('fr-FR', { day:'2-digit', month:'short' })
                : '';

            const item = document.createElement('div');
            item.className = 'dash-widget-anim';
            item.style.cssText = `
                display:flex;align-items:center;gap:12px;
                padding:13px 0;border-bottom:1px solid #f1f5f9;
                animation-delay:${i * 60}ms;`;
            item.innerHTML = `
                <!-- Avatar -->
                <div style="width:40px;height:40px;border-radius:50%;flex-shrink:0;
                            background:linear-gradient(135deg,#667eea,#764ba2);
                            display:flex;align-items:center;justify-content:center;
                            color:white;font-weight:700;font-size:.8rem;">
                    ${initials}
                </div>

                <!-- Info -->
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;color:#1e293b;font-size:.875rem;
                                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${escHtml(studentName)}
                    </div>
                    <div style="display:flex;align-items:center;gap:6px;margin-top:3px;
                                flex-wrap:wrap;">
                        <span style="font-size:.72rem;padding:2px 7px;border-radius:20px;
                                     font-weight:600;
                                     background:${tc.bg};color:${tc.tx};">
                            ${escHtml(n.type_evaluation || n.evaluation_titre || 'Éval.')}
                        </span>
                        ${dateStr ? `<span style="font-size:.72rem;color:#94a3b8;">${dateStr}</span>` : ''}
                    </div>
                </div>

                <!-- Score ring -->
                <div style="text-align:center;flex-shrink:0;">
                    <div style="font-size:1.1rem;font-weight:800;color:${scoreColor};">
                        ${note.toFixed(1)}
                    </div>
                    <div style="font-size:.65rem;color:#94a3b8;">/ ${max}</div>
                    <!-- mini bar -->
                    <div style="width:36px;height:3px;background:#e2e8f0;
                                border-radius:2px;margin-top:3px;overflow:hidden;">
                        <div style="height:100%;border-radius:2px;
                                    background:${scoreColor};width:${pct}%;"></div>
                    </div>
                </div>`;
            container.appendChild(item);
        });
    }

    // ── 8. ABSENCE ALERTS WIDGET ──────────────────────────────────────────────
    async function loadAbsenceAlerts() {
        const container = document.getElementById('absenceAlerts');
        if (!container) return;

        const absencesData = await apiFetch('/absences/');
        const absences = Array.isArray(absencesData)
            ? absencesData : (absencesData.results || []);

        if (!absences.length) {
            container.innerHTML = `
                <div style="text-align:center;padding:32px 16px;color:#94a3b8;">
                    <div style="font-size:2rem;margin-bottom:8px;">✅</div>
                    <div style="font-weight:500;">Aucune absence enregistrée</div>
                </div>`;
            return;
        }

        // Group by student
        const studentAbsences = {};
        absences.forEach(a => {
            const key = a.etudiant_id || a.etudiant;
            if (!studentAbsences[key]) {
                studentAbsences[key] = {
                    id:       key,
                    name:     a.etudiant_nom_complet
                              || `${a.etudiant_prenom || ''} ${a.etudiant_nom || ''}`.trim()
                              || 'Étudiant',
                    count:    0,
                    lastDate: a.date,
                    justified: 0,
                };
            }
            studentAbsences[key].count++;
            if (a.justifiee || a.justifié) studentAbsences[key].justified++;
            if (a.date && new Date(a.date) > new Date(studentAbsences[key].lastDate)) {
                studentAbsences[key].lastDate = a.date;
            }
        });

        const alerts = Object.values(studentAbsences)
            .filter(s => s.count >= 2)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);

        if (!alerts.length) {
            container.innerHTML = `
                <div style="text-align:center;padding:32px 16px;color:#94a3b8;">
                    <div style="font-size:2rem;margin-bottom:8px;">✅</div>
                    <div style="font-weight:500;">Aucune alerte d'absence</div>
                </div>`;
            return;
        }

        container.innerHTML = '';
        alerts.forEach((s, i) => {
            const lastDate = s.lastDate
                ? new Date(s.lastDate).toLocaleDateString('fr-FR',
                    { day:'2-digit', month:'short' })
                : '';

            // Severity tiers
            const severity = s.count >= 6 ? 'critical'
                           : s.count >= 4 ? 'high'
                           : 'medium';
            const severityStyles = {
                critical: { bg:'#fef2f2', border:'#fecaca', badge:'#dc2626', icon:'🔴' },
                high:     { bg:'#fff7ed', border:'#fed7aa', badge:'#ea580c', icon:'🟠' },
                medium:   { bg:'#fffbeb', border:'#fde68a', badge:'#d97706', icon:'🟡' },
            };
            const ss = severityStyles[severity];

            const unjustified = s.count - s.justified;

            const item = document.createElement('div');
            item.className = 'dash-widget-anim';
            item.style.cssText = `
                display:flex;align-items:center;gap:12px;
                padding:12px 14px;border-radius:12px;margin-bottom:8px;
                background:${ss.bg};border:1px solid ${ss.border};
                animation-delay:${i * 70}ms;`;
            item.innerHTML = `
                <!-- Icon -->
                <div style="font-size:1.2rem;flex-shrink:0;">${ss.icon}</div>

                <!-- Info -->
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:700;color:#1e293b;font-size:.875rem;
                                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${escHtml(s.name)}
                    </div>
                    <div style="font-size:.75rem;color:#64748b;margin-top:2px;
                                display:flex;gap:8px;flex-wrap:wrap;">
                        <span>Dernière : ${lastDate}</span>
                        ${unjustified > 0
                            ? `<span style="color:#dc2626;font-weight:600;">
                                ${unjustified} non justifiée${unjustified > 1 ? 's' : ''}
                               </span>`
                            : `<span style="color:#059669;">Toutes justifiées</span>`
                        }
                    </div>
                </div>

                <!-- Count badge -->
                <div style="flex-shrink:0;text-align:center;">
                    <div style="background:${ss.badge};color:white;
                                border-radius:10px;padding:4px 10px;
                                font-weight:800;font-size:.85rem;
                                min-width:32px;text-align:center;">
                        ${s.count}
                    </div>
                    <div style="font-size:.65rem;color:#94a3b8;margin-top:2px;">abs.</div>
                </div>`;
            container.appendChild(item);
        });
    }

    // ── 9. BELL NOTIFICATION DROPDOWN ────────────────────────────────────────
    const notifBtn = document.getElementById('notifBtn');
    if (notifBtn) {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;display:inline-block;';
        notifBtn.parentNode.insertBefore(wrap, notifBtn);
        wrap.appendChild(notifBtn);

        const dropdown = document.createElement('div');
        dropdown.id = 'notif-dropdown-custom';
        dropdown.style.cssText = `
            display:none;
            position:absolute;top:calc(100% + 10px);right:0;
            width:360px;background:#fff;border-radius:16px;
            box-shadow:0 16px 48px rgba(0,0,0,.18);
            border:1px solid #e2e8f0;
            z-index:9998;overflow:hidden;
            animation:notifDropIn .2s ease;`;

        dropdown.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;
                        padding:14px 18px;
                        background:linear-gradient(135deg,#667eea,#764ba2);">
                <h4 style="margin:0;font-size:.95rem;font-weight:700;color:white;">
                    🔔 Notifications
                </h4>
                <button id="mark-all-btn"
                    style="background:rgba(255,255,255,.2);border:none;color:white;
                           font-size:.78rem;cursor:pointer;font-weight:600;
                           padding:5px 10px;border-radius:8px;">
                    Tout lu ✓
                </button>
            </div>
            <div id="notif-list-custom" style="max-height:360px;overflow-y:auto;">
                <div style="padding:2rem;text-align:center;color:#94a3b8;font-size:.875rem;">
                    Chargement...
                </div>
            </div>
            <a href="/notifications/"
               style="display:block;text-align:center;padding:11px;font-size:.82rem;
                      color:#667eea;font-weight:700;text-decoration:none;
                      border-top:1px solid #f1f5f9;
                      transition:background .15s;"
               onmouseover="this.style.background='#f8fafc'"
               onmouseout="this.style.background='transparent'">
                Voir toutes les notifications →
            </a>`;
        wrap.appendChild(dropdown);

        notifBtn.addEventListener('click', e => {
            e.stopPropagation();
            const isOpen = dropdown.style.display !== 'none';
            dropdown.style.display = isOpen ? 'none' : 'block';
            if (!isOpen) loadDropdownNotifs();
        });

        document.addEventListener('click', e => {
            if (!wrap.contains(e.target)) dropdown.style.display = 'none';
        });

        document.getElementById('mark-all-btn')?.addEventListener('click', async () => {
            const data = await apiFetch('/notifications/?statut=Non_lu');
            const list = Array.isArray(data) ? data : (data.results || []);
            await Promise.all(
                list.map(n => apiFetch(`/notifications/${n.id}/lire/`, { method: 'POST' }))
            );
            updateNotifBadge(0);
            dropdown.style.display = 'none';
            loadDropdownNotifs();
        });
    }

    // ── 10. LOAD DROPDOWN NOTIFICATIONS ──────────────────────────────────────
    async function loadDropdownNotifs() {
        const list = document.getElementById('notif-list-custom');
        if (!list) return;
        list.innerHTML = `
            <div style="padding:2rem;text-align:center;color:#94a3b8;">
                Chargement...
            </div>`;

        const data = await apiFetch('/notifications/?statut=Non_lu');
        if (data?.error) {
            list.innerHTML = `
                <div style="padding:2rem;text-align:center;color:#94a3b8;">
                    Erreur de chargement
                </div>`;
            return;
        }

        const notifs = Array.isArray(data) ? data : (data.results || []);
        updateNotifBadge(notifs.length);

        if (!notifs.length) {
            list.innerHTML = `
                <div style="padding:2.5rem;text-align:center;">
                    <div style="font-size:2rem;margin-bottom:8px;">✅</div>
                    <div style="color:#94a3b8;font-size:.875rem;font-weight:500;">
                        Aucune nouvelle notification
                    </div>
                </div>`;
            return;
        }

        const typeIcons = {
            Notes:'📝', Absence:'⚠️', Paiement:'💰', Message:'✉️',
            Passage_Niveau:'🎓', Planning:'📅', Alerte:'🚨', Autre:'ℹ️',
        };
        const typeBg = {
            Notes:'#dbeafe', Absence:'#fee2e2', Paiement:'#dcfce7',
            Message:'#f3e8ff', Passage_Niveau:'#dcfce7',
            Planning:'#fef9c3', Alerte:'#fee2e2', Autre:'#f1f5f9',
        };

        list.innerHTML = '';
        notifs.slice(0, 10).forEach(n => {
            const icon   = typeIcons[n.type_notification] || 'ℹ️';
            const iconBg = typeBg[n.type_notification]    || '#f1f5f9';
            const date   = n.date_creation
                ? new Date(n.date_creation).toLocaleString('fr-FR', {
                    day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'
                  })
                : '';

            const item = document.createElement('div');
            item.style.cssText = `
                display:flex;align-items:flex-start;gap:12px;
                padding:13px 18px;border-bottom:1px solid #f8fafc;
                background:${n.urgent ? '#fff5f5' : '#fafbff'};
                cursor:default;transition:background .15s;`;
            item.onmouseover = () => item.style.background = '#f8fafc';
            item.onmouseout  = () => item.style.background = n.urgent ? '#fff5f5' : '#fafbff';

            item.innerHTML = `
                <div style="width:32px;height:32px;border-radius:9px;flex-shrink:0;
                            background:${iconBg};
                            display:flex;align-items:center;justify-content:center;
                            font-size:1rem;">
                    ${icon}
                </div>
                <div style="flex:1;min-width:0;">
                    <div style="font-size:.845rem;font-weight:600;color:#1e293b;
                                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${escHtml(n.titre)}
                        ${n.urgent
                            ? '<span style="font-size:.65rem;background:#fef2f2;color:#dc2626;padding:2px 6px;border-radius:6px;margin-left:4px;font-weight:700;">URGENT</span>'
                            : ''}
                    </div>
                    <div style="font-size:.775rem;color:#64748b;margin-top:2px;
                                display:-webkit-box;-webkit-line-clamp:2;
                                -webkit-box-orient:vertical;overflow:hidden;">
                        ${escHtml(n.contenu)}
                    </div>
                    <div style="font-size:.7rem;color:#94a3b8;margin-top:4px;">${date}</div>
                </div>
                <button data-notif-id="${n.id}"
                    style="background:#f1f5f9;border:none;color:#667eea;cursor:pointer;
                           font-size:.75rem;padding:5px 8px;border-radius:7px;flex-shrink:0;
                           font-weight:700;transition:background .15s;"
                    onmouseover="this.style.background='#e0e7ff'"
                    onmouseout="this.style.background='#f1f5f9'"
                    title="Marquer lu">✓ Lu</button>`;

            item.querySelector('button').addEventListener('click', async e => {
                e.stopPropagation();
                const id = parseInt(e.currentTarget.dataset.notifId);
                await apiFetch(`/notifications/${id}/lire/`, { method: 'POST' });
                item.remove();
                const remaining = list.querySelectorAll('[data-notif-id]').length;
                updateNotifBadge(Math.max(0, remaining));
                if (!list.querySelector('[data-notif-id]')) {
                    list.innerHTML = `
                        <div style="padding:2.5rem;text-align:center;">
                            <div style="font-size:2rem;margin-bottom:8px;">✅</div>
                            <div style="color:#94a3b8;font-size:.875rem;">Tout est lu</div>
                        </div>`;
                }
            });

            if (n.lien_action) {
                item.style.cursor = 'pointer';
                item.addEventListener('click', e => {
                    if (!e.target.closest('button')) window.location.href = n.lien_action;
                });
            }

            list.appendChild(item);
        });
    }

    // ── 11. NOTIFICATION BADGE ────────────────────────────────────────────────
    function updateNotifBadge(count) {
        ['notifBadge', 'notif-badge'].forEach(id => {
            const badge = document.getElementById(id);
            if (!badge) return;
            if (count === 0) {
                badge.style.display = 'none';
            } else {
                badge.textContent   = count > 99 ? '99+' : count;
                badge.style.display = 'flex';
            }
        });
    }

    // ── 12. MESSAGE BADGE ────────────────────────────────────────────────────
    async function loadMessageBadge() {
        const data   = await apiFetch('/messages/');
        const msgs   = Array.isArray(data) ? data : (data.results || []);
        const unread = msgs.filter(m => !m.lu && m.destinataire === USER.id).length;
        const badge  = document.getElementById('msgBadge');
        if (badge) {
            badge.textContent   = unread > 99 ? '99+' : unread;
            badge.style.display = unread > 0 ? 'flex' : 'none';
        }
    }

    // ── 13. MIRROR NOTIF BADGE FROM notifications.js ─────────────────────────
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

    // ── 14. LOGOUT ────────────────────────────────────────────────────────────
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
        const refresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh');
        if (refresh) {
            await fetch(`${API}/auth/logout/`, {
                method:  'POST',
                headers: authHeaders(),
                body:    JSON.stringify({ refresh }),
            }).catch(() => {});
        }
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = '/login/';
    });

    // ── 15. BOOT ──────────────────────────────────────────────────────────────
    await Promise.all([
        loadKPIs(),
        loadDropdownNotifs(),
        loadMessageBadge(),
        loadUpcomingClasses(),
        loadRecentNotes(),
        loadAbsenceAlerts(),
    ]);

    setTimeout(mirrorNotifJsBadge, 500);
});