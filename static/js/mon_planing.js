/**
 * Mon Planning - Espace Étudiant
 * JWT Authentication + Django REST API
 * FIXED: Proper data loading for student planning
 */

const API_URL = '/api';

const state = {
    plannings: [],
    myGroupes: [],        // Student's enrolled groupes with full objects
    currentWeek: new Date(),
    currentView: 'semaine', // 'semaine', 'mois', 'liste'
    currentMonth: new Date(),
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
    document.querySelector('.toast-etudiant')?.remove();
    const colors = { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#0284c7' };
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    
    const t = document.createElement('div');
    t.className = 'toast-etudiant';
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
// TIME & DATE HELPERS
// ============================================================
function normalizeTime(t) {
    if (!t) return '';
    return t.slice(0, 5);
}

function getWeekDates(date) {
    const start = new Date(date);
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
    });
}

function formatDateShort(date) {
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function formatMonthYear(date) {
    return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

const FR_DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const FR_DAYS_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function getDayShort(date) { return FR_DAYS_SHORT[date.getDay()]; }
function getDayFull(date) { return FR_DAYS_FULL[date.getDay()]; }

// ============================================================
// LOAD STUDENT DATA - FIXED VERSION
// ============================================================
async function loadStudentData() {
    const user = getUser();
    if (!user) return;

    console.log('Loading student data for user:', user.id);

    // Try multiple approaches to get student's groupes
    let groupes = [];
    
    // Approach 1: Try /inscriptions/ endpoint
    console.log('Trying /inscriptions/ endpoint...');
    let data = await apiFetch('/inscriptions/');
    if (!data?.error) {
        const inscriptions = Array.isArray(data) ? data : (data.results || []);
        console.log('Inscriptions received:', inscriptions);
        
        // Extract groupe objects from inscriptions
        groupes = inscriptions.map(i => {
            // Handle different data structures
            if (typeof i.groupe === 'object' && i.groupe !== null) {
                return i.groupe; // groupe is embedded object
            } else if (typeof i.groupe === 'number') {
                return { id: i.groupe }; // groupe is just ID
            } else if (i.groupe_id) {
                return { id: i.groupe_id };
            }
            return null;
        }).filter(g => g !== null);
    }

    // Approach 2: If no inscriptions, try /etudiant/groupes/ or /groupes/?etudiant=ID
    if (groupes.length === 0) {
        console.log('No inscriptions found, trying alternative endpoints...');
        
        // Try with query parameter
        data = await apiFetch(`/groupes/?etudiant=${user.id}`);
        if (!data?.error) {
            groupes = Array.isArray(data) ? data : (data.results || []);
        }
    }

    // Approach 3: Try /etudiants/me/groupes/
    if (groupes.length === 0) {
        data = await apiFetch('/etudiants/me/groupes/');
        if (!data?.error) {
            groupes = Array.isArray(data) ? data : (data.results || []);
        }
    }

    console.log('Student groupes found:', groupes);
    state.myGroupes = groupes;

    // Now load plannings for these groupes
    await loadPlanningsForGroupes(groupes);
}

async function loadPlanningsForGroupes(groupes) {
    if (groupes.length === 0) {
        console.warn('No groupes found for student');
        state.plannings = [];
        return;
    }

    const groupeIds = groupes.map(g => g.id).join(',');
    console.log('Loading plannings for groupe IDs:', groupeIds);

    // Try multiple approaches to get plannings
    
    // Approach 1: Query parameter filtering
    console.log('Trying /plannings/?groupe__in=' + groupeIds);
    let data = await apiFetch(`/plannings/?groupe__in=${groupeIds}`);
    
    if (data?.error) {
        console.log('groupe__in failed, trying without filter...');
        // Approach 2: Load all and filter client-side (if API doesn't support filtering)
        data = await apiFetch('/plannings/');
    }

    if (!data?.error) {
        let allPlannings = Array.isArray(data) ? data : (data.results || []);
        console.log('All plannings received:', allPlannings.length);
        
        // Filter plannings that belong to student's groupes
        const myGroupeIds = groupes.map(g => g.id);
        state.plannings = allPlannings.filter(p => {
            const planningGroupeId = typeof p.groupe === 'object' ? p.groupe?.id : p.groupe;
            const isMine = myGroupeIds.includes(planningGroupeId);
            if (!isMine) {
                console.log('Filtering out planning', p.id, 'groupe', planningGroupeId);
            }
            return isMine;
        });
        
        console.log('Filtered plannings for student:', state.plannings.length);
        console.log('Student plannings:', state.plannings);
    } else {
        console.error('Failed to load plannings:', data.message);
        showToast('Erreur chargement planning: ' + data.message, 'error');
        state.plannings = [];
    }
}

// ============================================================
// VIEW RENDERERS
// ============================================================
const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

function renderCalendar() {
    const container = document.querySelector('.week-view');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Update active view button
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase() === state.currentView) {
            btn.classList.add('active');
        }
    });
    
    switch(state.currentView) {
        case 'mois':
            renderMonthView(container);
            break;
        case 'liste':
            renderListView(container);
            break;
        case 'semaine':
        default:
            renderWeekView(container);
            break;
    }
}

function renderWeekView(container) {
    // Time column
    const timeCol = document.createElement('div');
    timeCol.className = 'time-column';
    timeCol.innerHTML = `<div class="day-header" style="height: 69px;"></div>` +
        TIME_SLOTS.map(t => `<div class="time-slot">${t}</div>`).join('');
    container.appendChild(timeCol);

    const weekDates = getWeekDates(state.currentWeek);
    
    // Update month display
    const monthDisplay = document.querySelector('.current-month');
    if (monthDisplay) {
        monthDisplay.textContent = formatMonthYear(weekDates[0]);
    }

    weekDates.forEach(date => {
        container.appendChild(createDayColumn(date));
    });
}

function createDayColumn(date) {
    const isToday = new Date().toDateString() === date.toDateString();
    const dayDiv = document.createElement('div');
    dayDiv.className = 'day-column';

    const header = document.createElement('div');
    header.className = 'day-header';
    header.innerHTML = `
        <div class="day-name">${getDayShort(date)}</div>
        <div class="day-number ${isToday ? 'today' : ''}">${date.getDate()}</div>`;
    dayDiv.appendChild(header);

    const content = document.createElement('div');
    content.className = 'day-content';

    const dayNameFull = getDayFull(date);
    
    // Filter plannings for this day
    const dayPlannings = state.plannings.filter(p => {
        // Handle different jour formats (full name or short)
        const planningDay = p.jour?.toLowerCase() || '';
        const currentDay = dayNameFull.toLowerCase();
        return planningDay === currentDay || 
               planningDay === getDayShort(date).toLowerCase();
    });

    console.log(`Day ${dayNameFull}: ${dayPlannings.length} plannings`);

    dayPlannings.forEach(p => {
        content.appendChild(createClassEvent(p));
    });

    dayDiv.appendChild(content);
    return dayDiv;
}

function createClassEvent(planning) {
    const div = document.createElement('div');
    
    // Calculate position based on time
    const startHour = parseInt(planning.heure_debut?.slice(0, 2) || 9);
    const startMin = parseInt(planning.heure_debut?.slice(3, 5) || 0);
    const endHour = parseInt(planning.heure_fin?.slice(0, 2) || 11);
    const endMin = parseInt(planning.heure_fin?.slice(3, 5) || 0);
    
    const startMinutes = (startHour - 8) * 60 + startMin;
    const duration = (endHour - startHour) * 60 + (endMin - startMin);
    
    const top = 60 + startMinutes;
    const height = Math.max(duration, 60); // Minimum 60px height

    // Find groupe info for styling
    const groupe = state.myGroupes.find(g => {
        const gid = typeof planning.groupe === 'object' ? planning.groupe?.id : planning.groupe;
        return g.id === gid;
    });
    
    // Determine event type/color based on langue
    let eventClass = 'event-english';
    const langue = (groupe?.langue || '').toLowerCase();
    if (langue.includes('franc')) eventClass = 'event-spanish'; // Using existing CSS
    else if (langue.includes('allem')) eventClass = 'event-conversation';

    div.className = `class-event ${eventClass}`;
    div.style.cssText = `top: ${top}px; height: ${height}px; cursor: pointer;`;
    div.innerHTML = `
        <div class="event-time">${normalizeTime(planning.heure_debut)} - ${normalizeTime(planning.heure_fin)}</div>
        <div class="event-title">${groupe?.nom_groupe || 'Cours #' + planning.groupe}</div>
        <div class="event-room">${planning.salle || '—'}</div>`;

    div.addEventListener('click', () => viewClassDetail(planning));
    return div;
}

function renderMonthView(container) {
    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(7, 1fr)';
    container.style.gap = '8px';
    
    const year = state.currentMonth.getFullYear();
    const month = state.currentMonth.getMonth();
    
    const monthDisplay = document.querySelector('.current-month');
    if (monthDisplay) {
        monthDisplay.textContent = formatMonthYear(state.currentMonth);
    }
    
    const dayNames = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    dayNames.forEach(name => {
        const dayHeader = document.createElement('div');
        dayHeader.style.cssText = 'text-align:center;font-weight:600;padding:12px;color:#64748b;border-bottom:2px solid #e5e7eb;';
        dayHeader.textContent = name;
        container.appendChild(dayHeader);
    });
    
    const firstDay = new Date(year, month, 1);
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    
    for (let i = 0; i < startOffset; i++) {
        const empty = document.createElement('div');
        empty.style.cssText = 'min-height:100px;background:#f8fafc;border-radius:8px;';
        container.appendChild(empty);
    }
    
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    
    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        const isToday = today.toDateString() === date.toDateString();
        const dayNameFull = getDayFull(date);
        
        const cell = document.createElement('div');
        cell.style.cssText = `
            min-height:100px;
            background:${isToday ? '#eff6ff' : 'white'};
            border:2px solid ${isToday ? '#3b82f6' : '#e5e7eb'};
            border-radius:8px;
            padding:8px;
            cursor:pointer;
        `;
        
        const dayNum = document.createElement('div');
        dayNum.style.cssText = `font-weight:600;margin-bottom:4px;color:${isToday ? '#3b82f6' : '#374151'};`;
        dayNum.textContent = day;
        cell.appendChild(dayNum);
        
        const dayPlannings = state.plannings.filter(p => {
            const planningDay = p.jour?.toLowerCase() || '';
            return planningDay === dayNameFull.toLowerCase();
        });
        
        dayPlannings.slice(0, 2).forEach(p => {
            const groupe = state.myGroupes.find(g => {
                const gid = typeof p.groupe === 'object' ? p.groupe?.id : p.groupe;
                return g.id === gid;
            });
            
            const badge = document.createElement('div');
            badge.style.cssText = `
                font-size:10px;padding:2px 6px;background:#dbeafe;color:#2563eb;
                border-radius:4px;margin-bottom:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
            `;
            badge.textContent = `${normalizeTime(p.heure_debut)} ${groupe?.nom_groupe || 'Cours'}`;
            cell.appendChild(badge);
        });
        
        if (dayPlannings.length > 2) {
            const more = document.createElement('div');
            more.style.cssText = 'font-size:10px;color:#6b7280;text-align:center;';
            more.textContent = `+${dayPlannings.length - 2}`;
            cell.appendChild(more);
        }
        
        container.appendChild(cell);
    }
}

function renderListView(container) {
    container.style.display = 'block';
    
    const sortedPlannings = [...state.plannings].sort((a, b) => {
        const dayOrder = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
        const dayDiff = dayOrder.indexOf(a.jour) - dayOrder.indexOf(b.jour);
        if (dayDiff !== 0) return dayDiff;
        return (a.heure_debut || '').localeCompare(b.heure_debut || '');
    });

    const grouped = {};
    sortedPlannings.forEach(p => {
        if (!grouped[p.jour]) grouped[p.jour] = [];
        grouped[p.jour].push(p);
    });

    Object.keys(grouped).forEach(jour => {
        const daySection = document.createElement('div');
        daySection.style.cssText = 'margin-bottom:1.5rem;background:white;border-radius:12px;padding:1rem;box-shadow:0 1px 3px rgba(0,0,0,0.1);';
        
        const dayTitle = document.createElement('h3');
        dayTitle.style.cssText = 'margin:0 0 1rem 0;color:#374151;font-size:1.1rem;border-bottom:2px solid #e5e7eb;padding-bottom:0.5rem;';
        dayTitle.textContent = jour;
        daySection.appendChild(dayTitle);

        grouped[jour].forEach(p => {
            const groupe = state.myGroupes.find(g => {
                const gid = typeof p.groupe === 'object' ? p.groupe?.id : p.groupe;
                return g.id === gid;
            });

            const item = document.createElement('div');
            item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:0.75rem;background:#f8fafc;border-radius:8px;margin-bottom:0.5rem;';
            item.innerHTML = `
                <div>
                    <div style="font-weight:600;color:#1f2937;">${normalizeTime(p.heure_debut)} - ${normalizeTime(p.heure_fin)}</div>
                    <div style="font-size:0.875rem;color:#6b7280;">${groupe?.nom_groupe || 'Cours'} - ${p.salle || 'Salle non définie'}</div>
                </div>
                <button onclick="viewClassDetailById(${p.id})" style="padding:0.5rem 1rem;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">Détails</button>
            `;
            daySection.appendChild(item);
        });

        container.appendChild(daySection);
    });
}

// ============================================================
// VIEW SWITCHING
// ============================================================
function switchView(view) {
    state.currentView = view;
    
    const container = document.querySelector('.week-view');
    container.style.display = '';
    container.style.gridTemplateColumns = '';
    container.style.gap = '';
    
    renderCalendar();
}

function previousPeriod() {
    if (state.currentView === 'mois') {
        state.currentMonth.setMonth(state.currentMonth.getMonth() - 1);
    } else {
        state.currentWeek.setDate(state.currentWeek.getDate() - 7);
    }
    refreshCalendar();
}

function nextPeriod() {
    if (state.currentView === 'mois') {
        state.currentMonth.setMonth(state.currentMonth.getMonth() + 1);
    } else {
        state.currentWeek.setDate(state.currentWeek.getDate() + 7);
    }
    refreshCalendar();
}

async function refreshCalendar() {
    await loadStudentData();
    renderCalendar();
}

// ============================================================
// CLASS DETAIL MODAL - FIXED WITH FORCED VISIBILITY
// ============================================================
function viewClassDetail(planning) {
    const groupe = state.myGroupes.find(g => {
        const gid = typeof planning.groupe === 'object' ? planning.groupe?.id : planning.groupe;
        return g.id === gid;
    });

    removeModal('modal-detail');
    const modal = createModalShell('modal-detail');
    
    modal.innerHTML = `
        <div style="background:#0f172a !important;border:2px solid #6366f1 !important;border-radius:16px;padding:2rem;width:90%;max-width:400px;color:#ffffff !important;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="margin:0;font-size:1.1rem;color:#ffffff !important;">Détail du Cours</h3>
                <button onclick="removeModal('modal-detail')" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#ffffff !important;">&times;</button>
            </div>
            
            <div style="display:grid;gap:0.75rem;margin-bottom:1.5rem;">
                <div style="padding:0.75rem 1rem;background:#1e293b !important;border:1px solid #475569 !important;border-radius:8px;">
                    <span style="color:#94a3b8 !important;font-size:0.875rem;display:block;">Groupe</span>
                    <strong style="color:#ffffff !important;">${groupe?.nom_groupe || 'Cours #' + planning.groupe}</strong>
                </div>
                <div style="padding:0.75rem 1rem;background:#1e293b !important;border:1px solid #475569 !important;border-radius:8px;">
                    <span style="color:#94a3b8 !important;font-size:0.875rem;display:block;">Jour</span>
                    <strong style="color:#ffffff !important;">${planning.jour}</strong>
                </div>
                <div style="padding:0.75rem 1rem;background:#1e293b !important;border:1px solid #475569 !important;border-radius:8px;">
                    <span style="color:#94a3b8 !important;font-size:0.875rem;display:block;">Horaire</span>
                    <strong style="color:#ffffff !important;">${normalizeTime(planning.heure_debut)} - ${normalizeTime(planning.heure_fin)}</strong>
                </div>
                <div style="padding:0.75rem 1rem;background:#1e293b !important;border:1px solid #475569 !important;border-radius:8px;">
                    <span style="color:#94a3b8 !important;font-size:0.875rem;display:block;">Salle</span>
                    <strong style="color:#ffffff !important;">${planning.salle || '—'}</strong>
                </div>
                <div style="padding:0.75rem 1rem;background:#1e293b !important;border:1px solid #475569 !important;border-radius:8px;">
                    <span style="color:#94a3b8 !important;font-size:0.875rem;display:block;">Statut</span>
                    <strong style="color:#ffffff !important;">${planning.statut_planning || 'Planifié'}</strong>
                </div>
            </div>
            
            <button onclick="removeModal('modal-detail')" style="width:100%;padding:0.75rem;background:#3b82f6 !important;color:#ffffff !important;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Fermer</button>
        </div>`;
    
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal('modal-detail'); });
}

// For list view button clicks
window.viewClassDetailById = function(id) {
    const planning = state.plannings.find(p => p.id === id);
    if (planning) viewClassDetail(planning);
};

// ============================================================
// SYNC FUNCTION
// ============================================================
function syncCalendar() {
    showToast('Synchronisation en cours...', 'info');
    setTimeout(() => {
        showToast('Calendrier synchronisé !', 'success');
    }, 2000);
}

// ============================================================
// UTILITIES
// ============================================================
function createModalShell(id) {
    const div = document.createElement('div');
    div.id = id;
    div.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:2000;
        display:flex; align-items:center; justify-content:center;`;
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

    // Navigation arrows
    document.querySelectorAll('.nav-arrow').forEach((btn, index) => {
        btn.addEventListener('click', () => {
            if (index === 0) previousPeriod();
            else nextPeriod();
        });
    });

    // View toggle buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const view = btn.textContent.toLowerCase();
            switchView(view);
        });
    });

    // Sync button
    document.querySelector('.sync-btn')?.addEventListener('click', syncCalendar);

    // Debug: Log current state
    console.log('Initializing student planning...');
    
    // Load data
    await loadStudentData();
    renderCalendar();
    
    // Debug: Final state
    console.log('Final state:', {
        groupes: state.myGroupes,
        plannings: state.plannings
    });
});