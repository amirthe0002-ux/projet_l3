/**
 * Gestion des Enseignants - Secrétariat
 * JWT Authentication + Django REST API
 * File: static/js/Gestion_ens.js
 *
 * ROOT CAUSES FIXED:
 * 1. Token key: LoginView returns { access, refresh, user }
 *    → must read localStorage.getItem('access'), NOT 'access_token'
 * 2. EnseignantSerializer.user = read_only=True
 *    → PUT /api/enseignants/<pk>/ CANNOT update first_name/last_name/telephone
 *    → user fields are sent as a SECOND PATCH to /api/utilisateurs/<user_pk>/
 * 3. DRF validation errors are nested objects → flattened into readable strings
 * 4. HTTP method changed to PATCH (partial=True already set in backend)
 * 5. All error messages shown inline in modal (not just toast)
 */

// ============================================================
// CONFIG
// ============================================================
const API_URL = '/api';

const state = {
    enseignants:   [],
    filtered:      [],
    groupes:       [],
    searchTerm:    '',
    filterContrat: 'all',
    filterStatut:  'all',
    filterLangue:  'all',
};

// ============================================================
// JWT HELPERS
// ============================================================
function getToken() {
    // LoginView returns { "access": "...", "refresh": "...", "user": {...} }
    // Your login page should store: localStorage.setItem('access', data.access)
    return (
        localStorage.getItem('access') ||
        sessionStorage.getItem('access') ||
        localStorage.getItem('access_token') ||   // fallback legacy key
        sessionStorage.getItem('access_token') ||
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
// API — flatten DRF nested errors
// ============================================================
function flattenDRFErrors(data) {
    if (typeof data === 'string') return data;
    if (data.detail) return data.detail;
    if (data.error)  return data.error;
    const msgs = [];
    for (const [key, val] of Object.entries(data)) {
        if (Array.isArray(val))        msgs.push(`${key}: ${val.join(', ')}`);
        else if (typeof val === 'object') msgs.push(`${key}: ${flattenDRFErrors(val)}`);
        else msgs.push(`${key}: ${val}`);
    }
    return msgs.join(' | ') || 'Erreur inconnue.';
}

async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });
        if (res.status === 401) {
            let msg = 'Token invalide ou expiré. Reconnectez-vous.';
            try { const d = await res.json(); msg = d.detail || d.error || msg; } catch {}
            return { error: 'JWT_INVALID', message: msg };
        }
        if (res.status === 403) {
            let msg = 'Accès refusé.';
            try { const d = await res.json(); msg = d.detail || d.error || msg; } catch {}
            return { error: 'FORBIDDEN', message: msg };
        }
        if (res.status === 204) return { success: true };

        const data = await res.json();
        if (!res.ok) return { error: 'API_ERROR', message: flattenDRFErrors(data), raw: data };
        return data;
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
    if (!['Secretariat', 'Comptable', 'Dirigeant'].includes(user.role)) {
        window.location.href = '/login/'; return null;
    }
    return user;
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
    document.querySelector('.toast-gest')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-gest';
    t.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:9999;
        padding:14px 22px; border-radius:12px; background:${colors[type]}; color:white;
        font-weight:500; font-size:0.9rem; box-shadow:0 8px 24px rgba(0,0,0,0.2);
        display:flex; align-items:center; gap:8px; max-width:420px; word-break:break-word;
        transform:translateX(120%); opacity:0; transition:all 0.3s ease;`;
    t.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform='translateX(0)'; t.style.opacity='1'; });
    setTimeout(() => {
        t.style.transform='translateX(120%)'; t.style.opacity='0';
        setTimeout(() => t.remove(), 300);
    }, 4500);
}

// ============================================================
// HELPERS
// ============================================================
function getInitials(nom) {
    if (!nom) return '??';
    return nom.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0,2);
}
function cardGradient(i) {
    const g = [
        'linear-gradient(135deg,#6366f1,#4f46e5)',
        'linear-gradient(135deg,#7c3aed,#a855f7)',
        'linear-gradient(135deg,#059669,#10b981)',
        'linear-gradient(135deg,#f59e0b,#d97706)',
        'linear-gradient(135deg,#ef4444,#dc2626)',
        'linear-gradient(135deg,#3b82f6,#2563eb)',
        'linear-gradient(135deg,#ec4899,#db2777)',
        'linear-gradient(135deg,#14b8a6,#0d9488)',
    ];
    return g[i % g.length];
}
function fmtDA(v) {
    if (v === null || v === undefined || v === '') return '—';
    return new Intl.NumberFormat('fr-DZ').format(v) + ' DA';
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-DZ') : '—'; }
function inp() {
    return `width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:10px;
            font-size:0.9rem;outline:none;box-sizing:border-box;font-family:inherit;background:#f9fafb;`;
}
function lbl() {
    return `font-size:0.875rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;`;
}
function errBox(id) {
    return `<div id="${id}" style="display:none;padding:0.75rem 1rem;background:#fef2f2;
            border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:0.85rem;"></div>`;
}
function showErr(id, msg) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg; el.style.display = 'block';
}
function hideErr(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
}

// ============================================================
// LOAD ENSEIGNANTS
// ============================================================
async function loadEnseignants() {
    const grid = document.querySelector('.teachers-grid');
    if (grid) grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#94a3b8;">
            <i class="fas fa-spinner fa-spin" style="font-size:2rem;margin-bottom:1rem;display:block;"></i>
            <p>Chargement des enseignants...</p>
        </div>`;

    const data = await apiFetch('/enseignants/');
    if (data?.error) {
        showToast(data.message, 'error');
        if (grid) grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#dc2626;">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:1rem;display:block;"></i>
                <p>${data.message}</p>
                <button onclick="loadEnseignants()" style="margin-top:1rem;padding:8px 16px;
                    background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer;">
                    Réessayer
                </button>
            </div>`;
        return;
    }

    state.enseignants = Array.isArray(data) ? data : (data.results || []);
    state.filtered    = [...state.enseignants];
    fillLangueDropdown(state.enseignants);
    updateStats(state.enseignants);
    renderGrid(state.enseignants);
}

async function loadGroupes() {
    const data = await apiFetch('/groupes/');
    if (!data?.error) state.groupes = Array.isArray(data) ? data : (data.results || []);
}

// ============================================================
// STATS
// ============================================================
function updateStats(ens) {
    const cards = document.querySelectorAll('.stat-content h3');
    if (!cards.length) return;
    const total      = ens.length;
    const actifs     = ens.filter(e => e.statut_emploi === 'Actif').length;
    const vacataires = ens.filter(e => e.type_contrat === 'Vacataire').length;
    const langues    = [...new Set(ens.map(e => e.langue_enseignee).filter(Boolean))].length;
    if (cards[0]) cards[0].textContent = total;
    if (cards[1]) cards[1].textContent = actifs;
    if (cards[2]) cards[2].textContent = vacataires;
    if (cards[3]) cards[3].textContent = langues;
}

function fillLangueDropdown(ens) {
    const select = document.querySelectorAll('.filter-select')[1];
    if (!select) return;
    const langues = [...new Set(ens.map(e => e.langue_enseignee).filter(Boolean))].sort();
    const first   = select.querySelector('option');
    select.innerHTML = ''; if (first) select.appendChild(first);
    langues.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l; opt.textContent = l; select.appendChild(opt);
    });
}

// ============================================================
// RENDER GRID
// ============================================================
function renderGrid(ens) {
    const grid = document.querySelector('.teachers-grid');
    if (!grid) return;
    if (!ens.length) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#94a3b8;">
                <i class="fas fa-user-slash" style="font-size:3rem;margin-bottom:1rem;display:block;"></i>
                <p style="font-size:1.1rem;font-weight:600;">Aucun enseignant trouvé</p>
                <p style="font-size:0.875rem;margin-top:0.5rem;">
                    ${state.searchTerm ? `Aucun résultat pour "${state.searchTerm}"` : 'Modifiez vos filtres'}
                </p>
            </div>`;
        return;
    }
    grid.innerHTML = ens.map((e, i) => {
        const nom      = e.nom_complet || `${e.user?.first_name||''} ${e.user?.last_name||''}`.trim() || 'Enseignant';
        const statut   = e.statut_emploi || 'Actif';
        const sColor   = statut==='Actif' ? '#059669' : statut==='Suspendu' ? '#d97706' : '#dc2626';
        const sBg      = statut==='Actif' ? 'rgba(16,185,129,0.15)' : statut==='Suspendu' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)';
        return `
        <div class="teacher-card" data-id="${e.id}" style="animation:fadeIn 0.4s ease ${i*.05}s both;">
            <div class="card-header" style="background:${cardGradient(i)};">
                <div class="teacher-profile">
                    <div class="teacher-avatar">${getInitials(nom)}</div>
                    <div class="teacher-info">
                        <h3>${nom}</h3>
                        <p>Prof. de ${e.langue_enseignee||'—'}</p>
                    </div>
                </div>
                <span class="teacher-badge">${e.type_contrat||'—'}</span>
            </div>
            <div class="card-body">
                <div class="stats-row">
                    <div class="mini-stat">
                        <div class="mini-stat-value">${e.nombre_groupes??'—'}</div>
                        <div class="mini-stat-label">Groupes</div>
                    </div>
                    <div class="mini-stat">
                        <div class="mini-stat-value">${e.heures_travaillees_mois??0}h</div>
                        <div class="mini-stat-label">Ce mois</div>
                    </div>
                    <div class="mini-stat">
                        <div class="mini-stat-value"
                             style="font-size:0.7rem;padding:2px 6px;border-radius:6px;
                                    background:${sBg};color:${sColor};">${statut}</div>
                        <div class="mini-stat-label">Statut</div>
                    </div>
                </div>
                <div class="details-list">
                    <div class="detail-item">
                        <span class="detail-label">Email</span>
                        <span class="detail-value">${e.user?.email||'—'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Téléphone</span>
                        <span class="detail-value">${e.user?.telephone||'—'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Qualification</span>
                        <span class="detail-value">${e.qualification||'—'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Niveaux</span>
                        <span class="detail-value">${e.niveaux||'—'}</span>
                    </div>
                </div>
                <div class="salary-info">
                    <div class="salary-header">
                        <h4>Salaire Mensuel</h4>
                        <i class="fas fa-money-bill-wave" style="color:#059669;"></i>
                    </div>
                    <div class="salary-amount">${fmtDA(e.salaire_mois)}</div>
                    <p style="color:#065f46;font-size:0.875rem;margin-top:0.5rem;">
                        <i class="fas fa-clock"></i> ${e.heures_travaillees_mois??0}h × ${fmtDA(e.tarif_horaire)}
                    </p>
                </div>
                <div class="card-actions">
                    <button class="btn-action btn-edit">
                        <i class="fas fa-edit"></i> Modifier
                    </button>
                    <button class="btn-action btn-pay">
                        <i class="fas fa-file-invoice-dollar"></i> Bulletin
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ============================================================
// FILTERS
// ============================================================
function applyFilters() {
    let r = [...state.enseignants];
    if (state.searchTerm) {
        const t = state.searchTerm.toLowerCase();
        r = r.filter(e => {
            const nom  = (e.nom_complet||`${e.user?.first_name||''} ${e.user?.last_name||''}`).toLowerCase();
            const mail = (e.user?.email||'').toLowerCase();
            const lang = (e.langue_enseignee||'').toLowerCase();
            return nom.includes(t) || mail.includes(t) || lang.includes(t);
        });
    }
    if (state.filterContrat !== 'all') r = r.filter(e => e.type_contrat    === state.filterContrat);
    if (state.filterStatut  !== 'all') r = r.filter(e => e.statut_emploi   === state.filterStatut);
    if (state.filterLangue  !== 'all') r = r.filter(e => e.langue_enseignee === state.filterLangue);
    state.filtered = r;
    updateStats(r);
    renderGrid(r);
}

// ============================================================
// MODAL DETAILS
// ============================================================
async function openModalDetails(id) {
    const e = state.enseignants.find(x => x.id === id);
    if (!e) return;
    const nom = e.nom_complet || `${e.user?.first_name||''} ${e.user?.last_name||''}`.trim();
    const g   = cardGradient(id % 8);

    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;z-index:2000;`;
    modal.innerHTML = `
        <div style="background:white;border-radius:20px;width:90%;max-width:560px;
                    max-height:90vh;overflow-y:auto;animation:fadeIn 0.3s ease;"
             onclick="event.stopPropagation()">
            <div style="background:${g};padding:2rem;border-radius:20px 20px 0 0;
                        color:white;display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="display:flex;align-items:center;gap:1rem;">
                    <div style="width:60px;height:60px;border-radius:50%;background:rgba(255,255,255,0.3);
                                display:flex;align-items:center;justify-content:center;
                                font-size:1.4rem;font-weight:700;">${getInitials(nom)}</div>
                    <div>
                        <h2 style="font-size:1.3rem;font-weight:700;margin-bottom:4px;">${nom}</h2>
                        <p style="opacity:0.85;font-size:0.875rem;">
                            Prof. de ${e.langue_enseignee||'—'} • ${e.type_contrat||'—'}
                        </p>
                    </div>
                </div>
                <button id="closeDetails" style="background:rgba(255,255,255,0.2);border:none;color:white;
                    width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1.2rem;">×</button>
            </div>
            <div style="padding:1.5rem;">
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-bottom:1.5rem;">
                    ${[['👥',e.nombre_groupes??'—','Groupes'],
                       ['⏱',(e.heures_travaillees_mois||0)+'h','Ce mois'],
                       ['⭐',(e.experience_annees||0)+' ans','Expérience']
                    ].map(([ic,v,lb]) => `
                        <div style="text-align:center;padding:1rem;background:#f8fafc;border-radius:12px;">
                            <div style="font-size:1.5rem;margin-bottom:4px;">${ic}</div>
                            <div style="font-size:1.4rem;font-weight:800;color:#1e293b;">${v}</div>
                            <div style="font-size:0.75rem;color:#64748b;">${lb}</div>
                        </div>`).join('')}
                </div>
                <div style="display:flex;flex-direction:column;gap:0.75rem;">
                    ${[['📧','Email',e.user?.email||'—'],
                       ['📞','Téléphone',e.user?.telephone||'—'],
                       ['🎓','Qualification',e.qualification||'—'],
                       ['📚','Niveaux',e.niveaux||'—'],
                       ['📅','Début contrat',fmtDate(e.date_debut_contrat)],
                       ['📅','Fin contrat',e.date_fin_contrat?fmtDate(e.date_fin_contrat):'Indéterminé'],
                       ['💰','Salaire mensuel',fmtDA(e.salaire_mois)],
                       ['💵','Tarif horaire',fmtDA(e.tarif_horaire)]
                    ].map(([ic,lb,v]) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;
                                    padding:0.75rem 1rem;background:#f8fafc;border-radius:10px;">
                            <span style="color:#64748b;font-size:0.875rem;">${ic} ${lb}</span>
                            <strong style="color:#1e293b;font-size:0.875rem;text-align:right;max-width:60%;">${v}</strong>
                        </div>`).join('')}
                </div>
                <div style="display:flex;gap:1rem;margin-top:1.5rem;">
                    <button onclick="openModalModifier(${id});this.closest('[style*=fixed]').remove();"
                            style="flex:1;padding:0.875rem;border:none;border-radius:10px;
                                   background:linear-gradient(135deg,#6366f1,#8b5cf6);
                                   color:white;font-weight:700;cursor:pointer;">
                        <i class="fas fa-edit"></i> Modifier
                    </button>
                    <button onclick="openModalBulletin(${id});this.closest('[style*=fixed]').remove();"
                            style="flex:1;padding:0.875rem;border:none;border-radius:10px;
                                   background:linear-gradient(135deg,#059669,#10b981);
                                   color:white;font-weight:700;cursor:pointer;">
                        <i class="fas fa-file-invoice-dollar"></i> Bulletin
                    </button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', ev => { if (ev.target===modal) modal.remove(); });
    document.getElementById('closeDetails')?.addEventListener('click', () => modal.remove());
}

// ============================================================
// MODAL MODIFIER — TWO PATCH CALLS
// PATCH 1 → /api/enseignants/<pk>/   (Enseignant model fields only)
// PATCH 2 → /api/utilisateurs/<uid>/ (Utilisateur fields: first_name, last_name, telephone)
// NOTE: If /api/utilisateurs/<uid>/ doesn't exist in your urls.py, add it (see comment below)
// ============================================================
async function openModalModifier(id) {
    const e = state.enseignants.find(x => x.id === id);
    if (!e) return;

    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;z-index:2000;`;
    modal.innerHTML = `
        <div style="background:white;border-radius:20px;padding:2rem;width:90%;max-width:520px;
                    max-height:90vh;overflow-y:auto;animation:fadeIn 0.3s ease;"
             onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                <h3 style="font-size:1.2rem;font-weight:700;color:#1e293b;">
                    <i class="fas fa-edit" style="color:#6366f1;margin-right:8px;"></i>Modifier l'enseignant
                </h3>
                <button id="closeModifier"
                        style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">×</button>
            </div>

            <p style="font-size:0.72rem;font-weight:700;color:#6366f1;text-transform:uppercase;
                      letter-spacing:.06em;margin-bottom:.6rem;">Informations personnelles</p>
            <div style="display:flex;flex-direction:column;gap:.75rem;margin-bottom:1.2rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Prénom</label>
                        <input id="mod_prenom" type="text" value="${e.user?.first_name||''}" style="${inp()}"></div>
                    <div><label style="${lbl()}">Nom</label>
                        <input id="mod_nom" type="text" value="${e.user?.last_name||''}" style="${inp()}"></div>
                </div>
                <div><label style="${lbl()}">Téléphone</label>
                    <input id="mod_tel" type="text" value="${e.user?.telephone||''}" style="${inp()}"></div>
            </div>

            <p style="font-size:0.72rem;font-weight:700;color:#6366f1;text-transform:uppercase;
                      letter-spacing:.06em;margin-bottom:.6rem;">Informations professionnelles</p>
            <div style="display:flex;flex-direction:column;gap:.75rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Langue enseignée *</label>
                        <input id="mod_langue" type="text" value="${e.langue_enseignee||''}" style="${inp()}"></div>
                    <div><label style="${lbl()}">Niveaux (A1,B1…) *</label>
                        <input id="mod_niveaux" type="text" value="${e.niveaux||''}" style="${inp()}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Type de contrat</label>
                        <select id="mod_contrat" style="${inp()}">
                            ${['CDI','CDD','Vacataire'].map(c =>
                                `<option value="${c}" ${c===e.type_contrat?'selected':''}>${c}</option>`
                            ).join('')}
                        </select></div>
                    <div><label style="${lbl()}">Statut emploi</label>
                        <select id="mod_statut" style="${inp()}">
                            ${['Actif','Inactif','Suspendu'].map(s =>
                                `<option value="${s}" ${s===e.statut_emploi?'selected':''}>${s}</option>`
                            ).join('')}
                        </select></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Tarif horaire (DA)</label>
                        <input id="mod_tarif" type="number" min="0" value="${e.tarif_horaire||''}" style="${inp()}"></div>
                    <div><label style="${lbl()}">Expérience (ans)</label>
                        <input id="mod_exp" type="number" min="0" value="${e.experience_annees||0}" style="${inp()}"></div>
                </div>
                <div><label style="${lbl()}">Qualification</label>
                    <input id="mod_qualif" type="text" value="${e.qualification||''}" style="${inp()}"></div>

                ${errBox('modError')}

                <button id="btnSaveModifier" style="width:100%;padding:.875rem;border:none;border-radius:10px;
                    background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-weight:700;
                    font-size:1rem;cursor:pointer;margin-top:.5rem;">
                    <i class="fas fa-save"></i> Enregistrer les modifications
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', ev => { if (ev.target===modal) modal.remove(); });
    document.getElementById('closeModifier')?.addEventListener('click', () => modal.remove());

    document.getElementById('btnSaveModifier')?.addEventListener('click', async () => {
        hideErr('modError');
        const btn     = document.getElementById('btnSaveModifier');
        const prenom  = document.getElementById('mod_prenom').value.trim();
        const nom     = document.getElementById('mod_nom').value.trim();
        const tel     = document.getElementById('mod_tel').value.trim();
        const langue  = document.getElementById('mod_langue').value.trim();
        const niveaux = document.getElementById('mod_niveaux').value.trim();
        const contrat = document.getElementById('mod_contrat').value;
        const statut  = document.getElementById('mod_statut').value;
        const tarif   = parseFloat(document.getElementById('mod_tarif').value) || 0;
        const exp     = parseInt(document.getElementById('mod_exp').value) || 0;
        const qualif  = document.getElementById('mod_qualif').value.trim();

        if (!langue || !niveaux) {
            showErr('modError', 'La langue et les niveaux sont obligatoires.'); return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled  = true;

        // ── PATCH 1: Enseignant model fields (user is read_only in serializer) ──
        const r1 = await apiFetch(`/enseignants/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify({
                langue_enseignee: langue,
                niveaux,
                type_contrat:      contrat,
                statut_emploi:     statut,
                tarif_horaire:     tarif,
                experience_annees: exp,
                qualification:     qualif,
            }),
        });

        if (r1?.error) {
            showErr('modError', '❌ ' + r1.message);
            btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer les modifications';
            btn.disabled  = false;
            return;
        }

        // ── PATCH 2: Utilisateur fields (first_name, last_name, telephone) ──
        // Requires a user-update endpoint. Add to api/urls.py:
        //   path('utilisateurs/<int:pk>/', views.UtilisateurDetailView.as_view(), name='user_detail'),
        // And a simple view that does partial update on Utilisateur with IsStaff permission.
        const userId = e.user?.id;
        if (userId) {
            const r2 = await apiFetch(`/utilisateurs/${userId}/`, {
                method: 'PATCH',
                body: JSON.stringify({ first_name: prenom, last_name: nom, telephone: tel }),
            });
            if (r2?.error) {
                // Not blocking — main data saved OK
                showToast('⚠️ Données pro sauvegardées. Prénom/Nom/Tél non modifiés (endpoint manquant).', 'warning');
            }
        }

        modal.remove();
        showToast('✅ Enseignant modifié avec succès !', 'success');
        await loadEnseignants();
    });
}

// ============================================================
// MODAL NOUVEL ENSEIGNANT
// POST /api/enseignants/ → EnseignantCreateSerializer
// Required fields: email, first_name, last_name, password, telephone,
//   langue_enseignee, niveaux, type_contrat, tarif_horaire, date_debut_contrat
// ============================================================
async function openModalNouvelEnseignant() {
    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;z-index:2000;`;
    modal.innerHTML = `
        <div style="background:white;border-radius:20px;padding:2rem;width:90%;max-width:520px;
                    max-height:90vh;overflow-y:auto;animation:fadeIn 0.3s ease;"
             onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="font-size:1.2rem;font-weight:700;color:#1e293b;">
                    <i class="fas fa-chalkboard-teacher" style="color:#6366f1;margin-right:8px;"></i>Nouvel Enseignant
                </h3>
                <button id="closeNouvel"
                        style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">×</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:.75rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Prénom *</label>
                        <input id="new_prenom" type="text" placeholder="Ahmed" style="${inp()}"></div>
                    <div><label style="${lbl()}">Nom *</label>
                        <input id="new_nom" type="text" placeholder="Benali" style="${inp()}"></div>
                </div>
                <div><label style="${lbl()}">Email *</label>
                    <input id="new_email" type="email" placeholder="ahmed@centre.com" style="${inp()}"></div>
                <div><label style="${lbl()}">Téléphone *</label>
                    <input id="new_tel" type="text" placeholder="0555 12 34 56" style="${inp()}"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Langue enseignée *</label>
                        <input id="new_langue" type="text" placeholder="Anglais" style="${inp()}"></div>
                    <div><label style="${lbl()}">Niveaux * (ex: A1,B1)</label>
                        <input id="new_niveaux" type="text" placeholder="A1,A2,B1" style="${inp()}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Contrat *</label>
                        <select id="new_contrat" style="${inp()}">
                            <option value="CDI">CDI</option>
                            <option value="CDD">CDD</option>
                            <option value="Vacataire">Vacataire</option>
                        </select></div>
                    <div><label style="${lbl()}">Tarif/heure (DA) *</label>
                        <input id="new_tarif" type="number" min="0" placeholder="2000" style="${inp()}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Date début contrat *</label>
                        <input id="new_date_debut" type="date" style="${inp()}"></div>
                    <div><label style="${lbl()}">Date fin contrat</label>
                        <input id="new_date_fin" type="date" style="${inp()}"></div>
                </div>
                <div><label style="${lbl()}">Qualification</label>
                    <input id="new_qualif" type="text" placeholder="Master Linguistique" style="${inp()}"></div>
                <div><label style="${lbl()}">Mot de passe *</label>
                    <input id="new_pwd" type="password" placeholder="Min. 8 caractères" style="${inp()}"></div>
                ${errBox('newError')}
                <button id="btnSaveNouvel" style="width:100%;padding:.875rem;border:none;border-radius:10px;
                    background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;font-weight:700;
                    font-size:1rem;cursor:pointer;margin-top:.5rem;">
                    <i class="fas fa-user-plus"></i> Ajouter l'enseignant
                </button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', ev => { if (ev.target===modal) modal.remove(); });
    document.getElementById('closeNouvel')?.addEventListener('click', () => modal.remove());

    document.getElementById('btnSaveNouvel')?.addEventListener('click', async () => {
        hideErr('newError');
        const prenom    = document.getElementById('new_prenom').value.trim();
        const nom       = document.getElementById('new_nom').value.trim();
        const email     = document.getElementById('new_email').value.trim();
        const tel       = document.getElementById('new_tel').value.trim();
        const langue    = document.getElementById('new_langue').value.trim();
        const niveaux   = document.getElementById('new_niveaux').value.trim();
        const contrat   = document.getElementById('new_contrat').value;
        const tarif     = document.getElementById('new_tarif').value;
        const dateDebut = document.getElementById('new_date_debut').value;
        const dateFin   = document.getElementById('new_date_fin').value || null;
        const qualif    = document.getElementById('new_qualif').value.trim();
        const pwd       = document.getElementById('new_pwd').value;

        if (!prenom||!nom||!email||!tel||!langue||!niveaux||!tarif||!dateDebut||!pwd) {
            showErr('newError','Tous les champs * sont obligatoires.'); return;
        }
        if (pwd.length < 8) { showErr('newError','Mot de passe: minimum 8 caractères.'); return; }

        const btn = document.getElementById('btnSaveNouvel');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;

        const result = await apiFetch('/enseignants/', {
            method: 'POST',
            body: JSON.stringify({
                email,
                first_name:         prenom,
                last_name:          nom,
                password:           pwd,
                telephone:          tel,
                langue_enseignee:   langue,
                niveaux,
                type_contrat:       contrat,
                tarif_horaire:      parseFloat(tarif),
                date_debut_contrat: dateDebut,
                date_fin_contrat:   dateFin,
                qualification:      qualif || '',
                experience_annees:  0,
                disponibilite:      {},
            }),
        });

        if (result?.error) {
            showErr('newError', '❌ ' + result.message);
            btn.innerHTML = '<i class="fas fa-user-plus"></i> Ajouter l\'enseignant';
            btn.disabled = false;
            return;
        }
        modal.remove();
        showToast(`✅ ${prenom} ${nom} ajouté avec succès !`, 'success');
        await loadEnseignants();
    });
}

// ============================================================
// MODAL BULLETIN
// POST /api/bulletins/ → BulletinSalaireSerializer
// ============================================================
async function openModalBulletin(id) {
    const e = state.enseignants.find(x => x.id === id);
    if (!e) return;
    const nom  = e.nom_complet || `${e.user?.first_name||''} ${e.user?.last_name||''}`.trim();
    const grad = cardGradient(id % 8);
    const today = new Date();
    const defPeriode = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}`;

    const bulData = await apiFetch(`/bulletins/?enseignant=${id}`);
    const buls    = !bulData?.error ? (Array.isArray(bulData) ? bulData : (bulData.results||[])) : [];
    const listHTML = buls.length
        ? buls.slice(0,5).map(b => `
            <div style="display:flex;justify-content:space-between;align-items:center;
                        padding:.6rem 1rem;background:#f8fafc;border-radius:8px;margin-bottom:.5rem;">
                <span style="font-size:.85rem;color:#475569;">${b.periode||'—'}</span>
                <span style="font-size:.85rem;font-weight:700;color:#1e293b;">${fmtDA(b.salaire_net)}</span>
                <span style="font-size:.75rem;padding:2px 8px;border-radius:6px;
                             background:${b.statut_paiement==='Paye'?'#dcfce7':'#fef3c7'};
                             color:${b.statut_paiement==='Paye'?'#059669':'#d97706'};">
                    ${b.statut_paiement==='Paye'?'Payé':'En attente'}
                </span>
            </div>`).join('')
        : '<p style="color:#94a3b8;font-size:.875rem;text-align:center;padding:1rem;">Aucun bulletin.</p>';

    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);
        display:flex;align-items:center;justify-content:center;z-index:2000;`;
    modal.innerHTML = `
        <div style="background:white;border-radius:20px;width:90%;max-width:540px;
                    max-height:90vh;overflow-y:auto;animation:fadeIn 0.3s ease;"
             onclick="event.stopPropagation()">
            <div style="background:${grad};padding:1.5rem 2rem;border-radius:20px 20px 0 0;color:white;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <div>
                        <h3 style="font-size:1.1rem;font-weight:700;">
                            <i class="fas fa-file-invoice-dollar"></i> Bulletin de Salaire
                        </h3>
                        <p style="opacity:.85;font-size:.875rem;margin-top:4px;">${nom}</p>
                    </div>
                    <button id="closeBulletin" style="background:rgba(255,255,255,0.2);border:none;
                        color:white;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1.2rem;">×</button>
                </div>
            </div>
            <div style="padding:1.5rem;">
                <h4 style="font-size:.95rem;font-weight:700;color:#1e293b;margin-bottom:.75rem;">Historique récent</h4>
                ${listHTML}
                <div style="border-top:2px solid #f1f5f9;margin-top:1.25rem;padding-top:1.25rem;">
                    <h4 style="font-size:.95rem;font-weight:700;color:#1e293b;margin-bottom:1rem;">Générer un bulletin</h4>
                    <div style="display:flex;flex-direction:column;gap:.75rem;">
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                            <div><label style="${lbl()}">Période *</label>
                                <input id="bul_periode" type="month" value="${defPeriode}" style="${inp()}"></div>
                            <div><label style="${lbl()}">Heures travaillées *</label>
                                <input id="bul_heures" type="number" min="0" step=".5"
                                       value="${e.heures_travaillees_mois||''}" placeholder="0" style="${inp()}"></div>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                            <div><label style="${lbl()}">Assurance (DA)</label>
                                <input id="bul_assurance" type="number" min="0" value="0" style="${inp()}"></div>
                            <div><label style="${lbl()}">Cotisations (DA)</label>
                                <input id="bul_cotisations" type="number" min="0" value="0" style="${inp()}"></div>
                        </div>
                        <div><label style="${lbl()}">Mode de paiement</label>
                            <select id="bul_mode" style="${inp()}">
                                <option value="Virement">Virement bancaire</option>
                                <option value="Especes">Espèces</option>
                                <option value="Cheque">Chèque</option>
                            </select></div>
                        <!-- Live preview -->
                        <div id="apercu" style="display:none;background:#f0fdf4;
                             border:1px solid #bbf7d0;border-radius:10px;padding:1rem;">
                            <p style="font-size:.8rem;color:#166534;font-weight:600;margin-bottom:6px;">Aperçu</p>
                            <div style="display:flex;justify-content:space-between;font-size:.875rem;">
                                <span>Salaire brut</span><span id="apr_brut" style="font-weight:700;">—</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;font-size:.875rem;margin-top:4px;">
                                <span>Retenues</span><span id="apr_ret" style="font-weight:700;color:#dc2626;">—</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;font-size:1rem;
                                        margin-top:8px;padding-top:8px;border-top:1px solid #bbf7d0;">
                                <span style="color:#166534;font-weight:700;">Salaire net</span>
                                <span id="apr_net" style="font-weight:800;color:#059669;font-size:1.1rem;">—</span>
                            </div>
                        </div>
                        ${errBox('bulError')}
                        <button id="btnGenBulletin" style="width:100%;padding:.875rem;border:none;border-radius:10px;
                            background:linear-gradient(135deg,#059669,#10b981);color:white;
                            font-weight:700;font-size:1rem;cursor:pointer;">
                            <i class="fas fa-file-invoice-dollar"></i> Générer le bulletin
                        </button>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', ev => { if (ev.target===modal) modal.remove(); });
    document.getElementById('closeBulletin')?.addEventListener('click', () => modal.remove());

    function calcApercu() {
        const h = parseFloat(document.getElementById('bul_heures')?.value)||0;
        const t = parseFloat(e.tarif_horaire)||0;
        const a = parseFloat(document.getElementById('bul_assurance')?.value)||0;
        const c = parseFloat(document.getElementById('bul_cotisations')?.value)||0;
        const brut = h*t; const ret = a+c; const net = brut-ret;
        const ap = document.getElementById('apercu');
        if (brut>0 && ap) {
            ap.style.display='block';
            document.getElementById('apr_brut').textContent = fmtDA(brut);
            document.getElementById('apr_ret').textContent  = '- '+fmtDA(ret);
            document.getElementById('apr_net').textContent  = fmtDA(net);
        }
    }
    ['bul_heures','bul_assurance','bul_cotisations'].forEach(x =>
        document.getElementById(x)?.addEventListener('input', calcApercu));
    calcApercu();

    document.getElementById('btnGenBulletin')?.addEventListener('click', async () => {
        hideErr('bulError');
        const periode  = document.getElementById('bul_periode').value;
        const heures   = parseFloat(document.getElementById('bul_heures').value);
        const mode     = document.getElementById('bul_mode').value;
        const assur    = parseFloat(document.getElementById('bul_assurance').value)||0;
        const cotis    = parseFloat(document.getElementById('bul_cotisations').value)||0;

        if (!periode) { showErr('bulError','Période obligatoire.'); return; }
        if (!heures||heures<=0) { showErr('bulError','Heures > 0 obligatoires.'); return; }

        const btn = document.getElementById('btnGenBulletin');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération...'; btn.disabled=true;

        const result = await apiFetch('/bulletins/', {
            method: 'POST',
            body: JSON.stringify({
                enseignant:         id,
                periode,
                heures_travaillees: heures,
                tarif_horaire:      parseFloat(e.tarif_horaire)||0,
                assurance:          assur,
                cotisations:        cotis,
                autres_retenues:    0,
                mode_paiement:      mode,
                statut_paiement:    'En_attente',
            }),
        });

        if (result?.error) {
            showErr('bulError', '❌ '+result.message);
            btn.innerHTML = '<i class="fas fa-file-invoice-dollar"></i> Générer le bulletin';
            btn.disabled=false; return;
        }
        modal.remove();
        showToast('✅ Bulletin généré avec succès !', 'success');
        await loadEnseignants();
    });
}

// ============================================================
// ARCHIVER
// ============================================================
async function archiverEnseignant(id) {
    const e   = state.enseignants.find(x => x.id===id);
    const nom = e ? (e.nom_complet||`${e.user?.first_name||''} ${e.user?.last_name||''}`.trim()) : 'cet enseignant';
    if (!confirm(`Archiver ${nom} ? Son compte sera désactivé.`)) return;
    const r = await apiFetch(`/enseignants/${id}/`, { method:'DELETE' });
    if (r?.error) { showToast(r.message, 'error'); return; }
    showToast(`${nom} archivé.`, 'success');
    await loadEnseignants();
}

// ============================================================
// EXPORT CSV
// ============================================================
function exportCSV() {
    if (!state.filtered.length) { showToast('Aucune donnée à exporter.','warning'); return; }
    const headers = ['ID','Nom complet','Email','Téléphone','Langue','Niveaux',
                     'Contrat','Tarif/h DA','Salaire DA','Groupes','Statut'];
    const rows = state.filtered.map(e => [
        e.id,
        e.nom_complet||`${e.user?.first_name||''} ${e.user?.last_name||''}`.trim(),
        e.user?.email||'', e.user?.telephone||'',
        e.langue_enseignee||'', e.niveaux||'', e.type_contrat||'',
        e.tarif_horaire||'', e.salaire_mois||'', e.nombre_groupes??'', e.statut_emploi||'',
    ]);
    const csv  = [headers,...rows].map(r => r.map(v=>`"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href=url; a.download=`enseignants_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast('Export CSV téléchargé !','success');
}

// ============================================================
// INJECT STYLES
// ============================================================
function injectStyles() {
    if (document.getElementById('ens-styles')) return;
    const s = document.createElement('style'); s.id='ens-styles';
    s.textContent = `
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .teacher-card { transition:transform .2s,box-shadow .2s; cursor:pointer; }
        .teacher-card:hover { transform:translateY(-4px); box-shadow:0 12px 24px rgba(0,0,0,.12); }
        .btn-action { transition:all .2s; }
        .btn-action:hover { transform:translateY(-1px); opacity:.9; }`;
    document.head.appendChild(s);
}

// ============================================================
// EVENTS
// ============================================================
function setupEvents() {
    document.querySelector('.btn-primary')?.addEventListener('click', openModalNouvelEnseignant);
    document.querySelector('.btn-secondary')?.addEventListener('click', exportCSV);

    const si = document.querySelector('.search-box input');
    if (si) {
        let tmr;
        si.addEventListener('input', ev => {
            clearTimeout(tmr);
            tmr = setTimeout(() => { state.searchTerm=ev.target.value.trim(); applyFilters(); }, 300);
        });
    }

    const sel = document.querySelectorAll('.filter-select');
    if (sel[0]) sel[0].addEventListener('change', ev => {
        const v=ev.target.value;
        state.filterContrat=['CDI','CDD','Vacataire'].includes(v)?v:'all'; applyFilters();
    });
    if (sel[1]) sel[1].addEventListener('change', ev => {
        state.filterLangue=ev.target.value||'all'; applyFilters();
    });
    if (sel[2]) sel[2].addEventListener('change', ev => {
        const v=ev.target.value;
        state.filterStatut=['Actif','Inactif','Suspendu'].includes(v)?v:'all'; applyFilters();
    });

    // Event delegation on grid — avoids onclick on dynamic elements
    document.querySelector('.teachers-grid')?.addEventListener('click', ev => {
        const card = ev.target.closest('.teacher-card');
        if (!card) return;
        const id = parseInt(card.dataset.id);
        if (!id) return;
        if (ev.target.closest('.btn-edit')) { openModalModifier(id); return; }
        if (ev.target.closest('.btn-pay'))  { openModalBulletin(id); return; }
        openModalDetails(id);
    });
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;
    injectStyles();
    setupEvents();
    await Promise.all([loadGroupes(), loadEnseignants()]);
});