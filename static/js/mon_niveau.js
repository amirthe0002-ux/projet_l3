/**
 * Mon Niveau - Espace Étudiant
 * JWT Authentication + Django REST API
 * Integrates with real endpoints:
 *   GET /api/auth/me/              → user info + role
 *   GET /api/etudiants/{pk}/       → niveau_actuel, moyenne_generale, taux_assiduité
 *   GET /api/notes/                → notes list (filtered by student server-side)
 *   GET /api/evaluations/          → evaluations (filtered by student server-side)
 *   GET /api/ressources/?niveau=X  → recommended resources for next level
 */

const API_URL = '/api';

// CEFR Level definitions
const CEFR_LEVELS = {
    'A1': { name: 'Débutant',       minScore: 0,  maxScore: 5,  targetAvg: 5,  description: 'Compréhension et expression de notions quotidiennes simples' },
    'A2': { name: 'Élémentaire',    minScore: 5,  maxScore: 10, targetAvg: 8,  description: 'Communication dans des situations simples et routinières' },
    'B1': { name: 'Intermédiaire',  minScore: 10, maxScore: 13, targetAvg: 11, description: 'Expression sur des sujets familiers dans des contextes variés' },
    'B2': { name: 'Avancé',         minScore: 13, maxScore: 16, targetAvg: 14, description: 'Communication complexe avec une bonne maîtrise de la langue' },
    'C1': { name: 'Autonome',       minScore: 16, maxScore: 20, targetAvg: 18, description: 'Expression fluide et spontanée dans des contextes professionnels' },
};

const NIVEAU_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1'];

// Application state
const state = {
    user: null,        // from /api/auth/me/
    etudiant: null,    // from /api/etudiants/{pk}/
    notes: [],         // from /api/notes/
    evaluations: [],   // from /api/evaluations/
    ressources: [],    // from /api/ressources/
};

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

function getStoredUser() {
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
// API FETCH WRAPPER
// ============================================================
async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });

        if (res.status === 401) {
            window.location.href = '/login/';
            return { error: 'JWT_INVALID' };
        }
        if (res.status === 403) return { error: 'FORBIDDEN' };
        if (res.status === 204) return { success: true };

        const data = await res.json();
        if (!res.ok) return { error: 'API_ERROR', message: data.detail || data.error || 'Erreur', raw: data };
        return data;

    } catch (e) {
        console.error('Network error:', e);
        return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible' };
    }
}

// ============================================================
// SESSION CHECK
// ============================================================
function checkSession() {
    const token = getToken();
    const user  = getStoredUser();
    if (!token || !user) { window.location.href = '/login/'; return null; }
    if (user.role !== 'Etudiant') { window.location.href = '/login/'; return null; }
    return user;
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
    document.querySelector('.toast-niveau')?.remove();
    const colors = { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#0284c7' };
    const icons  = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

    const t = document.createElement('div');
    t.className = 'toast-niveau';
    t.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:9999;
        padding:14px 22px; border-radius:12px; background:${colors[type]}; color:white;
        font-weight:500; font-size:0.9rem; box-shadow:0 8px 24px rgba(0,0,0,0.3);
        display:flex; align-items:center; gap:8px; max-width:420px;
        transform:translateX(120%); opacity:0; transition:all 0.3s ease;`;
    t.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    document.body.appendChild(t);

    requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; t.style.opacity = '1'; });
    setTimeout(() => {
        t.style.transform = 'translateX(120%)'; t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 4000);
}

// ============================================================
// LOADING STATE
// ============================================================
function setLoading(isLoading) {
    const loadingEl = document.getElementById('loadingOverlay');
    if (loadingEl) loadingEl.style.display = isLoading ? 'flex' : 'none';
}

// ============================================================
// DATA LOADING
// ============================================================

/**
 * Step 1 — Get authenticated user info.
 * /api/auth/me/ returns the Utilisateur serializer which includes `id`.
 * We need the Etudiant profile id, not the Utilisateur id.
 */
async function loadMe() {
    const data = await apiFetch('/auth/me/');
    if (data.error) {
        showToast('Impossible de charger le profil utilisateur.', 'error');
        return null;
    }
    return data; // { id, email, role, first_name, last_name, ... }
}

/**
 * Step 2 — Get Etudiant profile.
 * The server filters /api/etudiants/ to return only the current student's record
 * when the authenticated user has role Etudiant.
 * Fields: niveau_actuel, moyenne_generale, taux_assiduité, groupe, parent, ...
 */
async function loadEtudiantProfile() {
    const data = await apiFetch('/etudiants/');
    if (data.error) {
        showToast('Impossible de charger le profil étudiant.', 'error');
        return null;
    }
    // The API returns a list; for an Etudiant the list contains only their own record.
    const list = Array.isArray(data) ? data : (data.results || []);
    if (list.length === 0) {
        showToast('Profil étudiant introuvable.', 'warning');
        return null;
    }
    return list[0];
}

/**
 * Step 3 — Get notes for the current student.
 * Server filters automatically by role = Etudiant.
 */
async function loadNotes() {
    const data = await apiFetch('/notes/');
    if (data.error) return [];
    return Array.isArray(data) ? data : (data.results || []);
}

/**
 * Step 4 — Get evaluations for the student's group.
 * Server filters automatically by role = Etudiant.
 */
async function loadEvaluations() {
    const data = await apiFetch('/evaluations/');
    if (data.error) return [];
    return Array.isArray(data) ? data : (data.results || []);
}

/**
 * Step 5 — Load recommended resources for the next level.
 * Uses the student's current niveau to fetch the next level's resources.
 */
async function loadRecommendedResources(niveauActuel) {
    const nextNiveau = getNextLevel(niveauActuel);
    if (!nextNiveau) return [];

    const data = await apiFetch(`/ressources/?niveau=${nextNiveau}`);
    if (data.error) return [];
    const list = Array.isArray(data) ? data : (data.results || []);
    return list.slice(0, 6); // Show max 6 resources
}

// ============================================================
// COMPUTED HELPERS
// ============================================================

function getNextLevel(current) {
    const idx = NIVEAU_ORDER.indexOf(current);
    return idx >= 0 && idx < NIVEAU_ORDER.length - 1 ? NIVEAU_ORDER[idx + 1] : null;
}

function getPreviousLevel(current) {
    const idx = NIVEAU_ORDER.indexOf(current);
    return idx > 0 ? NIVEAU_ORDER[idx - 1] : null;
}

/**
 * Calculate real average from notes array.
 * Each note has note_obtenue and note_max.
 * We use a weighted percentage then scale to /20.
 */
function computeRealAverage(notes) {
    if (!notes || notes.length === 0) return null; // null = no notes yet
    const totalPct = notes.reduce((acc, n) => {
        const max = parseFloat(n.note_max) || 20;
        const val = parseFloat(n.note_obtenue) || 0;
        return acc + (val / max) * 20;
    }, 0);
    return parseFloat((totalPct / notes.length).toFixed(2));
}

/**
 * Calculate progress percentage toward the next level.
 * Based on the student's average relative to the score range for current level.
 */
function computeProgressToNextLevel(niveauActuel, moyenne) {
    const levelInfo     = CEFR_LEVELS[niveauActuel];
    const nextNiveau    = getNextLevel(niveauActuel);
    const nextLevelInfo = nextNiveau ? CEFR_LEVELS[nextNiveau] : null;

    if (!nextLevelInfo) return 100; // Already at C1

    const rangeSize       = nextLevelInfo.minScore - levelInfo.minScore;
    const progressInRange = Math.max(0, moyenne - levelInfo.minScore);
    return Math.min(100, Math.round((progressInRange / rangeSize) * 100));
}

function getMonthName(date) {
    const months = ['Janvier','Février','Mars','Avril','Mai','Juin',
                    'Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    return months[date.getMonth()];
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================

function renderLevelHero(niveauActuel) {
    const levelInfo = CEFR_LEVELS[niveauActuel] || CEFR_LEVELS['A1'];
    const el = (id) => document.getElementById(id);

    if (el('currentLevelLetter')) el('currentLevelLetter').textContent = niveauActuel;
    if (el('currentLevelName'))   el('currentLevelName').textContent   = levelInfo.name;
    if (el('levelDescription'))   el('levelDescription').textContent   = levelInfo.description;
}

function renderCEFRScale(niveauActuel) {
    const container    = document.getElementById('cefrScale');
    if (!container) return;

    const currentIndex = NIVEAU_ORDER.indexOf(niveauActuel);

    container.innerHTML = NIVEAU_ORDER.map((level, index) => {
        const info    = CEFR_LEVELS[level];
        let statusClass = '';
        let badge       = `${info.minScore}–${info.maxScore} pts`;

        if (index < currentIndex)      { statusClass = 'completed'; badge += ' ✓'; }
        else if (index === currentIndex) { statusClass = 'active';    badge += ' ← Votre niveau'; }
        else                             { statusClass = 'upcoming'; }

        return `
            <div class="scale-item ${statusClass}">
                <div class="scale-level">${level}</div>
                <div class="scale-content">
                    <h3>${info.name}</h3>
                    <p>${info.description}</p>
                </div>
                <div class="scale-range">${badge}</div>
            </div>`;
    }).join('');
}

function renderProgressCircle(niveauActuel, moyenne, progressPct) {
    const circle = document.getElementById('progressCircle');
    if (circle) {
        const circumference = 408; // 2 * π * 65
        circle.style.strokeDashoffset = circumference - (progressPct / 100) * circumference;
    }

    const nextNiveau = getNextLevel(niveauActuel);
    const el = (id) => document.getElementById(id);

    if (el('progressPercent'))  el('progressPercent').textContent  = progressPct + '%';
    if (el('progressLabel'))    el('progressLabel').textContent    = nextNiveau ? 'vers ' + nextNiveau : 'Niveau maximum';
    if (el('currentAverage'))   el('currentAverage').textContent   = (moyenne !== null ? moyenne.toFixed(1) : '--') + '/20';
    if (el('nextLevelGoal'))    el('nextLevelGoal').textContent    = nextNiveau || 'C1';
    if (el('targetScore') && nextNiveau) {
        el('targetScore').textContent = '≥ ' + CEFR_LEVELS[nextNiveau].minScore + '/20';
    }
}

function renderCriteria(niveauActuel, moyenne, assiduite) {
    const container = document.getElementById('criteriaList');
    if (!container) return;

    const nextNiveau        = getNextLevel(niveauActuel);
    const levelInfo         = CEFR_LEVELS[niveauActuel];
    const avgOk             = moyenne !== null && moyenne >= 10;
    const assOk             = parseFloat(assiduite) >= 80;
    const validationOk      = NIVEAU_ORDER.indexOf(niveauActuel) > 0; // passed at least A1

    const criteria = [
        {
            label: 'Moyenne générale ≥ 10/20',
            detail: moyenne !== null ? `Actuel : ${moyenne.toFixed(1)}/20` : 'Aucune note enregistrée',
            met: avgOk,
            pending: moyenne === null,
        },
        {
            label: "Taux d'assiduité ≥ 80%",
            detail: `Actuel : ${parseFloat(assiduite || 0).toFixed(1)}%`,
            met: assOk,
            pending: false,
        },
        {
            label: `Compétences ${niveauActuel} validées`,
            detail: validationOk ? 'Niveau précédent réussi' : 'Premier niveau',
            met: true,
            pending: false,
        },
        {
            label: `Examen de passage vers ${nextNiveau || 'niveau suivant'}`,
            detail: nextNiveau ? 'Prévu en fin de session' : 'Niveau maximum atteint',
            met: !nextNiveau,
            pending: !!nextNiveau,
        },
    ];

    container.innerHTML = criteria.map(c => {
        const icon  = c.met ? '✓' : (c.pending ? '~' : '○');
        const cls   = c.met ? 'met' : (c.pending ? 'pending' : 'unmet');
        return `
            <div class="criteria-item">
                <div class="criteria-check ${cls}">${icon}</div>
                <div class="criteria-text">
                    ${c.label}
                    <span>${c.detail}</span>
                </div>
            </div>`;
    }).join('');
}

function renderTimeline(niveauActuel) {
    const container = document.getElementById('timelineContainer');
    if (!container) return;

    const now         = new Date();
    const currentYear = now.getFullYear();
    const nextNiveau  = getNextLevel(niveauActuel);
    const prevNiveau  = getPreviousLevel(niveauActuel);

    const timeline = [
        {
            date: `Début de formation`,
            title: `Inscription en ${prevNiveau || niveauActuel}`,
            desc: prevNiveau
                ? `Vous avez validé le niveau ${prevNiveau} et intégré ${niveauActuel}`
                : `Entrée en formation — niveau ${niveauActuel}`,
            status: 'completed',
        },
        {
            date: 'Mi-parcours',
            title: `Évaluation continue ${niveauActuel}`,
            desc: 'Contrôle des compétences acquises (écrit + oral)',
            status: 'completed',
        },
        {
            date: `${getMonthName(now)} ${currentYear} — En cours`,
            title: `Contrôle continu ${niveauActuel}`,
            desc: `Suivi de votre progression vers ${nextNiveau || 'C1'}`,
            status: 'active',
        },
        {
            date: `Fin de session ${currentYear}`,
            title: `Examen final ${niveauActuel}${nextNiveau ? ' + passage ' + nextNiveau : ''}`,
            desc: nextNiveau
                ? `Objectif : valider ${niveauActuel} et accéder au niveau ${nextNiveau}`
                : 'Validation du niveau C1 — certification finale',
            status: 'pending',
        },
        ...(nextNiveau ? [{
            date: `Prochaine session`,
            title: `Début ${nextNiveau}`,
            desc: `Vous intégrerez le niveau ${nextNiveau} après validation`,
            status: 'pending',
        }] : []),
    ];

    container.innerHTML = timeline.map(t => `
        <div class="timeline-item ${t.status}">
            <div class="timeline-date">${t.date}</div>
            <div class="timeline-content">
                <h4>${t.title}</h4>
                <p>${t.desc}</p>
            </div>
        </div>`).join('');
}

function renderResources(ressources) {
    const container = document.getElementById('resourcesGrid');
    if (!container) return;

    if (!ressources || ressources.length === 0) {
        container.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:2rem; opacity:.6;">
                <p>Aucune ressource disponible pour le niveau suivant pour le moment.</p>
            </div>`;
        return;
    }

    const typeConfig = {
        'PDF':      { icon: '📄', color: '#ef4444' },
        'Video':    { icon: '🎥', color: '#8b5cf6' },
        'Audio':    { icon: '🎵', color: '#10b981' },
        'PPT':      { icon: '📊', color: '#f97316' },
        'Exercice': { icon: '📝', color: '#3b82f6' },
        'Lien':     { icon: '🔗', color: '#6366f1' },
    };

    container.innerHTML = ressources.map(r => {
        const cfg = typeConfig[r.type_ressource] || { icon: '📁', color: '#64748b' };
        return `
            <div class="resource-card" onclick="openResource(${r.id})" style="cursor:pointer;">
                <div class="resource-type" style="color:${cfg.color};">${cfg.icon} ${r.type_ressource}</div>
                <div class="resource-title">${r.titre}</div>
                <div class="resource-meta">${r.description || 'Ressource recommandée'}</div>
                ${r.nombre_telechargements > 0
                    ? `<div class="resource-downloads">⬇ ${r.nombre_telechargements} téléchargement(s)</div>`
                    : ''}
            </div>`;
    }).join('');
}

function renderNotesSummary(notes, evaluations) {
    const container = document.getElementById('notesSummary');
    if (!container) return;

    if (!notes || notes.length === 0) {
        container.innerHTML = '<p style="opacity:.6; text-align:center;">Aucune note enregistrée.</p>';
        return;
    }

    // Group notes by evaluation type
    const byType = {};
    notes.forEach(n => {
        const type = n.evaluation_type || 'Autre';
        if (!byType[type]) byType[type] = [];
        byType[type].push(n);
    });

    container.innerHTML = Object.entries(byType).map(([type, typeNotes]) => {
        const avg = typeNotes.reduce((acc, n) => acc + (parseFloat(n.note_obtenue) || 0), 0) / typeNotes.length;
        const pct = typeNotes.reduce((acc, n) => {
            const max = parseFloat(n.note_max) || 20;
            return acc + (parseFloat(n.note_obtenue) / max) * 100;
        }, 0) / typeNotes.length;
        const barColor = pct >= 60 ? '#059669' : (pct >= 40 ? '#d97706' : '#dc2626');

        return `
            <div class="note-type-row">
                <div class="note-type-label">${type} (${typeNotes.length})</div>
                <div class="note-type-bar">
                    <div class="note-type-fill" style="width:${pct.toFixed(0)}%; background:${barColor};"></div>
                </div>
                <div class="note-type-score">${avg.toFixed(1)}/20</div>
            </div>`;
    }).join('');
}

// ============================================================
// RESOURCE OPEN ACTION
// ============================================================
window.openResource = function(id) {
    const r = state.ressources.find(res => res.id === id);
    if (!r) return;

    if (r.url_lien) {
        window.open(r.url_lien, '_blank');
        showToast(`Ouverture de "${r.titre}"`, 'info');
    } else if (r.chemin_fichier) {
        // Use the dedicated download endpoint from api/urls.py
        window.open(`/api/ressources/${r.id}/download/`, '_blank');
        showToast(`Téléchargement de "${r.titre}"`, 'success');
    } else {
        showToast('Aucun fichier disponible pour cette ressource.', 'warning');
    }
};

// ============================================================
// MAIN INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check JWT session
    const storedUser = checkSession();
    if (!storedUser) return;

    setLoading(true);

    try {
        // 2. Load all data in parallel where possible
        const [meData, etudiantData, notesData, evaluationsData] = await Promise.all([
            loadMe(),
            loadEtudiantProfile(),
            loadNotes(),
            loadEvaluations(),
        ]);

        // Store in state
        state.user       = meData;
        state.etudiant   = etudiantData;
        state.notes      = notesData;
        state.evaluations = evaluationsData;

        if (!etudiantData) {
            setLoading(false);
            showToast('Profil étudiant introuvable. Contactez l\'administration.', 'error');
            return;
        }

        // 3. Extract key values from real API data
        const niveauActuel = etudiantData.niveau_actuel || 'A1';
        // Use API moyenne_generale, but override with computed value from notes if notes exist
        const apiMoyenne   = parseFloat(etudiantData.moyenne_generale) || 0;
        const computedMoy  = computeRealAverage(notesData);
        // Prefer computed average from notes if available, otherwise fall back to API field
        const moyenne      = computedMoy !== null ? computedMoy : (apiMoyenne > 0 ? apiMoyenne : null);
        const assiduite    = parseFloat(etudiantData.taux_assiduité) || 0;

        // 4. Load resources for next level (depends on niveauActuel)
        state.ressources = await loadRecommendedResources(niveauActuel);

        // 5. Render all sections
        const progressPct = computeProgressToNextLevel(niveauActuel, moyenne || 0);

        renderLevelHero(niveauActuel);
        renderCEFRScale(niveauActuel);
        renderProgressCircle(niveauActuel, moyenne, progressPct);
        renderCriteria(niveauActuel, moyenne, assiduite);
        renderTimeline(niveauActuel);
        renderResources(state.ressources);
        renderNotesSummary(notesData, evaluationsData);

    } catch (err) {
        console.error('Init error:', err);
        showToast('Erreur lors du chargement des données.', 'error');
    } finally {
        setLoading(false);
    }
});