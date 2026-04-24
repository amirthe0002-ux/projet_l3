/**
 * Profil Étudiant - JWT Authentication
 * File: static/js/profil_etd.js
 * FIXED — field names match EtudiantSerializer exactly
 */

const API_URL = '/api';

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
// SESSION
// ============================================================
function checkSession() {
    const token = getToken();
    const user  = getUser();
    if (!token || !user) { window.location.href = '/login/'; return null; }
    if (!['Etudiant', 'Dirigeant'].includes(user.role)) { window.location.href = '/login/'; return null; }
    return user;
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
    document.querySelector('.toast-profil')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-profil';
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
// SKELETON
// ============================================================
function skeleton(w = '80px', h = '1.2rem') {
    return `<span style="display:inline-block;width:${w};height:${h};
        background:linear-gradient(90deg,#e2e8f0 25%,#cbd5e1 50%,#e2e8f0 75%);
        background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:6px;">&nbsp;</span>`;
}
if (!document.getElementById('profil-shimmer')) {
    const s = document.createElement('style');
    s.id = 'profil-shimmer';
    s.textContent = `
        @keyframes shimmer { to { background-position: -200% 0; } }
        @keyframes fadeIn  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .fade-in { animation: fadeIn 0.4s ease forwards; }
    `;
    document.head.appendChild(s);
}

// ============================================================
// FORMAT HELPERS
// ============================================================
function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-DZ', { day:'numeric', month:'long', year:'numeric' });
}
function calculateAge(dateStr) {
    if (!dateStr) return '—';
    const birth = new Date(dateStr);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
    return age;
}
function formatCurrency(amount) {
    if (!amount && amount !== 0) return '—';
    return `${parseInt(amount).toLocaleString('fr-DZ')} DA`;
}
function setText(sel, val, isQuery = true) {
    const el = isQuery ? document.querySelector(sel) : document.getElementById(sel);
    if (el) el.textContent = val;
}

// ============================================================
// CHARGER ÉTUDIANT
// /api/etudiants/ filtered server-side for Etudiant role
// EtudiantSerializer fields used here:
//   user.first_name, user.last_name, user.email
//   date_naissance, genre, niveau_actuel, statut_etudiant
//   moyenne_generale, taux_assiduité
//   groupe (FK int), groupe_nom (flat)
//   parent (FK int), parent_id, parent_nom, parent_email,
//   parent_tel, parent_relation  ← all flat from serializer
// ============================================================
async function loadEtudiant(user) {
    const data = await apiFetch('/etudiants/');
    if (data?.error || !Array.isArray(data) || !data.length) return null;
    // Backend filters by role=Etudiant, so first result is the logged-in student
    return data.find(e => e.user?.email === user.email) || data[0];
}

// ============================================================
// 1. HEADER PROFIL
// ============================================================
function fillProfileHeader(user, etudiant) {
    const prenom   = user.first_name || '';
    const nom      = user.last_name  || '';
    const initials = `${prenom[0] || ''}${nom[0] || ''}`.toUpperCase();

    // niveau_actuel is a direct field on Etudiant model
    const niveau  = etudiant.niveau_actuel || 'A1';
    const statut  = etudiant.statut_etudiant || 'Actif';
    // groupe_nom is exposed by EtudiantSerializer.get_groupe_nom()
    const groupe  = etudiant.groupe_nom || '—';

    const avatar = document.querySelector('.avatar-section .avatar');
    if (avatar) avatar.textContent = initials;

    const h1 = document.querySelector('.info-text h1');
    if (h1) h1.textContent = `${prenom} ${nom}`;

    const subtitle = document.querySelector('.subtitle');
    if (subtitle) subtitle.textContent = `Étudiant — Niveau ${niveau}`;

    const badges = document.querySelectorAll('.badges .badge');
    if (badges[0]) badges[0].textContent = statut;
    if (badges[1]) badges[1].textContent = niveau;
    if (badges[2]) {
        badges[2].textContent = groupe;
    }
}

// ============================================================
// 2. INFORMATIONS PERSONNELLES
// ============================================================
function fillInfosPersonnelles(user, etudiant) {
    const card = document.querySelector('.left-column .card:first-child');
    if (!card) return;

    const age = calculateAge(etudiant.date_naissance);

    // Map label text → value
    // user fields come from UtilisateurSerializer nested inside EtudiantSerializer
    const data = {
        'ID Étudiant':        `ETU${String(etudiant.id || 0).padStart(4, '0')}`,
        'Nom Complet':        `${user.first_name} ${user.last_name}`,
        'Date de Naissance':  etudiant.date_naissance
                                ? `${formatDate(etudiant.date_naissance)} (${age} ans)`
                                : '—',
        'Email':              user.email || '—',
        // telephone comes from Utilisateur.telephone via UtilisateurSerializer
        'Téléphone':          etudiant.user?.telephone || '—',
        'Adresse':            etudiant.user?.adresse   || '—',
    };

    card.querySelectorAll('.info-row').forEach(row => {
        const label   = row.querySelector('.label')?.textContent?.trim();
        const valueEl = row.querySelector('.value');
        if (label && valueEl && data[label] !== undefined) {
            valueEl.textContent = data[label];
        }
    });

    card.classList.add('fade-in');
}

// ============================================================
// 3. INFORMATIONS PARENT
// EtudiantSerializer exposes flat fields:
//   parent_id, parent_nom, parent_email, parent_tel, parent_relation
// ============================================================
function fillParentInfo(etudiant) {
    const card = document.querySelector('.left-column .card:last-child');
    if (!card) return;

    const parentAvatar  = card.querySelector('.parent-avatar');
    const parentName    = card.querySelector('.parent-info h4');
    const parentDetails = card.querySelectorAll('.parent-info p');

    // Use the flat fields from EtudiantSerializer
    const nom      = etudiant.parent_nom      || null;
    const email    = etudiant.parent_email    || '—';
    const tel      = etudiant.parent_tel      || '—';
    const relation = etudiant.parent_relation || 'Parent';

    if (!nom) {
        if (parentName) parentName.textContent = 'Non renseigné';
        if (parentAvatar) parentAvatar.textContent = '—';
        return;
    }

    // Build initials from parent_nom (e.g. "Ahmed Bensalem" → "AB")
    const parts    = nom.trim().split(' ');
    const initials = parts.length >= 2
        ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
        : nom[0].toUpperCase();

    if (parentAvatar) parentAvatar.textContent = initials;
    if (parentName)   parentName.textContent   = nom;

    if (parentDetails[0]) parentDetails[0].innerHTML = `<i class="fas fa-user"></i> ${relation}`;
    if (parentDetails[1]) parentDetails[1].innerHTML = `<i class="fas fa-phone"></i> ${tel}`;
    if (parentDetails[2]) parentDetails[2].innerHTML = `<i class="fas fa-envelope"></i> ${email}`;

    card.classList.add('fade-in');
}

// ============================================================
// 4. INFORMATIONS ACADÉMIQUES
// ============================================================
async function fillInfosAcademiques(etudiant) {
    const card = document.querySelector('.right-column .card:first-child');
    if (!card) return;

    const niveau  = etudiant.niveau_actuel || 'A1';
    const groupe  = etudiant.groupe_nom    || '—';
    const moyenne = parseFloat(etudiant.moyenne_generale || 0);

    // Fetch groupe details to get enseignant name
    // etudiant.groupe is the raw FK integer from EtudiantSerializer
    let prof = '—';
    const groupeId = etudiant.groupe;
    if (groupeId) {
        const groupeData = await apiFetch(`/groupes/${groupeId}/`);
        // GroupeSerializer exposes enseignant_nom as flat field via get_enseignant_nom()
        if (!groupeData?.error) {
            prof = groupeData.enseignant_nom || '—';
        }
    }

    const statValues = card.querySelectorAll('.stat-value');
    if (statValues[0]) statValues[0].textContent = '—';       // langue not in serializer
    if (statValues[1]) statValues[1].textContent = niveau;
    if (statValues[2]) statValues[2].textContent = groupe;
    if (statValues[3]) statValues[3].textContent = prof;

    // Progression vers niveau suivant
    const niveaux = ['A1', 'A2', 'B1', 'B2', 'C1'];
    const idx     = niveaux.indexOf(niveau);
    const next    = idx < niveaux.length - 1 ? niveaux[idx + 1] : '—';

    // Map niveau → score range out of 20
    const seuils = { A1:[0,5], A2:[5,10], B1:[10,13], B2:[13,16], C1:[16,20] };
    const [min, max] = seuils[niveau] || [10, 13];
    const pct = max > min
        ? Math.min(100, Math.max(0, Math.round(((moyenne - min) / (max - min)) * 100)))
        : 0;

    const progressFill = card.querySelector('.progress-fill');
    const progressText = card.querySelector('.progress-section h4');
    const progressInfo = card.querySelectorAll('.progress-info span');

    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressText) progressText.textContent  = `Progression vers ${next}`;
    if (progressInfo[0]) progressInfo[0].textContent = `${pct}% complété`;
    if (progressInfo[1]) progressInfo[1].textContent = `Estimation: ${Math.max(1, Math.ceil((100 - pct) / 10))} mois restants`;

    card.classList.add('fade-in');
}

// ============================================================
// 5. RÉSUMÉ NOTES (circular chart)
// NoteSerializer fields: note_obtenue, note_max, evaluation_type
// ============================================================
async function fillResumeNotes(etudiant) {
    const card = document.querySelector('.right-column .card:nth-child(2)');
    if (!card) return;

    const gradeValue = card.querySelector('.grade-value');
    if (gradeValue) gradeValue.innerHTML = skeleton('50px', '2rem');

    // /api/notes/ filtered server-side for Etudiant role
    const notes = await apiFetch('/notes/');
    const notesList = (!notes?.error && Array.isArray(notes)) ? notes : [];

    // Fallback to moyenne_generale from etudiant object
    if (!notesList.length) {
        const moy = parseFloat(etudiant.moyenne_generale || 0);
        if (gradeValue) gradeValue.textContent = moy.toFixed(1);
        const circleFill = card.querySelector('.circle-fill');
        if (circleFill) circleFill.setAttribute('stroke-dasharray', `${(moy / 20) * 100}, 100`);
        card.classList.add('fade-in');
        return;
    }

    // Group by evaluation_type (flat field from NoteSerializer)
    const byType = {};
    notesList.forEach(n => {
        const t    = n.evaluation_type || 'Ecrit';
        const val  = parseFloat(n.note_obtenue || 0);
        const max  = parseFloat(n.note_max || 20);
        if (!byType[t]) byType[t] = { total: 0, max: 0, count: 0 };
        byType[t].total += val;
        byType[t].max   += max;
        byType[t].count++;
    });

    const avg = (t) => byType[t]?.count
        ? byType[t].total / byType[t].count
        : null;

    const ecrit          = avg('Ecrit')         ?? parseFloat(etudiant.moyenne_generale || 0);
    const oral           = avg('Oral')           ?? ecrit;
    const comprehension  = avg('Comprehension')  ?? ecrit;
    const participation  = avg('Participation')  ?? ecrit;

    const filled = [ecrit, oral, comprehension, participation].filter(v => v !== null);
    const moy    = filled.reduce((a, b) => a + b, 0) / filled.length;

    if (gradeValue) { gradeValue.textContent = moy.toFixed(1); gradeValue.classList.add('fade-in'); }

    const circleFill = card.querySelector('.circle-fill');
    if (circleFill) circleFill.setAttribute('stroke-dasharray', `${(moy / 20) * 100}, 100`);

    const gradeItems = card.querySelectorAll('.grade-item span:last-child');
    if (gradeItems[0]) gradeItems[0].textContent = `Écrit: ${ecrit.toFixed(1)}/20`;
    if (gradeItems[1]) gradeItems[1].textContent = `Oral: ${oral.toFixed(1)}/20`;
    if (gradeItems[2]) gradeItems[2].textContent = `Compréhension: ${comprehension.toFixed(1)}/20`;
    if (gradeItems[3]) gradeItems[3].textContent = `Participation: ${participation.toFixed(1)}/20`;

    card.classList.add('fade-in');
}

// ============================================================
// 6. ASSIDUITÉ
// taux_assiduité is a direct field on Etudiant model
// AbsenceSerializer fields: statut_absence, date_absence
// ============================================================
async function fillAssiduite(etudiant) {
    const card = document.querySelector('.right-column .card:nth-child(3)');
    if (!card) return;

    const attNumbers = card.querySelectorAll('.att-number');
    attNumbers.forEach(n => n.innerHTML = skeleton('30px'));

    const absences    = await apiFetch('/absences/');
    const absenceList = (!absences?.error && Array.isArray(absences)) ? absences : [];

    let present  = 0;
    let absent   = 0;
    let justifie = 0;
    let retard   = 0;

    if (absenceList.length) {
        // statut_absence uses exact model choices: Present, Absent, Justifie, Retard
        present  = absenceList.filter(a => a.statut_absence === 'Present').length;
        absent   = absenceList.filter(a => a.statut_absence === 'Absent').length;
        justifie = absenceList.filter(a => a.statut_absence === 'Justifie').length;
        retard   = absenceList.filter(a => a.statut_absence === 'Retard').length;
    } else {
        // Fallback: use taux_assiduité from etudiant (direct model field)
        const taux = parseFloat(etudiant.taux_assiduité ?? etudiant.taux_assiduite ?? 100);
        if (attNumbers[3]) {
            attNumbers[3].textContent = `${taux.toFixed(0)}%`;
            if (taux < 80) attNumbers[3].style.color = '#dc2626';
            else if (taux >= 95) attNumbers[3].style.color = '#10b981';
        }
        if (attNumbers[0]) attNumbers[0].textContent = '—';
        if (attNumbers[1]) attNumbers[1].textContent = '—';
        if (attNumbers[2]) attNumbers[2].textContent = '—';
        card.classList.add('fade-in');
        return;
    }

    const total = present + absent + justifie + retard;
    const taux  = total > 0 ? Math.round((present / total) * 100) : 100;

    if (attNumbers[0]) attNumbers[0].textContent = present;
    if (attNumbers[1]) attNumbers[1].textContent = absent;
    if (attNumbers[2]) attNumbers[2].textContent = retard;
    if (attNumbers[3]) {
        attNumbers[3].textContent = `${taux}%`;
        if (taux < 80)  attNumbers[3].style.color = '#dc2626';
        if (taux >= 95) attNumbers[3].style.color = '#10b981';
    }

    card.classList.add('fade-in');
}

// ============================================================
// 7. PAIEMENTS
// PaiementSerializer fields: montant_du, montant_paye, solde,
//   statut_paiement, date_paiement, periode
// ============================================================
async function fillPaiements(etudiant) {
    const card = document.querySelector('.right-column .card:last-child');
    if (!card) return;

    const paiements    = await apiFetch('/paiements/');
    const paiementList = (!paiements?.error && Array.isArray(paiements)) ? paiements : [];

    const now    = new Date();
    const moisLabel = now.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
    const moisCap   = moisLabel.charAt(0).toUpperCase() + moisLabel.slice(1);

    // Find current month payment
    const current = paiementList.find(p => {
        if (!p.date_paiement) return false;
        const d = new Date(p.date_paiement);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });

    const isPaid = current
        ? current.statut_paiement === 'Paye'
        : false;

    const montant = current?.montant_paye ?? current?.montant_du ?? '—';
    const dateP   = current?.date_paiement ? formatDate(current.date_paiement) : '—';

    // Update status card
    const statusCard  = card.querySelector('.payment-status-card');
    const statusIcon  = statusCard?.querySelector('.status-icon i');
    const statusTitle = statusCard?.querySelector('h4');
    const statusDesc  = statusCard?.querySelector('p');
    const statusBadge = statusCard?.querySelector('.status-badge');

    if (statusCard)  statusCard.className  = `payment-status-card ${isPaid ? 'paid' : 'unpaid'}`;
    if (statusIcon)  statusIcon.className  = `fas ${isPaid ? 'fa-check-circle' : 'fa-exclamation-circle'}`;
    if (statusBadge) { statusBadge.textContent = isPaid ? 'Payé' : 'Non Payé'; statusBadge.className = `status-badge ${isPaid ? 'paid' : 'unpaid'}`; }
    if (statusTitle) statusTitle.textContent = `Mensualité ${moisCap}`;
    if (statusDesc)  statusDesc.textContent  = isPaid
        ? `${formatCurrency(montant)} — Payé le ${dateP}`
        : `${formatCurrency(montant)} — En attente de paiement`;

    // Payment history — last 3
    const historyContainer = card.querySelector('.payment-history');
    if (historyContainer) {
        let html = '<h4>Historique des paiements</h4>';

        if (paiementList.length) {
            paiementList.slice(0, 3).forEach(p => {
                // statut_paiement model choices: Paye, Partiellement_paye, Impaye
                const paid = p.statut_paiement === 'Paye';
                html += `
                <div class="payment-item">
                    <span>${p.periode || formatDate(p.date_paiement)}</span>
                    <span style="color:${paid ? '#059669' : '#dc2626'};">
                        ${formatCurrency(p.montant_paye)} ${paid ? '✓' : '✗'}
                    </span>
                </div>`;
            });
        } else {
            html += '<p style="color:#94a3b8;font-size:.9rem;">Aucun historique disponible</p>';
        }

        historyContainer.innerHTML = html;
    }

    card.classList.add('fade-in');
}

// ============================================================
// ACTIONS BOUTONS
// ============================================================
function setupActions() {
    document.querySelector('.btn-edit')?.addEventListener('click', () =>
        showToast('Fonctionnalité de modification en développement.', 'warning')
    );
    document.querySelector('.btn-print')?.addEventListener('click', () =>
        window.print()
    );
    document.querySelector('.btn-change-photo')?.addEventListener('click', () =>
        showToast('Fonctionnalité photo en développement.', 'warning')
    );
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;

    setupActions();

    // Skeletons
    document.querySelectorAll('.value, .stat-value, .grade-value, .att-number').forEach(el => {
        if (!el.innerHTML.includes('<')) el.innerHTML = skeleton();
    });

    // Load student — /api/etudiants/ is filtered server-side for Etudiant role
    const etudiant = await loadEtudiant(user);

    if (!etudiant) {
        showToast('Impossible de charger le profil étudiant.', 'error');
        return;
    }

    // Fill all sections in parallel
    // fillInfosAcademiques needs an extra API call so runs separately
    fillProfileHeader(user, etudiant);
    fillInfosPersonnelles(user, etudiant);
    fillParentInfo(etudiant);

    await Promise.all([
        fillInfosAcademiques(etudiant),
        fillResumeNotes(etudiant),
        fillAssiduite(etudiant),
        fillPaiements(etudiant),
    ]);

    showToast('Profil chargé avec succès.', 'success');
});