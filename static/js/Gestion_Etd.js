/**
 * Gestion des Étudiants - Secrétariat
 * JWT Authentication + Django REST API
 * FIXED: Parent display uses flat fields (parent_id, parent_nom, parent_email, parent_tel)
 * File: static/js/Gestion_Etd.js
 */

// ============================================================
// CONFIG
// ============================================================
const API_URL = '/api';

const state = {
    etudiants:     [],
    filtered:      [],
    groupes:       [],
    searchTerm:    '',
    filterNiveau:  'all',
    filterLangue:  'all',
    filterStatut:  'all',
};

// ============================================================
// JWT HELPERS
// ============================================================
function getToken() {
    return localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || null;
}
function getUser() {
    try { return JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user')); }
    catch { return null; }
}
function authHeaders() {
    const token = getToken();
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

// ============================================================
// API GÉNÉRIQUE
// ============================================================
async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });
        if (res.status === 401) return { error: 'JWT_INVALID', message: 'Token invalide.' };
        if (res.status === 403) return { error: 'FORBIDDEN',   message: 'Accès refusé.' };
        if (!res.ok)            return { error: 'API_ERROR',   message: `Erreur ${res.status}` };
        if (res.status === 204) return { success: true };
        return await res.json();
    } catch (e) {
        return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible.' };
    }
}

// ============================================================
// VÉRIFIER SESSION
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
    document.querySelector('.toast-etd')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-etd';
    t.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:9999;
        padding:14px 22px; border-radius:12px;
        background:${colors[type]}; color:white; font-weight:500; font-size:0.9rem;
        box-shadow:0 8px 24px rgba(0,0,0,0.2);
        display:flex; align-items:center; gap:8px;
        transform:translateX(120%); opacity:0; transition:all 0.3s ease;`;
    t.innerHTML = `<span>${icons[type]}</span>${message}`;
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
function getInitials(nom) {
    if (!nom) return '??';
    return nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function niveauLabel(n) {
    const m = { A1:'A1 (Débutant)', A2:'A2 (Élémentaire)', B1:'B1 (Intermédiaire)', B2:'B2 (Confirmé)', C1:'C1 (Avancé)' };
    return m[n] || n;
}

function cardGradient(index) {
    const g = [
        'linear-gradient(135deg,#6366f1,#4f46e5)',
        'linear-gradient(135deg,#f59e0b,#d97706)',
        'linear-gradient(135deg,#10b981,#059669)',
        'linear-gradient(135deg,#8b5cf6,#7c3aed)',
        'linear-gradient(135deg,#ef4444,#dc2626)',
        'linear-gradient(135deg,#3b82f6,#2563eb)',
        'linear-gradient(135deg,#ec4899,#db2777)',
        'linear-gradient(135deg,#14b8a6,#0d9488)',
    ];
    return g[index % g.length];
}

function calculateAge(birthDate) {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}

// ============================================================
// CHARGER ÉTUDIANTS
// ============================================================
async function loadEtudiants() {
    const grid = document.querySelector('.students-grid');
    if (grid) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:3rem; color:#94a3b8;">
                <i class="fas fa-spinner fa-spin" style="font-size:2rem; display:block; margin-bottom:1rem;"></i>
                <p>Chargement des étudiants...</p>
            </div>`;
    }

    const data = await apiFetch('/etudiants/');

    if (data?.error) {
        showToast('Erreur: ' + data.message, 'error');
        if (grid) grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:3rem; color:#dc2626;">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem; display:block; margin-bottom:1rem;"></i>
                <p>${data.message}</p>
                <button onclick="loadEtudiants()" style="
                    margin-top:1rem; padding:8px 16px; background:#6366f1;
                    color:white; border:none; border-radius:8px; cursor:pointer;">
                    Réessayer
                </button>
            </div>`;
        return;
    }

    state.etudiants = data;
    state.filtered  = data;

    fillLangueDropdown(data);
    updateStats(data);
    renderGrid(data);
}

// ============================================================
// CHARGER GROUPES
// ============================================================
async function loadGroupes() {
    const data = await apiFetch('/groupes/?statut=Actif');
    if (!data?.error) state.groupes = data;
}

// ============================================================
// STATS CARDS
// ============================================================
function updateStats(etudiants) {
    const cards = document.querySelectorAll('.stat-content h3');
    if (!cards.length) return;
    const total    = etudiants.length;
    const actifs   = etudiants.filter(e => e.statut_etudiant === 'Actif').length;
    const suspendus = etudiants.filter(e => e.statut_etudiant === 'Suspendu').length;
    const c1       = etudiants.filter(e => e.niveau_actuel === 'C1').length;
    if (cards[0]) cards[0].textContent = total;
    if (cards[1]) cards[1].textContent = actifs;
    if (cards[2]) cards[2].textContent = suspendus;
    if (cards[3]) cards[3].textContent = c1;
}

// ============================================================
// DROPDOWN LANGUES
// ============================================================
function fillLangueDropdown(etudiants) {
    const select = document.querySelectorAll('.filter-select')[1];
    if (!select) return;
    const langues = [...new Set(
        etudiants.map(e => e.groupe_nom?.split('-')[0]?.trim()).filter(Boolean)
    )].sort();
    const first = select.querySelector('option');
    select.innerHTML = '';
    if (first) select.appendChild(first);
    langues.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l; opt.textContent = l;
        select.appendChild(opt);
    });
}

// ============================================================
// RENDER GRILLE
// ============================================================
function renderGrid(etudiants) {
    const grid = document.querySelector('.students-grid');
    if (!grid) return;

    if (!etudiants.length) {
        grid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:3rem; color:#94a3b8;">
                <i class="fas fa-user-slash" style="font-size:3rem; display:block; margin-bottom:1rem;"></i>
                <p style="font-size:1.1rem; font-weight:600;">Aucun étudiant trouvé</p>
            </div>`;
        return;
    }

    grid.innerHTML = etudiants.map((e, index) => {
        const prenom     = e.user?.first_name || '';
        const nom        = e.user?.last_name  || '';
        const nomComplet = `${prenom} ${nom}`.trim() || 'Étudiant';
        const initials   = getInitials(nomComplet);
        const tel        = e.user?.telephone || '—';
        const niveau     = e.niveau_actuel   || 'A1';
        const groupe     = e.groupe_nom      || 'Sans groupe';
        const statut     = e.statut_etudiant || 'Actif';
        const gradient   = cardGradient(index);
        const age        = calculateAge(e.date_naissance);
        const isMinor    = age !== null && age < 15;

        // ✅ Utilise les champs plats du serializer corrigé
        const hasParent  = !!e.parent_id;
        const indicator  = (isMinor && !hasParent) ? '⚠️ ' : (hasParent ? '👤 ' : '');

        const statutClass = statut === 'Suspendu' ? 'student-status status-warning'
                          : statut === 'Inactif'  ? 'student-status status-danger'
                          : 'student-status';

        return `
            <div class="student-card" data-id="${e.id}"
                 style="animation:fadeIn 0.4s ease ${index * 0.05}s both;">
                <div class="card-header" style="background:${gradient};">
                    <div class="student-main">
                        <div class="student-avatar">${initials}</div>
                        <div class="student-info">
                            <h3>${indicator}${nomComplet}</h3>
                            <p>ID: ETU${String(e.id).padStart(4, '0')}</p>
                        </div>
                    </div>
                    <span class="${statutClass}">${statut}</span>
                </div>
                <div class="card-body">
                    <div class="info-row">
                        <span class="info-label">Niveau</span>
                        <span class="info-value">${niveauLabel(niveau)}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Groupe</span>
                        <span class="info-value">${groupe}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Téléphone</span>
                        <span class="info-value">${tel}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Assiduité</span>
                        <span class="info-value">
                            ${parseFloat(e.taux_assiduité ?? e.taux_assiduite ?? 100).toFixed(0)}%
                        </span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Paiement</span>
                        <span class="payment-status payment-loading" id="pay-${e.id}">
                            <i class="fas fa-spinner fa-spin"></i>
                        </span>
                    </div>
                </div>
                <div class="card-footer">
                    <button class="btn-action btn-edit" onclick="openModalModifier(${e.id})">
                        <i class="fas fa-edit"></i> Modifier
                    </button>
                    <button class="btn-action btn-view" onclick="openModalDetails(${e.id})">
                        <i class="fas fa-eye"></i> Détails
                    </button>
                </div>
            </div>`;
    }).join('');

    etudiants.forEach(e => loadPaiementStatut(e.id));
}

// ============================================================
// STATUT PAIEMENT (async par étudiant)
// ============================================================
async function loadPaiementStatut(etudiantId) {
    const el = document.getElementById(`pay-${etudiantId}`);
    if (!el) return;

    const paiements = await apiFetch(`/paiements/?etudiant=${etudiantId}`);
    let statut = 'Non payé';
    let cls    = 'payment-unpaid';

    if (!paiements?.error && paiements.length) {
        const latest = paiements.sort((a, b) =>
            new Date(b.date_paiement) - new Date(a.date_paiement))[0];
        if (latest.statut_paiement === 'Paye') {
            statut = 'Payé'; cls = 'payment-paid';
        } else if (latest.statut_paiement === 'Partiellement_paye') {
            statut = 'Partiel'; cls = 'payment-partial';
        }
    }
    el.className = `payment-status ${cls}`;
    el.innerHTML = statut;
}

// ============================================================
// APPLIQUER FILTRES
// ============================================================
function applyFilters() {
    let result = [...state.etudiants];

    if (state.searchTerm) {
        const term = state.searchTerm.toLowerCase();
        result = result.filter(e => {
            const nom   = `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.toLowerCase();
            const email = (e.user?.email || '').toLowerCase();
            return nom.includes(term) || email.includes(term) || String(e.id).includes(term);
        });
    }
    if (state.filterNiveau !== 'all') result = result.filter(e => e.niveau_actuel === state.filterNiveau);
    if (state.filterLangue !== 'all') result = result.filter(e =>
        e.groupe_nom?.split('-')[0]?.trim() === state.filterLangue
    );
    if (state.filterStatut !== 'all') result = result.filter(e => e.statut_etudiant === state.filterStatut);

    state.filtered = result;
    updateStats(result);
    renderGrid(result);
}

// ============================================================
// MODAL DÉTAILS — FIXED: utilise les champs plats du serializer
// ============================================================
async function openModalDetails(etudiantId) {
    const etudiant = state.etudiants.find(e => e.id === etudiantId);
    if (!etudiant) return;

    const prenom     = etudiant.user?.first_name || '';
    const nom        = etudiant.user?.last_name  || '';
    const nomComplet = `${prenom} ${nom}`.trim();
    const initials   = getInitials(nomComplet);
    const age        = calculateAge(etudiant.date_naissance);
    const isMinor    = age !== null && age < 15;

    // ✅ Lecture directe des champs plats — pas de fetch supplémentaire
    const parentId       = etudiant.parent_id;
    const parentNom      = etudiant.parent_nom;
    const parentEmail    = etudiant.parent_email;
    const parentTel      = etudiant.parent_tel;
    const parentRelation = etudiant.parent_relation || 'Tuteur';
    const hasParent      = !!parentId;

    // Charger notes, absences, paiements
    const [notes, absences, paiements] = await Promise.all([
        apiFetch(`/notes/?etudiant=${etudiantId}`),
        apiFetch(`/absences/?etudiant=${etudiantId}`),
        apiFetch(`/paiements/?etudiant=${etudiantId}`),
    ]);

    const nbNotes    = !notes?.error    ? notes.length    : 0;
    const nbAbsences = !absences?.error ? absences.filter(a => a.statut_absence === 'Absent').length : 0;
    const moyenne    = !notes?.error && notes.length
        ? (notes.reduce((s, n) => s + parseFloat(n.note_obtenue), 0) / notes.length).toFixed(1)
        : '—';

    let paiementInfo = 'Aucun paiement';
    if (!paiements?.error && paiements.length) {
        const latest = paiements.sort((a, b) => new Date(b.date_paiement) - new Date(a.date_paiement))[0];
        const emoji  = latest.statut_paiement === 'Paye' ? '✅' : latest.statut_paiement === 'Partiellement_paye' ? '⚠️' : '❌';
        const label  = latest.statut_paiement === 'Paye' ? 'Payé' : latest.statut_paiement === 'Partiellement_paye' ? 'Partiel' : 'Non payé';
        paiementInfo = `${emoji} ${label} — ${new Intl.NumberFormat('fr-DZ').format(latest.montant_paye)} DA`;
    }

    // ── SECTION PARENT ────────────────────────────────────────
    let parentSectionHTML = '';

    if (hasParent) {
        parentSectionHTML = `
            <div style="margin-top:1.5rem; border-top:2px solid #e5e7eb; padding-top:1.5rem;">
                <h4 style="margin:0 0 1rem 0; color:#1e40af; font-size:1rem;
                           display:flex; align-items:center; gap:8px;">
                    <i class="fas fa-user-shield" style="color:#3b82f6;"></i>
                    Parent / Tuteur
                    ${isMinor ? '<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px;font-size:0.75rem;margin-left:auto;">Mineur</span>' : ''}
                </h4>
                <div style="background:#eff6ff; padding:1rem; border-radius:12px; border:2px solid #3b82f6;">
                    <div style="display:flex; align-items:center; gap:1rem; margin-bottom:1rem;">
                        <div style="width:44px; height:44px; border-radius:50%;
                                    background:linear-gradient(135deg,#3b82f6,#1e40af);
                                    display:flex; align-items:center; justify-content:center;
                                    color:white; font-size:1rem; font-weight:700; flex-shrink:0;">
                            ${getInitials(parentNom || '?')}
                        </div>
                        <div>
                            <div style="font-weight:700; color:#1e293b; font-size:1rem;">
                                ${parentNom || '—'}
                            </div>
                            <div style="font-size:0.8rem; color:#64748b; text-transform:capitalize;">
                                ${parentRelation}
                            </div>
                        </div>
                    </div>
                    ${[
                        ['fas fa-envelope', 'Email',     parentEmail || '—'],
                        ['fas fa-phone',    'Téléphone', parentTel   || '—'],
                    ].map(([icon, label, val]) => `
                        <div style="display:flex; justify-content:space-between; align-items:center;
                                    padding:0.5rem 0.75rem; background:white; border-radius:8px;
                                    margin-bottom:6px;">
                            <span style="color:#64748b; font-size:0.875rem;">
                                <i class="${icon}" style="color:#3b82f6; margin-right:6px;"></i>${label}
                            </span>
                            <strong style="color:#1e293b; font-size:0.875rem;">${val}</strong>
                        </div>`).join('')}
                </div>
            </div>`;

    } else if (isMinor) {
        parentSectionHTML = `
            <div style="margin-top:1.5rem; border-top:2px solid #e5e7eb; padding-top:1.5rem;">
                <div style="background:#fef3c7; border:2px solid #f59e0b;
                            padding:1rem; border-radius:12px; color:#92400e;">
                    <div style="font-weight:700; margin-bottom:0.5rem;">
                        <i class="fas fa-exclamation-triangle"></i> Parent manquant
                    </div>
                    <div style="font-size:0.875rem; line-height:1.5;">
                        Cet étudiant a <strong>${age} ans</strong> mais aucun parent n'est associé.
                        Modifiez l'étudiant pour en ajouter un.
                    </div>
                </div>
            </div>`;
    }

    // ── MODAL ─────────────────────────────────────────────────
    const modal = document.createElement('div');
    modal.id = `modalDetails-${etudiantId}`;
    modal.style.cssText = `position:fixed; inset:0; background:rgba(0,0,0,0.5);
        display:flex; align-items:center; justify-content:center; z-index:2000;`;

    modal.innerHTML = `
        <div style="background:white; border-radius:20px; width:90%; max-width:560px;
                    max-height:90vh; overflow-y:auto; animation:fadeIn 0.3s ease;"
             onclick="event.stopPropagation()">
            <!-- Header -->
            <div style="background:${cardGradient(etudiantId % 8)};
                        padding:2rem; border-radius:20px 20px 0 0;
                        color:white; display:flex; justify-content:space-between; align-items:flex-start;">
                <div style="display:flex; align-items:center; gap:1rem;">
                    <div style="width:60px; height:60px; border-radius:50%;
                                background:rgba(255,255,255,0.3);
                                display:flex; align-items:center; justify-content:center;
                                font-size:1.4rem; font-weight:700;">
                        ${initials}
                    </div>
                    <div>
                        <h2 style="font-size:1.3rem; font-weight:700; margin-bottom:4px;">${nomComplet}</h2>
                        <p style="opacity:0.85; font-size:0.875rem;">
                            ETU${String(etudiantId).padStart(4, '0')} •
                            ${etudiant.statut_etudiant || 'Actif'}
                            ${age !== null ? ` • ${age} ans` : ''}
                        </p>
                    </div>
                </div>
                <button id="closeDetails-${etudiantId}"
                        style="background:rgba(255,255,255,0.2); border:none; color:white;
                               width:32px; height:32px; border-radius:50%; cursor:pointer;
                               font-size:1.2rem; display:flex; align-items:center; justify-content:center;">
                    ×
                </button>
            </div>

            <div style="padding:1.5rem;">
                <!-- KPIs -->
                <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:1rem; margin-bottom:1.5rem;">
                    ${[['📊', moyenne, 'Moyenne'], ['📅', nbAbsences, 'Absences'], ['📝', nbNotes, 'Évals']].map(
                        ([icon, val, label]) => `
                        <div style="text-align:center; padding:1rem; background:#f8fafc; border-radius:12px;">
                            <div style="font-size:1.5rem; margin-bottom:4px;">${icon}</div>
                            <div style="font-size:1.4rem; font-weight:800; color:#1e293b;">${val}</div>
                            <div style="font-size:0.75rem; color:#64748b;">${label}</div>
                        </div>`).join('')}
                </div>

                <!-- Infos -->
                <div style="display:flex; flex-direction:column; gap:0.75rem;">
                    ${[
                        ['👤', 'Email',       etudiant.user?.email || '—'],
                        ['📞', 'Téléphone',   etudiant.user?.telephone || '—'],
                        ['🎓', 'Niveau',      niveauLabel(etudiant.niveau_actuel)],
                        ['👥', 'Groupe',      etudiant.groupe_nom || 'Sans groupe'],
                        ['📅', 'Inscription', etudiant.date_inscription
                            ? new Date(etudiant.date_inscription).toLocaleDateString('fr-DZ') : '—'],
                        ['🎂', 'Naissance',   etudiant.date_naissance
                            ? `${new Date(etudiant.date_naissance).toLocaleDateString('fr-DZ')}${age !== null ? ' (' + age + ' ans)' : ''}` : '—'],
                        ['💰', 'Paiement',    paiementInfo],
                        ['📈', 'Assiduité',   `${parseFloat(etudiant.taux_assiduité ?? etudiant.taux_assiduite ?? 100).toFixed(0)}%`],
                    ].map(([icon, label, val]) => `
                        <div style="display:flex; justify-content:space-between; align-items:center;
                                    padding:0.75rem 1rem; background:#f8fafc; border-radius:10px;">
                            <span style="color:#64748b; font-size:0.875rem;">${icon} ${label}</span>
                            <strong style="color:#1e293b; font-size:0.875rem; text-align:right; max-width:60%;">
                                ${val}
                            </strong>
                        </div>`).join('')}
                </div>

                <!-- Section Parent -->
                ${parentSectionHTML}

                <!-- Actions -->
                <div style="display:flex; gap:1rem; margin-top:1.5rem;">
                    <button onclick="openModalModifier(${etudiantId}); document.getElementById('modalDetails-${etudiantId}')?.remove();"
                            style="flex:1; padding:0.875rem; border:none; border-radius:10px;
                                   background:linear-gradient(135deg,#6366f1,#8b5cf6);
                                   color:white; font-weight:700; cursor:pointer;">
                        <i class="fas fa-edit"></i> Modifier
                    </button>
                    <button onclick="archiverEtudiant(${etudiantId}); document.getElementById('modalDetails-${etudiantId}')?.remove();"
                            style="flex:1; padding:0.875rem; border:2px solid #ef4444;
                                   border-radius:10px; background:white;
                                   color:#ef4444; font-weight:700; cursor:pointer;">
                        <i class="fas fa-archive"></i> Archiver
                    </button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById(`closeDetails-${etudiantId}`)?.addEventListener('click', () => modal.remove());
}

// ============================================================
// MODAL MODIFIER ÉTUDIANT
// ============================================================
async function openModalModifier(etudiantId) {
    const etudiant = state.etudiants.find(e => e.id === etudiantId);
    if (!etudiant) return;

    const prenom = etudiant.user?.first_name || '';
    const nom    = etudiant.user?.last_name  || '';

    const modal = document.createElement('div');
    modal.style.cssText = `position:fixed; inset:0; background:rgba(0,0,0,0.5);
        display:flex; align-items:center; justify-content:center; z-index:2000;`;

    modal.innerHTML = `
        <div style="background:white; border-radius:20px; padding:2rem;
                    width:90%; max-width:520px; max-height:90vh; overflow-y:auto;
                    animation:fadeIn 0.3s ease;"
             onclick="event.stopPropagation()">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h3 style="font-size:1.2rem; font-weight:700; color:#1e293b;">
                    <i class="fas fa-edit" style="color:#6366f1; margin-right:8px;"></i>
                    Modifier l'étudiant
                </h3>
                <button id="closeModifier"
                        style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#94a3b8;">×</button>
            </div>
            <div style="display:flex; flex-direction:column; gap:1rem;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                    <div>
                        <label style="${lbl()}">Prénom</label>
                        <input type="text" id="mod_prenom" value="${prenom}" style="${inp()}">
                    </div>
                    <div>
                        <label style="${lbl()}">Nom</label>
                        <input type="text" id="mod_nom" value="${nom}" style="${inp()}">
                    </div>
                </div>
                <div>
                    <label style="${lbl()}">Téléphone</label>
                    <input type="text" id="mod_tel" value="${etudiant.user?.telephone || ''}" style="${inp()}">
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                    <div>
                        <label style="${lbl()}">Niveau</label>
                        <select id="mod_niveau" style="${inp()}">
                            ${['A1','A2','B1','B2','C1'].map(n =>
                                `<option value="${n}" ${n === etudiant.niveau_actuel ? 'selected' : ''}>
                                    ${niveauLabel(n)}
                                </option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="${lbl()}">Statut</label>
                        <select id="mod_statut" style="${inp()}">
                            ${['Actif','Suspendu','Inactif'].map(s =>
                                `<option value="${s}" ${s === etudiant.statut_etudiant ? 'selected' : ''}>${s}</option>`
                            ).join('')}
                        </select>
                    </div>
                </div>
                <div>
                    <label style="${lbl()}">Groupe</label>
                    <select id="mod_groupe" style="${inp()}">
                        <option value="">-- Aucun groupe --</option>
                        ${state.groupes.map(g =>
                            `<option value="${g.id}" ${g.id === etudiant.groupe ? 'selected' : ''}>
                                ${g.nom_groupe} — ${g.niveau}
                            </option>`).join('')}
                    </select>
                </div>
                <button id="btnSaveModifier" style="width:100%; padding:0.875rem; border:none;
                    border-radius:10px; background:linear-gradient(135deg,#6366f1,#8b5cf6);
                    color:white; font-weight:700; font-size:1rem; cursor:pointer; margin-top:0.5rem;">
                    <i class="fas fa-save"></i> Enregistrer
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById('closeModifier')?.addEventListener('click', () => modal.remove());

    document.getElementById('btnSaveModifier')?.addEventListener('click', async () => {
        const btn = document.getElementById('btnSaveModifier');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled  = true;

        const result = await apiFetch(`/etudiants/${etudiantId}/`, {
            method: 'PUT',
            body:   JSON.stringify({
                niveau_actuel:   document.getElementById('mod_niveau').value,
                statut_etudiant: document.getElementById('mod_statut').value,
                groupe:          document.getElementById('mod_groupe').value || null,
            }),
        });

        if (result?.error) {
            showToast('Erreur: ' + result.message, 'error');
            btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
            btn.disabled  = false;
            return;
        }

        modal.remove();
        showToast('Étudiant modifié !', 'success');
        await loadEtudiants();
    });
}

// ============================================================
// MODAL NOUVEL ÉTUDIANT — auto parent si âge < 15
// ============================================================
function openModalNouvelEtudiant() {
    document.getElementById('modalNouvelEtudiant')?.remove();

    const modal = document.createElement('div');
    modal.id = 'modalNouvelEtudiant';
    modal.style.cssText = `position:fixed; inset:0; background:rgba(0,0,0,0.7);
        display:flex; align-items:center; justify-content:center; z-index:9999; padding:20px;`;

    modal.innerHTML = `
        <div style="background:white; border-radius:16px; padding:24px;
                    width:100%; max-width:600px; max-height:90vh; overflow-y:auto;
                    box-shadow:0 25px 50px rgba(0,0,0,0.3);">
            <div style="display:flex; justify-content:space-between; align-items:center;
                        margin-bottom:20px; border-bottom:2px solid #e5e7eb; padding-bottom:15px;">
                <h2 style="margin:0; color:#1f2937; font-size:1.4rem;">
                    <i class="fas fa-user-plus" style="color:#4f46e5; margin-right:10px;"></i>
                    Nouvel Étudiant
                </h2>
                <button onclick="document.getElementById('modalNouvelEtudiant').remove()"
                        style="background:#f3f4f6; border:none; width:36px; height:36px;
                               border-radius:50%; cursor:pointer; font-size:1.4rem; color:#6b7280;">×</button>
            </div>

            <form id="formNouvelEtudiant">
                <!-- Infos étudiant -->
                <div style="background:#f9fafb; padding:16px; border-radius:12px;
                            margin-bottom:16px; border:1px solid #e5e7eb;">
                    <h4 style="margin:0 0 15px 0; color:#374151;">
                        <i class="fas fa-user-graduate" style="color:#4f46e5;"></i>
                        Informations de l'étudiant
                    </h4>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                        <div>
                            <label style="${lbl()}">Prénom <span style="color:red;">*</span></label>
                            <input type="text" id="new_prenom" required placeholder="Ahmed" style="${inp()}">
                        </div>
                        <div>
                            <label style="${lbl()}">Nom <span style="color:red;">*</span></label>
                            <input type="text" id="new_nom" required placeholder="Benali" style="${inp()}">
                        </div>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="${lbl()}">Email <span style="color:red;">*</span></label>
                        <input type="email" id="new_email" required placeholder="ahmed@email.com" style="${inp()}">
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                        <div>
                            <label style="${lbl()}">Téléphone *</label>
                            <input type="tel" id="new_tel" required placeholder="0555 12 34 56" style="${inp()}">
                        </div>
                        <div>
                            <label style="${lbl()}">Date de naissance <span style="color:red;">*</span></label>
                            <input type="date" id="new_naissance" required style="${inp()}">
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                        <div>
                            <label style="${lbl()}">Groupe</label>
                            <select id="new_groupe" style="${inp()}">
                                <option value="">-- Aucun --</option>
                                ${state.groupes.map(g =>
                                    `<option value="${g.id}">${g.nom_groupe} — ${g.niveau}</option>`
                                ).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="${lbl()}">Niveau</label>
                            <select id="new_niveau" style="${inp()}">
                                ${['A1','A2','B1','B2','C1'].map(n =>
                                    `<option value="${n}">${niveauLabel(n)}</option>`).join('')}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label style="${lbl()}">Mot de passe <span style="color:red;">*</span></label>
                        <input type="password" id="new_pwd" required minlength="6"
                               placeholder="Min 6 caractères" style="${inp()}">
                    </div>
                </div>

                <!-- Alerte mineur -->
                <div id="ageAlert" style="display:none; padding:12px; background:#fef3c7;
                     border:1px solid #f59e0b; border-radius:8px; color:#92400e;
                     margin-bottom:16px; font-size:0.9rem;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <strong>Étudiant mineur (< 15 ans)</strong> — Informations parent obligatoires
                </div>

                <!-- Infos parent (affiché si âge < 15) -->
                <div id="parentSection" style="display:none; background:#eff6ff;
                     padding:16px; border-radius:12px; margin-bottom:16px; border:2px solid #3b82f6;">
                    <h4 style="margin:0 0 15px 0; color:#1e40af;">
                        <i class="fas fa-user-shield" style="color:#3b82f6;"></i>
                        Informations Parent/Tuteur <span style="color:red;">*</span>
                    </h4>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
                        <div>
                            <label style="${lbl()}">Prénom parent *</label>
                            <input type="text" id="parent_prenom" placeholder="Prénom" style="${inp()}">
                        </div>
                        <div>
                            <label style="${lbl()}">Nom parent *</label>
                            <input type="text" id="parent_nom" placeholder="Nom" style="${inp()}">
                        </div>
                    </div>
                    <div style="margin-bottom:12px;">
                        <label style="${lbl()}">Email parent *</label>
                        <input type="email" id="parent_email" placeholder="parent@email.com" style="${inp()}">
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                        <div>
                            <label style="${lbl()}">Téléphone parent *</label>
                            <input type="tel" id="parent_tel" placeholder="0555 98 76 54" style="${inp()}">
                        </div>
                        <div>
                            <label style="${lbl()}">Relation</label>
                            <select id="parent_relation" style="${inp()}">
                                <option value="Pere">Père</option>
                                <option value="Mere">Mère</option>
                                <option value="Tuteur" selected>Tuteur</option>
                                <option value="Autre">Autre</option>
                            </select>
                        </div>
                    </div>
                </div>

                <button type="submit" id="btnSubmit" style="width:100%; padding:14px; border:none;
                    border-radius:10px; background:linear-gradient(135deg,#4f46e5,#7c3aed);
                    color:white; font-weight:700; font-size:1.1rem; cursor:pointer;">
                    <i class="fas fa-user-plus"></i> Inscrire l'étudiant
                </button>
            </form>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // Afficher/cacher section parent selon l'âge
    document.getElementById('new_naissance')?.addEventListener('change', function () {
        const age = calculateAge(this.value);
        const showParent = age !== null && age < 15;
        document.getElementById('parentSection').style.display = showParent ? 'block' : 'none';
        document.getElementById('ageAlert').style.display      = showParent ? 'block' : 'none';
    });

    // Soumission
    document.getElementById('formNouvelEtudiant')?.addEventListener('submit', async e => {
        e.preventDefault();

        const prenom    = document.getElementById('new_prenom').value.trim();
        const nom       = document.getElementById('new_nom').value.trim();
        const email     = document.getElementById('new_email').value.trim();
        const tel       = document.getElementById('new_tel').value.trim();
        const naissance = document.getElementById('new_naissance').value;
        const groupe    = document.getElementById('new_groupe').value;
        const niveau    = document.getElementById('new_niveau').value;
        const pwd       = document.getElementById('new_pwd').value;
        const age       = calculateAge(naissance);
        const isMinor   = age !== null && age < 15;

        if (!prenom || !nom || !email || !tel || !naissance || !pwd) {
            showToast('Remplissez tous les champs obligatoires.', 'warning'); return;
        }
        if (pwd.length < 6) {
            showToast('Mot de passe minimum 6 caractères.', 'warning'); return;
        }

        const payload = {
            email, first_name: prenom, last_name: nom,
            password: pwd, telephone: tel,
            date_naissance: naissance,
            id_groupe: groupe || null,
            niveau_initial: niveau,
        };

        if (isMinor) {
            const pPrenom = document.getElementById('parent_prenom').value.trim();
            const pNom    = document.getElementById('parent_nom').value.trim();
            const pEmail  = document.getElementById('parent_email').value.trim();
            const pTel    = document.getElementById('parent_tel').value.trim();
            const pRel    = document.getElementById('parent_relation').value;

            if (!pPrenom || !pNom || !pEmail || !pTel) {
                showToast('Informations parent obligatoires pour un mineur < 15 ans.', 'warning');
                return;
            }

            payload.parent_first_name = pPrenom;
            payload.parent_last_name  = pNom;
            payload.parent_email      = pEmail;
            payload.parent_telephone  = pTel;
            payload.parent_relation   = pRel;
        }

        const btn = document.getElementById('btnSubmit');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Inscription...';
        btn.disabled  = true;

        const result = await apiFetch('/etudiants/', {
            method: 'POST',
            body:   JSON.stringify(payload),
        });

        if (result?.error) {
            showToast('Erreur: ' + result.message, 'error');
            btn.innerHTML = '<i class="fas fa-user-plus"></i> Inscrire l\'étudiant';
            btn.disabled  = false;
            return;
        }

        modal.remove();

        // Afficher le mot de passe généré pour le parent
        if (result.parent_auto_cree) {
            const info = result.parent_auto_cree;
            const msg  = [
                '✅ Étudiant inscrit avec succès !',
                '',
                '👤 Compte parent créé :',
                `Nom : ${info.nom}`,
                `Email : ${info.email}`,
                `Téléphone : ${info.telephone}`,
                info.mot_de_passe_genere ? `\n🔑 Mot de passe : ${info.mot_de_passe_genere}` : '',
                info.mot_de_passe_genere ? '⚠️ Notez ce mot de passe, il ne sera plus affiché !' : '',
            ].filter(Boolean).join('\n');
            setTimeout(() => alert(msg), 100);
            showToast('Étudiant et parent créés !', 'success');
        } else {
            showToast(`${prenom} ${nom} inscrit(e) avec succès !`, 'success');
        }

        await loadEtudiants();
    });
}

// ============================================================
// ARCHIVER ÉTUDIANT
// ============================================================
async function archiverEtudiant(etudiantId) {
    const e   = state.etudiants.find(e => e.id === etudiantId);
    const nom = e ? `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.trim() : 'cet étudiant';
    if (!confirm(`Archiver ${nom} ? Son compte sera désactivé.`)) return;

    const result = await apiFetch(`/etudiants/${etudiantId}/`, { method: 'DELETE' });
    if (result?.error) { showToast('Erreur: ' + result.message, 'error'); return; }
    showToast(`${nom} archivé.`, 'success');
    await loadEtudiants();
}

// ============================================================
// EXPORT CSV
// ============================================================
function exportCSV() {
    if (!state.filtered.length) { showToast('Aucune donnée à exporter.', 'warning'); return; }

    const headers = ['ID','Prénom','Nom','Email','Téléphone','Niveau','Groupe','Statut','Assiduité'];
    const rows = state.filtered.map(e => [
        `ETU${String(e.id).padStart(4,'0')}`,
        e.user?.first_name || '', e.user?.last_name || '',
        e.user?.email || '', e.user?.telephone || '',
        e.niveau_actuel || '', e.groupe_nom || '',
        e.statut_etudiant || '',
        `${parseFloat(e.taux_assiduité ?? e.taux_assiduite ?? 100).toFixed(0)}%`,
    ]);
    const csv  = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `etudiants_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Export CSV téléchargé !', 'success');
}

// ============================================================
// HELPERS STYLE
// ============================================================
function inp() {
    return `width:100%; padding:10px 14px; border:2px solid #e5e7eb; border-radius:10px;
            font-size:0.9rem; outline:none; box-sizing:border-box; font-family:inherit; background:#f9fafb;`;
}
function lbl() {
    return `font-size:0.875rem; font-weight:600; color:#374151; display:block; margin-bottom:6px;`;
}

// ============================================================
// INJECT STYLES
// ============================================================
function injectStyles() {
    if (document.getElementById('etd-styles')) return;
    const s = document.createElement('style');
    s.id = 'etd-styles';
    s.textContent = `
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .student-card { transition:transform 0.2s, box-shadow 0.2s; }
        .student-card:hover { transform:translateY(-4px); box-shadow:0 12px 24px rgba(0,0,0,0.12); }
        .status-warning { background:rgba(245,158,11,0.2)!important; color:#d97706!important; }
        .status-danger  { background:rgba(239,68,68,0.2)!important;  color:#dc2626!important; }
        .payment-loading { color:#94a3b8; font-size:0.8rem; }
        .btn-action { transition:all 0.2s; }
        .btn-action:hover { transform:translateY(-1px); opacity:0.9; }
    `;
    document.head.appendChild(s);
}

// ============================================================
// SETUP EVENTS
// ============================================================
function setupEvents() {
    document.querySelector('.btn-primary')?.addEventListener('click', openModalNouvelEtudiant);
    document.querySelector('.btn-secondary')?.addEventListener('click', exportCSV);

    const searchInput = document.querySelector('.search-box input');
    if (searchInput) {
        let timeout;
        searchInput.addEventListener('input', e => {
            clearTimeout(timeout);
            timeout = setTimeout(() => { state.searchTerm = e.target.value.trim(); applyFilters(); }, 300);
        });
    }

    const selects = document.querySelectorAll('.filter-select');
    if (selects[0]) selects[0].addEventListener('change', e => {
        state.filterNiveau = e.target.value === 'Tous les niveaux' ? 'all' : e.target.value;
        applyFilters();
    });
    if (selects[1]) selects[1].addEventListener('change', e => {
        state.filterLangue = e.target.value === 'Toutes les langues' ? 'all' : e.target.value;
        applyFilters();
    });
    if (selects[2]) selects[2].addEventListener('change', e => {
        state.filterStatut = e.target.value === 'Statut paiement' ? 'all' : e.target.value;
        applyFilters();
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
    await Promise.all([loadGroupes(), loadEtudiants()]);
});