/**
 * dashboard_parent.js
 * Full parent dashboard — real data from Django REST API
 */

'use strict';

// ── Auth ──────────────────────────────────────────────────────────────────────
function getToken() {
    return localStorage.getItem('access') || sessionStorage.getItem('access') ||
           localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || null;
}
function getUser() {
    try { return JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user')); }
    catch { return null; }
}
function authHeaders() {
    const t = getToken();
    const h = { 'Content-Type': 'application/json' };
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
}
async function apiFetch(endpoint) {
    try {
        const res = await fetch('/api' + endpoint, { headers: authHeaders() });
        if (res.status === 401) { window.location.href = '/login/'; return null; }
        if (!res.ok) return null;
        return res.json();
    } catch (_) { return null; }
}

// ── Check session ─────────────────────────────────────────────────────────────
function checkSession() {
    const token = getToken(), user = getUser();
    if (!token || !user) { window.location.href = '/login/'; return null; }
    if (!['Parent','Dirigeant'].includes(user.role)) { window.location.href = '/login/'; return null; }
    return user;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(s) {
    if (!s) return '—';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function initials(name) {
    return (name || '??').split(' ').filter(Boolean).map(w=>w[0]).join('').toUpperCase().slice(0,2);
}
function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'short' });
}
function timeAgo(d) {
    if (!d) return '';
    const diff = (Date.now() - new Date(d)) / 1000;
    if (diff < 60)    return 'À l\'instant';
    if (diff < 3600)  return `${Math.floor(diff/60)} min`;
    if (diff < 86400) return `${Math.floor(diff/3600)} h`;
    return `${Math.floor(diff/86400)} j`;
}

// ── Sidebar user info ─────────────────────────────────────────────────────────
function fillUser(user) {
    const name  = user.nom_complet || `${user.first_name||''} ${user.last_name||''}`.trim() || 'Parent';
    const email = user.email || '';
    const init  = initials(name);

    const nameEl  = document.getElementById('parentName');
    const emailEl = document.getElementById('parentEmail');
    const avatEl  = document.getElementById('parentAvatar');
    if (nameEl)  nameEl.textContent  = name;
    if (emailEl) emailEl.textContent = email;
    if (avatEl)  avatEl.textContent  = init;

    // Header date
    const dateEl = document.getElementById('headerDate');
    if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString('fr-FR', {
            weekday:'long', day:'numeric', month:'long', year:'numeric'
        });
    }
}

// ── State ─────────────────────────────────────────────────────────────────────
let activeEtudiantId = null;
let allEtudiants     = [];

// ── Load children (etudiants of this parent) ──────────────────────────────────
async function loadChildren() {
    const data = await apiFetch('/etudiants/');
    const tabs  = document.getElementById('childrenTabs');
    if (!tabs) return;

    const etudiants = Array.isArray(data) ? data : [];
    allEtudiants    = etudiants;

    if (!etudiants.length) {
        tabs.innerHTML = `<div class="empty-state"><i class="fas fa-user-graduate"></i>Aucun enfant trouvé.</div>`;
        return;
    }

    const colors = [
        'linear-gradient(135deg,#3b82f6,#06b6d4)',
        'linear-gradient(135deg,#ec4899,#f472b6)',
        'linear-gradient(135deg,#10b981,#34d399)',
        'linear-gradient(135deg,#f59e0b,#f97316)',
    ];

    tabs.innerHTML = etudiants.map((e, i) => {
        const nom   = e.user ? `${e.user.first_name||''} ${e.user.last_name||''}`.trim() : `Étudiant #${e.id}`;
        const level = e.niveau_actuel || '—';
        const init  = initials(nom);
        const color = colors[i % colors.length];
        return `
            <button class="child-tab ${i===0?'active':''}"
                    data-id="${e.id}" onclick="selectChild(${e.id}, this)">
                <div class="child-avatar" style="background:${color};">${init}</div>
                <div>
                    <div class="child-name">${esc(nom)}</div>
                    <div class="child-level">Niveau ${esc(level)}</div>
                </div>
            </button>`;
    }).join('');

    // Select first child
    if (etudiants[0]) selectChild(etudiants[0].id, tabs.querySelector('.child-tab'));
}

window.selectChild = function(etudiantId, btnEl) {
    activeEtudiantId = etudiantId;
    document.querySelectorAll('.child-tab').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    loadChildData(etudiantId);
};

// ── Load all data for a specific child ───────────────────────────────────────
async function loadChildData(etudiantId) {
    // Reset loading states
    ['notesContainer','absencesContainer','planningContainer','messagesContainer','cefrBar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div style="text-align:center;padding:1.5rem;color:#64748b;">
            <i class="fas fa-spinner fa-spin"></i>
        </div>`;
    });

    // Fetch in parallel
    const [notes, absences, planning, messages, paiements] = await Promise.all([
        apiFetch(`/notes/?etudiant=${etudiantId}`),
        apiFetch(`/absences/?etudiant=${etudiantId}`),
        apiFetch('/plannings/'),
        apiFetch('/messages/'),
        apiFetch(`/paiements/?etudiant=${etudiantId}`),
    ]);

    const etudiant = allEtudiants.find(e => e.id === etudiantId);

    renderKPIs(etudiant, notes, absences, paiements);
    renderNotes(notes);
    renderAbsences(absences);
    renderPlanning(planning, etudiant);
    renderMessages(messages);
    renderCEFR(etudiant);
}

// ── KPI Cards ─────────────────────────────────────────────────────────────────
function renderKPIs(etudiant, notes, absences, paiements) {
    // Moyenne
    const moyEl = document.getElementById('statMoyenne');
    const moyChg = document.getElementById('statMoyenneChange');
    if (moyEl) {
        const arr = Array.isArray(notes) ? notes : [];
        if (arr.length) {
            const avg = arr.reduce((s,n) => s + parseFloat(n.note_obtenue||0), 0) / arr.length;
            moyEl.textContent = avg.toFixed(1) + '/20';
            moyChg.textContent = arr.length + ' note(s) enregistrée(s)';
            moyChg.className   = 'stat-change ' + (avg >= 14 ? 'up' : '');
        } else {
            moyEl.textContent  = '—';
            moyChg.textContent = 'Aucune note';
        }
    }

    // Niveau
    const niveauEl  = document.getElementById('statNiveau');
    const niveauChg = document.getElementById('statNiveauChange');
    if (niveauEl && etudiant) {
        niveauEl.textContent  = etudiant.niveau_actuel || '—';
        niveauChg.textContent = etudiant.groupe_nom    ? `Groupe: ${etudiant.groupe_nom}` : 'Progression normale';
    }

    // Assiduité
    const assEl  = document.getElementById('statAssiduite');
    const absEl  = document.getElementById('statAbsences');
    if (assEl) {
        const arr   = Array.isArray(absences) ? absences : [];
        const nbAbs = arr.filter(a => a.statut_absence === 'Absent').length;
        const total = Math.max(arr.length, 1);
        const taux  = Math.max(0, 100 - (nbAbs / total * 100)).toFixed(0);
        assEl.textContent = taux + '%';
        absEl.textContent = `${nbAbs} absence(s) enregistrée(s)`;
        absEl.className   = 'stat-change ' + (nbAbs > 3 ? '' : 'up');
    }

    // Paiement
    const payEl  = document.getElementById('statPaiement');
    const payChg = document.getElementById('statPaiementChange');
    if (payEl) {
        const arr    = Array.isArray(paiements) ? paiements : [];
        const impaye = arr.find(p => p.statut_paiement === 'Impaye');
        if (impaye) {
            payEl.textContent  = '⚠️ Impayé';
            payEl.style.color  = '#f87171';
            payChg.textContent = `Solde: ${parseFloat(impaye.montant_du||0).toLocaleString('fr-FR')} DA`;
            payChg.className   = 'stat-change';
        } else if (arr.length) {
            payEl.textContent  = '✓ À jour';
            payEl.style.color  = '#34d399';
            payChg.textContent = 'Aucun impayé';
            payChg.className   = 'stat-change up';
        } else {
            payEl.textContent  = '—';
            payChg.textContent = 'Aucun paiement';
        }
    }
}

// ── Notes ─────────────────────────────────────────────────────────────────────
function renderNotes(data) {
    const el = document.getElementById('notesContainer');
    if (!el) return;
    const notes = Array.isArray(data) ? data.slice(0, 6) : [];
    if (!notes.length) {
        el.innerHTML = `<div class="empty-state"><i class="fas fa-clipboard"></i>Aucune note disponible.</div>`;
        return;
    }
    el.innerHTML = notes.map(n => {
        const val      = parseFloat(n.note_obtenue || 0);
        const max      = parseFloat(n.note_max || 20);
        const pct      = Math.round(val/max*100);
        const cls      = val >= 14 ? 'note-good' : val >= 10 ? 'note-mid' : 'note-low';
        const evalTitre = n.evaluation_titre || n.evaluation?.titre || 'Évaluation';
        return `
            <div class="note-row">
                <div>
                    <div style="color:#e2e8f0;font-size:.875rem;font-weight:600;">${esc(evalTitre)}</div>
                    <div style="color:#64748b;font-size:.75rem;margin-top:2px;">${fmtDate(n.date_note||n.date_creation)}</div>
                </div>
                <div style="display:flex;align-items:center;gap:.75rem;">
                    <div style="width:60px;height:5px;background:rgba(255,255,255,.08);border-radius:3px;">
                        <div style="width:${pct}%;height:100%;border-radius:3px;
                            background:${val>=14?'#10b981':val>=10?'#3b82f6':'#ef4444'};"></div>
                    </div>
                    <span class="note-pill ${cls}">${val}/${max}</span>
                </div>
            </div>`;
    }).join('');
}

// ── Absences ──────────────────────────────────────────────────────────────────
function renderAbsences(data) {
    const el     = document.getElementById('absencesContainer');
    const totEl  = document.getElementById('absTotal');
    if (!el) return;
    const abs = Array.isArray(data) ? data : [];
    const nbAbs  = abs.filter(a => a.statut_absence === 'Absent').length;
    if (totEl) {
        totEl.textContent = `${nbAbs} abs.`;
        totEl.style.background = nbAbs > 3 ? 'rgba(239,68,68,.2)' : 'rgba(16,185,129,.15)';
        totEl.style.color      = nbAbs > 3 ? '#f87171'            : '#34d399';
    }
    const recent = abs.slice(0, 5);
    if (!recent.length) {
        el.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle" style="color:#10b981;opacity:1;"></i>
            Aucune absence enregistrée.</div>`;
        return;
    }
    el.innerHTML = recent.map(a => {
        const isAbsent = a.statut_absence === 'Absent';
        const color    = isAbsent ? '#f87171' : '#34d399';
        const bg       = isAbsent ? 'rgba(239,68,68,.12)' : 'rgba(16,185,129,.12)';
        return `
            <div class="absence-row" style="background:${bg};border-color:${color}33;">
                <div>
                    <div style="color:#e2e8f0;font-size:.875rem;font-weight:600;">
                        ${esc(a.seance_date || fmtDate(a.date_absence))}
                    </div>
                    <div style="color:#64748b;font-size:.75rem;">${esc(a.raison||'')}</div>
                </div>
                <span style="background:${bg};color:${color};padding:3px 10px;
                    border-radius:20px;font-size:.75rem;font-weight:700;">
                    ${esc(a.statut_absence||'—')}
                </span>
            </div>`;
    }).join('');
}

// ── Planning ──────────────────────────────────────────────────────────────────
function renderPlanning(data, etudiant) {
    const el = document.getElementById('planningContainer');
    if (!el) return;
    const jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
    const plan  = Array.isArray(data) ? data : [];

    // Filter by group if possible
    const groupeId = etudiant?.groupe || etudiant?.groupe_id;
    const filtered = groupeId ? plan.filter(p => p.groupe === groupeId || p.groupe_id === groupeId) : plan.slice(0,5);

    if (!filtered.length) {
        el.innerHTML = `<div class="empty-state"><i class="fas fa-calendar"></i>Aucun planning trouvé.</div>`;
        return;
    }

    el.innerHTML = filtered.slice(0,5).map(p => {
        const jourStr = jours[parseInt(p.jour)] || p.jour || '—';
        const heure   = p.heure_debut ? p.heure_debut.substring(0,5) : '—';
        const heureFin= p.heure_fin   ? p.heure_fin.substring(0,5)   : '';
        return `
            <div class="planning-row">
                <span class="planning-day">${jourStr}</span>
                <div style="flex:1;">
                    <div style="color:#e2e8f0;font-size:.875rem;font-weight:600;">
                        ${esc(p.groupe_nom||p.groupe_niveau||'Cours')}
                    </div>
                    <div style="color:#64748b;font-size:.75rem;">${heure}${heureFin?' - '+heureFin:''} • ${esc(p.salle||'')}</div>
                </div>
                <i class="fas fa-chevron-right" style="color:#64748b;font-size:.7rem;"></i>
            </div>`;
    }).join('');
}

// ── Messages ──────────────────────────────────────────────────────────────────
function renderMessages(data) {
    const el    = document.getElementById('messagesContainer');
    const badge = document.getElementById('msgBadgeNav');
    if (!el) return;
    const msgs    = Array.isArray(data) ? data : [];
    const nonLus  = msgs.filter(m => !m.lu).length;
    if (badge) {
        badge.textContent  = nonLus;
        badge.style.display = nonLus > 0 ? 'inline-block' : 'none';
    }
    const recent = msgs.slice(0, 4);
    if (!recent.length) {
        el.innerHTML = `<div class="empty-state"><i class="fas fa-envelope"></i>Aucun message.</div>`;
        return;
    }
    const myId = getUser()?.id;
    el.innerHTML = recent.map(m => {
        const isSent  = String(m.expediteur) === String(myId);
        const nomOther= isSent ? (m.destinataire_nom||'Destinataire') : (m.expediteur_nom||'Expéditeur');
        const isUnread = !m.lu && !isSent;
        return `
            <div class="msg-row" onclick="window.location.href='{% url 'messagerie_parent' %}'">
                <div class="msg-avatar">${initials(nomOther)}</div>
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span style="color:#e2e8f0;font-size:.875rem;font-weight:${isUnread?'700':'500'};">
                            ${esc(nomOther)}
                        </span>
                        <span style="color:#64748b;font-size:.72rem;">${timeAgo(m.date_envoi)}</span>
                    </div>
                    <div style="color:#94a3b8;font-size:.78rem;white-space:nowrap;overflow:hidden;
                                text-overflow:ellipsis;margin-top:2px;">
                        ${isSent?'Vous: ':''}${esc((m.contenu||m.sujet||'').substring(0,50))}
                    </div>
                </div>
                ${isUnread ? `<span style="width:8px;height:8px;background:#6366f1;border-radius:50%;flex-shrink:0;"></span>` : ''}
            </div>`;
    }).join('');
}

// ── CEFR Progress Bar ─────────────────────────────────────────────────────────
function renderCEFR(etudiant) {
    const el    = document.getElementById('cefrBar');
    if (!el) return;
    const levels  = ['A1','A2','B1','B2','C1','C2'];
    const current = etudiant?.niveau_actuel || 'A1';
    const curIdx  = levels.indexOf(current);

    el.innerHTML = levels.map((lvl, i) => {
        const isDone    = i < curIdx;
        const isCurrent = i === curIdx;
        const cls       = isDone ? 'cefr-done' : isCurrent ? 'cefr-current' : 'cefr-future';
        const connector = i < levels.length - 1
            ? `<div class="cefr-connector ${i < curIdx ? 'done' : ''}"></div>` : '';
        return `
            <div class="cefr-step">
                <div class="cefr-circle ${cls}">
                    ${isDone ? '✓' : lvl}
                    ${isCurrent ? `<span style="position:absolute;top:-6px;right:-6px;
                        background:#f59e0b;color:#fff;font-size:.55rem;font-weight:700;
                        padding:1px 5px;border-radius:8px;">Actuel</span>` : ''}
                </div>
                <span style="font-size:.72rem;color:${isCurrent?'#fbbf24':isDone?'#818cf8':'#64748b'};
                    font-weight:${isCurrent?'700':'500'};">${lvl}</span>
            </div>
            ${connector}`;
    }).join('');
}

// ── Load message count for nav badge ─────────────────────────────────────────
async function loadMsgCount() {
    const data  = await apiFetch('/messages/');
    const badge = document.getElementById('msgBadgeNav');
    if (!badge || !Array.isArray(data)) return;
    const myId   = getUser()?.id;
    const nonLus = data.filter(m => !m.lu && String(m.destinataire) === String(myId)).length;
    badge.textContent  = nonLus;
    badge.style.display = nonLus > 0 ? 'inline-block' : 'none';
}

// ── Logout ────────────────────────────────────────────────────────────────────
function setupLogout() {
    document.getElementById('logoutLink')?.addEventListener('click', async e => {
        e.preventDefault();
        const refresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh');
        if (refresh) {
            await fetch('/api/auth/logout/', {
                method:'POST', headers: authHeaders(),
                body: JSON.stringify({ refresh }),
            }).catch(()=>{});
        }
        localStorage.clear(); sessionStorage.clear();
        window.location.href = '/login/';
    });
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;

    setupLogout();
    fillUser(user);
    await loadChildren();
    loadMsgCount();
});