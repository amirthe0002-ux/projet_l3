/**
 * Dashboard Parent - JWT Authentication
 * File: static/js/dashboard_parent.js
 */

// ============================================================
// CONFIG
// ============================================================
const API_URL = '/api';

// ============================================================
// JWT HELPERS
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
// API GÉNÉRIQUE
// ============================================================
async function apiFetch(endpoint) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, { headers: authHeaders() });
        if (res.status === 401) return { error: 'JWT_INVALID',  message: 'Token invalide.' };
        if (res.status === 403) return { error: 'FORBIDDEN',    message: 'Accès refusé.' };
        if (!res.ok)            return { error: 'API_ERROR',    message: `Erreur ${res.status}` };
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
// SKELETON LOADER
// ============================================================
function skeleton(w = '80px', h = '1.2rem') {
    return `<span style="
        display:inline-block; width:${w}; height:${h};
        background:linear-gradient(90deg,#e2e8f0 25%,#cbd5e1 50%,#e2e8f0 75%);
        background-size:200% 100%; animation:shimmer 1.5s infinite; border-radius:6px;
    ">&nbsp;</span>`;
}

// Injecter shimmer keyframe une seule fois
if (!document.getElementById('parent-shimmer')) {
    const s = document.createElement('style');
    s.id = 'parent-shimmer';
    s.textContent = `
        @keyframes shimmer { to { background-position: -200% 0; } }
        @keyframes fadeIn  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .fade-in { animation: fadeIn 0.4s ease forwards; }
    `;
    document.head.appendChild(s);
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
    document.querySelector('.toast-parent')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-parent';
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
// FORMATAGE
// ============================================================
function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-DZ', { day:'numeric', month:'long', year:'numeric' });
}

function formatRelative(dateStr) {
    if (!dateStr) return '—';
    const d    = new Date(dateStr);
    const now  = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 3600)   return `Il y a ${Math.floor(diff/60)} min`;
    if (diff < 86400)  return `Aujourd'hui`;
    if (diff < 172800) return `Hier`;
    if (diff < 604800) return `Il y a ${Math.floor(diff/86400)} jours`;
    return formatDate(dateStr);
}

function scoreClass(note, max = 20) {
    const pct = (note / max) * 100;
    if (pct >= 75) return 'score-high';
    if (pct >= 50) return 'score-medium';
    return 'score-low';
}

// ============================================================
// ÉTAT GLOBAL — enfant sélectionné
// ============================================================
let enfants = [];       // liste des objets Etudiant de cet parent
let enfantActif = null; // objet Etudiant courant

// ============================================================
// REMPLIR INFOS PARENT (sidebar)
// ============================================================
function fillParentInfo(user) {
    const prenom   = user.first_name || '';
    const nom      = user.last_name  || '';
    const initials = `${prenom[0] || ''}${nom[0] || ''}`.toUpperCase();

    const avatar   = document.querySelector('.parent-avatar');
    const nameEl   = document.querySelector('.parent-name');
    const emailEl  = document.querySelector('.parent-email');
    const headerH1 = document.querySelector('.header h1');

    if (avatar)   avatar.textContent   = initials;
    if (nameEl)   nameEl.textContent   = `${prenom} ${nom}`;
    if (emailEl)  emailEl.textContent  = user.email || '';
    if (headerH1) headerH1.textContent = `Tableau de Bord`;
}

// ============================================================
// CONSTRUIRE LES ONGLETS ENFANTS
// ============================================================
function buildChildrenTabs(etudiants) {
    const container = document.querySelector('.children-tabs');
    if (!container || !etudiants.length) return;

    // Palette de couleurs pour les avatars
    const palettes = [
        'linear-gradient(135deg, #3b82f6, #06b6d4)',
        'linear-gradient(135deg, #ec4899, #f472b6)',
        'linear-gradient(135deg, #f59e0b, #ef4444)',
        'linear-gradient(135deg, #10b981, #059669)',
    ];

    container.innerHTML = etudiants.map((e, i) => {
        const prenom   = e.user?.first_name || '';
        const nom      = e.user?.last_name  || '';
        const initials = `${prenom[0] || ''}${nom[0] || ''}`.toUpperCase();
        const niveau   = e.niveau_actuel || 'A1';
        const color    = palettes[i % palettes.length];

        return `
        <button class="child-tab ${i === 0 ? 'active' : ''}" data-etudiant-id="${e.id}">
            <div class="child-avatar" style="background: ${color};">${initials}</div>
            <div>
                <div class="child-name">${prenom} ${nom}</div>
                <div class="child-level">Niveau ${niveau}</div>
            </div>
        </button>`;
    }).join('');

    // Événement de sélection d'onglet
    container.querySelectorAll('.child-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            container.querySelectorAll('.child-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const id = parseInt(btn.dataset.etudiantId);
            enfantActif = enfants.find(e => e.id === id) || null;
            refreshDashboard();
        });
    });
}

// ============================================================
// RAFRAÎCHIR LE DASHBOARD pour l'enfant actif
// ============================================================
async function refreshDashboard() {
    if (!enfantActif) return;
    await Promise.all([
        loadStats(enfantActif),
        loadNotifications(),
    ]);
}

// ============================================================
// CHARGER LES STATS DE L'ENFANT ACTIF
// ============================================================
async function loadStats(etudiant) {
    // Skeleton sur toutes les valeurs
    document.querySelectorAll('.stat-value').forEach(el => {
        el.innerHTML = skeleton('60px', '1.8rem');
    });
    document.querySelectorAll('.stat-change').forEach(el => {
        el.innerHTML = skeleton('100px', '1rem');
    });

    // ── Moyenne générale ──────────────────────────────────────
    const moyenne = parseFloat(etudiant.moyenne_generale) || 0;

    // ── Assiduité ─────────────────────────────────────────────
    const taux = parseFloat(etudiant.taux_assiduité ?? etudiant.taux_assiduite ?? 100);

    // ── Absences ce mois ─────────────────────────────────────
    const absData = await apiFetch(`/absences/?etudiant=${etudiant.id}`);
    let nbAbsencesMois = 0;
    if (!absData?.error) {
        const debutMois = new Date();
        debutMois.setDate(1);
        debutMois.setHours(0, 0, 0, 0);
        nbAbsencesMois = absData.filter(a =>
            a.statut_absence === 'Absent' &&
            new Date(a.date_absence) >= debutMois
        ).length;
    }

    // ── Notes pour évolution moyenne ──────────────────────────
    const notesData = await apiFetch(`/notes/?etudiant=${etudiant.id}`);
    let evolution = null;
    if (!notesData?.error && notesData.length >= 2) {
        const now       = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const recent    = notesData.filter(n => new Date(n.date_saisie) >= lastMonth);
        const old       = notesData.filter(n => new Date(n.date_saisie) < lastMonth);
        if (recent.length && old.length) {
            const avgR = recent.reduce((s, n) => s + parseFloat(n.note_obtenue), 0) / recent.length;
            const avgO = old.reduce((s, n) => s + parseFloat(n.note_obtenue), 0) / old.length;
            evolution = (avgR - avgO).toFixed(1);
        }
    }

    // ── Classement dans le groupe ──────────────────────────────
    let classement = '—';
    let totalGroupe = '—';
    if (etudiant.groupe) {
        const groupeEtudiants = await apiFetch(`/etudiants/?groupe=${etudiant.groupe}`);
        if (!groupeEtudiants?.error && groupeEtudiants.length) {
            totalGroupe = groupeEtudiants.length;
            const sorted = [...groupeEtudiants].sort((a, b) =>
                parseFloat(b.moyenne_generale) - parseFloat(a.moyenne_generale)
            );
            const rank = sorted.findIndex(e => e.id === etudiant.id);
            classement = rank >= 0 ? `${rank + 1}ème` : '—';
        }
    }

    // ── Remplir les cartes ────────────────────────────────────
    const cards = document.querySelectorAll('.stat-card');

    cards.forEach(card => {
        const titre   = card.querySelector('h3')?.textContent?.trim() || '';
        const valEl   = card.querySelector('.stat-value');
        const chgEl   = card.querySelector('.stat-change');

        if (titre.includes('Moyenne')) {
            if (valEl) valEl.textContent = moyenne.toFixed(1);
            if (chgEl) {
                if (evolution !== null) {
                    const pos = parseFloat(evolution) >= 0;
                    chgEl.className = `stat-change ${pos ? 'up' : 'down'}`;
                    chgEl.textContent = `${pos ? '+' : ''}${evolution} ce trimestre`;
                } else {
                    chgEl.className = 'stat-change';
                    chgEl.textContent = 'Pas de comparaison disponible';
                }
            }
        }

        else if (titre.includes('Niveau')) {
            const niveauLabels = {
                A1: 'Débutant', A2: 'Élémentaire',
                B1: 'Intermédiaire', B2: 'Intermédiaire avancé', C1: 'Avancé'
            };
            const niveau = etudiant.niveau_actuel || 'A1';
            if (valEl) valEl.textContent = niveau;
            if (chgEl) chgEl.textContent = niveauLabels[niveau] || 'Progression normale';
        }

        else if (titre.includes('Assiduité')) {
            if (valEl) valEl.textContent = `${taux.toFixed(0)}%`;
            if (chgEl) chgEl.textContent = nbAbsencesMois > 0
                ? `${nbAbsencesMois} absence${nbAbsencesMois > 1 ? 's' : ''} ce mois`
                : 'Aucune absence ce mois';
        }

        else if (titre.includes('Classement')) {
            if (valEl) valEl.textContent = classement;
            if (chgEl) chgEl.textContent = totalGroupe !== '—'
                ? `Sur ${totalGroupe} élèves`
                : 'Groupe non disponible';
        }

        card.classList.add('fade-in');
    });
}

// ============================================================
// CHARGER LES NOTIFICATIONS (badge cloche)
// ============================================================
async function loadNotifications() {
    const dot = document.querySelector('.notification-dot');
    if (!dot) return;

    const data = await apiFetch('/notifications/?statut=Non_lu');
    if (!data?.error && data.length > 0) {
        dot.style.display    = 'inline-block';
        dot.title            = `${data.length} notification(s) non lue(s)`;
    } else {
        dot.style.display    = 'none';
    }
}

// ============================================================
// DÉCONNEXION
// ============================================================
function logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    sessionStorage.removeItem('user');

    showToast('Déconnexion réussie', 'success');
    setTimeout(() => { window.location.href = '/login/'; }, 800);
}

function initLogout() {
    const link = document.getElementById('logoutLink');
    if (link) {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
                logout();
            }
        });
    }
}

// ============================================================
// INIT PRINCIPAL
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;

    // Remplir la sidebar
    fillParentInfo(user);

    // Initialiser le bouton de déconnexion
    initLogout();

    // Charger les enfants (étudiants liés à ce parent)
    const etudiants = await apiFetch('/etudiants/');
    if (etudiants?.error || !etudiants?.length) {
        showToast('Aucun enfant associé à ce compte.', 'warning');
        // Afficher des tirets dans les stats
        document.querySelectorAll('.stat-value').forEach(el => el.textContent = '—');
        document.querySelectorAll('.stat-change').forEach(el => el.textContent = 'Données non disponibles');
        await loadNotifications();
        return;
    }

    // Stocker les enfants et sélectionner le premier
    enfants     = etudiants;
    enfantActif = enfants[0];

    // Construire les onglets dynamiquement
    buildChildrenTabs(enfants);

    // Charger le dashboard pour le premier enfant
    await refreshDashboard();

    showToast(`Bienvenue ${user.first_name} !`, 'success');
});