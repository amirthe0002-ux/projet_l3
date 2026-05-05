/**
 * Suivi de l'Enfant - Espace Parent
 * JWT Authentication + Django REST API
 * File: static/js/suivi_enfant.js
 * Pattern: mirrors etudiant_notes.js exactly
 */

// ============================================================
// CONFIG
// ============================================================
const API_URL = '/api';

const state = {
    enfants:     [],
    enfantActif: null,
    notes:       [],
    absences:    [],
};

// ============================================================
// JWT HELPERS  (identical to etudiant_notes.js)
// ============================================================
function getToken() {
    return localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || null;
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user'));
    } catch { return null; }
}

function authHeaders() {
    const token = getToken();
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

// ============================================================
// API GÉNÉRIQUE  (identical to etudiant_notes.js)
// ============================================================
async function apiFetch(endpoint) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, { headers: authHeaders() });
        if (res.status === 401) return { error: 'JWT_INVALID',    message: 'Token invalide.' };
        if (res.status === 403) return { error: 'FORBIDDEN',      message: 'Accès refusé.' };
        if (!res.ok)            return { error: 'API_ERROR',      message: `Erreur ${res.status}` };
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
    if (!['Parent', 'Dirigeant'].includes(user.role)) { window.location.href = '/login/'; return null; }
    return user;
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
    document.querySelector('.toast-suivi')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-suivi';
    t.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:9999;
        padding:14px 22px; border-radius:12px;
        background:${colors[type]}; color:white;
        font-weight:500; font-size:0.9rem;
        box-shadow:0 8px 24px rgba(0,0,0,0.2);
        display:flex; align-items:center; gap:8px;
        transform:translateX(120%); opacity:0; transition:all 0.3s ease;
    `;
    t.innerHTML = `<span>${icons[type]}</span>${message}`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; t.style.opacity = '1'; });
    setTimeout(() => {
        t.style.transform = 'translateX(120%)'; t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 3500);
}

// ============================================================
// FORMAT HELPERS
// ============================================================
function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-DZ', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}

function formatRelative(dateStr) {
    if (!dateStr) return '—';
    const diff = Math.floor((new Date() - new Date(dateStr)) / 1000);
    if (diff < 3600)   return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400)  return `Aujourd'hui`;
    if (diff < 172800) return `Hier`;
    if (diff < 604800) return `Il y a ${Math.floor(diff / 86400)} jours`;
    return formatDate(dateStr);
}

function scoreColor(note, max = 20) {
    const pct = (parseFloat(note) / parseFloat(max)) * 100;
    if (pct >= 75) return '#059669';
    if (pct >= 50) return '#d97706';
    return '#dc2626';
}

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

function emptyState(icon, msg) {
    return `<div style="text-align:center;padding:2.5rem 1rem;color:#94a3b8;">
        <i class="${icon}" style="font-size:2.5rem;margin-bottom:.75rem;display:block;opacity:.4;"></i>
        <p style="margin:0;font-size:.95rem;">${msg}</p>
    </div>`;
}

// ============================================================
// CHARGER LES ENFANTS DU PARENT
// Same pattern as loadEtudiant() in etudiant_notes.js —
// backend filters by request.user automatically for Parent role.
// EtudiantListCreateView does NOT filter Parent role server-side,
// so we match by parent_email (flat field in EtudiantSerializer).
// ============================================================
async function loadEnfants(user) {
    const data = await apiFetch('/etudiants/');
    if (data?.error) {
        showToast('Erreur chargement: ' + data.message, 'error');
        return [];
    }
    if (!Array.isArray(data)) return [];

    // EtudiantSerializer exposes parent_email via get_parent_email()
    // Filter children whose parent email matches the logged-in parent
    const enfants = data.filter(e => e.parent_email === user.email);
    return enfants;
}

// ============================================================
// CHARGER LES NOTES D'UN ENFANT
// Same pattern as loadNotes() in etudiant_notes.js
// ============================================================
async function loadNotes(etudiantId) {
    const data = await apiFetch(`/notes/?etudiant=${etudiantId}`);
    if (data?.error) {
        showToast('Erreur chargement notes: ' + data.message, 'error');
        return [];
    }
    return Array.isArray(data) ? data : [];
}

// ============================================================
// CHARGER LES ABSENCES D'UN ENFANT
// ============================================================
async function loadAbsences(etudiantId) {
    const data = await apiFetch(`/absences/?etudiant=${etudiantId}`);
    if (data?.error) {
        showToast('Erreur chargement absences: ' + data.message, 'error');
        return [];
    }
    return Array.isArray(data) ? data : [];
}

// ============================================================
// CHARGER LE PLANNING DU GROUPE DE L'ENFANT
// ============================================================
async function loadPlanning(groupeId) {
    if (!groupeId) return [];
    const data = await apiFetch(`/plannings/?groupe=${groupeId}`);
    if (data?.error) return [];
    return Array.isArray(data) ? data : [];
}

// ============================================================
// CHARGER LES RESSOURCES DU GROUPE
// ============================================================
async function loadRessources(groupeId) {
    const params = groupeId ? `?groupe=${groupeId}` : '';
    const data   = await apiFetch(`/ressources/${params}`);
    if (data?.error) return [];
    return Array.isArray(data) ? data : [];
}

// ============================================================
// REMPLIR SIDEBAR PARENT
// ============================================================
function fillParentInfo(user) {
    const prenom   = user.first_name || '';
    const nom      = user.last_name  || '';
    const initials = `${prenom[0] || ''}${nom[0] || ''}`.toUpperCase();

    setText('parentAvatar', initials || 'MP');
    setText('parentName',   `${prenom} ${nom}`.trim() || 'Parent');
    setText('parentEmail',  user.email || '');
}

// ============================================================
// REMPLIR BANNER ENFANT
// EtudiantSerializer exposes: niveau_actuel, groupe_nom,
// statut_etudiant, moyenne_generale, taux_assiduité as flat fields
// ============================================================
function fillEnfantBanner(etudiant) {
    if (!etudiant) return;
    const user     = etudiant.user || {};
    const prenom   = user.first_name || '';
    const nom      = user.last_name  || '';
    const initials = `${prenom[0] || ''}${nom[0] || ''}`.toUpperCase();
    const moyenne  = parseFloat(etudiant.moyenne_generale || 0).toFixed(1);
    const assiduite = parseFloat(etudiant.taux_assiduité ?? etudiant.taux_assiduite ?? 100).toFixed(0);

    setText('enfantAvatar',  initials || '—');
    setText('enfantNom',     `${prenom} ${nom}`.trim() || '—');
    setText('enfantNiveau',  `Niveau ${etudiant.niveau_actuel || 'A1'}`);
    setText('enfantGroupe',  etudiant.groupe_nom || 'Groupe non assigné');
    setText('enfantStatut',  etudiant.statut_etudiant || 'Actif');
    setText('kpiMoyenne',    `${moyenne}/20`);
    setText('kpiAssiduite',  `${assiduite}%`);
}

// ============================================================
// CONSTRUIRE SELECT ENFANTS
// ============================================================
function buildEnfantSelect(enfants) {
    const sel = document.getElementById('enfantSelect');
    if (!sel) return;

    if (!enfants.length) {
        sel.innerHTML = '<option value="">Aucun enfant associé</option>';
        return;
    }

    sel.innerHTML = enfants.map(e => {
        const u      = e.user || {};
        const prenom = u.first_name || '';
        const nom    = u.last_name  || '';
        return `<option value="${e.id}">${prenom} ${nom} — ${e.niveau_actuel || 'A1'}</option>`;
    }).join('');

    // Remove old listeners by cloning
    const newSel = sel.cloneNode(true);
    sel.parentNode.replaceChild(newSel, sel);

    newSel.addEventListener('change', async () => {
        const id = parseInt(newSel.value);
        state.enfantActif = state.enfants.find(e => e.id === id) || null;
        if (state.enfantActif) await refreshAll();
    });
}

// ============================================================
// TABS
// ============================================================
function initTabs() {
    document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const tab = document.getElementById(`tab-${btn.dataset.tab}`);
            if (tab) tab.classList.add('active');
        });
    });
}

// ============================================================
// LOGOUT
// ============================================================
function initLogout() {
    const link = document.getElementById('logoutLink');
    if (!link) return;
    link.addEventListener('click', e => {
        e.preventDefault();
        if (!confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) return;
        ['access_token', 'refresh_token', 'user'].forEach(k => {
            localStorage.removeItem(k);
            sessionStorage.removeItem(k);
        });
        window.location.href = '/login/';
    });
}

// ============================================================
// REFRESH TOUT
// ============================================================
async function refreshAll() {
    const etudiant = state.enfantActif;
    if (!etudiant) return;

    fillEnfantBanner(etudiant);

    // groupeId is the raw FK integer from EtudiantSerializer
    const groupeId = etudiant.groupe;

    const [notes, absences, plannings, ressources] = await Promise.all([
        loadNotes(etudiant.id),
        loadAbsences(etudiant.id),
        loadPlanning(groupeId),
        loadRessources(groupeId),
    ]);

    state.notes    = notes;
    state.absences = absences;

    renderNotes(notes);
    renderAbsences(absences);
    renderPlanning(plannings);
    renderRessources(ressources);
    loadNotifBadge();
}

// ============================================================
// RENDER NOTES
// NoteSerializer flat fields: evaluation_titre, evaluation_type,
// note_obtenue, note_max, pourcentage, remarque_prof, date_saisie
// ============================================================
function renderNotes(notes) {
    const listEl  = document.getElementById('notesList');
    const countEl = document.getElementById('notesCount');
    const compEl  = document.getElementById('competencesGrid');
    const kpiEl   = document.getElementById('kpiNotes');

    if (countEl) countEl.textContent = `${notes.length} évaluation(s)`;
    if (kpiEl)   kpiEl.textContent   = notes.length;

    if (!notes.length) {
        if (listEl) listEl.innerHTML = emptyState('fas fa-star', 'Aucune note disponible');
        if (compEl) compEl.innerHTML = emptyState('fas fa-chart-bar', 'Aucune donnée');
        return;
    }

    const sorted = [...notes].sort((a, b) => new Date(b.date_saisie) - new Date(a.date_saisie));

    if (listEl) {
        listEl.innerHTML = sorted.map(n => {
            const noteVal  = parseFloat(n.note_obtenue || 0);
            const maxVal   = parseFloat(n.note_max || 20);
            const pct      = maxVal > 0 ? Math.round((noteVal / maxVal) * 100) : 0;
            const color    = scoreColor(noteVal, maxVal);
            return `
            <div class="note-row">
                <div class="note-info">
                    <div class="note-titre">${n.evaluation_titre || 'Évaluation'}</div>
                    <div class="note-meta">
                        <span class="tag-type">${n.evaluation_type || '—'}</span>
                        <span class="note-date">${formatRelative(n.date_saisie)}</span>
                    </div>
                    ${n.remarque_prof ? `<div class="note-remarque">💬 ${n.remarque_prof}</div>` : ''}
                </div>
                <div class="note-score-wrap">
                    <div class="note-score" style="color:${color};">
                        ${noteVal.toFixed(1)}<span class="note-max">/${maxVal}</span>
                    </div>
                    <div class="note-bar-wrap">
                        <div class="note-bar-fill" style="width:${pct}%;background:${color};"></div>
                    </div>
                    <div class="note-pct">${pct}%</div>
                </div>
            </div>`;
        }).join('');
    }

    // Progression par type
    if (compEl) {
        const byType = {};
        notes.forEach(n => {
            const t = n.evaluation_type || 'Autre';
            if (!byType[t]) byType[t] = { total: 0, count: 0, max: 0 };
            byType[t].total += parseFloat(n.note_obtenue || 0);
            byType[t].max   += parseFloat(n.note_max || 20);
            byType[t].count++;
        });
        const icons = { Ecrit:'✍️', Oral:'🗣️', Comprehension:'👂', Participation:'🙋', Projet:'📁', Examen:'📝' };
        compEl.innerHTML = Object.entries(byType).map(([type, data]) => {
            const moy   = (data.total / data.count).toFixed(1);
            const pct   = data.max > 0 ? Math.round((data.total / data.max) * 100) : 0;
            const color = scoreColor(data.total, data.max);
            return `
            <div class="competence-card">
                <div class="comp-header">
                    <span>${icons[type] || '📊'} ${type}</span>
                    <strong style="color:${color};">${moy}/20</strong>
                </div>
                <div class="comp-bar-wrap">
                    <div class="comp-bar-fill" style="width:${pct}%;background:${color};"></div>
                </div>
                <div class="comp-footer">
                    <span>${data.count} évaluation(s)</span><span>${pct}%</span>
                </div>
            </div>`;
        }).join('');
    }
}

// ============================================================
// RENDER ABSENCES
// AbsenceSerializer fields: statut_absence, date_absence,
// raison, justification
// ============================================================
function renderAbsences(absences) {
    const listEl    = document.getElementById('absenceList');
    const tauxEl    = document.getElementById('statTaux');
    const presEl    = document.getElementById('statPresences');
    const justEl    = document.getElementById('statJustifiees');
    const nonJustEl = document.getElementById('statNonJust');
    const badgeEl   = document.getElementById('tabAbsBadge');
    const kpiAbsEl  = document.getElementById('kpiAbsences');

    const presences  = absences.filter(a => a.statut_absence === 'Present').length;
    const absNonJust = absences.filter(a => a.statut_absence === 'Absent').length;
    const absJust    = absences.filter(a => a.statut_absence === 'Justifie').length;
    const total      = absences.length;
    const taux       = total > 0 ? Math.round((presences / total) * 100) : 100;

    if (tauxEl)    tauxEl.textContent    = `${taux}%`;
    if (presEl)    presEl.textContent    = presences;
    if (justEl)    justEl.textContent    = absJust;
    if (nonJustEl) nonJustEl.textContent = absNonJust;
    if (kpiAbsEl)  kpiAbsEl.textContent  = absNonJust;

    if (badgeEl) {
        badgeEl.textContent   = absNonJust;
        badgeEl.style.display = absNonJust > 0 ? 'inline-flex' : 'none';
    }

    if (!absences.length) {
        if (listEl) listEl.innerHTML = emptyState('fas fa-user-check', 'Aucune absence enregistrée');
        return;
    }

    const sorted = [...absences].sort((a, b) => new Date(b.date_absence) - new Date(a.date_absence));
    const statutConfig = {
        Present:  { label:'Présent',  cls:'badge-present',  icon:'✓' },
        Absent:   { label:'Absent',   cls:'badge-absent',   icon:'✕' },
        Justifie: { label:'Justifié', cls:'badge-justifie', icon:'📋' },
        Retard:   { label:'Retard',   cls:'badge-retard',   icon:'⏰' },
    };

    if (listEl) {
        listEl.innerHTML = sorted.map(a => {
            const cfg = statutConfig[a.statut_absence] || { label: a.statut_absence, cls:'', icon:'?' };
            return `
            <div class="absence-row">
                <div class="abs-date">
                    <div class="abs-day">${new Date(a.date_absence).toLocaleDateString('fr-DZ',{day:'numeric',month:'short'})}</div>
                    <div class="abs-year">${new Date(a.date_absence).getFullYear()}</div>
                </div>
                <div class="abs-info">
                    <div class="abs-seance">Séance du ${formatDate(a.date_absence)}</div>
                    ${a.raison        ? `<div class="abs-raison">📌 ${a.raison}</div>`        : ''}
                    ${a.justification ? `<div class="abs-justif">📄 ${a.justification}</div>` : ''}
                </div>
                <div class="abs-badge ${cfg.cls}">${cfg.icon} ${cfg.label}</div>
            </div>`;
        }).join('');
    }
}

// ============================================================
// RENDER PLANNING
// PlanningSerializer flat fields: jour, heure_debut, heure_fin,
// salle, groupe_nom, enseignant_nom
// ============================================================
function renderPlanning(plannings) {
    const gridEl  = document.getElementById('planningGrid');
    const countEl = document.getElementById('planningCount');

    if (countEl) countEl.textContent = `${plannings.length} séance(s) / semaine`;

    if (!plannings.length) {
        if (gridEl) gridEl.innerHTML = emptyState('fas fa-calendar-alt', 'Aucun planning disponible');
        return;
    }

    const jourOrdre  = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
    const jourEmojis = { Lundi:'🟦', Mardi:'🟩', Mercredi:'🟨', Jeudi:'🟧', Vendredi:'🟥', Samedi:'🟪', Dimanche:'⬜' };
    const today      = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][new Date().getDay()];

    const byJour = {};
    plannings.forEach(p => {
        if (!byJour[p.jour]) byJour[p.jour] = [];
        byJour[p.jour].push(p);
    });

    if (gridEl) {
        gridEl.innerHTML = jourOrdre.filter(j => byJour[j]).map(jour => {
            const isToday = jour === today;
            return `
            <div class="planning-day ${isToday ? 'planning-today' : ''}">
                <div class="planning-day-header">
                    ${jourEmojis[jour] || '📅'} ${jour}
                    ${isToday ? '<span class="today-badge">Aujourd\'hui</span>' : ''}
                </div>
                ${byJour[jour].map(s => `
                    <div class="planning-slot">
                        <div class="slot-time">🕐 ${s.heure_debut?.slice(0,5)} – ${s.heure_fin?.slice(0,5)}</div>
                        <div class="slot-info">
                            <span class="slot-groupe">${s.groupe_nom || '—'}</span>
                            <span class="slot-salle">📍 Salle ${s.salle || '—'}</span>
                        </div>
                        <div class="slot-prof">👨‍🏫 ${s.enseignant_nom || 'Professeur'}</div>
                    </div>`).join('')}
            </div>`;
        }).join('');
    }
}

// ============================================================
// RENDER RESSOURCES
// RessourceSerializer flat fields: titre, type_ressource,
// niveau, description, url_lien, chemin_fichier, visible_etudiants
// ============================================================
function renderRessources(ressources) {
    const gridEl  = document.getElementById('resourcesGrid');
    const countEl = document.getElementById('ressourcesCount');

    const visible = ressources.filter(r => r.visible_etudiants !== false);
    if (countEl) countEl.textContent = `${visible.length} ressource(s)`;

    if (!visible.length) {
        if (gridEl) gridEl.innerHTML = emptyState('fas fa-book-open', 'Aucune ressource disponible');
        return;
    }

    const typeIcons  = { PDF:'📄', PPT:'📊', Video:'🎥', Audio:'🎵', Exercice:'✏️', Lien:'🔗' };
    const typeColors = { PDF:'#ef4444', PPT:'#f59e0b', Video:'#8b5cf6', Audio:'#06b6d4', Exercice:'#10b981', Lien:'#3b82f6' };

    if (gridEl) {
        gridEl.innerHTML = visible.map(r => {
            const type = r.type_ressource || 'Document';
            return `
            <div class="resource-card">
                <div class="res-icon" style="background:${typeColors[type] || '#64748b'}20;color:${typeColors[type] || '#64748b'};">
                    ${typeIcons[type] || '📁'}
                </div>
                <div class="res-body">
                    <div class="res-titre">${r.titre}</div>
                    <div class="res-meta">
                        <span class="res-type">${type}</span>
                        ${r.niveau ? `<span class="res-niveau">Niveau ${r.niveau}</span>` : ''}
                        <span class="res-date">${formatRelative(r.date_creation)}</span>
                    </div>
                    ${r.description ? `<div class="res-desc">${r.description}</div>` : ''}
                </div>
                <div class="res-action">
                    ${r.url_lien
                        ? `<a href="${r.url_lien}" target="_blank" class="btn-dl">🔗 Ouvrir</a>`
                        : r.chemin_fichier
                            ? `<button onclick="downloadResource(${r.id})" class="btn-dl">⬇️ Télécharger</button>`
                            : `<span style="color:#94a3b8;font-size:.8rem;">Non disponible</span>`
                    }
                </div>
            </div>`;
        }).join('');
    }
}

// ============================================================
// DOWNLOAD RESSOURCE
// ============================================================
async function downloadResource(resourceId) {
    try {
        const res = await fetch(`${API_URL}/ressources/${resourceId}/download/`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        if (!res.ok) { showToast('Erreur lors du téléchargement', 'error'); return; }
        const blob = await res.blob();
        const url  = window.URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = res.headers.get('content-disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'ressource';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        showToast('Téléchargement démarré', 'success');
    } catch { showToast('Erreur de téléchargement', 'error'); }
}

// ============================================================
// BADGE NOTIFICATIONS
// ============================================================
async function loadNotifBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const data = await apiFetch('/notifications/?statut=Non_lu');
    if (!data?.error && Array.isArray(data) && data.length > 0) {
        badge.textContent   = data.length;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
}

// ============================================================
// INIT — mirrors DOMContentLoaded in etudiant_notes.js exactly
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;

    // Fill sidebar info immediately
    fillParentInfo(user);

    // Init UI
    initTabs();
    initLogout();

    // Load all children linked to this parent
    // Same pattern as loadEtudiant() — /api/etudiants/ filters server-side
    // for Enseignant and Etudiant roles, but NOT for Parent.
    // EtudiantSerializer exposes parent_email as flat field, so we filter client-side.
    const enfants = await loadEnfants(user);
    state.enfants = enfants;

    if (!enfants.length) {
        showToast('Aucun enfant associé à ce compte.', 'warning');
        ['notesList', 'absenceList', 'planningGrid', 'resourcesGrid'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = emptyState('fas fa-child', 'Aucun enfant associé à ce compte.');
        });
        setText('kpiMoyenne',   '—');
        setText('kpiAssiduite', '—');
        setText('kpiAbsences',  '—');
        setText('kpiNotes',     '—');
        await loadNotifBadge();
        return;
    }

    // Select first child by default
    state.enfantActif = enfants[0];
    buildEnfantSelect(enfants);
    await refreshAll();

    showToast(`Bienvenue ${user.first_name || ''} !`, 'success');
});