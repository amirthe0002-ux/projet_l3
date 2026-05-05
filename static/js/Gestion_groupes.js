/**
 * Gestion des Groupes - Secrétariat
 * FIXED: Nombre réel de membres depuis l'API /etudiants/?groupe=X
 */

const API_URL = '/api';

const state = {
    groupes:      [],
    enseignants:  [],
    etudiantsCounts: {}, // cache { groupeId: count }
    searchTerm:   '',
};

// ─── JWT ──────────────────────────────────────────────────────────────────────
function getToken() {
    return localStorage.getItem('access_token') || sessionStorage.getItem('access_token') ||
           localStorage.getItem('access') || sessionStorage.getItem('access') || null;
}
function getUser() {
    try { return JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user')); }
    catch { return null; }
}
function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const t = getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
}

// ─── API ──────────────────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });
        if (res.status === 401) return { error: 'JWT_INVALID',  message: 'Token invalide. Reconnectez-vous.' };
        if (res.status === 403) return { error: 'FORBIDDEN',    message: 'Accès refusé.' };
        if (res.status === 204) return { success: true };
        const data = await res.json();
        if (!res.ok) return { error: 'API_ERROR', message: flattenErrors(data) };
        return data;
    } catch { return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible.' }; }
}

function flattenErrors(data) {
    if (typeof data === 'string') return data;
    if (data.detail) return data.detail;
    if (data.error)  return data.error;
    const msgs = [];
    for (const [k, v] of Object.entries(data)) {
        if (Array.isArray(v))           msgs.push(`${k}: ${v.join(', ')}`);
        else if (typeof v === 'object') msgs.push(`${k}: ${flattenErrors(v)}`);
        else msgs.push(`${k}: ${v}`);
    }
    return msgs.join(' | ') || 'Erreur inconnue.';
}

// ─── Session ──────────────────────────────────────────────────────────────────
function checkSession() {
    const token = getToken(), user = getUser();
    if (!token || !user) { window.location.href = '/login/'; return null; }
    if (!['Secretariat', 'Comptable', 'Dirigeant'].includes(user.role)) {
        window.location.href = '/login/'; return null;
    }
    return user;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    document.querySelector('.toast-grp')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const t = document.createElement('div');
    t.className = 'toast-grp';
    t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;padding:14px 22px;
        border-radius:12px;background:${colors[type]};color:white;font-weight:500;font-size:.9rem;
        box-shadow:0 8px 24px rgba(0,0,0,.2);transition:all .3s;max-width:400px;`;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function langueFlag(langue) {
    if (!langue) return '🌐';
    const l = langue.toLowerCase();
    if (l.includes('angl'))  return '🇬🇧';
    if (l.includes('franc')) return '🇫🇷';
    if (l.includes('allem')) return '🇩🇪';
    if (l.includes('espag')) return '🇪🇸';
    if (l.includes('ital'))  return '🇮🇹';
    return '🌐';
}
function formatPrice(v) {
    if (!v) return '0';
    const n = parseFloat(v);
    return n >= 1000 ? (n/1000).toFixed(1).replace('.0','') + 'k' : n.toString();
}
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('fr-FR') : '—'; }

const INP = `width:100%;padding:.75rem;border:2px solid #475569;border-radius:8px;
             background:#1e293b;color:#fff;font-size:.9rem;box-sizing:border-box;`;
const LBL = `display:block;margin-bottom:.4rem;font-weight:600;color:#fff;font-size:.875rem;`;

// ─── FIXED: Obtenir le vrai nombre d'étudiants ────────────────────────────────
// Retourne le nombre réel depuis l'API ou depuis le cache
function getRealCount(groupe) {
    // ✅ Priorité 1 : cache fraîchement chargé depuis /etudiants/?groupe=X
    if (state.etudiantsCounts[groupe.id] !== undefined) {
        return state.etudiantsCounts[groupe.id];
    }
    // ✅ Priorité 2 : champ nombre_etudiants retourné par le serializer
    if (groupe.nombre_etudiants !== null && groupe.nombre_etudiants !== undefined) {
        return groupe.nombre_etudiants;
    }
    return 0;
}

// ─── FIXED: Charger les vrais compteurs depuis l'API ──────────────────────────
async function loadAllCounts(groupes) {
    // Charger tous les étudiants en 1 seul appel et répartir par groupe
    const data = await apiFetch('/etudiants/');
    if (data?.error) return;

    const etudiants = Array.isArray(data) ? data : (data.results || []);

    // Initialiser à 0 tous les groupes
    groupes.forEach(g => { state.etudiantsCounts[g.id] = 0; });

    // Compter par groupe
    etudiants.forEach(e => {
        const groupeId = e.groupe;
        if (groupeId !== null && groupeId !== undefined) {
            if (state.etudiantsCounts[groupeId] !== undefined) {
                state.etudiantsCounts[groupeId]++;
            } else {
                state.etudiantsCounts[groupeId] = 1;
            }
        }
    });

    // Mettre à jour l'affichage des cartes déjà rendues
    groupes.forEach(g => {
        const count = state.etudiantsCounts[g.id];
        const cap   = g.capacite_max || 15;
        const pct   = Math.round((count / cap) * 100);

        // Mettre à jour le compteur visible sur la carte
        const card = document.querySelector(`.group-card[data-id="${g.id}"]`);
        if (!card) return;

        // Valeur étudiants
        const statVals = card.querySelectorAll('.g-stat-value');
        if (statVals[0]) statVals[0].textContent = count;

        // Barre de progression
        const bar = card.querySelector('[data-pct]');
        if (bar) {
            bar.style.width = `${pct}%`;
            bar.style.background = pct > 85 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#10b981';
        }

        // Pourcentage texte
        const pctEl = card.querySelector('[data-pcttext]');
        if (pctEl) pctEl.textContent = `${pct}%`;
    });
}

// ─── Load enseignants ─────────────────────────────────────────────────────────
async function loadEnseignants() {
    const data = await apiFetch('/enseignants/');
    if (!data?.error) {
        state.enseignants = Array.isArray(data) ? data : (data.results || []);
    }
}

// ─── Build teacher options ────────────────────────────────────────────────────
function buildTeacherOptions(selectedLang = '', selectedId = null) {
    const lang = (selectedLang || '').toLowerCase().trim();
    let filtered = state.enseignants.filter(e =>
        (e.langue_enseignee || '').toLowerCase().trim() === lang
    );
    if (!filtered.length && lang) {
        filtered = state.enseignants.filter(e => {
            const el = (e.langue_enseignee || '').toLowerCase().trim();
            return el.includes(lang) || lang.includes(el);
        });
    }
    const showingAll = !filtered.length;
    if (showingAll) filtered = state.enseignants;

    const prefix = showingAll && lang
        ? `<option value="" disabled style="color:#f59e0b;">⚠ Aucun prof de "${selectedLang}" — tous affichés</option>`
        : `<option value="">-- Sélectionner un professeur --</option>`;

    return prefix + filtered.map(e => {
        const nom = e.nom_complet || `${e.user?.first_name||''} ${e.user?.last_name||''}`.trim() || `Prof #${e.id}`;
        const langLabel = showingAll && e.langue_enseignee ? ` (${e.langue_enseignee})` : '';
        return `<option value="${e.id}" ${e.id === selectedId ? 'selected' : ''}>${nom}${langLabel}</option>`;
    }).join('');
}

// ─── Load groupes ─────────────────────────────────────────────────────────────
async function loadGroupes() {
    const timeline = document.querySelector('.groups-timeline');
    if (!timeline) return;

    timeline.innerHTML = `
        <div style="text-align:center;padding:3rem;color:#94a3b8;">
            <i class="fas fa-spinner fa-spin" style="font-size:2rem;margin-bottom:1rem;display:block;"></i>
            <p>Chargement des groupes...</p>
        </div>`;

    const data = await apiFetch('/groupes/');
    if (data?.error) {
        showToast('Erreur: ' + data.message, 'error');
        timeline.innerHTML = `
            <div style="text-align:center;padding:3rem;color:#dc2626;">
                <p>${data.message}</p>
                <button onclick="loadGroupes()" style="margin-top:1rem;padding:8px 16px;
                    background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer;">
                    Réessayer
                </button>
            </div>`;
        return;
    }

    state.groupes = Array.isArray(data) ? data : (data.results || []);

    if (!state.groupes.length) {
        timeline.innerHTML = `
            <div style="text-align:center;padding:3rem;color:#94a3b8;">
                <i class="fas fa-layer-group" style="font-size:3rem;margin-bottom:1rem;display:block;"></i>
                <p style="font-size:1.1rem;font-weight:600;">Aucun groupe trouvé</p>
                <p style="font-size:.875rem;margin-top:.5rem;">Créez votre premier groupe ci-dessus</p>
            </div>`;
        return;
    }

    // ✅ Rendre la grille d'abord avec les données du serializer
    renderGroupes();

    // ✅ Puis charger les vrais compteurs en arrière-plan et mettre à jour
    loadAllCounts(state.groupes);

    showToast(`${state.groupes.length} groupe(s) chargé(s)`, 'success');
}

// ─── Render groupes ───────────────────────────────────────────────────────────
function renderGroupes() {
    const timeline = document.querySelector('.groups-timeline');
    if (!timeline) return;
    timeline.innerHTML = '';

    const slots = {};
    state.groupes.forEach(g => {
        const key = extractTimeSlot(g);
        if (!slots[key]) slots[key] = [];
        slots[key].push(g);
    });

    Object.keys(slots).forEach(timeKey => {
        const slotGroupes = slots[timeKey];
        const isEvening   = timeKey.includes('18') || timeKey.includes('19') || timeKey.includes('20');
        const slotDiv     = document.createElement('div');
        slotDiv.className = 'time-slot';
        slotDiv.innerHTML = `
            <div class="time-header">
                <span class="time-badge" ${isEvening?'style="background:linear-gradient(135deg,#f59e0b,#d97706);"':''}>
                    <i class="fas ${isEvening?'fa-moon':'fa-sun'}"></i> ${timeKey}
                </span>
                <span class="time-info">Créneau • ${slotGroupes[0].salle || 'Salle non définie'}</span>
            </div>`;
        const rowDiv = document.createElement('div');
        rowDiv.className = 'groups-row';
        slotGroupes.forEach(g => rowDiv.appendChild(createGroupCard(g)));
        slotDiv.appendChild(rowDiv);
        timeline.appendChild(slotDiv);
    });
}

function extractTimeSlot(groupe) {
    if (groupe.planning && Array.isArray(groupe.planning) && groupe.planning.length > 0) {
        const p = groupe.planning[0];
        return `${(p.heure_debut||'09:00').substring(0,5)} - ${(p.heure_fin||'11:00').substring(0,5)}`;
    }
    const name = (groupe.nom_groupe || '').toLowerCase();
    if (name.includes('soir')  || name.includes('18')) return '18:00 - 20:00';
    if (name.includes('midi')  || name.includes('11')) return '11:00 - 13:00';
    if (name.includes('apres') || name.includes('14')) return '14:00 - 16:00';
    return '09:00 - 11:00';
}

// ─── FIXED: createGroupCard utilise getRealCount ───────────────────────────────
function createGroupCard(groupe) {
    const card = document.createElement('div');
    card.className   = 'group-card';
    card.dataset.id   = groupe.id;
    card.dataset.lang = (groupe.langue || '').toLowerCase();

    // ✅ FIXED: utilise getRealCount() qui cherche dans le cache ET le serializer
    const nb  = getRealCount(groupe);
    const cap = groupe.capacite_max || 15;
    const pct = Math.round((nb / cap) * 100);

    card.innerHTML = `
        <div class="group-header">
            <span class="group-level">${groupe.niveau || 'N/A'}</span>
            <span class="group-lang">${langueFlag(groupe.langue)} ${groupe.langue || '—'}</span>
        </div>
        <h3 class="group-name">${groupe.nom_groupe || '—'}</h3>
        <p class="group-teacher">
            <i class="fas fa-chalkboard-teacher"></i> Prof. ${groupe.enseignant_nom || 'Non assigné'}
        </p>
        <div class="group-stats">
            <div class="g-stat">
                <div class="g-stat-value">${nb}</div>
                <div class="g-stat-label">Étudiants</div>
            </div>
            <div class="g-stat">
                <div class="g-stat-value">${cap}</div>
                <div class="g-stat-label">Capacité</div>
            </div>
            <div class="g-stat">
                <div class="g-stat-value">${formatPrice(groupe.tarif_mensuel)}</div>
                <div class="g-stat-label">Prix DA</div>
            </div>
        </div>
        <div style="margin:10px 0 4px;">
            <div style="display:flex;justify-content:space-between;font-size:.75rem;color:#94a3b8;margin-bottom:4px;">
                <span>Remplissage</span>
                <span data-pcttext>${pct}%</span>
            </div>
            <div style="height:6px;background:#334155;border-radius:3px;">
                <div data-pct style="height:100%;width:${pct}%;
                    background:${pct>85?'#ef4444':pct>60?'#f59e0b':'#10b981'};
                    border-radius:3px;transition:width .5s;"></div>
            </div>
        </div>
        <div class="group-footer">
            <button class="btn-group btn-view" onclick="openModalDetails(${groupe.id})">
                <i class="fas fa-eye"></i> Voir
            </button>
            <button class="btn-group btn-edit" onclick="openModalModifier(${groupe.id})">
                <i class="fas fa-edit"></i> Modifier
            </button>
        </div>`;
    return card;
}

// ─── MODAL DETAILS ────────────────────────────────────────────────────────────
async function openModalDetails(groupeId) {
    const g = state.groupes.find(x => x.id === groupeId);
    if (!g) return;

    // ✅ FIXED: utilise le vrai count du cache
    const nb  = getRealCount(g);
    const cap = g.capacite_max || 15;

    const modal = document.createElement('div');
    modal.id = 'modal-details';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2000;
        display:flex;align-items:center;justify-content:center;`;

    modal.innerHTML = `
        <div style="background:#0f172a;border:2px solid #6366f1;border-radius:16px;
                    width:90%;max-width:680px;max-height:90vh;overflow:hidden;
                    display:flex;flex-direction:column;box-shadow:0 25px 50px rgba(0,0,0,.6);"
             onclick="event.stopPropagation()">

            <!-- Header -->
            <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:1.25rem 1.5rem;
                        display:flex;justify-content:space-between;align-items:center;flex-shrink:0;">
                <div>
                    <h3 style="margin:0;color:#fff;font-size:1.15rem;">${g.nom_groupe}</h3>
                    <p style="margin:4px 0 0;color:rgba(255,255,255,.75);font-size:.85rem;">
                        ${langueFlag(g.langue)} ${g.langue||'—'} · Niveau ${g.niveau||'—'}
                    </p>
                </div>
                <button onclick="document.getElementById('modal-details').remove()"
                        style="background:rgba(255,255,255,.2);border:none;color:#fff;
                               width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1.1rem;">×</button>
            </div>

            <!-- Tabs -->
            <div style="display:flex;background:#1e293b;border-bottom:1px solid #334155;flex-shrink:0;">
                <button id="tabInfoBtn" onclick="switchTab('info')"
                        style="flex:1;padding:12px;border:none;background:transparent;
                               color:#6366f1;font-weight:700;font-size:.875rem;cursor:pointer;
                               border-bottom:3px solid #6366f1;">
                    📋 Informations
                </button>
                <button id="tabStudentsBtn" onclick="switchTab('students')"
                        style="flex:1;padding:12px;border:none;background:transparent;
                               color:#94a3b8;font-weight:600;font-size:.875rem;cursor:pointer;
                               border-bottom:3px solid transparent;">
                    👥 Étudiants
                    <span id="studentCountBadge" style="background:#334155;color:#94a3b8;
                        padding:1px 7px;border-radius:10px;font-size:.75rem;margin-left:4px;">
                        ${nb}
                    </span>
                </button>
            </div>

            <!-- Tab: Info -->
            <div id="tabInfo" style="padding:1.25rem 1.5rem;overflow-y:auto;flex:1;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.25rem;">
                    ${[
                        ['👨‍🏫 Professeur', g.enseignant_nom || 'Non assigné'],
                        ['🏫 Salle',        g.salle || 'Non définie'],
                        ['👥 Étudiants',    `${nb} / ${cap}`],
                        ['💰 Prix',         `${formatPrice(g.tarif_mensuel)} DA/mois`],
                        ['📅 Début',        fmtDate(g.date_debut)],
                        ['📅 Fin',          g.date_fin ? fmtDate(g.date_fin) : 'Non définie'],
                        ['📊 Statut',       g.statut_groupe || 'Actif'],
                        ['🔢 Places libres', cap - nb],
                    ].map(([lb, v]) => `
                        <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:.75rem 1rem;">
                            <div style="color:#94a3b8;font-size:.75rem;margin-bottom:3px;">${lb}</div>
                            <div style="color:#fff;font-weight:600;font-size:.9rem;">${v}</div>
                        </div>`).join('')}
                </div>
                <div style="display:flex;gap:.75rem;margin-top:auto;padding-top:.5rem;">
                    <button onclick="document.getElementById('modal-details').remove();openModalModifier(${groupeId})"
                            style="flex:1;padding:.75rem;background:#3b82f6;color:#fff;border:none;
                                   border-radius:8px;cursor:pointer;font-weight:600;">
                        <i class="fas fa-edit"></i> Modifier
                    </button>
                    <button onclick="supprimerGroupe(${groupeId})"
                            style="flex:1;padding:.75rem;background:#ef4444;color:#fff;border:none;
                                   border-radius:8px;cursor:pointer;font-weight:600;">
                        <i class="fas fa-trash"></i> Supprimer
                    </button>
                </div>
            </div>

            <!-- Tab: Students -->
            <div id="tabStudents" style="display:none;flex-direction:column;flex:1;overflow:hidden;">
                <div style="padding:.75rem 1.5rem;border-bottom:1px solid #334155;flex-shrink:0;">
                    <input id="etudiantSearch" type="text" placeholder="🔍 Rechercher un étudiant..."
                           oninput="filterStudentRows(this.value)"
                           style="width:100%;padding:.6rem 1rem;background:#1e293b;border:2px solid #334155;
                                  border-radius:8px;color:#fff;font-size:.875rem;box-sizing:border-box;">
                </div>
                <div style="overflow-y:auto;flex:1;padding:.75rem 1.5rem;">
                    <div id="studentsLoading" style="text-align:center;padding:2rem;color:#94a3b8;">
                        <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;margin-bottom:.5rem;display:block;"></i>
                        Chargement des étudiants...
                    </div>
                    <table id="studentsTable" style="display:none;width:100%;border-collapse:collapse;font-size:.85rem;">
                        <thead>
                            <tr style="border-bottom:2px solid #334155;">
                                <th style="padding:.6rem .75rem;text-align:left;color:#94a3b8;font-weight:600;">#</th>
                                <th style="padding:.6rem .75rem;text-align:left;color:#94a3b8;font-weight:600;">Nom</th>
                                <th style="padding:.6rem .75rem;text-align:left;color:#94a3b8;font-weight:600;">Email</th>
                                <th style="padding:.6rem .75rem;text-align:center;color:#94a3b8;font-weight:600;">Niveau</th>
                                <th style="padding:.6rem .75rem;text-align:center;color:#94a3b8;font-weight:600;">Moyenne</th>
                                <th style="padding:.6rem .75rem;text-align:center;color:#94a3b8;font-weight:600;">Statut</th>
                            </tr>
                        </thead>
                        <tbody id="studentsTbody"></tbody>
                    </table>
                    <div id="studentsEmpty" style="display:none;text-align:center;padding:2rem;color:#64748b;">
                        <div style="font-size:2.5rem;margin-bottom:.75rem;">👤</div>
                        <p>Aucun étudiant dans ce groupe</p>
                    </div>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    // ✅ FIXED: charger les étudiants depuis l'API directement
    loadStudentsForGroup(groupeId);
}

function switchTab(tab) {
    const isInfo = tab === 'info';
    document.getElementById('tabInfo').style.display     = isInfo ? 'block' : 'none';
    document.getElementById('tabStudents').style.display = isInfo ? 'none'  : 'flex';

    const iBtn = document.getElementById('tabInfoBtn');
    const sBtn = document.getElementById('tabStudentsBtn');
    if (iBtn) { iBtn.style.color = isInfo ? '#6366f1' : '#94a3b8'; iBtn.style.borderBottom = isInfo ? '3px solid #6366f1' : '3px solid transparent'; }
    if (sBtn) { sBtn.style.color = !isInfo ? '#6366f1' : '#94a3b8'; sBtn.style.borderBottom = !isInfo ? '3px solid #6366f1' : '3px solid transparent'; }
}

// ─── FIXED: loadStudentsForGroup ──────────────────────────────────────────────
async function loadStudentsForGroup(groupeId) {
    // ✅ Charger directement depuis l'API avec le filtre groupe
    const data = await apiFetch(`/etudiants/?groupe=${groupeId}`);

    const loading = document.getElementById('studentsLoading');
    const table   = document.getElementById('studentsTable');
    const empty   = document.getElementById('studentsEmpty');
    const badge   = document.getElementById('studentCountBadge');

    if (!loading) return; // modal fermé

    const students = !data?.error ? (Array.isArray(data) ? data : []) : [];

    // ✅ Mettre à jour le cache
    state.etudiantsCounts[groupeId] = students.length;

    // ✅ Mettre à jour le badge dans le tab
    if (badge) {
        badge.textContent  = students.length;
        badge.style.background = students.length ? '#6366f1' : '#334155';
        badge.style.color      = students.length ? '#fff'    : '#94a3b8';
    }

    // ✅ Mettre à jour aussi la carte dans la grille
    const card = document.querySelector(`.group-card[data-id="${groupeId}"]`);
    if (card) {
        const statVals = card.querySelectorAll('.g-stat-value');
        if (statVals[0]) statVals[0].textContent = students.length;
        const g   = state.groupes.find(x => x.id === groupeId);
        const cap = g?.capacite_max || 15;
        const pct = Math.round((students.length / cap) * 100);
        const bar = card.querySelector('[data-pct]');
        if (bar) { bar.style.width = `${pct}%`; bar.style.background = pct>85?'#ef4444':pct>60?'#f59e0b':'#10b981'; }
        const pctEl = card.querySelector('[data-pcttext]');
        if (pctEl) pctEl.textContent = `${pct}%`;
    }

    loading.style.display = 'none';

    if (!students.length) {
        if (empty) empty.style.display = 'block';
        return;
    }

    if (table) table.style.display = 'table';
    const tbody = document.getElementById('studentsTbody');
    if (!tbody) return;

    tbody.innerHTML = students.map((s, i) => {
        const nom      = s.user ? `${s.user.first_name||''} ${s.user.last_name||''}`.trim() : '—';
        const email    = s.user?.email || '—';
        const niveau   = s.niveau_actuel || '—';
        const moy      = s.moyenne_generale != null ? Number(s.moyenne_generale).toFixed(1) : '—';
        const statut   = s.statut_etudiant || 'Actif';
        const initials = nom.split(' ').filter(Boolean).map(w => w[0]).join('').substring(0,2).toUpperCase();
        const moyColor = parseFloat(moy) >= 14 ? '#10b981' : parseFloat(moy) >= 10 ? '#3b82f6' : '#ef4444';

        return `
            <tr class="student-row" style="border-bottom:1px solid #1e293b;transition:background .15s;"
                onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background=''">
                <td style="padding:.6rem .75rem;color:#64748b;">${i+1}</td>
                <td style="padding:.6rem .75rem;">
                    <div style="display:flex;align-items:center;gap:.6rem;">
                        <div style="width:30px;height:30px;border-radius:50%;
                                    background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;
                                    display:flex;align-items:center;justify-content:center;
                                    font-size:.7rem;font-weight:700;flex-shrink:0;">${initials || '?'}</div>
                        <span style="color:#e2e8f0;font-weight:500;">${nom}</span>
                    </div>
                </td>
                <td style="padding:.6rem .75rem;color:#94a3b8;font-size:.8rem;">${email}</td>
                <td style="padding:.6rem .75rem;text-align:center;">
                    <span style="background:#312e81;color:#a5b4fc;padding:2px 8px;border-radius:8px;font-size:.75rem;font-weight:700;">${niveau}</span>
                </td>
                <td style="padding:.6rem .75rem;text-align:center;color:${moyColor};font-weight:700;">${moy}/20</td>
                <td style="padding:.6rem .75rem;text-align:center;">
                    <span style="padding:2px 8px;border-radius:8px;font-size:.75rem;font-weight:600;
                        background:${statut==='Actif'?'rgba(16,185,129,.15)':'rgba(239,68,68,.15)'};
                        color:${statut==='Actif'?'#10b981':'#ef4444'};">${statut}</span>
                </td>
            </tr>`;
    }).join('');
}

function filterStudentRows(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('#studentsTbody .student-row').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
}

// ─── MODAL NOUVEAU GROUPE ─────────────────────────────────────────────────────
async function openModalNouveau() {
    if (!state.enseignants.length) {
        showToast('Chargement des professeurs...', 'info');
        await loadEnseignants();
    }
    const today = new Date().toISOString().split('T')[0];

    const modal = document.createElement('div');
    modal.id = 'modal-groupe';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2000;
        display:flex;align-items:center;justify-content:center;`;

    modal.innerHTML = `
        <div style="background:#0f172a;border:2px solid #6366f1;border-radius:16px;padding:2rem;
                    width:90%;max-width:520px;max-height:90vh;overflow-y:auto;color:#fff;
                    box-shadow:0 25px 50px rgba(0,0,0,.6);" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                <h3 style="margin:0;font-size:1.15rem;">
                    <i class="fas fa-plus-circle" style="color:#6366f1;margin-right:8px;"></i>Nouveau Groupe
                </h3>
                <button onclick="document.getElementById('modal-groupe').remove()"
                        style="background:none;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer;">×</button>
            </div>
            <div style="display:grid;gap:.9rem;">
                <div><label style="${LBL}">Nom du groupe *</label>
                    <input type="text" id="new_nom" placeholder="ex: Anglais A2 - Matin" style="${INP}"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${LBL}">Niveau *</label>
                        <select id="new_niveau" style="${INP}">
                            ${['A1','A2','B1','B2','C1','C2'].map(n=>`<option value="${n}">${n}</option>`).join('')}
                        </select></div>
                    <div><label style="${LBL}">Langue *</label>
                        <select id="new_langue" onchange="updateTeacherOptions(this.value)" style="${INP}">
                            ${['Anglais','Français','Allemand','Espagnol','Italien']
                              .map(l=>`<option value="${l}">${langueFlag(l)} ${l}</option>`).join('')}
                        </select></div>
                </div>
                <div><label style="${LBL}">Professeur * <span style="font-weight:400;color:#64748b;font-size:.75rem;">(filtré par langue)</span></label>
                    <select id="new_enseignant" style="${INP}">${buildTeacherOptions('Anglais')}</select></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${LBL}">Salle</label>
                        <input type="text" id="new_salle" placeholder="Salle 101" style="${INP}"></div>
                    <div><label style="${LBL}">Capacité max *</label>
                        <input type="number" id="new_capacite" value="15" min="1" style="${INP}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${LBL}">Tarif mensuel (DA) *</label>
                        <input type="number" id="new_tarif" placeholder="8000" style="${INP}"></div>
                    <div><label style="${LBL}">Date début *</label>
                        <input type="date" id="new_date_debut" value="${today}" style="${INP}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${LBL}">Durée (semaines)</label>
                        <input type="number" id="new_duree" value="12" min="1" style="${INP}"></div>
                    <div><label style="${LBL}">Date fin (optionnel)</label>
                        <input type="date" id="new_date_fin" style="${INP}"></div>
                </div>
                <div id="newGrpError" style="display:none;padding:.75rem;background:rgba(239,68,68,.1);
                     border:1px solid #ef4444;border-radius:8px;color:#fca5a5;font-size:.875rem;"></div>
                <div style="display:flex;gap:.75rem;margin-top:.5rem;">
                    <button onclick="document.getElementById('modal-groupe').remove()"
                            style="flex:1;padding:.875rem;border:2px solid #475569;background:#334155;
                                   color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">Annuler</button>
                    <button id="btnCreate"
                            style="flex:1;padding:.875rem;background:#6366f1;color:#fff;border:none;
                                   border-radius:8px;cursor:pointer;font-weight:700;font-size:.95rem;">
                        <i class="fas fa-save"></i> Créer le groupe
                    </button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    document.getElementById('btnCreate').onclick = async () => {
        const errEl = document.getElementById('newGrpError');
        errEl.style.display = 'none';
        const btn = document.getElementById('btnCreate');

        const nom      = document.getElementById('new_nom').value.trim();
        const niveau   = document.getElementById('new_niveau').value;
        const langue   = document.getElementById('new_langue').value;
        const ensId    = parseInt(document.getElementById('new_enseignant').value);
        const salle    = document.getElementById('new_salle').value.trim();
        const capacite = parseInt(document.getElementById('new_capacite').value) || 15;
        const tarif    = parseFloat(document.getElementById('new_tarif').value);
        const debut    = document.getElementById('new_date_debut').value;
        const duree    = parseInt(document.getElementById('new_duree').value) || 12;
        const fin      = document.getElementById('new_date_fin').value || null;

        if (!nom || !ensId || !tarif || !debut) {
            errEl.textContent = '⚠️ Veuillez remplir tous les champs obligatoires (*).';
            errEl.style.display = 'block'; return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';
        btn.disabled  = true;

        const result = await apiFetch('/groupes/', {
            method: 'POST',
            body: JSON.stringify({
                nom_groupe: nom, niveau, langue, enseignant: ensId,
                salle: salle || '', capacite_max: capacite, tarif_mensuel: tarif,
                date_debut: debut, date_fin: fin, duree_semaines: duree,
                statut_groupe: 'Actif', nombre_etudiants: 0,
            }),
        });

        if (result?.error) {
            errEl.textContent = '❌ ' + result.message;
            errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-save"></i> Créer le groupe';
            btn.disabled = false; return;
        }

        modal.remove();
        state.groupes.push(result);
        state.etudiantsCounts[result.id] = 0; // nouveau groupe = 0 étudiants
        renderGroupes();
        showToast(`✅ Groupe "${nom}" créé avec succès !`, 'success');
    };
}

function updateTeacherOptions(lang) {
    const select = document.getElementById('new_enseignant');
    if (select) select.innerHTML = buildTeacherOptions(lang);
}

// ─── MODAL MODIFIER ───────────────────────────────────────────────────────────
async function openModalModifier(groupeId) {
    const g = state.groupes.find(x => x.id === groupeId);
    if (!g) return;

    const modal = document.createElement('div');
    modal.id = 'modal-modifier';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2000;
        display:flex;align-items:center;justify-content:center;`;

    modal.innerHTML = `
        <div style="background:#0f172a;border:2px solid #3b82f6;border-radius:16px;padding:2rem;
                    width:90%;max-width:520px;max-height:90vh;overflow-y:auto;color:#fff;
                    box-shadow:0 25px 50px rgba(0,0,0,.6);" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                <h3 style="margin:0;font-size:1.15rem;">
                    <i class="fas fa-edit" style="color:#3b82f6;margin-right:8px;"></i>Modifier le groupe
                </h3>
                <button onclick="document.getElementById('modal-modifier').remove()"
                        style="background:none;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer;">×</button>
            </div>
            <div style="display:grid;gap:.9rem;">
                <div><label style="${LBL}">Nom du groupe</label>
                    <input type="text" id="mod_nom" value="${g.nom_groupe||''}" style="${INP}"></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${LBL}">Niveau</label>
                        <select id="mod_niveau" style="${INP}">
                            ${['A1','A2','B1','B2','C1','C2'].map(n=>
                                `<option value="${n}" ${g.niveau===n?'selected':''}>${n}</option>`).join('')}
                        </select></div>
                    <div><label style="${LBL}">Langue</label>
                        <select id="mod_langue" onchange="updateModTeacherOptions(this.value)" style="${INP}">
                            ${['Anglais','Français','Allemand','Espagnol','Italien'].map(l=>
                                `<option value="${l}" ${g.langue===l?'selected':''}>${langueFlag(l)} ${l}</option>`).join('')}
                        </select></div>
                </div>
                <div><label style="${LBL}">Professeur <span style="font-weight:400;color:#64748b;font-size:.75rem;">(filtré par langue)</span></label>
                    <select id="mod_enseignant" style="${INP}">${buildTeacherOptions(g.langue, g.enseignant)}</select></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${LBL}">Salle</label>
                        <input type="text" id="mod_salle" value="${g.salle||''}" style="${INP}"></div>
                    <div><label style="${LBL}">Capacité max</label>
                        <input type="number" id="mod_capacite" value="${g.capacite_max||15}" min="1" style="${INP}"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${LBL}">Tarif (DA)</label>
                        <input type="number" id="mod_tarif" value="${g.tarif_mensuel||''}" style="${INP}"></div>
                    <div><label style="${LBL}">Statut</label>
                        <select id="mod_statut" style="${INP}">
                            ${['Actif','Cloture','Annule'].map(s=>
                                `<option value="${s}" ${g.statut_groupe===s?'selected':''}>${s}</option>`).join('')}
                        </select></div>
                </div>
                <div id="modGrpError" style="display:none;padding:.75rem;background:rgba(239,68,68,.1);
                     border:1px solid #ef4444;border-radius:8px;color:#fca5a5;font-size:.875rem;"></div>
                <div style="display:flex;gap:.75rem;margin-top:.5rem;">
                    <button onclick="document.getElementById('modal-modifier').remove()"
                            style="flex:1;padding:.875rem;border:2px solid #475569;background:#334155;
                                   color:#fff;border-radius:8px;cursor:pointer;font-weight:600;">Annuler</button>
                    <button id="btnSave"
                            style="flex:1;padding:.875rem;background:#3b82f6;color:#fff;border:none;
                                   border-radius:8px;cursor:pointer;font-weight:700;">
                        <i class="fas fa-save"></i> Enregistrer
                    </button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    document.getElementById('btnSave').onclick = async () => {
        const errEl = document.getElementById('modGrpError');
        errEl.style.display = 'none';
        const btn = document.getElementById('btnSave');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled  = true;

        const result = await apiFetch(`/groupes/${groupeId}/`, {
            method: 'PUT',
            body: JSON.stringify({
                nom_groupe:    document.getElementById('mod_nom').value.trim(),
                niveau:        document.getElementById('mod_niveau').value,
                langue:        document.getElementById('mod_langue').value,
                enseignant:    parseInt(document.getElementById('mod_enseignant').value),
                salle:         document.getElementById('mod_salle').value.trim(),
                capacite_max:  parseInt(document.getElementById('mod_capacite').value) || 15,
                tarif_mensuel: parseFloat(document.getElementById('mod_tarif').value),
                statut_groupe: document.getElementById('mod_statut').value,
            }),
        });

        if (result?.error) {
            errEl.textContent = '❌ ' + result.message;
            errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
            btn.disabled = false; return;
        }

        // ✅ Conserver le vrai count dans le résultat
        result.nombre_etudiants = state.etudiantsCounts[groupeId] ?? g.nombre_etudiants ?? 0;
        const idx = state.groupes.findIndex(x => x.id === groupeId);
        if (idx !== -1) state.groupes[idx] = result;
        modal.remove();
        renderGroupes();
        showToast('✅ Groupe modifié avec succès !', 'success');
    };
}

function updateModTeacherOptions(lang) {
    const select = document.getElementById('mod_enseignant');
    if (!select) return;
    select.innerHTML = buildTeacherOptions(lang, parseInt(select.value) || null);
}

// ─── Supprimer ────────────────────────────────────────────────────────────────
async function supprimerGroupe(groupeId) {
    const g = state.groupes.find(x => x.id === groupeId);
    if (!confirm(`Supprimer le groupe "${g?.nom_groupe || groupeId}" ?`)) return;
    const result = await apiFetch(`/groupes/${groupeId}/`, { method: 'DELETE' });
    if (result?.error) { showToast('❌ ' + result.message, 'error'); return; }
    state.groupes = state.groupes.filter(x => x.id !== groupeId);
    delete state.etudiantsCounts[groupeId];
    document.getElementById('modal-details')?.remove();
    document.getElementById('modal-modifier')?.remove();
    renderGroupes();
    showToast('Groupe supprimé.', 'success');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;
    document.querySelector('.btn-primary')?.addEventListener('click', openModalNouveau);
    await loadEnseignants();
    await loadGroupes();
});