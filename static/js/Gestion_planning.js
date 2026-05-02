/**
 * Gestion du Planning - Secrétariat
 * JWT Authentication + Django REST API
 * ADDED: Annulation séance + notification enseignant & étudiants
 */

const API_URL = '/api';

const state = {
    plannings:   [],
    groupes:     [],
    enseignants: [],
    currentWeek: new Date(),
    currentView: 'semaine',
    currentDay:  new Date(),
    currentMonth: new Date(),
    filters: {
        langue: '',
        enseignant: '',
        salle: '',
        groupe: ''
    }
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
function flattenDRFErrors(data) {
    if (typeof data === 'string') return data;
    if (data.detail)              return data.detail;
    if (data.error)               return data.error;
    const msgs = [];
    for (const [key, val] of Object.entries(data)) {
        if (Array.isArray(val))           msgs.push(val.join(', '));
        else if (typeof val === 'object') msgs.push(flattenDRFErrors(val));
        else                              msgs.push(String(val));
    }
    return msgs.join(' | ') || 'Erreur inconnue.';
}

async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });
        if (res.status === 401) return { error: 'JWT_INVALID', message: 'Token invalide.' };
        if (res.status === 403) return { error: 'FORBIDDEN',   message: 'Accès refusé.' };
        if (res.status === 204) return { success: true };
        const data = await res.json();
        if (!res.ok) return { error: 'API_ERROR', message: flattenDRFErrors(data), raw: data };
        return data;
    } catch (e) {
        return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible.' };
    }
}

// ============================================================
// SESSION
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
    document.querySelector('.toast-planning')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-planning';
    t.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:9999;
        padding:14px 22px; border-radius:12px; background:${colors[type]}; color:white;
        font-weight:500; font-size:0.9rem; box-shadow:0 8px 24px rgba(0,0,0,0.2);
        display:flex; align-items:center; gap:8px; max-width:420px;
        transform:translateX(120%); opacity:0; transition:all 0.3s ease;`;
    t.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform='translateX(0)'; t.style.opacity='1'; });
    setTimeout(() => {
        t.style.transform='translateX(120%)'; t.style.opacity='0';
        setTimeout(() => t.remove(), 300);
    }, 4000);
}

// ============================================================
// TIME & DATE HELPERS
// ============================================================
function normalizeTime(t) {
    if (!t) return '';
    return t.slice(0, 5);
}

function getWeekDates(date) {
    const start = new Date(date);
    const day   = start.getDay();
    const diff  = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 5 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
    });
}

function formatDateShort(date) {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatDateFull(date) {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const FR_DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const FR_DAYS_FULL  = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function getDayShort(date) { return FR_DAYS_SHORT[date.getDay()]; }
function getDayFull(date)  { return FR_DAYS_FULL[date.getDay()]; }
function getMonthName(date) {
    return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

// ============================================================
// LOAD DATA
// ============================================================
async function loadGroupes() {
    const data = await apiFetch('/groupes/');
    if (!data?.error) state.groupes = Array.isArray(data) ? data : (data.results || []);
}

async function loadEnseignants() {
    const data = await apiFetch('/enseignants/');
    if (!data?.error) state.enseignants = Array.isArray(data) ? data : (data.results || []);
}

async function loadPlannings() {
    const data = await apiFetch('/plannings/');
    if (!data?.error) {
        state.plannings = Array.isArray(data) ? data : (data.results || []);
    } else {
        showToast('Erreur chargement planning: ' + data.message, 'error');
        state.plannings = [];
    }
}

// ============================================================
// FILTER LOGIC
// ============================================================
function getFilteredPlannings() {
    return state.plannings.filter(p => {
        const groupe = state.groupes.find(g => g.id === p.groupe);
        if (state.filters.langue && groupe) {
            if (!(groupe.langue || '').toLowerCase().includes(state.filters.langue.toLowerCase())) return false;
        }
        if (state.filters.enseignant && p.enseignant) {
            if (p.enseignant !== parseInt(state.filters.enseignant)) return false;
        }
        if (state.filters.salle && p.salle) {
            if (!p.salle.toLowerCase().includes(state.filters.salle.toLowerCase())) return false;
        }
        if (state.filters.groupe && p.groupe !== parseInt(state.filters.groupe)) return false;
        return true;
    });
}

// ============================================================
// VIEW RENDERERS
// ============================================================
const TIME_SLOTS = ['09:00', '11:00', '14:00', '16:00', '18:00'];

function renderCalendar() {
    const container = document.querySelector('.week-view');
    if (!container) return;
    container.innerHTML = '';

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === state.currentView) btn.classList.add('active');
    });

    switch (state.currentView) {
        case 'jour':   renderDayView(container);   break;
        case 'mois':   renderMonthView(container); break;
        default:       renderWeekView(container);  break;
    }
}

function renderWeekView(container) {
    const timeCol = document.createElement('div');
    timeCol.className = 'time-column';
    timeCol.innerHTML = `<div class="time-slot-header">Heure</div>` +
        TIME_SLOTS.map(t => `<div class="time-slot-header">${t}</div>`).join('');
    container.appendChild(timeCol);

    const weekDates = getWeekDates(state.currentWeek);
    const filtered  = getFilteredPlannings();

    const headerTitle = document.querySelector('.calendar-nav h2');
    if (headerTitle) {
        headerTitle.textContent =
            `Semaine du ${formatDateShort(weekDates[0])} - ${formatDateShort(weekDates[4])} ${weekDates[4].getFullYear()}`;
    }

    weekDates.forEach(date => container.appendChild(createDayColumn(date, filtered)));
}

function createDayColumn(date, plannings) {
    const isToday = new Date().toDateString() === date.toDateString();
    const dayDiv  = document.createElement('div');
    dayDiv.className = 'day-column';

    const header = document.createElement('div');
    header.className = `day-header ${isToday ? 'today' : ''}`;
    header.innerHTML = `${getDayShort(date)}<span>${formatDateShort(date)}</span>`;
    dayDiv.appendChild(header);

    const dayNameFull = getDayFull(date);

    TIME_SLOTS.forEach(slotTime => {
        const slot = document.createElement('div');
        slot.className = 'schedule-slot';

        plannings
            .filter(p => p.jour === dayNameFull && normalizeTime(p.heure_debut) === slotTime)
            .forEach(p => {
                const groupe = state.groupes.find(g => g.id === p.groupe);
                slot.appendChild(createSessionCard(p, groupe));
            });

        dayDiv.appendChild(slot);
    });

    return dayDiv;
}

function renderDayView(container) {
    const timeCol = document.createElement('div');
    timeCol.className = 'time-column';
    timeCol.innerHTML = `<div class="time-slot-header">Heure</div>` +
        TIME_SLOTS.map(t => `<div class="time-slot-header">${t}</div>`).join('');
    container.appendChild(timeCol);

    const filtered    = getFilteredPlannings();
    const dayNameFull = getDayFull(state.currentDay);
    const isToday     = new Date().toDateString() === state.currentDay.toDateString();

    const headerTitle = document.querySelector('.calendar-nav h2');
    if (headerTitle) headerTitle.textContent = `${dayNameFull} ${formatDateFull(state.currentDay)}`;

    const dayDiv = document.createElement('div');
    dayDiv.className = 'day-column';
    dayDiv.style.flex = '3';

    const header = document.createElement('div');
    header.className = `day-header ${isToday ? 'today' : ''}`;
    header.innerHTML = `${getDayShort(state.currentDay)}<span>${formatDateShort(state.currentDay)}</span>`;
    dayDiv.appendChild(header);

    TIME_SLOTS.forEach(slotTime => {
        const slot = document.createElement('div');
        slot.className = 'schedule-slot';
        filtered
            .filter(p => p.jour === dayNameFull && normalizeTime(p.heure_debut) === slotTime)
            .forEach(p => {
                const groupe = state.groupes.find(g => g.id === p.groupe);
                slot.appendChild(createSessionCard(p, groupe));
            });
        dayDiv.appendChild(slot);
    });

    container.appendChild(dayDiv);

    for (let i = 0; i < 4; i++) {
        const emptyCol = document.createElement('div');
        emptyCol.className = 'day-column';
        emptyCol.style.opacity = '0.3';
        emptyCol.innerHTML = `<div class="day-header">-</div>` +
            TIME_SLOTS.map(() => '<div class="schedule-slot"></div>').join('');
        container.appendChild(emptyCol);
    }
}

function renderMonthView(container) {
    container.style.cssText = 'display:grid;grid-template-columns:repeat(7,1fr);gap:8px;';
    const filtered = getFilteredPlannings();
    const year  = state.currentMonth.getFullYear();
    const month = state.currentMonth.getMonth();

    const headerTitle = document.querySelector('.calendar-nav h2');
    if (headerTitle) headerTitle.textContent = getMonthName(state.currentMonth);

    ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].forEach(name => {
        const dh = document.createElement('div');
        dh.style.cssText = 'text-align:center;font-weight:600;padding:12px;color:#64748b;border-bottom:2px solid #e5e7eb;';
        dh.textContent = name;
        container.appendChild(dh);
    });

    let startOffset = new Date(year, month, 1).getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    for (let i = 0; i < startOffset; i++) {
        const e = document.createElement('div');
        e.style.cssText = 'min-height:100px;background:#f8fafc;border-radius:8px;';
        container.appendChild(e);
    }

    const today = new Date();
    for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
        const date       = new Date(year, month, day);
        const isToday    = today.toDateString() === date.toDateString();
        const dayNameFull = getDayFull(date);

        const cell = document.createElement('div');
        cell.style.cssText = `min-height:100px;background:${isToday?'#eff6ff':'white'};border:2px solid ${isToday?'#3b82f6':'#e5e7eb'};border-radius:8px;padding:8px;cursor:pointer;`;
        cell.onclick = () => switchToDayView(date);

        const dayNum = document.createElement('div');
        dayNum.style.cssText = `font-weight:600;margin-bottom:4px;color:${isToday?'#3b82f6':'#374151'};`;
        dayNum.textContent = day;
        cell.appendChild(dayNum);

        const dayPlannings = filtered.filter(p => p.jour === dayNameFull);
        dayPlannings.slice(0, 3).forEach(p => {
            const groupe = state.groupes.find(g => g.id === p.groupe);
            const lang = (groupe?.langue || '').toLowerCase();
            let color = '#3b82f6';
            if (lang.includes('franc')) color = '#ec4899';
            else if (lang.includes('allem')) color = '#a855f7';

            // Grey out cancelled
            const cancelled = p.statut_planning === 'Annule';
            const badge = document.createElement('div');
            badge.style.cssText = `font-size:10px;padding:2px 6px;border-radius:4px;margin-bottom:2px;
                white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
                background:${cancelled?'#fef2f2':color+'20'};color:${cancelled?'#dc2626':color};
                text-decoration:${cancelled?'line-through':'none'};`;
            badge.textContent = `${normalizeTime(p.heure_debut)} ${groupe?.nom_groupe || ''}${cancelled?' ❌':''}`;
            cell.appendChild(badge);
        });

        if (dayPlannings.length > 3) {
            const more = document.createElement('div');
            more.style.cssText = 'font-size:10px;color:#6b7280;text-align:center;';
            more.textContent = `+${dayPlannings.length - 3} plus`;
            cell.appendChild(more);
        }

        container.appendChild(cell);
    }
}

// ============================================================
// SESSION CARD
// ============================================================
function createSessionCard(planning, groupe) {
    const div = document.createElement('div');

    const langue = (groupe?.langue || '').toLowerCase();
    let langClass = 'anglais';
    if (langue.includes('franc')) langClass = 'francais';
    else if (langue.includes('allem')) langClass = 'allemand';
    else if (langue.includes('espag')) langClass = 'espagnol';
    else if (langue.includes('ital'))  langClass = 'italien';

    const cancelled = planning.statut_planning === 'Annule';

    const hasConflict = !cancelled && state.plannings.some(p =>
        p.id !== planning.id &&
        p.jour === planning.jour &&
        normalizeTime(p.heure_debut) === normalizeTime(planning.heure_debut) &&
        p.salle === planning.salle
    );

    div.className = `session ${langClass}`;
    div.style.cssText = `cursor:pointer;position:relative;${cancelled ? 'opacity:0.55;border:2px dashed #dc2626;' : ''}`;
    div.innerHTML = `
        ${hasConflict ? '<div class="conflict-indicator" title="Conflit de salle"><i class="fas fa-exclamation"></i></div>' : ''}
        ${cancelled   ? '<div style="position:absolute;top:4px;right:6px;font-size:10px;color:#dc2626;font-weight:700;">ANNULÉ</div>' : ''}
        <div class="session-time">${normalizeTime(planning.heure_debut)} - ${normalizeTime(planning.heure_fin)}</div>
        <div class="session-group">${groupe?.nom_groupe || 'Groupe #' + planning.groupe}</div>
        <div class="session-room"><i class="fas fa-door-open"></i> ${planning.salle || '—'}</div>`;

    div.addEventListener('click', () => viewPlanning(planning.id));
    return div;
}

// ============================================================
// VIEW SWITCHING
// ============================================================
function switchView(view) {
    state.currentView = view;
    const container = document.querySelector('.week-view');
    container.style.cssText = '';
    renderCalendar();
}

function switchToDayView(date) {
    state.currentDay = new Date(date);
    switchView('jour');
}

// ============================================================
// STYLE HELPERS
// ============================================================
function inp() {
    return `width:100%;padding:10px 14px;border:2px solid #475569 !important;border-radius:8px;
            font-size:0.9rem;outline:none;box-sizing:border-box;font-family:inherit;
            background:#0f172a !important;color:#ffffff !important;`;
}
function sel() { return inp(); }
function lbl() {
    return `font-size:0.875rem;font-weight:600;color:#ffffff !important;display:block;margin-bottom:6px;`;
}

// ============================================================
// VIEW PLANNING MODAL — with Annuler button
// ============================================================
function viewPlanning(planningId) {
    const planning   = state.plannings.find(p => p.id === planningId);
    if (!planning) return;

    const groupe     = state.groupes.find(g => g.id === planning.groupe);
    const enseignant = state.enseignants.find(e => e.id === planning.enseignant);
    const ensNom     = planning.enseignant_nom ||
        (enseignant
            ? (enseignant.nom_complet || `${enseignant.user?.first_name||''} ${enseignant.user?.last_name||''}`.trim())
            : '—');

    const isCancelled = planning.statut_planning === 'Annule';

    removeModal('modal-view');
    const modal = createModalShell('modal-view');
    modal.innerHTML = `
        <div style="background:#0f172a !important;border:2px solid #6366f1 !important;border-radius:16px;
                    padding:2rem;width:90%;max-width:480px;max-height:90vh;overflow-y:auto;
                    color:#ffffff !important;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);"
             onclick="event.stopPropagation()">

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="margin:0;font-size:1.1rem;color:#ffffff !important;">
                    <i class="fas fa-calendar-check" style="color:#6366f1;margin-right:8px;"></i>Détail Séance
                    ${isCancelled ? '<span style="background:#dc2626;color:white;font-size:11px;padding:2px 8px;border-radius:6px;margin-left:8px;">ANNULÉE</span>' : ''}
                </h3>
                <button onclick="removeModal('modal-view')"
                        style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#ffffff !important;">&times;</button>
            </div>

            <div style="display:grid;gap:0.6rem;margin-bottom:1.5rem;">
                ${[
                    ['Groupe',    groupe?.nom_groupe || '—'],
                    ['Langue',    groupe?.langue     || '—'],
                    ['Niveau',    groupe?.niveau     || '—'],
                    ['Jour',      planning.jour],
                    ['Horaire',   `${normalizeTime(planning.heure_debut)} - ${normalizeTime(planning.heure_fin)}`],
                    ['Salle',     planning.salle     || '—'],
                    ['Professeur', ensNom],
                    ['Statut',    planning.statut_planning || '—'],
                ].map(([lb, v]) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;
                                padding:0.65rem 1rem;background:#1e293b !important;
                                border:1px solid #475569 !important;border-radius:8px;">
                        <span style="color:#94a3b8;font-size:.875rem;">${lb}</span>
                        <strong style="font-size:.875rem;text-align:right;max-width:60%;color:#ffffff !important;">${v}</strong>
                    </div>`).join('')}
            </div>

            <!-- ACTION BUTTONS -->
            <div style="display:flex;gap:0.6rem;flex-wrap:wrap;">
                <button onclick="removeModal('modal-view')"
                        style="flex:1;min-width:80px;padding:0.7rem;border:2px solid #475569 !important;
                               background:#1e293b !important;color:#ffffff !important;
                               border-radius:8px;cursor:pointer;font-weight:600;font-size:.85rem;">
                    Fermer
                </button>

                ${!isCancelled ? `
                <button onclick="removeModal('modal-view'); editPlanning(${planning.id});"
                        style="flex:1;min-width:80px;padding:0.7rem;background:#3b82f6 !important;
                               color:#ffffff !important;border:none;border-radius:8px;
                               cursor:pointer;font-weight:600;font-size:.85rem;">
                    <i class="fas fa-edit"></i> Modifier
                </button>

                <button onclick="removeModal('modal-view'); openAnnulationModal(${planning.id});"
                        style="flex:1;min-width:80px;padding:0.7rem;background:#f59e0b !important;
                               color:#ffffff !important;border:none;border-radius:8px;
                               cursor:pointer;font-weight:600;font-size:.85rem;">
                    <i class="fas fa-ban"></i> Annuler
                </button>
                ` : `
                <button onclick="removeModal('modal-view'); restorePlanning(${planning.id});"
                        style="flex:1;min-width:80px;padding:0.7rem;background:#059669 !important;
                               color:#ffffff !important;border:none;border-radius:8px;
                               cursor:pointer;font-weight:600;font-size:.85rem;">
                    <i class="fas fa-undo"></i> Restaurer
                </button>
                `}

                <button onclick="deletePlanning(${planning.id});"
                        style="flex:1;min-width:80px;padding:0.7rem;background:#ef4444 !important;
                               color:#ffffff !important;border:none;border-radius:8px;
                               cursor:pointer;font-weight:600;font-size:.85rem;">
                    <i class="fas fa-trash"></i> Supprimer
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal('modal-view'); });
}

// ============================================================
// ANNULATION MODAL — reason + notify toggles
// ============================================================
function openAnnulationModal(planningId) {
    const planning   = state.plannings.find(p => p.id === planningId);
    if (!planning) return;

    const groupe     = state.groupes.find(g => g.id === planning.groupe);
    const groupeNom  = groupe?.nom_groupe || `Groupe #${planning.groupe}`;
    const enseignant = state.enseignants.find(e => e.id === planning.enseignant);
    const ensNom     = planning.enseignant_nom ||
        (enseignant
            ? (enseignant.nom_complet || `${enseignant.user?.first_name||''} ${enseignant.user?.last_name||''}`.trim())
            : null);

    removeModal('modal-annul');
    const modal = createModalShell('modal-annul');
    modal.innerHTML = `
        <div style="background:#0f172a !important;border:2px solid #f59e0b !important;border-radius:16px;
                    padding:2rem;width:90%;max-width:500px;max-height:90vh;overflow-y:auto;
                    color:#ffffff !important;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);"
             onclick="event.stopPropagation()">

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                <h3 style="margin:0;font-size:1.1rem;color:#ffffff !important;">
                    <i class="fas fa-ban" style="color:#f59e0b;margin-right:8px;"></i>Annuler la Séance
                </h3>
                <button onclick="removeModal('modal-annul')"
                        style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#ffffff !important;">&times;</button>
            </div>

            <!-- Summary -->
            <div style="background:#1e293b;border:1px solid #f59e0b33;border-radius:10px;
                        padding:1rem;margin-bottom:1.25rem;">
                <p style="margin:0 0 4px;color:#94a3b8;font-size:.8rem;">Séance concernée</p>
                <p style="margin:0;color:#ffffff;font-weight:600;">
                    ${groupeNom} — ${planning.jour} ${normalizeTime(planning.heure_debut)}–${normalizeTime(planning.heure_fin)}
                </p>
                ${ensNom ? `<p style="margin:4px 0 0;color:#94a3b8;font-size:.85rem;">Professeur : ${ensNom}</p>` : ''}
            </div>

            <div style="display:grid;gap:1rem;">

                <!-- Reason -->
                <div>
                    <label style="${lbl()}">Motif d'annulation *</label>
                    <select id="ann_motif" style="${sel()}">
                        <option value="">-- Sélectionner le motif --</option>
                        <option value="Maladie de l'enseignant">Maladie de l'enseignant</option>
                        <option value="Absence de l'enseignant">Absence de l'enseignant</option>
                        <option value="Férié / Événement exceptionnel">Férié / Événement exceptionnel</option>
                        <option value="Problème technique / Salle indisponible">Problème technique / Salle indisponible</option>
                        <option value="Nombre insuffisant d'étudiants">Nombre insuffisant d'étudiants</option>
                        <option value="Autre">Autre</option>
                    </select>
                </div>

                <!-- Custom reason if Autre -->
                <div id="ann_autre_wrap" style="display:none;">
                    <label style="${lbl()}">Préciser le motif</label>
                    <input id="ann_autre" type="text" placeholder="Décrivez la raison..."
                           style="${inp()}">
                </div>

                <!-- Message to include in notification -->
                <div>
                    <label style="${lbl()}">Message additionnel (optionnel)</label>
                    <textarea id="ann_message" rows="3" placeholder="Ex: La séance sera rattrapée le..."
                              style="${inp()}min-height:80px;resize:vertical;"></textarea>
                </div>

                <!-- Who to notify -->
                <div style="background:#1e293b;border:1px solid #334155;border-radius:10px;padding:1rem;">
                    <p style="margin:0 0 10px;color:#ffffff;font-weight:600;font-size:.9rem;">
                        <i class="fas fa-bell" style="color:#6366f1;margin-right:6px;"></i>Notifier
                    </p>

                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-bottom:8px;">
                        <div id="toggle_ens" class="notif-toggle ${ensNom ? 'toggle-on' : ''}"
                             onclick="toggleNotif(this)"
                             style="width:44px;height:24px;border-radius:12px;
                                    background:${ensNom ? '#6366f1' : '#334155'};
                                    position:relative;cursor:pointer;transition:background .2s;flex-shrink:0;
                                    ${!ensNom ? 'opacity:0.4;pointer-events:none;' : ''}">
                            <div style="position:absolute;top:2px;left:${ensNom ? '22px' : '2px'};
                                        width:20px;height:20px;border-radius:50%;background:white;
                                        transition:left .2s;" class="toggle-thumb"></div>
                        </div>
                        <div>
                            <span style="color:#ffffff;font-size:.9rem;">L'enseignant</span>
                            ${ensNom
                                ? `<span style="color:#94a3b8;font-size:.8rem;display:block;">${ensNom}</span>`
                                : `<span style="color:#475569;font-size:.8rem;display:block;">(aucun enseignant assigné)</span>`}
                        </div>
                    </label>

                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                        <div id="toggle_etud" class="notif-toggle toggle-on"
                             onclick="toggleNotif(this)"
                             style="width:44px;height:24px;border-radius:12px;background:#6366f1;
                                    position:relative;cursor:pointer;transition:background .2s;flex-shrink:0;">
                            <div style="position:absolute;top:2px;left:22px;
                                        width:20px;height:20px;border-radius:50%;background:white;
                                        transition:left .2s;" class="toggle-thumb"></div>
                        </div>
                        <div>
                            <span style="color:#ffffff;font-size:.9rem;">Les étudiants du groupe</span>
                            <span style="color:#94a3b8;font-size:.8rem;display:block;">${groupeNom}</span>
                        </div>
                    </label>
                </div>

                <!-- Error -->
                <div id="ann_error" style="display:none;padding:.75rem;background:#450a0a;
                     border:1px solid #f87171;border-radius:8px;color:#fca5a5;font-size:.85rem;"></div>

                <!-- Buttons -->
                <div style="display:flex;gap:0.75rem;margin-top:.5rem;">
                    <button type="button" onclick="removeModal('modal-annul')"
                            style="flex:1;padding:.75rem;border:2px solid #475569 !important;
                                   background:#1e293b !important;color:#ffffff !important;
                                   border-radius:8px;cursor:pointer;font-weight:600;">
                        Annuler
                    </button>
                    <button id="btn_confirm_annul"
                            style="flex:1;padding:.75rem;background:#f59e0b !important;
                                   color:#ffffff !important;border:none;border-radius:8px;
                                   cursor:pointer;font-weight:600;">
                        <i class="fas fa-ban"></i> Confirmer l'annulation
                    </button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal('modal-annul'); });

    // Show/hide custom reason field
    document.getElementById('ann_motif').addEventListener('change', function () {
        document.getElementById('ann_autre_wrap').style.display =
            this.value === 'Autre' ? '' : 'none';
    });

    // Confirm button
    document.getElementById('btn_confirm_annul').addEventListener('click', () =>
        confirmAnnulation(planningId, planning, groupe, enseignant)
    );
}

// Toggle notification switch
function toggleNotif(el) {
    const isOn = el.classList.toggle('toggle-on');
    el.style.background = isOn ? '#6366f1' : '#334155';
    const thumb = el.querySelector('.toggle-thumb');
    if (thumb) thumb.style.left = isOn ? '22px' : '2px';
}

// ============================================================
// CONFIRM ANNULATION — patch planning + send notifications
// ============================================================
async function confirmAnnulation(planningId, planning, groupe, enseignant) {
    const errEl  = document.getElementById('ann_error');
    const btn    = document.getElementById('btn_confirm_annul');
    errEl.style.display = 'none';

    const motifSel = document.getElementById('ann_motif').value;
    const motifCustom = document.getElementById('ann_autre').value.trim();
    const message  = document.getElementById('ann_message').value.trim();
    const notifEns  = document.getElementById('toggle_ens')?.classList.contains('toggle-on');
    const notifEtud = document.getElementById('toggle_etud')?.classList.contains('toggle-on');

    const motif = motifSel === 'Autre' ? (motifCustom || 'Autre') : motifSel;

    if (!motif) {
        errEl.textContent    = 'Veuillez sélectionner un motif.';
        errEl.style.display  = 'block';
        return;
    }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Annulation en cours...';
    btn.disabled  = true;

    // ── Step 1: PATCH planning statut → Annule ────────────────
    const patchResult = await apiFetch(`/plannings/${planningId}/`, {
        method: 'PATCH',
        body: JSON.stringify({
            statut_planning:  'Annule',
            notes_planning:   `[ANNULÉ] Motif: ${motif}${message ? '. ' + message : ''}`,
        }),
    });

    if (patchResult?.error) {
        errEl.textContent   = '❌ ' + patchResult.message;
        errEl.style.display = 'block';
        btn.innerHTML       = '<i class="fas fa-ban"></i> Confirmer l\'annulation';
        btn.disabled        = false;
        return;
    }

    // Update local state
    const idx = state.plannings.findIndex(p => p.id === planningId);
    if (idx !== -1) state.plannings[idx] = patchResult;

    // ── Step 2: Build notification content ───────────────────
    const groupeNom = groupe?.nom_groupe || `Groupe #${planning.groupe}`;
    const horaire   = `${normalizeTime(planning.heure_debut)}–${normalizeTime(planning.heure_fin)}`;
    const notifContenu = `La séance du ${planning.jour} (${horaire}) du groupe ${groupeNom} est annulée.` +
        ` Motif : ${motif}.` +
        (message ? ` ${message}` : '');

    const notifTitre = `Séance annulée — ${groupeNom} ${planning.jour}`;

    const notifPromises = [];

    // ── Step 3: Notify enseignant ─────────────────────────────
    if (notifEns && planning.enseignant) {
        // We need the Utilisateur id of the enseignant
        // EnseignantSerializer has user.id nested
        const ensUserId = enseignant?.user?.id;
        if (ensUserId) {
            notifPromises.push(
                apiFetch('/notifications/', {
                    method: 'POST',
                    body: JSON.stringify({
                        utilisateur:        ensUserId,
                        type_notification:  'Planning',
                        titre:              notifTitre,
                        contenu:            notifContenu,
                        canal:              'App',
                        urgent:             true,
                    }),
                })
            );
        }
    }

    // ── Step 4: Notify students in the group ──────────────────
    if (notifEtud && planning.groupe) {
        // Fetch students of the group
        const etudData = await apiFetch(`/etudiants/?groupe=${planning.groupe}`);
        const etudiants = (!etudData?.error && Array.isArray(etudData)) ? etudData : [];

        etudiants.forEach(etud => {
            const etudUserId = etud.user?.id;
            if (!etudUserId) return;
            notifPromises.push(
                apiFetch('/notifications/', {
                    method: 'POST',
                    body: JSON.stringify({
                        utilisateur:        etudUserId,
                        type_notification:  'Planning',
                        titre:              notifTitre,
                        contenu:            notifContenu,
                        canal:              'App',
                        urgent:             true,
                    }),
                })
            );
        });
    }

    // Fire all notifications in parallel
    const notifResults = await Promise.all(notifPromises);
    const notifOk  = notifResults.filter(r => !r?.error).length;
    const notifFail = notifResults.filter(r => r?.error).length;

    removeModal('modal-annul');
    renderCalendar();

    // ── Step 5: Summary toast ────────────────────────────────
    let toastMsg = `✅ Séance annulée (${motif}).`;
    if (notifPromises.length > 0) {
        toastMsg += ` ${notifOk} notification(s) envoyée(s)`;
        if (notifFail > 0) toastMsg += `, ${notifFail} échec(s)`;
        toastMsg += '.';
    }
    showToast(toastMsg, notifFail > 0 ? 'warning' : 'success');
}

// ============================================================
// RESTORE PLANNING (undo cancel)
// ============================================================
async function restorePlanning(planningId) {
    if (!confirm('Restaurer cette séance (la remettre en Planifié) ?')) return;

    const result = await apiFetch(`/plannings/${planningId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ statut_planning: 'Planifie' }),
    });

    if (result?.error) { showToast('❌ ' + result.message, 'error'); return; }

    const idx = state.plannings.findIndex(p => p.id === planningId);
    if (idx !== -1) state.plannings[idx] = result;

    renderCalendar();
    showToast('✅ Séance restaurée.', 'success');
}

// ============================================================
// FILTER MODAL
// ============================================================
function openFilterModal() {
    if (!state.groupes.length)     loadGroupes();
    if (!state.enseignants.length) loadEnseignants();

    const langueOpts = `
        <option value="">Toutes les langues</option>
        <option value="anglais"  ${state.filters.langue==='anglais'  ?'selected':''}>Anglais</option>
        <option value="français" ${state.filters.langue==='français' ?'selected':''}>Français</option>
        <option value="allemand" ${state.filters.langue==='allemand' ?'selected':''}>Allemand</option>
        <option value="espagnol" ${state.filters.langue==='espagnol' ?'selected':''}>Espagnol</option>
        <option value="italien"  ${state.filters.langue==='italien'  ?'selected':''}>Italien</option>`;

    const ensOpts = '<option value="">Tous les enseignants</option>' +
        state.enseignants.map(e => {
            const nom = e.nom_complet ||
                `${e.user?.first_name||''} ${e.user?.last_name||''}`.trim() || `Prof #${e.id}`;
            return `<option value="${e.id}" ${state.filters.enseignant==e.id?'selected':''}>${nom}</option>`;
        }).join('');

    const groupeOpts = '<option value="">Tous les groupes</option>' +
        state.groupes.map(g =>
            `<option value="${g.id}" ${state.filters.groupe==g.id?'selected':''}>${g.nom_groupe}</option>`
        ).join('');

    removeModal('modal-filter');
    const modal = createModalShell('modal-filter');
    modal.innerHTML = `
        <div style="background:#0f172a !important;border:2px solid #6366f1 !important;border-radius:16px;
                    padding:2rem;width:90%;max-width:450px;color:#ffffff !important;
                    box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="margin:0;font-size:1.1rem;color:#ffffff !important;">
                    <i class="fas fa-filter" style="color:#6366f1;margin-right:8px;"></i>Filtrer le Planning
                </h3>
                <button onclick="removeModal('modal-filter')"
                        style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#ffffff !important;">&times;</button>
            </div>
            <div style="display:grid;gap:1rem;">
                <div><label style="${lbl()}">Langue</label><select id="f_langue" style="${sel()}">${langueOpts}</select></div>
                <div><label style="${lbl()}">Enseignant</label><select id="f_ens" style="${sel()}">${ensOpts}</select></div>
                <div><label style="${lbl()}">Salle</label>
                    <input id="f_salle" type="text" placeholder="Ex: Salle 101"
                           value="${state.filters.salle}" style="${inp()}"></div>
                <div><label style="${lbl()}">Groupe</label><select id="f_groupe" style="${sel()}">${groupeOpts}</select></div>
                <div style="display:flex;gap:.75rem;margin-top:.5rem;">
                    <button type="button" onclick="resetFilters()"
                            style="flex:1;padding:.75rem;border:2px solid #475569 !important;
                                   background:#1e293b !important;color:#ffffff !important;
                                   border-radius:8px;cursor:pointer;font-weight:600;">
                        <i class="fas fa-undo"></i> Réinitialiser
                    </button>
                    <button onclick="applyFilters()"
                            style="flex:1;padding:.75rem;background:#6366f1 !important;color:#ffffff !important;
                                   border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                        <i class="fas fa-check"></i> Appliquer
                    </button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal('modal-filter'); });
}

function applyFilters() {
    state.filters.langue     = document.getElementById('f_langue').value;
    state.filters.enseignant = document.getElementById('f_ens').value;
    state.filters.salle      = document.getElementById('f_salle').value.trim();
    state.filters.groupe     = document.getElementById('f_groupe').value;
    removeModal('modal-filter');
    renderCalendar();
    showToast('Filtres appliqués', 'success');
}

function resetFilters() {
    state.filters = { langue:'', enseignant:'', salle:'', groupe:'' };
    removeModal('modal-filter');
    renderCalendar();
    showToast('Filtres réinitialisés', 'info');
}

// ============================================================
// NAVIGATION
// ============================================================
function previousWeek() {
    if (state.currentView === 'jour') state.currentDay.setDate(state.currentDay.getDate() - 1);
    else if (state.currentView === 'mois') state.currentMonth.setMonth(state.currentMonth.getMonth() - 1);
    else state.currentWeek.setDate(state.currentWeek.getDate() - 7);
    refreshCalendar();
}

function nextWeek() {
    if (state.currentView === 'jour') state.currentDay.setDate(state.currentDay.getDate() + 1);
    else if (state.currentView === 'mois') state.currentMonth.setMonth(state.currentMonth.getMonth() + 1);
    else state.currentWeek.setDate(state.currentWeek.getDate() + 7);
    refreshCalendar();
}

async function refreshCalendar() {
    await loadPlannings();
    renderCalendar();
}

// ============================================================
// EDIT PLANNING
// ============================================================
async function editPlanning(planningId) {
    const planning = state.plannings.find(p => p.id === planningId);
    if (!planning) return;

    if (!state.groupes.length)     await loadGroupes();
    if (!state.enseignants.length) await loadEnseignants();

    const groupeOpts = state.groupes.map(g =>
        `<option value="${g.id}" ${g.id===planning.groupe?'selected':''}>
            ${g.nom_groupe} (${g.langue} ${g.niveau})
        </option>`).join('');

    const ensOpts = '<option value="">-- Aucun --</option>' +
        state.enseignants.map(e => {
            const nom = e.nom_complet ||
                `${e.user?.first_name||''} ${e.user?.last_name||''}`.trim() || `Prof #${e.id}`;
            return `<option value="${e.id}" ${e.id===planning.enseignant?'selected':''}>${nom}</option>`;
        }).join('');

    const currentDebut = normalizeTime(planning.heure_debut);
    const currentFin   = normalizeTime(planning.heure_fin);
    const heuresDebut  = ['09:00','11:00','14:00','16:00','18:00'];
    const heuresFin    = ['11:00','13:00','16:00','18:00','20:00'];
    const jours        = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];

    removeModal('modal-edit');
    const modal = createModalShell('modal-edit');
    modal.innerHTML = `
        <div style="background:#0f172a !important;border:2px solid #6366f1 !important;border-radius:16px;
                    padding:2rem;width:90%;max-width:500px;max-height:90vh;overflow-y:auto;
                    color:#ffffff !important;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);"
             onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                <h3 style="margin:0;font-size:1.1rem;color:#ffffff !important;">
                    <i class="fas fa-edit" style="color:#3b82f6;margin-right:8px;"></i>Modifier la Séance
                </h3>
                <button onclick="removeModal('modal-edit')"
                        style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#ffffff !important;">&times;</button>
            </div>
            <div style="display:grid;gap:1rem;">
                <div><label style="${lbl()}">Groupe *</label><select id="e_groupe" style="${sel()}">${groupeOpts}</select></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Jour *</label>
                        <select id="e_jour" style="${sel()}">
                            ${jours.map(j=>`<option value="${j}" ${planning.jour===j?'selected':''}>${j}</option>`).join('')}
                        </select>
                    </div>
                    <div><label style="${lbl()}">Salle *</label>
                        <input id="e_salle" type="text" value="${planning.salle||''}" style="${inp()}">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Heure début *</label>
                        <select id="e_debut" style="${sel()}">
                            ${heuresDebut.map(h=>`<option value="${h}" ${currentDebut===h?'selected':''}>${h}</option>`).join('')}
                        </select>
                    </div>
                    <div><label style="${lbl()}">Heure fin *</label>
                        <select id="e_fin" style="${sel()}">
                            ${heuresFin.map(h=>`<option value="${h}" ${currentFin===h?'selected':''}>${h}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div><label style="${lbl()}">Professeur</label><select id="e_ens" style="${sel()}">${ensOpts}</select></div>
                <div id="editError" style="display:none;padding:.75rem;background:#450a0a;
                     border:1px solid #f87171;border-radius:8px;color:#fca5a5;font-size:.85rem;"></div>
                <div style="display:flex;gap:.75rem;margin-top:.5rem;">
                    <button type="button" onclick="removeModal('modal-edit')"
                            style="flex:1;padding:.75rem;border:2px solid #475569 !important;
                                   background:#1e293b !important;color:#ffffff !important;
                                   border-radius:8px;cursor:pointer;font-weight:600;">Annuler</button>
                    <button id="btnEditSave"
                            style="flex:1;padding:.75rem;background:#3b82f6 !important;color:#ffffff !important;
                                   border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                        <i class="fas fa-save"></i> Enregistrer
                    </button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal('modal-edit'); });

    document.getElementById('btnEditSave').addEventListener('click', async () => {
        const errEl  = document.getElementById('editError');
        const btn    = document.getElementById('btnEditSave');
        errEl.style.display = 'none';

        const groupe = parseInt(document.getElementById('e_groupe').value);
        const jour   = document.getElementById('e_jour').value;
        const salle  = document.getElementById('e_salle').value.trim();
        const hDebut = document.getElementById('e_debut').value;
        const hFin   = document.getElementById('e_fin').value;
        const ensVal = document.getElementById('e_ens').value;

        if (!groupe || !jour || !salle || !hDebut || !hFin) {
            errEl.textContent  = 'Tous les champs * sont obligatoires.';
            errEl.style.display = 'block'; return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled  = true;

        const result = await apiFetch(`/plannings/${planningId}/`, {
            method: 'PUT',
            body: JSON.stringify({
                groupe,
                jour,
                heure_debut:     hDebut,
                heure_fin:       hFin,
                salle,
                enseignant:      ensVal ? parseInt(ensVal) : null,
                statut_planning: planning.statut_planning || 'Planifie',
                recurence:       planning.recurence       || 'Hebdomadaire',
            }),
        });

        if (result?.error) {
            errEl.textContent   = '❌ ' + result.message;
            errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
            btn.disabled  = false;
            return;
        }

        const idx = state.plannings.findIndex(p => p.id === planningId);
        if (idx !== -1) state.plannings[idx] = result;
        removeModal('modal-edit');
        renderCalendar();
        showToast('✅ Séance modifiée !', 'success');
    });
}

// ============================================================
// NEW SESSION MODAL
// ============================================================
async function openNewSessionModal() {
    if (!state.groupes.length)     await loadGroupes();
    if (!state.enseignants.length) await loadEnseignants();

    const groupeOpts = '<option value="">-- Sélectionner --</option>' +
        state.groupes.map(g =>
            `<option value="${g.id}">${g.nom_groupe} (${g.langue} ${g.niveau})</option>`
        ).join('');

    const ensOpts = '<option value="">-- Aucun --</option>' +
        state.enseignants.map(e => {
            const nom = e.nom_complet ||
                `${e.user?.first_name||''} ${e.user?.last_name||''}`.trim() || `Prof #${e.id}`;
            return `<option value="${e.id}">${nom}</option>`;
        }).join('');

    const heuresDebut = ['09:00','11:00','14:00','16:00','18:00'];
    const heuresFin   = ['11:00','13:00','16:00','18:00','20:00'];
    const jours       = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];

    removeModal('modal-new');
    const modal = createModalShell('modal-new');
    modal.innerHTML = `
        <div style="background:#0f172a !important;border:2px solid #6366f1 !important;border-radius:16px;
                    padding:2rem;width:90%;max-width:500px;max-height:90vh;overflow-y:auto;
                    color:#ffffff !important;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);"
             onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                <h3 style="margin:0;font-size:1.1rem;color:#ffffff !important;">
                    <i class="fas fa-plus-circle" style="color:#6366f1;margin-right:8px;"></i>Nouvelle Séance
                </h3>
                <button onclick="removeModal('modal-new')"
                        style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#ffffff !important;">&times;</button>
            </div>
            <div style="display:grid;gap:1rem;">
                <div><label style="${lbl()}">Groupe *</label><select id="n_groupe" style="${sel()}">${groupeOpts}</select></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Jour *</label>
                        <select id="n_jour" style="${sel()}">
                            ${jours.map(j=>`<option value="${j}">${j}</option>`).join('')}
                        </select>
                    </div>
                    <div><label style="${lbl()}">Salle *</label>
                        <input id="n_salle" type="text" placeholder="Salle 101" style="${inp()}">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div><label style="${lbl()}">Heure début *</label>
                        <select id="n_debut" style="${sel()}">
                            ${heuresDebut.map(h=>`<option value="${h}">${h}</option>`).join('')}
                        </select>
                    </div>
                    <div><label style="${lbl()}">Heure fin *</label>
                        <select id="n_fin" style="${sel()}">
                            ${heuresFin.map(h=>`<option value="${h}">${h}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div><label style="${lbl()}">Professeur</label><select id="n_ens" style="${sel()}">${ensOpts}</select></div>
                <div id="newError" style="display:none;padding:.75rem;background:#450a0a;
                     border:1px solid #f87171;border-radius:8px;color:#fca5a5;font-size:.85rem;"></div>
                <div style="display:flex;gap:.75rem;margin-top:.5rem;">
                    <button type="button" onclick="removeModal('modal-new')"
                            style="flex:1;padding:.75rem;border:2px solid #475569 !important;
                                   background:#1e293b !important;color:#ffffff !important;
                                   border-radius:8px;cursor:pointer;font-weight:600;">Annuler</button>
                    <button id="btnNewSave"
                            style="flex:1;padding:.75rem;background:#6366f1 !important;color:#ffffff !important;
                                   border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                        <i class="fas fa-plus"></i> Créer
                    </button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal('modal-new'); });

    document.getElementById('btnNewSave').addEventListener('click', async () => {
        const errEl  = document.getElementById('newError');
        const btn    = document.getElementById('btnNewSave');
        errEl.style.display = 'none';

        const groupe = parseInt(document.getElementById('n_groupe').value);
        const jour   = document.getElementById('n_jour').value;
        const salle  = document.getElementById('n_salle').value.trim();
        const hDebut = document.getElementById('n_debut').value;
        const hFin   = document.getElementById('n_fin').value;
        const ensVal = document.getElementById('n_ens').value;

        if (!groupe) { errEl.textContent = 'Sélectionnez un groupe.'; errEl.style.display='block'; return; }
        if (!salle)  { errEl.textContent = 'La salle est obligatoire.'; errEl.style.display='block'; return; }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';
        btn.disabled  = true;

        const result = await apiFetch('/plannings/', {
            method: 'POST',
            body: JSON.stringify({
                groupe,
                jour,
                heure_debut:     hDebut,
                heure_fin:       hFin,
                salle,
                enseignant:      ensVal ? parseInt(ensVal) : null,
                statut_planning: 'Planifie',
                recurence:       'Hebdomadaire',
            }),
        });

        if (result?.error) {
            errEl.textContent   = '❌ ' + result.message;
            errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-plus"></i> Créer';
            btn.disabled  = false;
            return;
        }

        state.plannings.push(result);
        removeModal('modal-new');
        renderCalendar();
        showToast('✅ Séance créée !', 'success');
    });
}

// ============================================================
// DELETE
// ============================================================
async function deletePlanning(id) {
    if (!confirm('Supprimer définitivement cette séance du planning ?')) return;
    const result = await apiFetch(`/plannings/${id}/`, { method: 'DELETE' });
    if (result?.error) { showToast('❌ ' + result.message, 'error'); return; }
    state.plannings = state.plannings.filter(p => p.id !== id);
    removeModal('modal-view');
    renderCalendar();
    showToast('Séance supprimée.', 'success');
}

// ============================================================
// UTILITIES
// ============================================================
function createModalShell(id) {
    const div = document.createElement('div');
    div.id = id;
    div.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:2000;
                         display:flex;align-items:center;justify-content:center;`;
    return div;
}

function removeModal(id) {
    document.getElementById(id)?.remove();
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;

    const navBtns = document.querySelectorAll('.calendar-nav .nav-btn');
    if (navBtns.length >= 2) {
        navBtns[0].addEventListener('click', e => { e.preventDefault(); previousWeek(); });
        navBtns[1].addEventListener('click', e => { e.preventDefault(); nextWeek(); });
    }

    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            e.preventDefault();
            switchView(btn.textContent.toLowerCase());
        });
    });

    document.querySelector('.btn-secondary')?.addEventListener('click', e => {
        e.preventDefault();
        openFilterModal();
    });

    document.querySelector('.btn-primary')?.addEventListener('click', e => {
        e.preventDefault();
        openNewSessionModal();
    });

    await Promise.all([loadGroupes(), loadEnseignants(), loadPlannings()]);
    renderCalendar();
});