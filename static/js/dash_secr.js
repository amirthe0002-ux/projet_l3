/**
 * Dashboard Secrétariat - Menu Radial + JWT
 * File: static/js/dash_secr.js
 *
 * FIXES:
 * 1. Token key: 'access' not 'access_token'
 * 2. Refresh key: 'refresh' not 'refresh_token'
 * 3. /dashboard/ requires IsDirigeant → Secretariat gets 403
 *    → Stats loaded from /etudiants/, /enseignants/, /groupes/, /paiements/, /absences/
 * 4. loadAll() called on DOMContentLoaded (not only on button click)
 * 5. Double API call removed (was calling /dashboard/ twice)
 * 6. Stat card selectors fixed to match actual HTML structure
 * 7. Hardcoded list items replaced properly on load
 */

const API_URL = '/api';

// ============================================================
// JWT HELPERS
// ============================================================
function getToken() {
    return (
        localStorage.getItem('access') ||
        sessionStorage.getItem('access') ||
        localStorage.getItem('access_token') ||
        sessionStorage.getItem('access_token') ||
        null
    );
}

function getRefreshToken() {
    // LoginView stores key as 'refresh'
    return (
        localStorage.getItem('refresh') ||
        sessionStorage.getItem('refresh') ||
        localStorage.getItem('refresh_token') ||
        sessionStorage.getItem('refresh_token') ||
        null
    );
}

function getUser() {
    try {
        const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function authHeaders() {
    const token = getToken();
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

// ============================================================
// API
// ============================================================
async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });
        if (res.status === 401) return { error: 'JWT_INVALID',    message: 'Token invalide.' };
        if (res.status === 403) return { error: 'FORBIDDEN',      message: 'Accès refusé.' };
        if (res.status === 204) return { success: true };
        if (!res.ok) {
            let msg = `Erreur ${res.status}`;
            try { const d = await res.json(); msg = d.detail || d.error || msg; } catch {}
            return { error: 'API_ERROR', message: msg };
        }
        return await res.json();
    } catch (e) {
        return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible.' };
    }
}

// ============================================================
// SESSION CHECK
// ============================================================
function checkSession() {
    const token = getToken();
    const user  = getUser();
    if (!token || !user) { window.location.href = '/login/'; return null; }
    // Secretariat dashboard — allow Secretariat + Dirigeant (who can view all)
    if (!['Secretariat', 'Dirigeant'].includes(user.role)) {
        window.location.href = '/login/'; return null;
    }
    return user;
}

// ============================================================
// DÉCONNEXION
// ============================================================
async function handleDisconnect(event) {
    if (event) event.preventDefault();
    if (!confirm('Voulez-vous vous déconnecter ?')) return;

    try {
        await fetch(`${API_URL}/auth/logout/`, {
            method:  'POST',
            headers: authHeaders(),
            body:    JSON.stringify({ refresh: getRefreshToken() }),
        });
    } catch {}

    // Clear both old and new key names
    ['access', 'refresh', 'access_token', 'refresh_token', 'user'].forEach(k => {
        localStorage.removeItem(k);
        sessionStorage.removeItem(k);
    });
    window.location.href = '/login/';
}

// ============================================================
// AFFICHER / CACHER DASHBOARD
// ============================================================
function showDashboard(event) {
    if (event) event.preventDefault();
    const overlay   = document.getElementById('menu-overlay');
    const dashboard = document.getElementById('dashboard-content');
    if (overlay)   overlay.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');
    window.scrollTo(0, 0);
    if (!dataLoaded) loadAll();
}

function hideDashboard() {
    const overlay   = document.getElementById('menu-overlay');
    const dashboard = document.getElementById('dashboard-content');
    if (dashboard) dashboard.classList.add('hidden');
    if (overlay)   overlay.classList.remove('hidden');
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
    document.querySelector('.toast-secr')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-secr';
    t.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:9999;
        padding:14px 22px; border-radius:12px; background:${colors[type]}; color:white;
        font-weight:500; font-size:0.9rem; box-shadow:0 8px 24px rgba(0,0,0,0.2);
        display:flex; align-items:center; gap:8px; max-width:380px;
        transform:translateX(120%); opacity:0; transition:all 0.3s ease;`;
    t.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; t.style.opacity = '1'; });
    setTimeout(() => {
        t.style.transform = 'translateX(120%)'; t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 3500);
}

// ============================================================
// FORMATAGE
// ============================================================
function fmtDA(val) {
    if (val === null || val === undefined) return '—';
    return new Intl.NumberFormat('fr-DZ').format(Math.round(val)) + ' DA';
}

function formatRelative(dateStr) {
    if (!dateStr) return '—';
    const d    = new Date(dateStr);
    const diff = Math.floor((Date.now() - d) / 1000);
    if (diff < 60)     return 'Il y a quelques secondes';
    if (diff < 3600)   return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400)  return `Aujourd'hui, ${d.toLocaleTimeString('fr-DZ', { hour:'2-digit', minute:'2-digit' })}`;
    if (diff < 172800) return `Hier, ${d.toLocaleTimeString('fr-DZ', { hour:'2-digit', minute:'2-digit' })}`;
    return d.toLocaleDateString('fr-DZ', { day:'numeric', month:'short' });
}

function statutBadge(statut) {
    const map = {
        'Paye':               ['status-paid',    'Payé'],
        'Partiellement_paye': ['status-pending', 'Partiel'],
        'Impaye':             ['status-unpaid',  'Impayé'],
        'Actif':              ['status-active',  'Actif'],
        'Active':             ['status-active',  'Actif'],
        'Suspendu':           ['status-pending', 'Suspendu'],
        'Inactif':            ['status-unpaid',  'Inactif'],
    };
    const [cls, label] = map[statut] || ['status-pending', statut];
    return `<span class="status-badge ${cls}">${label}</span>`;
}

// ============================================================
// SKELETON
// ============================================================
function setSkeleton(el, w = '80px', h = '1.5rem') {
    if (!el) return;
    el.innerHTML = `<span style="display:inline-block;width:${w};height:${h};
        background:linear-gradient(90deg,#e2e8f0 25%,#cbd5e1 50%,#e2e8f0 75%);
        background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:6px;">&nbsp;</span>`;
}

// Inject base styles once
if (!document.getElementById('secr-shimmer')) {
    const s = document.createElement('style');
    s.id = 'secr-shimmer';
    s.textContent = `
        @keyframes shimmer { to { background-position:-200% 0; } }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .hidden { display:none !important; }
    `;
    document.head.appendChild(s);
}

// ============================================================
// LOAD STATS — FIX: /dashboard/ is IsDirigeant only
// Secretariat uses individual endpoints it has access to:
//   /etudiants/ → IsStaff ✅
//   /enseignants/ → IsAuthenticated ✅
//   /groupes/ → IsAuthenticated ✅
//   /paiements/ → IsComptable (includes Secretariat) ✅
//   /absences/ → IsAuthenticated ✅
// All loaded in ONE parallel call, shared between finance + personnel sections
// ============================================================
let cachedStats = null;

async function fetchAllStats() {
    if (cachedStats) return cachedStats;

    const [etudiants, enseignants, groupes, paiements, absences] = await Promise.all([
        apiFetch('/etudiants/'),
        apiFetch('/enseignants/'),
        apiFetch('/groupes/?statut=Actif'),
        apiFetch('/paiements/'),
        apiFetch('/absences/?statut=Absent'),
    ]);

    const etu  = !etudiants?.error  ? (Array.isArray(etudiants)  ? etudiants  : etudiants.results  || []) : [];
    const ens  = !enseignants?.error? (Array.isArray(enseignants) ? enseignants: enseignants.results || []) : [];
    const grp  = !groupes?.error    ? (Array.isArray(groupes)    ? groupes    : groupes.results    || []) : [];
    const pay  = !paiements?.error  ? (Array.isArray(paiements)  ? paiements  : paiements.results  || []) : [];
    const abs  = !absences?.error   ? (Array.isArray(absences)   ? absences   : absences.results   || []) : [];

    // Compute financial aggregates
    const revenus   = pay.filter(p => p.statut_paiement === 'Paye')
                         .reduce((s, p) => s + parseFloat(p.montant_paye || 0), 0);
    const depenses  = 0; // bulletins would need IsComptable — use 0 as fallback
    const solde     = revenus - depenses;
    const enRetard  = pay.filter(p => p.statut_paiement === 'Impaye').length;
    const partiels  = pay.filter(p => p.statut_paiement === 'Partiellement_paye').length;
    const totalDu   = pay.reduce((s, p) => s + parseFloat(p.montant_du || 0), 0);
    const taux      = totalDu > 0 ? Math.round((revenus / totalDu) * 100) : 0;

    cachedStats = { etu, ens, grp, pay, abs, revenus, depenses, solde, enRetard, partiels, totalDu, taux };
    return cachedStats;
}

// ============================================================
// STATS FINANCIÈRES (4 cartes gauche)
// Stat cards are inside .financial-section .stats-grid .stat-card .stat-value
// ============================================================
async function loadFinanceStats() {
    // Get all .stat-value inside the financial section
    const section  = document.querySelector('.financial-section');
    const statVals = section?.querySelectorAll('.stat-value');
    if (!statVals) return;
    statVals.forEach(el => setSkeleton(el, '90px', '1.5rem'));

    const s = await fetchAllStats();

    const values = [
        fmtDA(s.revenus),
        fmtDA(s.depenses || 0),
        fmtDA(s.solde),
        s.enRetard,
    ];

    statVals.forEach((el, i) => {
        el.textContent = values[i] ?? '—';
        el.style.animation = 'fadeIn 0.4s ease';
    });

    // Taux paiement trend
    const trends = section?.querySelectorAll('.stat-trend');
    if (trends?.[0]) {
        trends[0].textContent = `${s.taux}%`;
        trends[0].className   = `stat-trend ${s.taux >= 80 ? 'trend-up' : 'trend-down'}`;
    }
}

// ============================================================
// STATS PERSONNEL (4 cartes droite)
// ============================================================
async function loadPersonnelStats() {
    const section  = document.querySelector('.personnel-section');
    const statVals = section?.querySelectorAll('.stat-value');
    if (!statVals) return;
    statVals.forEach(el => setSkeleton(el, '60px', '1.5rem'));

    const s = await fetchAllStats();

    const etuActifs = s.etu.filter(e => e.statut_etudiant === 'Actif').length;
    const ensActifs = s.ens.filter(e => e.statut_emploi   === 'Actif').length;

    const values = [
        etuActifs,
        ensActifs,
        s.grp.length,
        s.abs.length,
    ];

    statVals.forEach((el, i) => {
        el.textContent = values[i] ?? '—';
        el.style.animation = 'fadeIn 0.4s ease';
    });

    // Update badge in radial menu
    const badge = document.querySelector('.item-badge');
    if (badge) badge.textContent = etuActifs;
}

// ============================================================
// DERNIERS PAIEMENTS (liste gauche)
// Replaces the hardcoded .list-item rows inside .financial-section .list-container
// ============================================================
async function loadDerniersPaiements() {
    const container = document.querySelector('.financial-section .list-container');
    if (!container) return;

    // Remove old hardcoded rows
    container.querySelectorAll('.list-item').forEach(el => el.remove());

    // Loading indicator
    const loading = document.createElement('div');
    loading.id = 'fin-loading';
    loading.style.cssText = 'text-align:center;padding:1.5rem;color:#94a3b8;font-size:.875rem;';
    loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Chargement...';
    container.appendChild(loading);

    const s = await fetchAllStats();
    document.getElementById('fin-loading')?.remove();

    if (!s.pay.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;padding:1.5rem;color:#94a3b8;font-size:.875rem;';
        empty.textContent = 'Aucun paiement récent.';
        container.appendChild(empty);
        return;
    }

    const sorted = [...s.pay]
        .sort((a, b) => new Date(b.date_creation || b.date_paiement) - new Date(a.date_creation || a.date_paiement))
        .slice(0, 4);

    sorted.forEach(p => {
        const isPaye   = p.statut_paiement === 'Paye';
        const solde    = parseFloat(p.montant_du || 0) - parseFloat(p.montant_paye || 0);
        const montant  = isPaye
            ? `+${fmtDA(p.montant_paye)}`
            : `-${fmtDA(solde)}`;

        const item = document.createElement('div');
        item.className = 'list-item';
        item.style.animation = 'fadeIn 0.4s ease';
        item.innerHTML = `
            <div class="item-icon"><i class="fas fa-user-graduate"></i></div>
            <div class="item-info">
                <h4>${p.etudiant_nom || '—'}</h4>
                <p>${p.periode || 'Paiement'} — ${p.mode_paiement || ''}</p>
            </div>
            <div class="item-amount">
                <div class="amount ${isPaye ? 'positive' : 'negative'}">${montant}</div>
                <div class="date">${formatRelative(p.date_creation || p.date_paiement)}</div>
            </div>
            ${statutBadge(p.statut_paiement)}`;
        container.appendChild(item);
    });
}

// ============================================================
// ACTIVITÉS RÉCENTES (liste droite)
// ============================================================
async function loadActivitesRecentes() {
    const container = document.querySelector('.personnel-section .list-container');
    if (!container) return;

    container.querySelectorAll('.list-item').forEach(el => el.remove());

    const loading = document.createElement('div');
    loading.id = 'pers-loading';
    loading.style.cssText = 'text-align:center;padding:1.5rem;color:#94a3b8;font-size:.875rem;';
    loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Chargement...';
    container.appendChild(loading);

    const s = await fetchAllStats();
    document.getElementById('pers-loading')?.remove();

    const activites = [];

    // Derniers étudiants inscrits
    [...s.etu]
        .sort((a, b) => new Date(b.date_inscription) - new Date(a.date_inscription))
        .slice(0, 2)
        .forEach(e => {
            const nom = e.user?.nom_complet ||
                `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.trim() || '—';
            activites.push({
                icon:   'fas fa-user-plus',
                titre:  'Nouvel Étudiant',
                detail: `${nom} — ${e.groupe_nom || 'Sans groupe'}`,
                badge:  statutBadge('Actif'),
                date:   e.date_inscription,
            });
        });

    // Alertes absences (>= 3 absences)
    const countMap = {};
    s.abs.forEach(a => { countMap[a.etudiant] = (countMap[a.etudiant] || 0) + 1; });
    Object.entries(countMap)
        .filter(([, c]) => c >= 3)
        .slice(0, 2)
        .forEach(([etudiantId, count]) => {
            const e   = s.etu.find(x => x.id == etudiantId);
            const nom = e?.user?.nom_complet || `Étudiant #${etudiantId}`;
            activites.push({
                icon:   'fas fa-exclamation-circle',
                titre:  'Alerte Absences',
                detail: `${nom} — ${count} absences`,
                badge:  `<span class="status-badge status-pending">À traiter</span>`,
                date:   new Date().toISOString(),
            });
        });

    if (!activites.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align:center;padding:1.5rem;color:#94a3b8;font-size:.875rem;';
        empty.textContent = 'Aucune activité récente.';
        container.appendChild(empty);
        return;
    }

    activites
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .forEach(act => {
            const item = document.createElement('div');
            item.className = 'list-item';
            item.style.animation = 'fadeIn 0.4s ease';
            item.innerHTML = `
                <div class="item-icon"><i class="${act.icon}"></i></div>
                <div class="item-info">
                    <h4>${act.titre}</h4>
                    <p>${act.detail}</p>
                </div>
                <div class="item-amount">
                    ${act.badge}
                    <div class="date">${formatRelative(act.date)}</div>
                </div>`;
            container.appendChild(item);
        });
}

// ============================================================
// MODAL NOUVEAU PAIEMENT
// ============================================================
async function openModalPaiement() {
    const s = await fetchAllStats();

    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.6);
        display:flex;align-items:center;justify-content:center;z-index:3000;`;
    modal.innerHTML = `
        <div style="background:white;border-radius:20px;padding:2rem;width:90%;max-width:500px;
                    animation:fadeIn 0.3s ease;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="font-size:1.2rem;font-weight:700;color:#1e293b;">
                    <i class="fas fa-money-bill-wave" style="color:#10b981;margin-right:8px;"></i>Nouveau Paiement
                </h3>
                <button id="closePaiement" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">×</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:1rem;">
                <div>
                    <label style="${lbl()}">Étudiant *</label>
                    <select id="pay_etudiant" style="${inp()}">
                        <option value="">-- Choisir un étudiant --</option>
                        ${s.etu.map(e => {
                            const nom = `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.trim();
                            return `<option value="${e.id}">${nom}</option>`;
                        }).join('')}
                    </select>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="${lbl()}">Montant dû (DA) *</label>
                        <input type="number" id="pay_du" placeholder="8000" style="${inp()}">
                    </div>
                    <div>
                        <label style="${lbl()}">Montant payé (DA) *</label>
                        <input type="number" id="pay_paye" placeholder="8000" style="${inp()}">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="${lbl()}">Mode *</label>
                        <select id="pay_mode" style="${inp()}">
                            <option value="Especes">Espèces</option>
                            <option value="Cheque">Chèque</option>
                            <option value="Virement">Virement</option>
                            <option value="Carte">Carte</option>
                        </select>
                    </div>
                    <div>
                        <label style="${lbl()}">Période</label>
                        <input type="text" id="pay_periode" placeholder="Avril 2026" style="${inp()}">
                    </div>
                </div>
                <div>
                    <label style="${lbl()}">Date *</label>
                    <input type="date" id="pay_date" style="${inp()}">
                </div>
                <div id="payError" style="display:none;padding:.75rem;background:#fef2f2;
                     border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:.85rem;"></div>
                <button id="btnSavePaiement" style="width:100%;padding:.875rem;border:none;
                    border-radius:10px;background:linear-gradient(135deg,#10b981,#059669);
                    color:white;font-weight:700;font-size:1rem;cursor:pointer;">
                    <i class="fas fa-save"></i> Enregistrer
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    document.getElementById('pay_date').valueAsDate = new Date();
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById('closePaiement').addEventListener('click', () => modal.remove());

    document.getElementById('btnSavePaiement').addEventListener('click', async () => {
        const errEl       = document.getElementById('payError');
        errEl.style.display = 'none';
        const etudiantId  = document.getElementById('pay_etudiant').value;
        const montantDu   = parseFloat(document.getElementById('pay_du').value);
        const montantPaye = parseFloat(document.getElementById('pay_paye').value);
        const mode        = document.getElementById('pay_mode').value;
        const date        = document.getElementById('pay_date').value;
        const periode     = document.getElementById('pay_periode').value;

        if (!etudiantId || isNaN(montantDu) || isNaN(montantPaye) || !date) {
            errEl.textContent = 'Remplissez tous les champs obligatoires.';
            errEl.style.display = 'block'; return;
        }

        let statut = 'Paye';
        if (montantPaye < montantDu) statut = 'Partiellement_paye';
        if (montantPaye === 0)       statut = 'Impaye';

        const btn = document.getElementById('btnSavePaiement');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...'; btn.disabled = true;

        const result = await apiFetch('/paiements/', {
            method: 'POST',
            body: JSON.stringify({
                etudiant: parseInt(etudiantId),
                montant_du: montantDu, montant_paye: montantPaye,
                mode_paiement: mode, date_paiement: date,
                periode, statut_paiement: statut,
            }),
        });

        if (result?.error) {
            errEl.textContent = '❌ ' + result.message;
            errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer'; btn.disabled = false; return;
        }

        modal.remove();
        showToast('Paiement enregistré !', 'success');
        cachedStats = null;  // invalidate cache
        loadAll();
    });
}

// ============================================================
// MODAL NOUVEL ÉTUDIANT
// ============================================================
async function openModalEtudiant() {
    const s = await fetchAllStats();

    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.6);
        display:flex;align-items:center;justify-content:center;z-index:3000;`;
    modal.innerHTML = `
        <div style="background:white;border-radius:20px;padding:2rem;width:90%;max-width:520px;
                    max-height:90vh;overflow-y:auto;animation:fadeIn 0.3s ease;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="font-size:1.2rem;font-weight:700;color:#1e293b;">
                    <i class="fas fa-user-plus" style="color:#6366f1;margin-right:8px;"></i>Nouvel Étudiant
                </h3>
                <button id="closeEtu" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">×</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:1rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Prénom *</label>
                        <input type="text" id="etu_prenom" placeholder="Ahmed" style="${inp()}"></div>
                    <div><label style="${lbl()}">Nom *</label>
                        <input type="text" id="etu_nom" placeholder="Benali" style="${inp()}"></div>
                </div>
                <div><label style="${lbl()}">Email *</label>
                    <input type="email" id="etu_email" placeholder="ahmed@email.com" style="${inp()}"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Téléphone *</label>
                        <input type="text" id="etu_tel" placeholder="0555 123 456" style="${inp()}"></div>
                    <div><label style="${lbl()}">Date naissance *</label>
                        <input type="date" id="etu_naissance" style="${inp()}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Groupe</label>
                        <select id="etu_groupe" style="${inp()}">
                            <option value="">-- Aucun --</option>
                            ${s.grp.map(g =>
                                `<option value="${g.id}">${g.nom_groupe} — ${g.niveau}</option>`
                            ).join('')}
                        </select></div>
                    <div><label style="${lbl()}">Niveau</label>
                        <select id="etu_niveau" style="${inp()}">
                            <option value="A1">A1 - Débutant</option>
                            <option value="A2">A2 - Élémentaire</option>
                            <option value="B1">B1 - Intermédiaire</option>
                            <option value="B2">B2 - Confirmé</option>
                            <option value="C1">C1 - Avancé</option>
                        </select></div>
                </div>
                <div><label style="${lbl()}">Mot de passe provisoire *</label>
                    <input type="password" id="etu_pwd" placeholder="Minimum 8 caractères" style="${inp()}"></div>
                <div id="etuError" style="display:none;padding:.75rem;background:#fef2f2;
                     border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:.85rem;"></div>
                <button id="btnSaveEtu" style="width:100%;padding:.875rem;border:none;
                    border-radius:10px;background:linear-gradient(135deg,#6366f1,#8b5cf6);
                    color:white;font-weight:700;font-size:1rem;cursor:pointer;">
                    <i class="fas fa-user-plus"></i> Inscrire l'étudiant
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById('closeEtu').addEventListener('click', () => modal.remove());

    document.getElementById('btnSaveEtu').addEventListener('click', async () => {
        const errEl    = document.getElementById('etuError');
        errEl.style.display = 'none';
        const prenom   = document.getElementById('etu_prenom').value.trim();
        const nom      = document.getElementById('etu_nom').value.trim();
        const email    = document.getElementById('etu_email').value.trim();
        const tel      = document.getElementById('etu_tel').value.trim();
        const nais     = document.getElementById('etu_naissance').value;
        const groupe   = document.getElementById('etu_groupe').value;
        const niveau   = document.getElementById('etu_niveau').value;
        const pwd      = document.getElementById('etu_pwd').value;

        if (!prenom || !nom || !email || !tel || !nais || !pwd) {
            errEl.textContent = 'Remplissez tous les champs obligatoires (*).';
            errEl.style.display = 'block'; return;
        }
        if (pwd.length < 8) {
            errEl.textContent = 'Le mot de passe doit faire au moins 8 caractères.';
            errEl.style.display = 'block'; return;
        }

        const btn = document.getElementById('btnSaveEtu');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Inscription...'; btn.disabled = true;

        const result = await apiFetch('/etudiants/', {
            method: 'POST',
            body: JSON.stringify({
                email, first_name: prenom, last_name: nom,
                password: pwd, telephone: tel,
                date_naissance: nais,
                id_groupe: groupe || null,
                niveau_initial: niveau,
            }),
        });

        if (result?.error) {
            errEl.textContent = '❌ ' + result.message;
            errEl.style.display = 'block';
            btn.innerHTML = "<i class='fas fa-user-plus'></i> Inscrire l'étudiant"; btn.disabled = false; return;
        }

        modal.remove();
        showToast(`${prenom} ${nom} inscrit avec succès !`, 'success');
        cachedStats = null;  // invalidate cache
        loadAll();
    });
}

// ============================================================
// HELPERS STYLE
// ============================================================
function inp() {
    return `width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:10px;
            font-size:0.9rem;outline:none;box-sizing:border-box;font-family:inherit;background:#f9fafb;`;
}
function lbl() {
    return `font-size:0.875rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;`;
}

// ============================================================
// SETUP BOUTONS
// ============================================================
function setupButtons() {
    // Notifications
    document.querySelector('.header-actions .fa-bell')
        ?.closest('button')
        ?.addEventListener('click', async () => {
            const data = await apiFetch('/notifications/?statut=Non_lu');
            if (!data?.error) {
                showToast(data.length > 0
                    ? `${data.length} notification(s) non lue(s).`
                    : 'Aucune nouvelle notification.', 'info');
            }
        });

    // Quick actions FINANCIER
    const finBtns = document.querySelectorAll('.financial-section .quick-btn');
    if (finBtns[0]) finBtns[0].addEventListener('click', openModalPaiement);
    if (finBtns[1]) finBtns[1].addEventListener('click', () => showToast('Fonctionnalité en développement.', 'warning'));
    if (finBtns[2]) finBtns[2].addEventListener('click', () => showToast('Fonctionnalité en développement.', 'warning'));
    if (finBtns[3]) finBtns[3].addEventListener('click', async () => {
        const s = await fetchAllStats();
        const impayés = s.pay.filter(p => p.statut_paiement === 'Impaye').length;
        showToast(`${impayés} relance(s) en attente.`, 'info');
    });

    // Quick actions PERSONNEL
    const persBtns = document.querySelectorAll('.personnel-section .quick-btn');
    if (persBtns[0]) persBtns[0].addEventListener('click', openModalEtudiant);
    if (persBtns[1]) persBtns[1].addEventListener('click', () => window.location.href = '/secretariat/enseignants/');
    if (persBtns[2]) persBtns[2].addEventListener('click', () => showToast('Fonctionnalité en développement.', 'warning'));
    if (persBtns[3]) persBtns[3].addEventListener('click', () => showToast('Fonctionnalité en développement.', 'warning'));

    // Voir tout links
    document.querySelectorAll('.btn-view-all').forEach((link, i) => {
        link.addEventListener('click', e => {
            e.preventDefault();
            const urls = ['/comptable/paiements/', '/secretariat/etudiants/'];
            if (urls[i]) window.location.href = urls[i];
        });
    });
}

// ============================================================
// LOAD ALL
// ============================================================
let dataLoaded = false;

async function loadAll() {
    cachedStats = null;  // always refresh on explicit loadAll()
    await Promise.all([
        loadFinanceStats(),
        loadPersonnelStats(),
        loadDerniersPaiements(),
        loadActivitesRecentes(),
    ]);
    dataLoaded = true;
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    const user = checkSession();
    if (!user) return;

    setupButtons();

    // Load data immediately on page load (not waiting for button click)
    loadAll();

    // Auto-refresh every 2 minutes if dashboard is visible
    setInterval(() => {
        const dashboard = document.getElementById('dashboard-content');
        if (dashboard && !dashboard.classList.contains('hidden')) {
            loadAll();
        }
    }, 120000);
});