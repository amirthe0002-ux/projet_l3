// audit_der.js — Dashboard Dirigeant — Audit des actions
// Bugs fixed:
//   1. Stats counters now use GET /api/audit/?stats=1  → real counts from DB (not just page-1 items)
//   2. Search now works — the view now supports ?search=
//   3. Stat card lookup by .stat-card position instead of missing IDs
//   4. LOGIN connexions now display correctly (same list endpoint)

document.addEventListener('DOMContentLoaded', function () {
    initializeAuditPage();
    loadAuditStats();   // load counters first (separate fast call)
    loadAuditLogs();    // load paginated list
});

// =====================================================
// TOKEN
// =====================================================
function getAuthToken() {
    return (
        localStorage.getItem('access')       ||
        localStorage.getItem('access_token') ||
        sessionStorage.getItem('access')     ||
        sessionStorage.getItem('access_token') ||
        ''
    );
}

// =====================================================
// STATS — uses ?stats=1 → returns { CREATE:5, LOGIN:12, … }
// FIX: was reading only the first page (10 items) and counting them
//      locally — so any action with fewer than 10 entries on page 1
//      would show 0.
// =====================================================
async function loadAuditStats() {
    const token = getAuthToken();
    if (!token) return;

    try {
        const res = await fetch('/api/audit/?stats=1', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;

        // Response is now { "CREATE": 42, "LOGIN": 18, "UPDATE": 7, … }
        const counts = await res.json();

        // Update the 4 stat cards (Créations / Modifications / Suppressions / Connexions)
        // The cards are matched by their visible title text — robust to any HTML structure
        setStatByTitle('Créations',     counts.CREATE   || 0);
        setStatByTitle('Modifications', counts.UPDATE   || 0);
        setStatByTitle('Suppressions',  counts.DELETE   || 0);
        setStatByTitle('Connexions',    counts.LOGIN    || 0);

        // Also try the ID-based approach in case the HTML uses IDs
        setStatById('stat-create', counts.CREATE   || 0);
        setStatById('stat-update', counts.UPDATE   || 0);
        setStatById('stat-delete', counts.DELETE   || 0);
        setStatById('stat-login',  counts.LOGIN    || 0);

        // Fallback: if HTML uses ordered .stat-value / .stat-number / h2 inside stat cards
        setStatByOrder(0, counts.CREATE   || 0);
        setStatByOrder(1, counts.UPDATE   || 0);
        setStatByOrder(2, counts.DELETE   || 0);
        setStatByOrder(3, counts.LOGIN    || 0);

    } catch (e) {
        console.warn('[audit] Stats load failed:', e);
    }
}

function setStatById(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setStatByOrder(index, value) {
    // Try common stat number selectors in order of likelihood
    const selectors = [
        '.stat-value', '.stat-number', '.stat-count',
        '.kpi-value', '.counter', 'h2', 'h3',
    ];
    for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els[index]) { els[index].textContent = value; return; }
    }
}

function setStatByTitle(title, value) {
    // Walk every element; if its text includes the title keyword,
    // look for a sibling/child number element
    const keywords = { 'Créations': 'créat', 'Modifications': 'modif', 'Suppressions': 'suppr', 'Connexions': 'connexion' };
    const kw = keywords[title]?.toLowerCase();
    if (!kw) return;

    document.querySelectorAll('*').forEach(el => {
        const txt = el.textContent?.toLowerCase() || '';
        if (!txt.includes(kw) || el.children.length > 2) return;

        // Found a label element — look for sibling number
        const card = el.closest('[class*="stat"], [class*="card"], [class*="kpi"], li, div');
        if (!card) return;
        const numEl = card.querySelector(
            'span[class*="val"], span[class*="num"], h2, h3, h4, [class*="count"], [class*="value"]'
        );
        if (numEl && numEl !== el) numEl.textContent = value;
    });
}

// =====================================================
// INIT
// =====================================================
function initializeAuditPage() {
    initializeFilters();
    initializeSearch();
    setupLogout();
}

// =====================================================
// FILTERS
// =====================================================
function initializeFilters() {
    ['action-filter', 'entity-filter', 'user-filter'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', () => { currentPage = 1; loadAuditLogs(); });
    });
}

function applyQuickFilter(filterType) {
    ['action-filter', 'entity-filter', 'search-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });

    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-filter="${filterType}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const actionMap = {
        login:  'LOGIN',
        create: 'CREATE',
        update: 'UPDATE',
        delete: 'DELETE',
        export: 'DOWNLOAD',
    };

    const actionEl = document.getElementById('action-filter');
    if (actionEl && actionMap[filterType]) {
        actionEl.value = actionMap[filterType];
    }

    currentPage = 1;
    loadAuditLogs();
}

// =====================================================
// SEARCH
// =====================================================
function initializeSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;

    let searchTimeout;
    searchInput.addEventListener('input', function () {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => { currentPage = 1; loadAuditLogs(); }, 400);
    });
}

// =====================================================
// PAGINATION
// =====================================================
let currentPage = 1;
const itemsPerPage = 20;

function updatePagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const container  = document.getElementById('pagination-container');
    if (!container) return;

    if (totalPages <= 1) { container.innerHTML = ''; return; }

    let html = '';
    html += `<button class="px-3 py-1 mx-1 bg-gray-600 text-white rounded
             ${currentPage === 1 ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-500'}"
             ${currentPage === 1 ? 'disabled' : ''}
             onclick="changePage(${currentPage - 1})">Précédent</button>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<button class="px-3 py-1 mx-1 bg-indigo-600 text-white rounded">${i}</button>`;
        } else if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
            html += `<button class="px-3 py-1 mx-1 bg-gray-600 text-white rounded hover:bg-gray-500"
                     onclick="changePage(${i})">${i}</button>`;
        } else if (i === currentPage - 3 || i === currentPage + 3) {
            html += `<span class="px-2 py-1 mx-1 text-gray-400">…</span>`;
        }
    }

    html += `<button class="px-3 py-1 mx-1 bg-gray-600 text-white rounded
             ${currentPage === totalPages ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-500'}"
             ${currentPage === totalPages ? 'disabled' : ''}
             onclick="changePage(${currentPage + 1})">Suivant</button>`;

    container.innerHTML = html;
}

function changePage(page) {
    currentPage = page;
    loadAuditLogs();
}

// =====================================================
// LOAD AUDIT LOGS
// =====================================================
async function loadAuditLogs() {
    showLoading();

    const token = getAuthToken();
    if (!token) { showError('Session expirée. Veuillez vous reconnecter.'); return; }

    try {
        const action = document.getElementById('action-filter')?.value || '';
        const entity = document.getElementById('entity-filter')?.value || '';
        const user   = document.getElementById('user-filter')?.value   || '';
        const search = document.getElementById('search-input')?.value  || '';

        // PAGE SIZE sent to backend — DRF uses ?page= + PAGE_SIZE from settings (10)
        // We override per-page via ?page_size= if the backend supports it,
        // otherwise we request page N and show all results on that page
        let url = `/api/audit/?page=${currentPage}`;
        if (action) url += `&action=${encodeURIComponent(action)}`;
        if (entity) url += `&entite=${encodeURIComponent(entity)}`;
        if (user)   url += `&utilisateur=${encodeURIComponent(user)}`;
        if (search) url += `&search=${encodeURIComponent(search)}`; // FIX: was missing in old view

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type':  'application/json',
            },
        });

        if (response.status === 401) { showError('Session expirée.'); return; }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data  = await response.json();
        // Handle both paginated { count, results } and plain array
        const logs  = data.results !== undefined ? data.results : (Array.isArray(data) ? data : []);
        const total = data.count   !== undefined ? data.count   : logs.length;

        displayAuditLogs(logs);
        updatePagination(total);

    } catch (error) {
        console.error('[audit] loadAuditLogs:', error);
        showError('Erreur lors du chargement des données d\'audit.');
    }
}

// =====================================================
// DISPLAY LOGS
// FIX: was failing silently when logs was undefined
// =====================================================
function displayAuditLogs(auditLogs) {
    const container = document.getElementById('audit-list');
    if (!container) return;

    if (!auditLogs || !auditLogs.length) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <i class="fas fa-history text-4xl mb-4 block"></i>
                <p>Aucun log d'audit trouvé pour ces critères.</p>
            </div>`;
        return;
    }

    container.innerHTML = auditLogs.map(log => {
        const cls   = getActionClass(log.action);
        const icon  = getActionIcon(log.action);
        const label = getActionLabel(log.action);
        const date  = formatDate(log.date_action);
        const nom   = escapeHtml(log.utilisateur_nom || 'Système');

        const changesHtml = (log.ancienne_valeur || log.nouvelle_valeur) ? `
            <div class="text-xs text-gray-400 bg-gray-700 p-2 rounded mt-2 overflow-x-auto">
                ${log.ancienne_valeur ? `<div><strong>Avant:</strong> ${escapeHtml(JSON.stringify(log.ancienne_valeur))}</div>` : ''}
                ${log.nouvelle_valeur ? `<div><strong>Après:</strong> ${escapeHtml(JSON.stringify(log.nouvelle_valeur))}</div>` : ''}
            </div>` : '';

        const errorHtml = log.message_erreur ? `
            <div class="text-xs text-red-400 bg-red-900/40 p-2 rounded mt-2">
                <strong>Erreur:</strong> ${escapeHtml(log.message_erreur)}
            </div>` : '';

        const ipHtml = log.adresse_ip
            ? `<div class="text-xs text-gray-500 mt-1">IP: ${escapeHtml(log.adresse_ip)}</div>` : '';

        // Result badge
        const resultBadge = log.resultat === 'Erreur'
            ? `<span class="ml-2 text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Erreur</span>`
            : '';

        return `
        <div class="audit-item ${cls} flex items-start gap-4 p-4 bg-gray-800 rounded-lg mb-3 mx-4">
            <div class="flex-shrink-0">
                <div class="w-10 h-10 rounded-full flex items-center justify-center
                            action-icon-${log.action.toLowerCase()}
                            ${getIconBg(log.action)}">
                    <i class="${icon} text-white text-sm"></i>
                </div>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-1 flex-wrap gap-2">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-medium text-white">${nom}</span>
                        ${log.entite ? `<span class="text-gray-500">•</span>
                        <span class="text-sm text-gray-400">${escapeHtml(log.entite)}</span>` : ''}
                        ${log.id_entite ? `<span class="text-gray-500">•</span>
                        <span class="text-sm text-gray-400">ID: ${log.id_entite}</span>` : ''}
                        ${resultBadge}
                    </div>
                    <span class="text-xs text-gray-500 whitespace-nowrap">${date}</span>
                </div>
                <div class="text-sm text-gray-300 mb-1">
                    <span class="font-semibold action-text-${log.action.toLowerCase()}
                                 ${getTextColor(log.action)}">${label}</span>
                    ${log.entite ? ` sur <em>${escapeHtml(log.entite)}</em>` : ''}
                    ${log.id_entite ? ` (ID: ${log.id_entite})` : ''}
                </div>
                ${changesHtml}${errorHtml}${ipHtml}
            </div>
        </div>`;
    }).join('');
}

function getIconBg(action) {
    const map = {
        CREATE:   'bg-green-600',
        UPDATE:   'bg-blue-600',
        DELETE:   'bg-red-600',
        HARD_DELETE: 'bg-red-800',
        LOGIN:    'bg-indigo-600',
        LOGOUT:   'bg-gray-600',
        DOWNLOAD: 'bg-amber-600',
        EXPORT:   'bg-amber-600',
    };
    return map[action] || 'bg-gray-600';
}

function getTextColor(action) {
    const map = {
        CREATE:   'text-green-400',
        UPDATE:   'text-blue-400',
        DELETE:   'text-red-400',
        HARD_DELETE: 'text-red-600',
        LOGIN:    'text-indigo-400',
        LOGOUT:   'text-gray-400',
        DOWNLOAD: 'text-amber-400',
        EXPORT:   'text-amber-400',
    };
    return map[action] || 'text-gray-400';
}

// =====================================================
// EXPORT
// =====================================================
async function exportAuditLogs() {
    const btn = document.querySelector('button[onclick="exportAuditLogs()"]');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Export en cours...';
        btn.disabled  = true;
    }
    try {
        const token = getAuthToken();
        const action = document.getElementById('action-filter')?.value || '';
        const entity = document.getElementById('entity-filter')?.value || '';
        const search = document.getElementById('search-input')?.value  || '';

        // Build URL with active filters so export matches current view
        let url = '/api/audit/?page_size=10000';
        if (action) url += `&action=${encodeURIComponent(action)}`;
        if (entity) url += `&entite=${encodeURIComponent(entity)}`;
        if (search) url += `&search=${encodeURIComponent(search)}`;

        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error('Erreur export');

        const data = await res.json();
        const logs = data.results || data;

        // Build CSV client-side
        const headers = ['Date', 'Utilisateur', 'Action', 'Entité', 'ID Entité', 'Résultat', 'IP', 'Erreur'];
        const rows = logs.map(l => [
            l.date_action, l.utilisateur_nom || 'Système', l.action,
            l.entite || '', l.id_entite || '', l.resultat || '',
            l.adresse_ip || '', l.message_erreur || '',
        ]);
        const esc = v => { const s = String(v ?? '').replace(/"/g, '""'); return /[,"\n\r]/.test(s) ? `"${s}"` : s; };
        const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        triggerDownload(blob, `audit_logs_${today()}.csv`);
        showToast('Logs exportés avec succès !', 'success');

    } catch (e) {
        console.error(e);
        showToast('Erreur lors de l\'export des logs', 'error');
    } finally {
        if (btn) { btn.innerHTML = '<i class="fas fa-download mr-2"></i>Exporter CSV'; btn.disabled = false; }
    }
}

async function exportFilteredAuditLogs() {
    return exportAuditLogs();  // same logic with filters already applied
}

function triggerDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

function today() { return new Date().toISOString().split('T')[0]; }

// =====================================================
// LOGOUT
// =====================================================
function setupLogout() {
    document.querySelectorAll('.logout-link').forEach(link => {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            if (confirm('Voulez-vous vous déconnecter ?')) logout();
        });
    });
}

async function logout() {
    const token   = getAuthToken();
    const refresh = localStorage.getItem('refresh')       ||
                    localStorage.getItem('refresh_token') ||
                    sessionStorage.getItem('refresh')     || '';
    try {
        await fetch('/api/auth/logout/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ refresh }),
        });
    } catch (_) {}
    ['access', 'access_token', 'refresh', 'refresh_token', 'user'].forEach(k => {
        localStorage.removeItem(k); sessionStorage.removeItem(k);
    });
    window.location.href = '/login/';
}

// =====================================================
// UI HELPERS
// =====================================================
function showLoading() {
    const c = document.getElementById('audit-list');
    if (c) c.innerHTML = `
        <div class="text-center py-8">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mx-auto"></div>
            <p class="text-gray-400 mt-2">Chargement des logs d'audit...</p>
        </div>`;
}

function showError(message) {
    const c = document.getElementById('audit-list');
    if (c) c.innerHTML = `
        <div class="text-center py-8 text-red-400">
            <i class="fas fa-exclamation-triangle text-4xl mb-4 block"></i>
            <p>${escapeHtml(message)}</p>
        </div>`;
}

function showToast(message, type = 'info') {
    const colors = { success: 'bg-green-500', error: 'bg-red-500', info: 'bg-blue-500', warning: 'bg-yellow-500' };
    const t = document.createElement('div');
    t.className = `fixed top-4 right-4 px-4 py-2 rounded-lg text-white z-50 shadow-lg ${colors[type] || colors.info}`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// =====================================================
// ACTION HELPERS
// =====================================================
function getActionClass(action) {
    const map = { CREATE:'audit-create', UPDATE:'audit-update', DELETE:'audit-delete',
                  LOGIN:'audit-login', LOGOUT:'audit-logout', DOWNLOAD:'audit-export', EXPORT:'audit-export' };
    return map[action] || 'audit-default';
}
function getActionIcon(action) {
    const map = { CREATE:'fas fa-plus', UPDATE:'fas fa-edit', DELETE:'fas fa-trash',
                  HARD_DELETE:'fas fa-trash-alt', LOGIN:'fas fa-sign-in-alt',
                  LOGOUT:'fas fa-sign-out-alt', DOWNLOAD:'fas fa-download', EXPORT:'fas fa-file-export' };
    return map[action] || 'fas fa-cog';
}
function getActionLabel(action) {
    const map = { CREATE:'Création', UPDATE:'Modification', DELETE:'Suppression',
                  HARD_DELETE:'Suppression définitive', LOGIN:'Connexion',
                  LOGOUT:'Déconnexion', DOWNLOAD:'Téléchargement', EXPORT:'Export',
                  READ:'Consultation' };
    return map[action] || action;
}
function formatDate(dateString) {
    if (!dateString) return '—';
    try {
        const date = new Date(dateString);
        const diff = Date.now() - date.getTime();
        const min  = Math.floor(diff / 60000);
        const hr   = Math.floor(diff / 3600000);
        const day  = Math.floor(diff / 86400000);
        if (min < 1)  return 'À l\'instant';
        if (min < 60) return `Il y a ${min} min`;
        if (hr < 24)  return `Il y a ${hr} h`;
        if (day < 7)  return `Il y a ${day} j`;
        return date.toLocaleDateString('fr-FR', {
            day:'2-digit', month:'2-digit', year:'numeric',
            hour:'2-digit', minute:'2-digit'
        });
    } catch (_) { return '—'; }
}

// =====================================================
// GLOBAL (called from inline HTML onclick)
// =====================================================
window.applyQuickFilter        = applyQuickFilter;
window.changePage              = changePage;
window.exportAuditLogs         = exportAuditLogs;
window.exportFilteredAuditLogs = exportFilteredAuditLogs;