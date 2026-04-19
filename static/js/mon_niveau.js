/**
 * Mon Niveau - Espace Étudiant
 * JWT Authentication + Django REST API
 * File: static/js/mon_niveau.js
 */

const API_URL = '/api';

// CEFR Level definitions
const CEFR_LEVELS = {
    'A1': { name: 'Débutant', minScore: 0, maxScore: 5, description: 'Compréhension et expression de notions quotidiennes simples' },
    'A2': { name: 'Élémentaire', minScore: 5, maxScore: 10, description: 'Communication dans des situations simples et routinières' },
    'B1': { name: 'Intermédiaire', minScore: 10, maxScore: 13, description: 'Expression sur des sujets familiers dans des contextes variés' },
    'B2': { name: 'Avancé', minScore: 13, maxScore: 16, description: 'Communication complexe avec une bonne maîtrise de la langue' },
    'C1': { name: 'Autonome', minScore: 16, maxScore: 20, description: 'Expression fluide et spontanée dans des contextes professionnels' }
};

const state = {
    studentData: null,
    niveauData: null,
    progressData: null,
    ressources: []
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

        if (res.status === 401) {
            window.location.href = '/login/';
            return { error: 'JWT_INVALID', message: 'Session expirée' };
        }
        if (res.status === 403) {
            return { error: 'FORBIDDEN', message: 'Accès refusé' };
        }
        if (res.status === 204) return { success: true };

        const data = await res.json();
        if (!res.ok) return { error: 'API_ERROR', message: data.detail || data.error || 'Erreur', raw: data };
        return data;

    } catch (e) {
        return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible' };
    }
}

// ============================================================
// SESSION
// ============================================================
function checkSession() {
    const token = getToken();
    const user = getUser();
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
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    
    const t = document.createElement('div');
    t.className = 'toast-niveau';
    t.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 9999;
        padding: 14px 22px; border-radius: 12px; background: ${colors[type]}; color: white;
        font-weight: 500; font-size: 0.9rem; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        display: flex; align-items: center; gap: 8px; max-width: 420px;
        transform: translateX(120%); opacity: 0; transition: all 0.3s ease;`;
    t.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    document.body.appendChild(t);
    
    requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; t.style.opacity = '1'; });
    setTimeout(() => {
        t.style.transform = 'translateX(120%)'; t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 4000);
}

// ============================================================
// LOAD STUDENT DATA
// ============================================================
async function loadStudentNiveau() {
    const user = getUser();
    if (!user) return;

    console.log('Loading niveau data for student:', user.id);

    // Try multiple endpoints to get student level data
    let niveauData = null;
    
    // Approach 1: /etudiants/me/niveau/
    let data = await apiFetch('/etudiants/me/niveau/');
    if (!data?.error) {
        niveauData = data;
    }
    
    // Approach 2: /etudiants/{id}/niveau/
    if (!niveauData) {
        data = await apiFetch(`/etudiants/${user.id}/niveau/`);
        if (!data?.error) {
            niveauData = data;
        }
    }

    // Approach 3: /niveaux/?etudiant={id}
    if (!niveauData) {
        data = await apiFetch(`/niveaux/?etudiant=${user.id}`);
        if (!data?.error) {
            const results = Array.isArray(data) ? data : (data.results || []);
            niveauData = results[0]; // Take first niveau
        }
    }

    // Fallback: Use inscription data to determine level
    if (!niveauData) {
        data = await apiFetch('/inscriptions/');
        if (!data?.error) {
            const inscriptions = Array.isArray(data) ? data : (data.results || []);
            if (inscriptions.length > 0) {
                // Get highest niveau from inscriptions
                const niveaux = inscriptions.map(i => i.groupe?.niveau || 'A1');
                const niveauOrder = ['A1', 'A2', 'B1', 'B2', 'C1'];
                const highestNiveau = niveaux.sort((a, b) => 
                    niveauOrder.indexOf(b) - niveauOrder.indexOf(a)
                )[0];
                
                niveauData = {
                    niveau_actuel: highestNiveau,
                    moyenne_generale: inscriptions[0].moyenne || 0,
                    taux_assiduite: inscriptions[0].assiduite || 0
                };
            }
        }
    }

    console.log('Niveau data:', niveauData);
    state.niveauData = niveauData || {
        niveau_actuel: 'A1',
        moyenne_generale: 0,
        taux_assiduite: 0
    };

    // Load progress/evaluation data
    await loadProgressData();
    
    // Load recommended resources
    await loadRecommendedResources();
    
    renderAll();
}

async function loadProgressData() {
    const user = getUser();
    
    // Try to load evaluations/notes
    let data = await apiFetch('/evaluations/');
    if (!data?.error) {
        const evaluations = Array.isArray(data) ? data : (data.results || []);
        state.progressData = {
            evaluations: evaluations,
            moyenne: calculateAverage(evaluations)
        };
    } else {
        // Fallback: use niveau data
        state.progressData = {
            evaluations: [],
            moyenne: state.niveauData?.moyenne_generale || 0
        };
    }
}

function calculateAverage(evaluations) {
    if (!evaluations || evaluations.length === 0) return 0;
    const sum = evaluations.reduce((acc, e) => acc + (e.note || 0), 0);
    return (sum / evaluations.length).toFixed(1);
}

async function loadRecommendedResources() {
    const currentNiveau = state.niveauData?.niveau_actuel || 'A1';
    const nextNiveau = getNextLevel(currentNiveau);
    
    // Load resources for next level
    let data = await apiFetch(`/ressources/?niveau=${nextNiveau}&limit=4`);
    if (!data?.error) {
        state.ressources = Array.isArray(data) ? data : (data.results || []);
    } else {
        state.ressources = [];
    }
}

// ============================================================
// RENDER FUNCTIONS
// ============================================================
function renderAll() {
    renderLevelHero();
    renderCEFRScale();
    renderProgressCircle();
    renderCriteria();
    renderTimeline();
    renderResources();
}

function renderLevelHero() {
    const niveau = state.niveauData?.niveau_actuel || 'A1';
    const levelInfo = CEFR_LEVELS[niveau] || CEFR_LEVELS['A1'];
    
    document.getElementById('currentLevelLetter').textContent = niveau;
    document.getElementById('currentLevelName').textContent = levelInfo.name;
    document.getElementById('levelDescription').textContent = levelInfo.description;
}

function renderCEFRScale() {
    const container = document.getElementById('cefrScale');
    const currentNiveau = state.niveauData?.niveau_actuel || 'A1';
    const niveauOrder = ['A1', 'A2', 'B1', 'B2', 'C1'];
    const currentIndex = niveauOrder.indexOf(currentNiveau);
    
    container.innerHTML = niveauOrder.map((level, index) => {
        const info = CEFR_LEVELS[level];
        let statusClass = '';
        let statusText = `${info.minScore}-${info.maxScore} pts`;
        
        if (index < currentIndex) {
            statusClass = 'completed';
        } else if (index === currentIndex) {
            statusClass = 'active';
            statusText += ' ✓ Actuel';
        }
        
        return `
            <div class="scale-item ${statusClass}">
                <div class="scale-level">${level}</div>
                <div class="scale-content">
                    <h3>${info.name}</h3>
                    <p>${info.description}</p>
                </div>
                <div class="scale-range">${statusText}</div>
            </div>
        `;
    }).join('');
}

function renderProgressCircle() {
    const currentNiveau = state.niveauData?.niveau_actuel || 'A1';
    const nextNiveau = getNextLevel(currentNiveau);
    const currentScore = parseFloat(state.niveauData?.moyenne_generale || state.progressData?.moyenne || 0);
    
    const levelInfo = CEFR_LEVELS[currentNiveau];
    const nextLevelInfo = CEFR_LEVELS[nextNiveau];
    
    // Calculate progress percentage to next level
    const progressRange = nextLevelInfo.minScore - levelInfo.minScore;
    const currentProgress = Math.max(0, currentScore - levelInfo.minScore);
    const percentage = Math.min(100, Math.round((currentProgress / progressRange) * 100));
    
    // Update circle stroke
    const circle = document.getElementById('progressCircle');
    const circumference = 408; // 2 * π * 65
    const offset = circumference - (percentage / 100) * circumference;
    circle.style.strokeDashoffset = offset;
    
    // Update text
    document.getElementById('progressPercent').textContent = percentage + '%';
    document.getElementById('progressLabel').textContent = 'vers ' + nextNiveau;
    document.getElementById('currentAverage').textContent = currentScore.toFixed(1) + '/20';
    document.getElementById('nextLevelGoal').textContent = nextNiveau;
    document.getElementById('targetScore').textContent = '≥' + nextLevelInfo.minScore + '/20';
}

function getNextLevel(current) {
    const order = ['A1', 'A2', 'B1', 'B2', 'C1'];
    const idx = order.indexOf(current);
    return idx < order.length - 1 ? order[idx + 1] : 'C1';
}

function renderCriteria() {
    const currentScore = parseFloat(state.niveauData?.moyenne_generale || 0);
    const assiduite = state.niveauData?.taux_assiduite || 0;
    const currentNiveau = state.niveauData?.niveau_actuel || 'A1';
    const nextNiveau = getNextLevel(currentNiveau);
    
    const criteria = [
        {
            label: 'Moyenne générale ≥ 10/20',
            value: currentScore,
            target: 10,
            unit: '/20',
            met: currentScore >= 10
        },
        {
            label: "Taux d'assiduité ≥ 80%",
            value: assiduite,
            target: 80,
            unit: '%',
            met: assiduite >= 80
        },
        {
            label: `Validation des compétences ${currentNiveau}`,
            value: 100,
            target: 100,
            unit: '%',
            met: true // Assuming current level is validated
        },
        {
            label: `Examen de passage ${nextNiveau}`,
            value: 0,
            target: 100,
            unit: '',
            met: false,
            pending: true
        }
    ];
    
    document.getElementById('criteriaList').innerHTML = criteria.map(c => `
        <div class="criteria-item">
            <div class="criteria-check ${c.pending ? 'pending' : ''}">${c.met ? '✓' : (c.pending ? '~' : '○')}</div>
            <div class="criteria-text">
                ${c.label}
                <span>${c.met ? `(Actuel: ${c.value}${c.unit})` : (c.pending ? '(Prévu prochainement)' : `(Actuel: ${c.value}${c.unit})`)}</span>
            </div>
        </div>
    `).join('');
}

function renderTimeline() {
    const currentNiveau = state.niveauData?.niveau_actuel || 'A1';
    const nextNiveau = getNextLevel(currentNiveau);
    
    // Generate timeline based on current date
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    const timeline = [
        {
            date: `Septembre ${currentYear - 1}`,
            title: `Début formation ${currentNiveau}`,
            desc: 'Entrée en niveau actuel',
            status: 'completed'
        },
        {
            date: `Décembre ${currentYear - 1}`,
            title: 'Évaluation mi-parcours',
            desc: `Contrôle des compétences acquises`,
            status: 'completed'
        },
        {
            date: getMonthName(now) + ' (Actuel)',
            title: `Contrôle continu ${currentNiveau}`,
            desc: `Moyenne: ${(state.niveauData?.moyenne_generale || 0).toFixed(1)}/20`,
            status: 'active'
        },
        {
            date: `Juin ${currentYear}`,
            title: `Examen final ${currentNiveau} + Passage ${nextNiveau}`,
            desc: `Objectif: Validation complète niveau ${nextNiveau}`,
            status: 'pending'
        },
        {
            date: `Septembre ${currentYear}`,
            title: `Début formation ${nextNiveau}`,
            desc: `Niveau ${nextNiveau.toLowerCase()} - Objectif ${getNextLevel(nextNiveau)}`,
            status: 'pending'
        }
    ];
    
    document.getElementById('timelineContainer').innerHTML = timeline.map(t => `
        <div class="timeline-item ${t.status}">
            <div class="timeline-date">${t.date}</div>
            <div class="timeline-content">
                <h4>${t.title}</h4>
                <p>${t.desc}</p>
            </div>
        </div>
    `).join('');
}

function getMonthName(date) {
    const months = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 
                    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    return months[date.getMonth()];
}

function renderResources() {
    const container = document.getElementById('resourcesGrid');
    
    if (state.ressources.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: var(--gray);">
                <p>Aucune ressource recommandée pour le moment</p>
            </div>
        `;
        return;
    }
    
    const typeConfig = {
        'PDF': { icon: '📄', color: '#ef4444' },
        'Video': { icon: '🎥', color: '#8b5cf6' },
        'Audio': { icon: '🎵', color: '#10b981' },
        'PPT': { icon: '📊', color: '#f97316' },
        'Exercice': { icon: '📝', color: '#3b82f6' },
        'Lien': { icon: '🔗', color: '#6366f1' }
    };
    
    container.innerHTML = state.ressources.map(r => {
        const cfg = typeConfig[r.type_ressource] || { icon: '📁', color: '#64748b' };
        return `
            <div class="resource-card" onclick="openResource(${r.id})">
                <div class="resource-type">${cfg.icon} ${r.type_ressource}</div>
                <div class="resource-title">${r.titre}</div>
                <div class="resource-meta">${r.description || 'Ressource recommandée'}</div>
            </div>
        `;
    }).join('');
}

// ============================================================
// ACTIONS
// ============================================================
window.openResource = function(id) {
    const r = state.ressources.find(res => res.id === id);
    if (!r) return;
    
    if (r.url_lien) {
        window.open(r.url_lien, '_blank');
    } else if (r.chemin_fichier) {
        const a = document.createElement('a');
        a.href = r.chemin_fichier;
        a.download = r.titre;
        a.click();
    }
    showToast(`Ouverture de "${r.titre}"`, 'success');
};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;

    console.log('Initializing Mon Niveau for student:', user.id);
    
    await loadStudentNiveau();
});