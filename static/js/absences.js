/**
 * Gestion des Absences - Enseignant
 * JWT Authentication + Django REST API
 *
 * ALERT FLOW:
 *   When saveAttendance() POSTs a new absence with statut_absence='Absent',
 *   the backend (AbsenceListCreateView.post) automatically:
 *     1. Counts total 'Absent' records for that student
 *     2. If count > seuil (default 3 from ParametreSysteme):
 *        - Sends urgent notification to the student
 *        - Sends urgent notification to the parent (if exists)
 *   The frontend shows a local warning banner via checkAbsenceAlert()
 *   as immediate visual feedback BEFORE the save (optimistic UI).
 *
 * SAVE LOGIC:
 *   - Only POST/PUT records where statut != 'Present'
 *     (present is the default — no DB row needed unless changing FROM absent)
 *   - If a record already exists in DB (state.savedIds), always PUT to update it
 *   - unique_together(etudiant, seance) is respected by checking savedIds first
 */

const API_URL = '/api';

const state = {
    etudiants:  [],    // list of students in the group
    seance:     null,  // today's session object
    groupe:     null,  // current group object
    absences:   {},    // { etudiantId: 'Present'|'Absent'|'Retard'|'Justifie' }
    savedIds:   {},    // { etudiantId: absenceId } — already in DB
    saving:     false,
    absenceCounts: {}, // { etudiantId: number } — cached from API
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
// API WRAPPER
// ============================================================
async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });

        if (res.status === 401) { window.location.href = '/login/'; return { error: 'JWT_INVALID' }; }
        if (res.status === 403) return { error: 'FORBIDDEN',     message: 'Accès refusé.' };
        if (res.status === 204) return { success: true };
        if (!res.ok) {
            let msg = `Erreur ${res.status}`;
            try { const d = await res.json(); msg = d.detail || d.error || JSON.stringify(d); } catch {}
            return { error: 'API_ERROR', message: msg };
        }

        const ct = res.headers.get('content-type') || '';
        return ct.includes('application/json') ? await res.json() : await res.text();

    } catch (e) {
        console.error('Network error:', e);
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
    if (!['Enseignant', 'Dirigeant'].includes(user.role)) { window.location.href = '/login/'; return null; }
    return user;
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
    document.querySelector('.toast-abs')?.remove();
    const colors = { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#0284c7' };
    const icons  = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };

    const t = document.createElement('div');
    t.className = 'toast-abs';
    t.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:9999;
        padding:14px 22px; border-radius:12px;
        background:${colors[type]}; color:white;
        font-weight:500; font-size:0.9rem;
        box-shadow:0 8px 24px rgba(0,0,0,0.2);
        display:flex; align-items:center; gap:8px;
        transform:translateX(120%); opacity:0;
        transition:all 0.3s ease;`;
    t.innerHTML = `<span>${icons[type]}</span>${message}`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; t.style.opacity = '1'; });
    setTimeout(() => {
        t.style.transform = 'translateX(120%)'; t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 3500);
}

// ============================================================
// PAGE ALERT BANNER
// ============================================================
function showAlert(message, type = 'warning') {
    const container = document.getElementById('alertContainer');
    if (!container) return;

    const colors     = { warning: '#fef3c7', error: '#fee2e2', success: '#d1fae5', info: '#dbeafe' };
    const textColors = { warning: '#92400e', error: '#991b1b', success: '#065f46', info: '#1e40af' };
    const emojis     = { warning: '⚠️', error: '❌', success: '✅', info: 'ℹ️' };

    const alert = document.createElement('div');
    alert.style.cssText = `
        margin-top:1rem; padding:1rem 1.25rem; border-radius:12px;
        background:${colors[type]}; color:${textColors[type]};
        font-weight:500; display:flex; align-items:center; gap:0.75rem;
        animation:fadeInDown 0.3s ease;`;
    alert.innerHTML = `
        <span style="font-size:1.2rem;">${emojis[type]}</span>
        <span>${message}</span>
        <button onclick="this.parentElement.remove()"
                style="margin-left:auto; background:none; border:none; cursor:pointer;
                       font-size:1.1rem; color:${textColors[type]};">×</button>`;
    container.appendChild(alert);
    setTimeout(() => alert?.remove(), 8000);
}

// ============================================================
// DATE INFO
// ============================================================
function fillDateInfo() {
    const now   = new Date();
    const jours = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
    const mois  = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

    const el = (id) => document.getElementById(id);
    if (el('currentDay'))     el('currentDay').textContent     = now.getDate();
    if (el('currentMonth'))   el('currentMonth').textContent   = mois[now.getMonth()];
    if (el('currentWeekday')) el('currentWeekday').textContent = jours[now.getDay()];

    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((now - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
    if (el('currentWeek')) el('currentWeek').textContent = `Semaine ${weekNum}`;
}

// ============================================================
// LOAD GROUP + TODAY'S SESSION
// ============================================================
async function loadGroupeAndSeance() {
    const urlParams = new URLSearchParams(window.location.search);
    const groupeId  = urlParams.get('groupe');

    const groupes = await apiFetch('/groupes/?statut=Actif');
    if (groupes?.error || !Array.isArray(groupes) || groupes.length === 0) {
        const list = Array.isArray(groupes) ? groupes : [];
        if (document.getElementById('groupName'))
            document.getElementById('groupName').textContent = 'Aucun groupe actif';
        if (document.getElementById('sessionDetails'))
            document.getElementById('sessionDetails').textContent = 'Assignez un groupe d\'abord';
        showAlert('Vous n\'avez aucun groupe actif assigné.', 'warning');
        return;
    }

    state.groupe = groupeId
        ? (groupes.find(g => g.id == groupeId) || groupes[0])
        : groupes[0];

    if (document.getElementById('groupName'))
        document.getElementById('groupName').textContent = state.groupe.nom_groupe;

    // Populate group selector if it exists in the HTML
    const selector = document.getElementById('groupeSelector');
    if (selector) {
        selector.innerHTML = groupes.map(g =>
            `<option value="${g.id}" ${g.id === state.groupe.id ? 'selected' : ''}>
                ${g.nom_groupe}
             </option>`
        ).join('');
        selector.addEventListener('change', async (e) => {
            state.groupe = groupes.find(g => g.id == e.target.value) || state.groupe;
            state.savedIds  = {};
            state.absences  = {};
            state.absenceCounts = {};
            await loadSeanceForGroupe();
            await loadEtudiants();
        });
    }

    await loadSeanceForGroupe();
    await loadEtudiants();
}

async function loadSeanceForGroupe() {
    const today   = new Date().toISOString().split('T')[0];
    const seances = await apiFetch(`/seances/?groupe=${state.groupe.id}`);

    if (!seances?.error && Array.isArray(seances) && seances.length) {
        // Prefer today's session; fall back to the most recent one
        state.seance = seances.find(s => s.date_seance === today) || seances[0];
        if (document.getElementById('sessionDetails'))
            document.getElementById('sessionDetails').textContent =
                `${state.seance.heure_debut?.slice(0,5)} → ${state.seance.heure_fin?.slice(0,5)} • Salle ${state.seance.salle}`;
    } else {
        state.seance = null;
        if (document.getElementById('sessionDetails'))
            document.getElementById('sessionDetails').textContent = 'Aucune séance pour aujourd\'hui';
        showAlert(
            'Aucune séance enregistrée pour aujourd\'hui. ' +
            'Vous pouvez quand même saisir les présences, elles seront rattachées manuellement.',
            'info'
        );
    }
}

// ============================================================
// LOAD STUDENTS
// ============================================================
async function loadEtudiants() {
    const list = document.getElementById('studentList');
    if (list) {
        list.innerHTML = `
            <div style="text-align:center; padding:3rem;">
                <div style="width:50px; height:50px; border:4px solid #e2e8f0;
                            border-top-color:#667eea; border-radius:50%;
                            animation:spin 1s linear infinite; margin:0 auto 1rem;"></div>
                <p style="color:#64748b;">Chargement des étudiants...</p>
            </div>`;
    }

    const data = await apiFetch(`/etudiants/?groupe=${state.groupe.id}`);

    if (data?.error) {
        if (list) list.innerHTML = `
            <div style="text-align:center; padding:3rem; color:#dc2626;">
                <div style="font-size:2rem; margin-bottom:0.5rem;">⚠️</div>
                <p>${data.message}</p>
                <button onclick="loadEtudiants()"
                        style="margin-top:1rem; padding:8px 16px; background:#667eea;
                               color:white; border:none; border-radius:8px; cursor:pointer;">
                    Réessayer
                </button>
            </div>`;
        return;
    }

    state.etudiants = Array.isArray(data) ? data : (data.results || []);

    if (document.getElementById('totalStudents'))
        document.getElementById('totalStudents').textContent = state.etudiants.length;

    // Default everyone to Present
    state.etudiants.forEach(e => {
        if (!state.absences[e.id]) state.absences[e.id] = 'Present';
    });

    // Load existing absence records for this session
    if (state.seance) await loadExistingAbsences();

    // Pre-fetch absence counts for all students (for alert badge display)
    await loadAllAbsenceCounts();

    renderStudentList();
    updateStats();
}

// ============================================================
// LOAD EXISTING ABSENCES FROM DB (to pre-fill the UI)
// ============================================================
async function loadExistingAbsences() {
    if (!state.seance) return;

    const data = await apiFetch(`/absences/?seance=${state.seance.id}`);
    if (data?.error || !Array.isArray(data)) return;

    data.forEach(abs => {
        // abs.etudiant is the FK integer id
        state.absences[abs.etudiant] = abs.statut_absence;
        state.savedIds[abs.etudiant] = abs.id;
    });
}

// ============================================================
// PRE-FETCH TOTAL ABSENCE COUNTS FOR ALL STUDENTS
// This lets us show the badge BEFORE saving (optimistic warning)
// ============================================================
async function loadAllAbsenceCounts() {
    // Run all requests in parallel for speed
    await Promise.all(
        state.etudiants.map(async (e) => {
            const data = await apiFetch(`/absences/?etudiant=${e.id}&statut=Absent`);
            state.absenceCounts[e.id] = data?.error ? 0 : (Array.isArray(data) ? data.length : 0);
        })
    );
}

// ============================================================
// RENDER STUDENT LIST
// ============================================================
function renderStudentList() {
    const list = document.getElementById('studentList');
    if (!list) return;

    if (!state.etudiants.length) {
        list.innerHTML = `
            <div style="text-align:center; padding:3rem; color:#64748b;">
                <div style="font-size:2.5rem; margin-bottom:0.5rem;">👥</div>
                <p>Aucun étudiant dans ce groupe.</p>
            </div>`;
        return;
    }

    list.innerHTML = state.etudiants.map(e => {
        const nom      = e.user?.nom_complet || `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.trim();
        const initials = nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
        const statut   = state.absences[e.id] || 'Present';
        const count    = state.absenceCounts[e.id] || 0;

        // Show warning badge if student already has 3+ absences
        const alertBadge = count >= 3
            ? `<span title="${count} absences enregistrées"
                     style="background:#dc2626; color:white; font-size:0.7rem;
                            font-weight:700; padding:2px 8px; border-radius:99px;
                            margin-left:8px;">
                   ⚠ ${count} absences
               </span>`
            : '';

        return `
            <div class="student-item" id="student-${e.id}" data-student="${e.id}">
                <div class="student-info">
                    <div class="student-avatar">
                        ${initials}
                    </div>
                    <div>
                        <h4 style="font-size:0.95rem; font-weight:600; color:#1e293b; margin-bottom:4px;">
                            ${nom}${alertBadge}
                        </h4>
                        <span style="font-size:0.8rem; color:#64748b;">
                            Niveau ${e.niveau_actuel} •
                            Assiduité ${parseFloat(e.taux_assiduité ?? 100).toFixed(0)}%
                        </span>
                    </div>
                </div>

                <div class="attendance-buttons">
                    ${renderButtons(e.id, statut)}
                </div>
            </div>`;
    }).join('');

    // Apply row background colours
    state.etudiants.forEach(e => applyRowStyle(e.id, state.absences[e.id]));
}

// ============================================================
// RENDER STATUS BUTTONS FOR ONE STUDENT
// ============================================================
function renderButtons(etudiantId, statut) {
    const btns = [
        { val: 'Present',  label: '✅ Présent',  color: '#059669' },
        { val: 'Absent',   label: '❌ Absent',   color: '#dc2626' },
        { val: 'Retard',   label: '⏰ Retard',   color: '#d97706' },
        { val: 'Justifie', label: '📝 Justifié', color: '#2563eb' },
    ];

    return btns.map(b => {
        const active = statut === b.val;
        return `
            <button
                onclick="setStatut(${etudiantId}, '${b.val}')"
                style="
                    padding:8px 14px; border-radius:8px;
                    border:2px solid ${b.color};
                    background:${active ? b.color : 'white'};
                    color:${active ? 'white' : b.color};
                    font-size:0.8rem; font-weight:600;
                    cursor:pointer; transition:all 0.2s ease; white-space:nowrap;">
                ${b.label}
            </button>`;
    }).join('');
}

// ============================================================
// SET STATUS FOR ONE STUDENT
// ============================================================
function setStatut(etudiantId, statut) {
    const previous = state.absences[etudiantId];
    state.absences[etudiantId] = statut;

    // Optimistic count update for alert badge
    if (statut === 'Absent' && previous !== 'Absent') {
        state.absenceCounts[etudiantId] = (state.absenceCounts[etudiantId] || 0) + 1;
    } else if (statut !== 'Absent' && previous === 'Absent') {
        state.absenceCounts[etudiantId] = Math.max(0, (state.absenceCounts[etudiantId] || 1) - 1);
    }

    // Re-render only this student's row
    const row = document.getElementById(`student-${etudiantId}`);
    if (row) {
        row.querySelector('.attendance-buttons').innerHTML = renderButtons(etudiantId, statut);
        applyRowStyle(etudiantId, statut);

        // Update alert badge inline
        const count = state.absenceCounts[etudiantId] || 0;
        const h4    = row.querySelector('h4');
        if (h4) {
            // Remove existing badge
            h4.querySelector('span[title]')?.remove();
            if (count >= 3) {
                const badge = document.createElement('span');
                badge.title = `${count} absences enregistrées`;
                badge.style.cssText = 'background:#dc2626; color:white; font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:99px; margin-left:8px;';
                badge.textContent = `⚠ ${count} absences`;
                h4.appendChild(badge);
            }
        }
    }

    // Show local page alert if student hits threshold
    checkAbsenceAlert(etudiantId, statut);

    updateStats();
}

// ============================================================
// LOCAL ALERT CHECK (optimistic, before save)
// Real backend notifications fire automatically on POST /absences/
// ============================================================
function checkAbsenceAlert(etudiantId, statut) {
    if (statut !== 'Absent') return;

    const count    = state.absenceCounts[etudiantId] || 0;
    const etudiant = state.etudiants.find(e => e.id === etudiantId);
    const nom      = etudiant?.user?.nom_complet
        || `${etudiant?.user?.first_name || ''} ${etudiant?.user?.last_name || ''}`.trim()
        || 'Cet étudiant';

    // Seuil = 3 (mirrors ParametreSysteme 'LIMITE_ABSENCES' default in backend)
    if (count >= 3) {
        showAlert(
            `<strong>${nom}</strong> cumule <strong>${count} absences</strong>. ` +
            `Une notification urgente sera envoyée à l'étudiant, au parent et au dirigeant lors de la sauvegarde.`,
            'warning'
        );
    }
}

// ============================================================
// ROW BACKGROUND COLOUR
// ============================================================
function applyRowStyle(etudiantId, statut) {
    const row = document.getElementById(`student-${etudiantId}`);
    if (!row) return;

    const borders = { Present: '#059669', Absent: '#dc2626', Retard: '#d97706', Justifie: '#2563eb' };
    const bgs     = { Present: '#f0fdf4', Absent: '#fef2f2', Retard: '#fffbeb', Justifie: '#eff6ff' };

    row.style.borderLeft = `4px solid ${borders[statut] || '#e2e8f0'}`;
    row.style.background = bgs[statut] || 'white';
}

// ============================================================
// UPDATE STAT COUNTERS
// ============================================================
function updateStats() {
    const counts = { Present: 0, Absent: 0, Retard: 0, Justifie: 0 };
    Object.values(state.absences).forEach(s => { if (s in counts) counts[s]++; });

    const el = (cls) => document.querySelector(`.${cls}`);
    if (el('present-count'))   el('present-count').textContent   = counts.Present;
    if (el('absent-count'))    el('absent-count').textContent    = counts.Absent;
    if (el('late-count'))      el('late-count').textContent      = counts.Retard;
    if (el('justified-count')) el('justified-count').textContent = counts.Justifie;
}

// ============================================================
// SAVE ABSENCES
// ============================================================
async function saveAttendance() {
    if (state.saving) return;
    if (!state.seance) {
        showToast('Aucune séance trouvée. Créez d\'abord une séance pour ce groupe.', 'warning');
        return;
    }
    if (!state.etudiants.length) {
        showToast('Aucun étudiant à enregistrer.', 'warning');
        return;
    }

    state.saving = true;
    const btn = document.querySelector('.btn-save');
    if (btn) { btn.textContent = '⏳ Enregistrement...'; btn.disabled = true; }

    const today   = new Date().toISOString().split('T')[0];
    let success   = 0;
    let errors    = 0;
    const alertsTriggered = []; // collect names that crossed the threshold

    for (const etudiant of state.etudiants) {
        const statut    = state.absences[etudiant.id] || 'Present';
        const absenceId = state.savedIds[etudiant.id];

        // ── Decision logic ──────────────────────────────────────────────
        //
        // Case 1: No DB record yet AND student is Present
        //   → Skip. No need to store a "Present" row; Present is the default.
        //
        // Case 2: No DB record yet AND student is NOT Present (Absent/Retard/Justifie)
        //   → POST new absence record.
        //   → Backend will check total absences and send notifications if > seuil.
        //
        // Case 3: DB record exists (absenceId) AND statut changed to Present
        //   → DELETE the record (student was previously absent but now corrected).
        //
        // Case 4: DB record exists AND statut is still non-Present
        //   → PUT to update (e.g. Absent → Justifie).
        //
        // ────────────────────────────────────────────────────────────────

        let result;

        if (!absenceId && statut === 'Present') {
            // Case 1 — nothing to do
            success++;
            continue;
        }

        if (!absenceId && statut !== 'Present') {
            // Case 2 — POST
            result = await apiFetch('/absences/', {
                method: 'POST',
                body: JSON.stringify({
                    etudiant:       etudiant.id,
                    seance:         state.seance.id,
                    statut_absence: statut,
                    date_absence:   today,
                }),
            });

            if (!result?.error) {
                state.savedIds[etudiant.id] = result.id;

                // Backend already sends notifications automatically.
                // We collect names here for a summary toast.
                if (statut === 'Absent') {
                    const newCount = (state.absenceCounts[etudiant.id] || 0);
                    if (newCount >= 3) {
                        const nom = etudiant.user?.nom_complet
                            || `${etudiant.user?.first_name || ''} ${etudiant.user?.last_name || ''}`.trim();
                        alertsTriggered.push(nom);
                    }
                }
            }

        } else if (absenceId && statut === 'Present') {
            // Case 3 — DELETE (student was corrected to Present)
            result = await apiFetch(`/absences/${absenceId}/`, { method: 'DELETE' });
            if (!result?.error) {
                delete state.savedIds[etudiant.id];
            }

        } else {
            // Case 4 — PUT (update existing record)
            result = await apiFetch(`/absences/${absenceId}/`, {
                method: 'PUT',
                body: JSON.stringify({
                    etudiant:       etudiant.id,
                    seance:         state.seance.id,
                    statut_absence: statut,
                    date_absence:   today,
                }),
            });
        }

        if (result?.error) {
            console.error(`Erreur étudiant ${etudiant.id}:`, result.message);
            errors++;
        } else {
            success++;
        }
    }

    state.saving = false;
    if (btn) { btn.textContent = '💾 Enregistrer'; btn.disabled = false; }

    if (errors === 0) {
        showToast(`✓ ${success} présences enregistrées avec succès !`, 'success');
    } else {
        showToast(`${success} enregistrés — ${errors} erreur(s). Vérifiez la console.`, 'warning');
    }

    // Summary alert for students who triggered the absence threshold
    if (alertsTriggered.length > 0) {
        showAlert(
            `🔔 Notifications urgentes envoyées pour : <strong>${alertsTriggered.join(', ')}</strong> ` +
            `(seuil de 3 absences dépassé). Étudiant, parent et dirigeant ont été notifiés.`,
            'warning'
        );
    }
}

// ============================================================
// MARK ALL SHORTCUT
// ============================================================
function markAll(statut) {
    state.etudiants.forEach(e => setStatut(e.id, statut));
    showToast(`Tous marqués comme ${statut}`, 'info');
}

// ============================================================
// PDF EXPORT
// ============================================================
function generatePDF() {
    if (!state.etudiants.length) {
        showToast('Aucune donnée à exporter.', 'warning');
        return;
    }

    const today  = new Date().toLocaleDateString('fr-DZ');
    const groupe = state.groupe?.nom_groupe || 'Groupe';
    const seance = state.seance
        ? `${state.seance.heure_debut?.slice(0,5)} → ${state.seance.heure_fin?.slice(0,5)}`
        : 'Séance du jour';

    const counts = { Present: 0, Absent: 0, Retard: 0, Justifie: 0 };
    Object.values(state.absences).forEach(s => { if (s in counts) counts[s]++; });

    const icons = { Present: '✅', Absent: '❌', Retard: '⏰', Justifie: '📝' };

    const rows = state.etudiants.map(e => {
        const nom    = e.user?.nom_complet || `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.trim();
        const statut = state.absences[e.id] || 'Present';
        const count  = state.absenceCounts[e.id] || 0;
        const warn   = count >= 3 ? `<span style="color:#dc2626; font-size:0.75rem;"> ⚠ ${count} abs.</span>` : '';
        return `
            <tr>
                <td>${nom}${warn}</td>
                <td>Niveau ${e.niveau_actuel}</td>
                <td style="text-align:center;">${icons[statut] || '—'} ${statut}</td>
            </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="UTF-8">
            <title>Présences — ${groupe} — ${today}</title>
            <style>
                body  { font-family:'Segoe UI',sans-serif; padding:2rem; color:#1e293b; }
                h1    { font-size:1.5rem; color:#667eea; margin-bottom:0.25rem; }
                p     { color:#64748b; font-size:0.9rem; margin-bottom:1.5rem; }
                table { width:100%; border-collapse:collapse; margin-top:1rem; }
                th    { background:#667eea; color:white; padding:10px 14px; text-align:left; font-size:0.875rem; }
                td    { padding:10px 14px; border-bottom:1px solid #e2e8f0; font-size:0.875rem; }
                tr:nth-child(even) td { background:#f8fafc; }
                .summary { display:flex; gap:1.5rem; margin-bottom:1.5rem; flex-wrap:wrap; }
                .sum-item { padding:10px 16px; border-radius:8px; font-weight:700; font-size:0.875rem; }
                .s-p { background:#d1fae5; color:#065f46; }
                .s-a { background:#fee2e2; color:#991b1b; }
                .s-r { background:#fef3c7; color:#92400e; }
                .s-j { background:#dbeafe; color:#1e40af; }
                @media print { button { display:none !important; } }
            </style>
        </head>
        <body>
            <h1>📅 Feuille de Présence — ${groupe}</h1>
            <p>${seance} • ${today}</p>
            <div class="summary">
                <div class="sum-item s-p">✅ Présents: ${counts.Present}</div>
                <div class="sum-item s-a">❌ Absents: ${counts.Absent}</div>
                <div class="sum-item s-r">⏰ Retards: ${counts.Retard}</div>
                <div class="sum-item s-j">📝 Justifiés: ${counts.Justifie}</div>
            </div>
            <table>
                <thead>
                    <tr>
                        <th>Nom complet</th>
                        <th>Niveau</th>
                        <th style="text-align:center;">Statut</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            <div style="margin-top:2rem; border-top:1px solid #e2e8f0; padding-top:1rem;
                        color:#94a3b8; font-size:0.8rem;">
                Généré le ${today} • Centre de Langues
            </div>
            <script>window.onload = () => window.print();<\/script>
        </body>
        </html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
    else showToast('Activez les popups pour générer le PDF.', 'warning');
}

// ============================================================
// INJECT STYLES
// ============================================================
(function injectStyles() {
    if (document.getElementById('abs-extra-styles')) return;
    const s = document.createElement('style');
    s.id = 'abs-extra-styles';
    s.textContent = `
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        @keyframes fadeInDown {
            from { opacity:0; transform:translateY(-10px); }
            to   { opacity:1; transform:translateY(0); }
        }
        .student-item {
            border-left:4px solid #e2e8f0;
            background:white;
            border-radius:12px;
            margin-bottom:10px;
            padding:1rem 1.25rem;
            display:flex;
            align-items:center;
            justify-content:space-between;
            transition:all 0.2s ease;
        }
        .student-item .student-info {
            display:flex; align-items:center; gap:1rem;
        }
        .student-avatar {
            width:50px; height:50px; border-radius:50%;
            background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);
            display:flex; align-items:center; justify-content:center;
            color:white; font-weight:700; font-size:1rem; flex-shrink:0;
        }
        .attendance-buttons {
            display:flex; gap:8px; flex-wrap:wrap;
        }
        @media (max-width:640px) {
            .student-item {
                flex-direction:column;
                align-items:flex-start;
                gap:0.75rem;
            }
        }
    `;
    document.head.appendChild(s);
})();

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;

    fillDateInfo();
    await loadGroupeAndSeance();
});