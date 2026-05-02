// groupe.js - Group Management System with Database Integration
// FIX: Student count now loaded from GET /api/etudiants/?groupe=<id> for each group
//      so the displayed number matches the actual enrolled students, not the stale
//      `nombre_etudiants` field stored on the group model (which can be out of sync).

document.addEventListener('DOMContentLoaded', function () {

    // ─── Auth ─────────────────────────────────────────────────────────────────
    function getAuthToken() {
        return (
            localStorage.getItem('access') ||
            sessionStorage.getItem('access') ||
            localStorage.getItem('access_token') ||
            sessionStorage.getItem('access_token') ||
            null
        );
    }

    const state = {
        groups:        [],
        studentCounts: {},   // FIX: { groupId: realCount }
        currentFilter: 'all',
        searchQuery:   '',
        apiBaseUrl:    '/api',
        authToken:     getAuthToken(),
    };

    const elements = {
        filterBtns: document.querySelectorAll('.filter-btn'),
        groupsGrid: document.querySelector('.groups-grid'),
    };

    init();

    // ─── Init ──────────────────────────────────────────────────────────────────
    function init() {
        if (!state.authToken) {
            showNotification('❌ Veuillez vous connecter d\'abord', 'error');
            setTimeout(() => window.location.href = '/login/', 2000);
            return;
        }
        injectStyles();
        injectModal();
        createSearchBox();
        setupEventListeners();
        loadGroupsFromDatabase();
    }

    // ─── Search box ────────────────────────────────────────────────────────────
    function createSearchBox() {
        const searchContainer = document.createElement('div');
        searchContainer.className = 'search-container';
        searchContainer.style.cssText = 'margin-bottom:2rem;position:relative;max-width:400px;';
        searchContainer.innerHTML = `
            <span style="position:absolute;left:1rem;top:50%;transform:translateY(-50%);color:#94a3b8;">🔍</span>
            <input type="text" id="groupSearch" placeholder="Rechercher un groupe..."
                style="width:100%;padding:1rem 1rem 1rem 3rem;border:2px solid #e2e8f0;
                       border-radius:12px;font-size:1rem;transition:all .3s;box-sizing:border-box;">`;
        const filters = document.querySelector('.filters');
        if (filters) filters.parentNode.insertBefore(searchContainer, filters.nextSibling);

        document.getElementById('groupSearch').addEventListener('input', debounce(e => {
            state.searchQuery = e.target.value.toLowerCase();
            filterGroups();
        }, 300));
    }

    // ─── Event listeners ───────────────────────────────────────────────────────
    function setupEventListeners() {
        elements.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                setActiveFilter(btn);
                state.currentFilter = btn.textContent.trim().toLowerCase();
                filterGroups();
            });
        });
    }

    // ─── Load groups + real student counts ────────────────────────────────────
    // FIX: After loading groups, we fetch /api/etudiants/?groupe=<id> for every
    //      group in parallel and store the real count in state.studentCounts.
    //      This guarantees the card shows actual enrolled students.
    async function loadGroupsFromDatabase() {
        try {
            showLoadingState();

            // 1. Load groups
            const res = await apiGet('/groupes/');
            state.groups = Array.isArray(res) ? res : (res.results || []);

            // 2. Load real student counts for all groups in parallel
            await loadRealStudentCounts(state.groups);

            // 3. Render with real counts
            renderGroups(state.groups);
            updateFilterCounts(state.groups);

        } catch (err) {
            console.error('Error loading groups:', err);
            showNotification('❌ Erreur lors du chargement des groupes', 'error');
        }
    }

    // FIX: Fetch each group's actual students and store count
    async function loadRealStudentCounts(groups) {
        const promises = groups.map(async g => {
            try {
                const data = await apiGet(`/etudiants/?groupe=${g.id}`);
                const list = Array.isArray(data) ? data : (data.results || []);
                state.studentCounts[g.id] = list.length;
            } catch (_) {
                // Fallback to API field if individual fetch fails
                state.studentCounts[g.id] = g.nombre_etudiants ?? 0;
            }
        });
        await Promise.all(promises);
    }

    // ─── API helper ────────────────────────────────────────────────────────────
    async function apiGet(path) {
        const res = await fetch(state.apiBaseUrl + path, {
            headers: {
                'Authorization': `Bearer ${state.authToken}`,
                'Content-Type':  'application/json',
            }
        });
        if (res.status === 401) { handleAuthError(); throw new Error('Unauthorized'); }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    // ─── Render ────────────────────────────────────────────────────────────────
    function showLoadingState() {
        elements.groupsGrid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:4rem;">
                <div style="width:50px;height:50px;border:4px solid #e2e8f0;
                            border-top-color:#667eea;border-radius:50%;
                            animation:spin 1s linear infinite;margin:0 auto 1rem;"></div>
                <p style="color:#64748b;">Chargement des groupes...</p>
            </div>`;
    }

    function renderGroups(groups) {
        elements.groupsGrid.innerHTML = '';
        if (!groups.length) { showNoResults(); return; }
        groups.forEach(g => elements.groupsGrid.appendChild(createGroupCard(g)));
        setupCardActions();
    }

    function createGroupCard(group) {
        const card = document.createElement('div');
        card.className     = 'group-card';
        card.dataset.id     = group.id;
        card.dataset.status = (group.statut_groupe || 'actif').toLowerCase();
        card.dataset.name   = (group.nom_groupe || '').toLowerCase();
        card.dataset.langue = (group.langue || '').toLowerCase();
        card.dataset.niveau = (group.niveau || '').toLowerCase();

        const levelColors = {
            'A1': 'linear-gradient(135deg,#84fab0 0%,#8fd3f4 100%)',
            'A2': 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)',
            'B1': 'linear-gradient(135deg,#f093fb 0%,#f5576c 100%)',
            'B2': 'linear-gradient(135deg,#4facfe 0%,#00f2fe 100%)',
            'C1': 'linear-gradient(135deg,#ff9a56 0%,#ff6a88 100%)',
        };
        const scheduleBg     = { 'A1':'#e0f8f7','A2':'#eff6ff','B1':'#fdf2f8','B2':'#ecfeff','C1':'#fef2f2' };
        const scheduleBorder = { 'A1':'#06b6d4','A2':'#667eea','B1':'#ec4899','B2':'#06b6d4','C1':'#dc2626' };
        const scheduleTitle  = { 'A1':'#155e75','A2':'#1e40af','B1':'#9d174d','B2':'#155e75','C1':'#7f1d1d' };
        const scheduleText   = { 'A1':'#0e7490','A2':'#3b82f6','B1':'#be185d','B2':'#0e7490','C1':'#991b1b' };

        const bg       = levelColors[group.niveau] || levelColors['A1'];
        const isActive = (group.statut_groupe || 'Actif') === 'Actif';

        // FIX: use the real count fetched from the students endpoint
        const nb = state.studentCounts[group.id] ?? group.nombre_etudiants ?? 0;

        card.innerHTML = `
            <div class="group-header" style="background:${bg};">
                <span class="status-badge ${isActive ? 'status-active' : 'status-completed'}">
                    ${isActive ? 'Actif' : 'Terminé'}
                </span>
                <span class="group-level">${group.niveau || 'A1'}</span>
                <h3 class="group-title">${escapeHtml(group.nom_groupe || 'Groupe sans nom')}</h3>
                <span class="group-lang">🇬🇧 ${escapeHtml(group.langue || 'Anglais')} - ${getNiveauLabel(group.niveau)}</span>
            </div>
            <div class="group-body">
                <div class="stats-row">
                    <div class="stat-box">
                        <span class="stat-number" id="nb-${group.id}">${nb}</span>
                        <span class="stat-label">Étudiants</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-number">${group.moyenne_groupe || '—'}</span>
                        <span class="stat-label">Moyenne</span>
                    </div>
                    <div class="stat-box">
                        <span class="stat-number">${group.taux_assiduité || '—'}%</span>
                        <span class="stat-label">Assiduité</span>
                    </div>
                </div>
                <div class="schedule-info"
                     style="background:${scheduleBg[group.niveau]||'#eff6ff'};
                            border-color:${scheduleBorder[group.niveau]||'#667eea'};">
                    <h4 style="color:${scheduleTitle[group.niveau]||'#1e40af'};">📅 Planning</h4>
                    <p style="color:${scheduleText[group.niveau]||'#3b82f6'};">
                        ${escapeHtml(group.salle || 'Salle non assignée')}
                    </p>
                </div>
                <div class="progress-section">
                    <div class="progress-header">
                        <span>Progression du programme</span>
                        <span>${group.progression || 0}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width:${group.progression || 0}%;background:${bg};"></div>
                    </div>
                </div>
                <div class="students-preview">
                    <div class="avatar-stack">${generateAvatars(nb, bg)}</div>
                    <span class="more-students">
                        ${nb > 3 ? (nb - 3) + ' autres étudiants' : 'Voir détails'}
                    </span>
                </div>
                <div class="group-actions" style="margin-top:1.5rem;">
                    <button class="btn-action btn-primary view-details-btn"
                            data-id="${group.id}"
                            data-name="${escapeHtml(group.nom_groupe || '')}"
                            style="background:${bg};">
                        📊 Voir Détails
                    </button>
                    <button class="btn-action btn-secondary notes-btn" data-id="${group.id}">
                        📝 Notes
                    </button>
                </div>
            </div>`;
        return card;
    }

    function setupCardActions() {
        document.querySelectorAll('.view-details-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                openGroupModal(btn.dataset.id, btn.dataset.name);
            });
        });
        document.querySelectorAll('.notes-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                window.location.href = `/enseignant/notes/?groupe=${btn.dataset.id}`;
            });
        });
    }

    // ─── MODAL ─────────────────────────────────────────────────────────────────
    function injectModal() {
        const modal = document.createElement('div');
        modal.id = 'groupModal';
        modal.innerHTML = `
            <div class="gm-overlay" id="gmOverlay">
                <div class="gm-panel">
                    <div class="gm-header" id="gmHeader">
                        <div>
                            <h2 class="gm-title" id="gmTitle">Détails du groupe</h2>
                            <p class="gm-subtitle" id="gmSubtitle"></p>
                        </div>
                        <button class="gm-close" id="gmClose">✕</button>
                    </div>
                    <div class="gm-tabs">
                        <button class="gm-tab active" data-tab="students">👥 Étudiants</button>
                        <button class="gm-tab" data-tab="planning">📅 Planning</button>
                    </div>
                    <div class="gm-body" id="tabStudents">
                        <div class="gm-search-row">
                            <input type="text" id="studentSearch" placeholder="🔍 Rechercher un étudiant..." class="gm-search">
                            <span class="gm-count" id="studentCount"></span>
                        </div>
                        <div class="gm-table-wrap">
                            <table class="gm-table">
                                <thead>
                                    <tr>
                                        <th>#</th><th>Étudiant</th><th>Email</th>
                                        <th>Niveau</th><th>Moyenne</th><th>Statut</th>
                                    </tr>
                                </thead>
                                <tbody id="studentsTbody"></tbody>
                            </table>
                        </div>
                        <div class="gm-empty" id="studentsEmpty" style="display:none;">
                            <span>👤</span><p>Aucun étudiant dans ce groupe</p>
                        </div>
                    </div>
                    <div class="gm-body" id="tabPlanning" style="display:none;">
                        <div id="planningContent"></div>
                        <div class="gm-empty" id="planningEmpty" style="display:none;">
                            <span>📅</span><p>Aucun planning défini pour ce groupe</p>
                        </div>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);

        document.getElementById('gmClose').addEventListener('click', closeModal);
        document.getElementById('gmOverlay').addEventListener('click', e => {
            if (e.target === document.getElementById('gmOverlay')) closeModal();
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

        document.querySelectorAll('.gm-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.gm-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById('tabStudents').style.display =
                    tab.dataset.tab === 'students' ? 'block' : 'none';
                document.getElementById('tabPlanning').style.display =
                    tab.dataset.tab === 'planning' ? 'block' : 'none';
            });
        });

        document.getElementById('studentSearch').addEventListener('input', e => {
            filterStudentTable(e.target.value.toLowerCase());
        });
    }

    function closeModal() {
        const overlay = document.getElementById('gmOverlay');
        overlay.style.animation = 'gmFadeOut .2s ease forwards';
        setTimeout(() => {
            overlay.style.animation = '';
            document.getElementById('groupModal').style.display = 'none';
        }, 200);
    }

    async function openGroupModal(groupId, groupName) {
        document.querySelectorAll('.gm-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
        document.getElementById('tabStudents').style.display = 'block';
        document.getElementById('tabPlanning').style.display = 'none';
        document.getElementById('studentSearch').value = '';
        document.getElementById('gmTitle').textContent = groupName || 'Détails du groupe';
        document.getElementById('gmSubtitle').textContent = 'Chargement...';
        document.getElementById('groupModal').style.display = 'block';

        const group = state.groups.find(g => String(g.id) === String(groupId));
        const levelColors = {
            'A1':'linear-gradient(135deg,#84fab0,#8fd3f4)',
            'A2':'linear-gradient(135deg,#667eea,#764ba2)',
            'B1':'linear-gradient(135deg,#f093fb,#f5576c)',
            'B2':'linear-gradient(135deg,#4facfe,#00f2fe)',
            'C1':'linear-gradient(135deg,#ff9a56,#ff6a88)',
        };
        const bg = group ? (levelColors[group.niveau] || levelColors['A1']) : levelColors['A1'];
        document.getElementById('gmHeader').style.background = bg;

        const [students, plannings] = await Promise.all([
            loadStudents(groupId),
            loadPlanning(groupId),
        ]);

        // FIX: update the card's student count badge with the freshly loaded count
        const realCount = students.length;
        state.studentCounts[groupId] = realCount;
        const nbEl = document.getElementById(`nb-${groupId}`);
        if (nbEl) nbEl.textContent = realCount;

        renderStudentsTab(students, group);
        renderPlanningTab(plannings, group);
    }

    // ─── Students tab ──────────────────────────────────────────────────────────
    async function loadStudents(groupId) {
        try {
            const data = await apiGet(`/etudiants/?groupe=${groupId}`);
            return Array.isArray(data) ? data : (data.results || []);
        } catch (_) { return []; }
    }

    function renderStudentsTab(students, group) {
        const tbody    = document.getElementById('studentsTbody');
        const empty    = document.getElementById('studentsEmpty');
        const countEl  = document.getElementById('studentCount');
        const subtitle = document.getElementById('gmSubtitle');

        subtitle.textContent = group
            ? `${group.langue || ''} · Niveau ${group.niveau || ''} · ${students.length} étudiant(s)`
            : `${students.length} étudiant(s)`;

        countEl.textContent = `${students.length} étudiant(s)`;

        if (!students.length) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        tbody.innerHTML = students.map((s, i) => {
            const nom      = s.user ? `${s.user.first_name || ''} ${s.user.last_name || ''}`.trim() : '—';
            const email    = s.user?.email || '—';
            const niveau   = s.niveau_actuel || '—';
            const moy      = s.moyenne_generale != null ? Number(s.moyenne_generale).toFixed(1) : '—';
            const statut   = s.statut_etudiant || 'Actif';
            const initials = nom.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase() || 'ET';

            return `
                <tr class="gm-row">
                    <td class="gm-num">${i + 1}</td>
                    <td>
                        <div class="gm-student-cell">
                            <div class="gm-avatar">${initials}</div>
                            <span class="gm-student-name">${escapeHtml(nom)}</span>
                        </div>
                    </td>
                    <td class="gm-email">${escapeHtml(email)}</td>
                    <td><span class="gm-level-badge">${niveau}</span></td>
                    <td class="gm-avg ${getMoyenneClass(moy)}">${moy !== '—' ? moy + '/20' : '—'}</td>
                    <td>
                        <span class="gm-status ${statut === 'Actif' ? 'gm-status-active' : 'gm-status-inactive'}">
                            ${statut}
                        </span>
                    </td>
                </tr>`;
        }).join('');
    }

    function getMoyenneClass(moy) {
        const v = parseFloat(moy);
        if (isNaN(v)) return '';
        if (v >= 16) return 'avg-excellent';
        if (v >= 12) return 'avg-good';
        return 'avg-low';
    }

    function filterStudentTable(query) {
        document.querySelectorAll('#studentsTbody .gm-row').forEach(row => {
            row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
        });
    }

    // ─── Planning tab ──────────────────────────────────────────────────────────
    async function loadPlanning(groupId) {
        try {
            const data = await apiGet(`/plannings/?groupe=${groupId}`);
            return Array.isArray(data) ? data : (data.results || []);
        } catch (_) { return []; }
    }

    function renderPlanningTab(plannings, group) {
        const container = document.getElementById('planningContent');
        const empty     = document.getElementById('planningEmpty');

        if (!plannings || !plannings.length) {
            container.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        const dayOrder = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
        plannings.sort((a, b) => dayOrder.indexOf(a.jour) - dayOrder.indexOf(b.jour));

        container.innerHTML = `
            <div class="gm-planning-grid">
                ${plannings.map(p => {
                    const status      = p.statut_planning || 'Planifie';
                    const statusLabel = { 'Planifie':'Planifié','Confirme':'Confirmé','Annule':'Annulé' }[status] || status;
                    const statusColor = { 'Planifie':'#3b82f6','Confirme':'#10b981','Annule':'#ef4444' }[status] || '#6b7280';
                    return `
                        <div class="gm-planning-card">
                            <div class="gm-planning-day">${p.jour || '—'}</div>
                            <div class="gm-planning-time">
                                🕐 ${p.heure_debut ? p.heure_debut.substring(0,5) : '—'}
                                – ${p.heure_fin   ? p.heure_fin.substring(0,5)   : '—'}
                            </div>
                            <div class="gm-planning-salle">📍 ${escapeHtml(p.salle || 'Salle non définie')}</div>
                            ${p.enseignant_nom ? `<div class="gm-planning-ens">👤 ${escapeHtml(p.enseignant_nom)}</div>` : ''}
                            ${p.notes_planning ? `<div class="gm-planning-notes">${escapeHtml(p.notes_planning)}</div>` : ''}
                            <div class="gm-planning-status" style="color:${statusColor};">● ${statusLabel}</div>
                        </div>`;
                }).join('')}
            </div>`;
    }

    // ─── Filters ────────────────────────────────────────────────────────────────
    function setActiveFilter(activeBtn) {
        elements.filterBtns.forEach(btn => {
            btn.classList.remove('active');
            btn.style.cssText = 'background:white;color:#64748b;border-color:#e2e8f0;';
        });
        activeBtn.classList.add('active');
        activeBtn.style.cssText =
            'background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:white;border-color:transparent;';
    }

    function filterGroups() {
        let visible = 0;
        document.querySelectorAll('.group-card').forEach(card => {
            const status = card.dataset.status || '';
            const name   = card.dataset.name   || '';
            const langue = card.dataset.langue  || '';
            const niveau = card.dataset.niveau  || '';
            const f      = state.currentFilter;

            const matchSearch =
                name.includes(state.searchQuery) ||
                langue.includes(state.searchQuery) ||
                niveau.includes(state.searchQuery);

            let matchFilter = true;
            if      (f.includes('actif'))                                matchFilter = status === 'actif';
            else if (f.includes('terminé') || f.includes('termine'))    matchFilter = ['cloture','terminee','annule'].includes(status);
            else if (f.includes('anglais'))                              matchFilter = langue === 'anglais';
            else if (f.includes('français') || f.includes('francais'))  matchFilter = ['français','francais'].includes(langue);

            const show = matchSearch && matchFilter;
            card.style.display = show ? 'block' : 'none';
            if (show) visible++;
        });

        let noRes = document.querySelector('.no-results');
        if (visible === 0) {
            if (!noRes) {
                noRes = document.createElement('div');
                noRes.className = 'no-results';
                noRes.style.cssText = 'grid-column:1/-1;text-align:center;padding:4rem;';
                noRes.innerHTML = `
                    <span style="font-size:3rem;">🔍</span>
                    <h3 style="color:#1e293b;margin:1rem 0;">Aucun groupe trouvé</h3>
                    <p style="color:#64748b;">Modifiez vos critères de recherche</p>`;
                elements.groupsGrid.appendChild(noRes);
            }
        } else {
            noRes?.remove();
        }
    }

    function updateFilterCounts(groups) {
        const total  = groups.length;
        // FIX: use the real student count from state for any display that needs it
        const actifs = groups.filter(g => (g.statut_groupe || 'Actif') === 'Actif').length;
        elements.filterBtns.forEach(btn => {
            const t = btn.textContent.toLowerCase();
            if      (t.includes('tous'))    btn.textContent = `Tous (${total})`;
            else if (t.includes('actif'))   btn.textContent = `Actifs (${actifs})`;
            else if (t.includes('terminé')) btn.textContent = `Terminés (${total - actifs})`;
        });
    }

    function showNoResults() {
        elements.groupsGrid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:4rem;">
                <span style="font-size:4rem;">👥</span>
                <h3 style="color:#1e293b;margin:1rem 0;">Aucun groupe disponible</h3>
                <p style="color:#64748b;">Contactez l'administration pour créer des groupes</p>
            </div>`;
    }

    // ─── Utilities ─────────────────────────────────────────────────────────────
    function getNiveauLabel(n) {
        return ({ 'A1':'Débutant','A2':'Intermédiaire','B1':'Avancé','B2':'Confirmé','C1':'Maîtrise' })[n] || 'Débutant';
    }

    function generateAvatars(count, bg) {
        const ini  = ['AB','SK','ML','JD','AL','MK'];
        let   html = '';
        const show = Math.min(count, 3);
        for (let i = 0; i < show; i++)
            html += `<div class="avatar" style="background:${bg};">${ini[i] || 'ST'}</div>`;
        if (count > 3)
            html += `<div class="avatar" style="background:${bg};">+${count - 3}</div>`;
        return html;
    }

    function escapeHtml(text) {
        if (!text) return '';
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    function debounce(func, wait) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => func(...args), wait); };
    }

    function handleAuthError() {
        ['access', 'access_token'].forEach(k => {
            localStorage.removeItem(k);
            sessionStorage.removeItem(k);
        });
        window.location.href = '/login/';
    }

    function showNotification(message, type = 'info') {
        const colors = { success:'#10b981', warning:'#f59e0b', error:'#ef4444', info:'#3b82f6' };
        const n = document.createElement('div');
        n.style.cssText = `
            position:fixed;top:20px;right:20px;background:${colors[type]};color:white;
            padding:1rem 2rem;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.2);
            z-index:99999;font-weight:600;animation:slideInRight .4s ease;`;
        n.textContent = message;
        document.body.appendChild(n);
        setTimeout(() => {
            n.style.animation = 'slideOutRight .4s ease';
            setTimeout(() => n.remove(), 400);
        }, 3000);
    }

    // ─── Styles ────────────────────────────────────────────────────────────────
    function injectStyles() {
        const s = document.createElement('style');
        s.textContent = `
        @keyframes spin          { to { transform:rotate(360deg); } }
        @keyframes fadeInUp      { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes gmFadeIn      { from{opacity:0} to{opacity:1} }
        @keyframes gmFadeOut     { from{opacity:1} to{opacity:0} }
        @keyframes gmSlideIn     { from{opacity:0;transform:translateY(30px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes slideInRight  { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes slideOutRight { from{transform:translateX(0);opacity:1} to{transform:translateX(100%);opacity:0} }

        .group-card { transition:all .3s ease; }
        .group-card:hover { transform:translateY(-5px); box-shadow:0 20px 25px -5px rgba(0,0,0,.1); }
        .btn-action { transition:all .3s; }
        .btn-action:hover { transform:translateY(-2px); box-shadow:0 4px 12px rgba(0,0,0,.15); }
        .progress-fill { transition:width .5s ease; }

        .gm-overlay {
            position:fixed;inset:0;background:rgba(15,23,42,.55);
            display:flex;align-items:center;justify-content:center;
            z-index:9999;backdrop-filter:blur(4px);animation:gmFadeIn .25s ease;
        }
        .gm-panel {
            background:#fff;border-radius:20px;width:min(900px,95vw);
            max-height:88vh;display:flex;flex-direction:column;
            overflow:hidden;box-shadow:0 25px 60px rgba(0,0,0,.25);animation:gmSlideIn .3s ease;
        }
        .gm-header {
            display:flex;justify-content:space-between;align-items:flex-start;
            padding:24px 28px;color:#fff;flex-shrink:0;
        }
        .gm-title   { margin:0;font-size:1.4rem;font-weight:700; }
        .gm-subtitle{ margin:4px 0 0;font-size:.9rem;opacity:.85; }
        .gm-close {
            background:rgba(255,255,255,.25);border:none;color:#fff;
            width:36px;height:36px;border-radius:50%;font-size:16px;
            cursor:pointer;display:flex;align-items:center;justify-content:center;
            transition:background .2s;flex-shrink:0;
        }
        .gm-close:hover { background:rgba(255,255,255,.4); }
        .gm-tabs {
            display:flex;gap:0;border-bottom:2px solid #f1f5f9;
            background:#f8fafc;flex-shrink:0;
        }
        .gm-tab {
            padding:14px 28px;border:none;background:transparent;
            font-size:.95rem;font-weight:600;color:#64748b;cursor:pointer;
            border-bottom:3px solid transparent;margin-bottom:-2px;transition:all .2s;
        }
        .gm-tab.active          { color:#6366f1;border-bottom-color:#6366f1;background:#fff; }
        .gm-tab:hover:not(.active) { color:#374151;background:#f1f5f9; }
        .gm-body { padding:24px 28px;overflow-y:auto;flex:1; }
        .gm-search-row { display:flex;align-items:center;gap:12px;margin-bottom:16px; }
        .gm-search {
            flex:1;padding:10px 16px;border:2px solid #e2e8f0;border-radius:10px;
            font-size:.9rem;outline:none;transition:border .2s;
        }
        .gm-search:focus { border-color:#6366f1; }
        .gm-count { font-size:.85rem;color:#64748b;white-space:nowrap; }
        .gm-table-wrap { overflow-x:auto;border-radius:12px;border:1px solid #e2e8f0; }
        .gm-table { width:100%;border-collapse:collapse;font-size:.88rem; }
        .gm-table thead { background:#f8fafc; }
        .gm-table th { padding:12px 16px;text-align:left;font-weight:600;color:#374151;white-space:nowrap; }
        .gm-table td { padding:12px 16px;border-top:1px solid #f1f5f9; }
        .gm-row:hover { background:#f8fafc; }
        .gm-num { color:#9ca3af;font-size:.8rem;width:32px; }
        .gm-student-cell { display:flex;align-items:center;gap:10px; }
        .gm-avatar {
            width:34px;height:34px;border-radius:50%;
            background:linear-gradient(135deg,#667eea,#764ba2);
            color:#fff;display:flex;align-items:center;justify-content:center;
            font-size:.75rem;font-weight:700;flex-shrink:0;
        }
        .gm-student-name   { font-weight:600;color:#1e293b; }
        .gm-email          { color:#64748b;font-size:.83rem; }
        .gm-level-badge    {
            display:inline-block;padding:2px 10px;border-radius:20px;
            background:#ede9fe;color:#6d28d9;font-weight:700;font-size:.8rem;
        }
        .gm-avg            { font-weight:700; }
        .avg-excellent     { color:#059669; }
        .avg-good          { color:#0284c7; }
        .avg-low           { color:#dc2626; }
        .gm-status         { display:inline-block;padding:3px 10px;border-radius:20px;font-size:.8rem;font-weight:600; }
        .gm-status-active  { background:#d1fae5;color:#065f46; }
        .gm-status-inactive{ background:#fee2e2;color:#991b1b; }
        .gm-empty          { text-align:center;padding:4rem 2rem;color:#94a3b8; }
        .gm-empty span     { font-size:3rem; }
        .gm-empty p        { margin-top:12px;font-size:1rem; }
        .gm-planning-grid  { display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px; }
        .gm-planning-card  {
            background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;
            padding:20px;display:flex;flex-direction:column;gap:8px;transition:box-shadow .2s;
        }
        .gm-planning-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.08); }
        .gm-planning-day    { font-size:1.1rem;font-weight:700;color:#1e293b; }
        .gm-planning-time   { font-size:.95rem;color:#374151;font-weight:600; }
        .gm-planning-salle  { font-size:.88rem;color:#64748b; }
        .gm-planning-ens    { font-size:.88rem;color:#64748b; }
        .gm-planning-notes  {
            font-size:.82rem;color:#94a3b8;font-style:italic;
            border-top:1px solid #e2e8f0;padding-top:8px;margin-top:4px;
        }
        .gm-planning-status { font-size:.82rem;font-weight:600;margin-top:4px; }
        `;
        document.head.appendChild(s);
    }

});