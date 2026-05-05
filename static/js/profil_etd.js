/**
 * Profil Étudiant - JWT Authentication
 * FIXED:
 * - Langue taken from groupe object
 * - Paiements: student can't access /api/paiements/ (IsComptable)
 *   → shows data from etudiant object fields instead
 * - Token key matches LoginView: 'access' not 'access_token'
 */

const API_URL = '/api';

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
    const token = getToken();
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

// ── API ───────────────────────────────────────────────────────────────────────
async function apiFetch(endpoint, opts = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) },
        });
        if (res.status === 401) return { error: 'JWT_INVALID' };
        if (res.status === 403) return { error: 'FORBIDDEN' };
        if (res.status === 204) return { success: true };
        if (!res.ok)            return { error: 'API_ERROR', status: res.status };
        return res.json();
    } catch (e) { return { error: 'NETWORK_ERROR' }; }
}

// ── Session ───────────────────────────────────────────────────────────────────
function checkSession() {
    const token = getToken(), user = getUser();
    if (!token || !user) { window.location.href = '/login/'; return null; }
    if (!['Etudiant', 'Dirigeant'].includes(user.role)) { window.location.href = '/login/'; return null; }
    return user;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    document.querySelector('.toast-profil')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-profil';
    t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
        padding:14px 22px;border-radius:12px;background:${colors[type]};color:white;
        font-weight:500;font-size:.9rem;box-shadow:0 8px 24px rgba(0,0,0,.2);
        display:flex;align-items:center;gap:8px;
        transform:translateX(120%);opacity:0;transition:all .3s ease;`;
    t.innerHTML = `<span>${icons[type]}</span>${message}`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; t.style.opacity = '1'; });
    setTimeout(() => {
        t.style.transform = 'translateX(120%)'; t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 3500);
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function skeleton(w = '80px', h = '1.2rem') {
    return `<span style="display:inline-block;width:${w};height:${h};
        background:linear-gradient(90deg,#e2e8f0 25%,#cbd5e1 50%,#e2e8f0 75%);
        background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:6px;">&nbsp;</span>`;
}
if (!document.getElementById('profil-shimmer')) {
    const s = document.createElement('style');
    s.id = 'profil-shimmer';
    s.textContent = `
        @keyframes shimmer { to { background-position:-200% 0; } }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .fade-in { animation:fadeIn .4s ease forwards; }
    `;
    document.head.appendChild(s);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-DZ', { day:'numeric', month:'long', year:'numeric' });
}
function calcAge(d) {
    if (!d) return '—';
    const birth = new Date(d), today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    if (today.getMonth() < birth.getMonth() ||
        (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
    return age;
}
function fmtDA(v) {
    if (v === null || v === undefined || v === '') return '—';
    return `${parseInt(v).toLocaleString('fr-DZ')} DA`;
}

// ── Load student profile ──────────────────────────────────────────────────────
// Uses /api/etudiants/me/ (EtudiantMeView in views.py)
// Fallback: /api/etudiants/ filtered by server for Etudiant role
async function loadEtudiant(user) {
    // Try the dedicated /me/ endpoint first
    let data = await apiFetch('/etudiants/me/');
    if (!data?.error) return data;

    // Fallback: list endpoint (server filters by role=Etudiant)
    const list = await apiFetch('/etudiants/');
    if (list?.error || !Array.isArray(list)) return null;
    return list.find(e => e.user?.email === user.email) || list[0] || null;
}

// ── 1. Profile Header ─────────────────────────────────────────────────────────
function fillProfileHeader(user, etudiant, groupeData) {
    const prenom  = user.first_name || '';
    const nom     = user.last_name  || '';
    const init    = `${prenom[0]||''}${nom[0]||''}`.toUpperCase();
    const niveau  = etudiant.niveau_actuel   || '—';
    const statut  = etudiant.statut_etudiant || 'Actif';
    const groupe  = etudiant.groupe_nom      || groupeData?.nom_groupe || '—';

    const avatar = document.querySelector('.avatar-section .avatar');
    if (avatar) avatar.textContent = init;

    const h1 = document.querySelector('.info-text h1');
    if (h1) h1.textContent = `${prenom} ${nom}`;

    const subtitle = document.querySelector('.subtitle');
    if (subtitle) subtitle.textContent = `Étudiant — Niveau ${niveau}`;

    const badges = document.querySelectorAll('.badges .badge');
    if (badges[0]) badges[0].textContent = statut;
    if (badges[1]) badges[1].textContent = niveau;
    if (badges[2]) badges[2].textContent = groupe;
}

// ── 2. Infos Personnelles ─────────────────────────────────────────────────────
function fillInfosPersonnelles(user, etudiant) {
    const card = document.querySelector('.left-column .card:first-child');
    if (!card) return;

    const age   = calcAge(etudiant.date_naissance);
    const phone = etudiant.user?.telephone || etudiant.telephone || '—';
    const addr  = etudiant.user?.adresse   || etudiant.adresse   || '—';

    const data = {
        'ID Étudiant':        `ETU${String(etudiant.id||0).padStart(4,'0')}`,
        'Nom Complet':        `${user.first_name} ${user.last_name}`,
        'Date de Naissance':  etudiant.date_naissance
                                ? `${formatDate(etudiant.date_naissance)} (${age} ans)` : '—',
        'Email':              user.email || '—',
        'Téléphone':          phone,
        'Adresse':            addr,
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

// ── 3. Infos Parent ───────────────────────────────────────────────────────────
function fillParentInfo(etudiant) {
    const card = document.querySelector('.left-column .card:last-child');
    if (!card) return;

    const nom      = etudiant.parent_nom      || null;
    const email    = etudiant.parent_email    || '—';
    const tel      = etudiant.parent_tel      || '—';
    const relation = etudiant.parent_relation || 'Parent';

    const parentAvatar  = card.querySelector('.parent-avatar');
    const parentName    = card.querySelector('.parent-info h4');
    const parentDetails = card.querySelectorAll('.parent-info p');

    if (!nom) {
        if (parentName)   parentName.textContent   = 'Non renseigné';
        if (parentAvatar) parentAvatar.textContent  = '—';
        return;
    }

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

// ── 4. Infos Académiques ──────────────────────────────────────────────────────
// FIX: langue comes from groupeData.langue (fetched from /api/groupes/<id>/)
function fillInfosAcademiques(etudiant, groupeData) {
    const card = document.querySelector('.right-column .card:first-child');
    if (!card) return;

    const niveau  = etudiant.niveau_actuel || 'A1';
    const groupe  = etudiant.groupe_nom    || groupeData?.nom_groupe || '—';
    const moyenne = parseFloat(etudiant.moyenne_generale || 0);

    // ✅ FIXED: langue from groupe object
    const langue  = groupeData?.langue || '—';
    const prof    = groupeData?.enseignant_nom || '—';

    const statValues = card.querySelectorAll('.stat-value');
    if (statValues[0]) statValues[0].textContent = langue;  // ← was hardcoded '—'
    if (statValues[1]) statValues[1].textContent = niveau;
    if (statValues[2]) statValues[2].textContent = groupe;
    if (statValues[3]) statValues[3].textContent = prof;

    // Progression CEFR
    const niveaux = ['A1','A2','B1','B2','C1','C2'];
    const idx     = niveaux.indexOf(niveau);
    const next    = idx >= 0 && idx < niveaux.length - 1 ? niveaux[idx + 1] : '—';
    const seuils  = { A1:[0,5], A2:[5,10], B1:[10,13], B2:[13,16], C1:[16,20], C2:[20,20] };
    const [min, max] = seuils[niveau] || [10,20];
    const pct = max > min
        ? Math.min(100, Math.max(0, Math.round(((moyenne - min) / (max - min)) * 100)))
        : 0;

    const progressFill = card.querySelector('.progress-fill');
    const progressText = card.querySelector('.progress-section h4');
    const progressInfo = card.querySelectorAll('.progress-info span');

    if (progressFill) progressFill.style.width    = `${pct}%`;
    if (progressText) progressText.textContent    = next !== '—' ? `Progression vers ${next}` : 'Niveau maximum atteint 🎉';
    if (progressInfo[0]) progressInfo[0].textContent = `${pct}% complété`;
    if (progressInfo[1]) progressInfo[1].textContent = pct < 100
        ? `Estimation : ${Math.max(1, Math.ceil((100-pct)/10))} mois restants`
        : 'Prêt pour le niveau suivant !';

    card.classList.add('fade-in');
}

// ── 5. Résumé Notes ───────────────────────────────────────────────────────────
async function fillResumeNotes(etudiant) {
    const card = document.querySelector('.right-column .card:nth-child(2)');
    if (!card) return;

    const gradeValue = card.querySelector('.grade-value');
    if (gradeValue) gradeValue.innerHTML = skeleton('50px','2rem');

    const notes = await apiFetch('/notes/');
    const list  = (!notes?.error && Array.isArray(notes)) ? notes : [];

    // If no notes or forbidden, use moyenne_generale from etudiant
    if (!list.length) {
        const moy = parseFloat(etudiant.moyenne_generale || 0);
        if (gradeValue) gradeValue.textContent = moy.toFixed(1);
        const circleFill = card.querySelector('.circle-fill');
        if (circleFill) circleFill.setAttribute('stroke-dasharray', `${(moy/20)*100}, 100`);
        card.classList.add('fade-in');
        return;
    }

    // Group by evaluation_type
    const byType = {};
    list.forEach(n => {
        const t   = n.evaluation_type || n.type_evaluation || 'Ecrit';
        const val = parseFloat(n.note_obtenue || 0);
        const max = parseFloat(n.note_max || 20);
        if (!byType[t]) byType[t] = { total:0, max:0, count:0 };
        byType[t].total += val;
        byType[t].count++;
    });
    const avg = t => byType[t] ? byType[t].total / byType[t].count : null;

    const globalAvg = list.reduce((s,n) => s + parseFloat(n.note_obtenue||0), 0) / list.length;
    const ecrit      = avg('Ecrit')        ?? globalAvg;
    const oral       = avg('Oral')         ?? globalAvg;
    const compr      = avg('Comprehension')  ?? globalAvg;
    const part       = avg('Participation')  ?? globalAvg;

    if (gradeValue) { gradeValue.textContent = globalAvg.toFixed(1); gradeValue.classList.add('fade-in'); }

    const circleFill = card.querySelector('.circle-fill');
    if (circleFill) circleFill.setAttribute('stroke-dasharray', `${(globalAvg/20)*100}, 100`);

    const gradeItems = card.querySelectorAll('.grade-item span:last-child');
    if (gradeItems[0]) gradeItems[0].textContent = `Écrit: ${ecrit.toFixed(1)}/20`;
    if (gradeItems[1]) gradeItems[1].textContent = `Oral: ${oral.toFixed(1)}/20`;
    if (gradeItems[2]) gradeItems[2].textContent = `Compréhension: ${compr.toFixed(1)}/20`;
    if (gradeItems[3]) gradeItems[3].textContent = `Participation: ${part.toFixed(1)}/20`;

    card.classList.add('fade-in');
}

// ── 6. Assiduité ──────────────────────────────────────────────────────────────
async function fillAssiduite(etudiant) {
    const card = document.querySelector('.right-column .card:nth-child(3)');
    if (!card) return;

    card.querySelectorAll('.att-number').forEach(n => n.innerHTML = skeleton('30px'));

    const absences = await apiFetch('/absences/');
    const list     = (!absences?.error && Array.isArray(absences)) ? absences : [];

    const attNumbers = card.querySelectorAll('.att-number');

    if (!list.length) {
        // Fallback to taux_assiduité field on etudiant
        const taux = parseFloat(etudiant.taux_assiduité ?? etudiant.taux_assiduite ?? 95);
        if (attNumbers[0]) attNumbers[0].textContent = '—';
        if (attNumbers[1]) attNumbers[1].textContent = '—';
        if (attNumbers[2]) attNumbers[2].textContent = '—';
        if (attNumbers[3]) {
            attNumbers[3].textContent = `${taux.toFixed(0)}%`;
            attNumbers[3].style.color = taux < 80 ? '#dc2626' : taux >= 95 ? '#10b981' : '#f59e0b';
        }
        card.classList.add('fade-in');
        return;
    }

    const present  = list.filter(a => a.statut_absence === 'Present').length;
    const absent   = list.filter(a => a.statut_absence === 'Absent').length;
    const justifie = list.filter(a => a.statut_absence === 'Justifie').length;
    const retard   = list.filter(a => a.statut_absence === 'Retard').length;
    const total    = present + absent + justifie + retard;
    const taux     = total > 0 ? Math.round((present / total) * 100) : 100;

    if (attNumbers[0]) attNumbers[0].textContent = present;
    if (attNumbers[1]) attNumbers[1].textContent = absent;
    if (attNumbers[2]) attNumbers[2].textContent = retard;
    if (attNumbers[3]) {
        attNumbers[3].textContent = `${taux}%`;
        attNumbers[3].style.color = taux < 80 ? '#dc2626' : taux >= 95 ? '#10b981' : '#f59e0b';
    }
    card.classList.add('fade-in');
}

// ── 7. Paiements ──────────────────────────────────────────────────────────────
// FIX: /api/paiements/ is IsComptable — students get 403.
// Solution: Try the endpoint anyway (Secretariat can see all).
// If 403, build UI from etudiant fields that the serializer exposes.
async function fillPaiements(etudiant) {
    const card = document.querySelector('.right-column .card:last-child');
    if (!card) return;

    const now       = new Date();
    const moisLabel = now.toLocaleDateString('fr-FR', { month:'long', year:'numeric' });
    const moisCap   = moisLabel.charAt(0).toUpperCase() + moisLabel.slice(1);

    // Try paiements endpoint — works if user is Comptable/Secrétariat/Dirigeant
    // For pure Etudiant role it returns 403 → we use fallback
    const paiements = await apiFetch(`/paiements/?etudiant=${etudiant.id}`);
    const hasPay    = !paiements?.error && Array.isArray(paiements) && paiements.length > 0;

    let isPaid      = false;
    let montant     = '—';
    let dateP       = '—';
    let solde       = '—';
    let history     = [];

    if (hasPay) {
        // ── Real paiement data available ──
        const list = paiements;
        history = list.slice(0, 3);

        // Find current month
        const current = list.find(p => {
            if (!p.date_paiement) return false;
            const d = new Date(p.date_paiement);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }) || list[0];

        isPaid  = current?.statut_paiement === 'Paye';
        montant = current?.montant_paye ?? current?.montant_du ?? '—';
        dateP   = current?.date_paiement ? formatDate(current.date_paiement) : '—';
        solde   = current?.solde ?? '—';

    } else {
        // ── FALLBACK: build from etudiant object ──
        // Some serializers expose payment summary fields on the etudiant:
        // statut_paiement, dernier_paiement, montant_mensuel, solde_restant
        // If your serializer exposes them, great. If not we show a clear message.
        const statutPay = etudiant.statut_paiement || null;

        if (statutPay) {
            isPaid  = statutPay === 'Paye';
            montant = etudiant.montant_mensuel ?? etudiant.tarif_mensuel ?? '—';
            dateP   = etudiant.dernier_paiement ? formatDate(etudiant.dernier_paiement) : '—';
        } else {
            // No payment data accessible — show informative message
            const statusCard = card.querySelector('.payment-status-card');
            if (statusCard) {
                statusCard.innerHTML = `
                    <div style="text-align:center;padding:1.5rem;color:#94a3b8;">
                        <i class="fas fa-lock" style="font-size:2rem;margin-bottom:.75rem;display:block;color:#6366f1;"></i>
                        <p style="font-weight:600;color:#e2e8f0;margin-bottom:.5rem;">
                            Données de paiement
                        </p>
                        <p style="font-size:.85rem;line-height:1.5;">
                            Contactez le secrétariat pour consulter votre situation financière.
                        </p>
                        <p style="margin-top:.75rem;font-size:.8rem;color:#64748b;">
                            Étudiant : ETU${String(etudiant.id||0).padStart(4,'0')}
                        </p>
                    </div>`;
            }
            const historyContainer = card.querySelector('.payment-history');
            if (historyContainer) historyContainer.innerHTML = '';
            card.classList.add('fade-in');
            return;
        }
    }

    // ── Render status card ──
    const statusCard  = card.querySelector('.payment-status-card');
    const statusIcon  = statusCard?.querySelector('.status-icon i');
    const statusTitle = statusCard?.querySelector('h4');
    const statusDesc  = statusCard?.querySelector('p');
    const statusBadge = statusCard?.querySelector('.status-badge');

    if (statusCard)  statusCard.className  = `payment-status-card ${isPaid ? 'paid' : 'unpaid'}`;
    if (statusIcon)  statusIcon.className  = `fas ${isPaid ? 'fa-check-circle' : 'fa-exclamation-circle'}`;
    if (statusBadge) {
        statusBadge.textContent = isPaid ? 'Payé ✓' : 'Non Payé';
        statusBadge.className   = `status-badge ${isPaid ? 'paid' : 'unpaid'}`;
    }
    if (statusTitle) statusTitle.textContent = `Mensualité ${moisCap}`;
    if (statusDesc)  statusDesc.textContent  = isPaid
        ? `${fmtDA(montant)} — Payé le ${dateP}`
        : solde !== '—'
            ? `Solde restant : ${fmtDA(solde)}`
            : `${fmtDA(montant)} — En attente de paiement`;

    // ── Render history ──
    const historyContainer = card.querySelector('.payment-history');
    if (historyContainer) {
        let html = '<h4 style="margin-bottom:.75rem;font-weight:600;">Historique des paiements</h4>';

        if (history.length) {
            history.forEach(p => {
                const paid    = p.statut_paiement === 'Paye';
                const partial = p.statut_paiement === 'Partiellement_paye';
                const color   = paid ? '#059669' : partial ? '#f59e0b' : '#dc2626';
                const icon    = paid ? '✓' : partial ? '◑' : '✗';
                const label   = p.periode || formatDate(p.date_paiement) || '—';
                const amount  = paid
                    ? fmtDA(p.montant_paye)
                    : partial
                        ? `${fmtDA(p.montant_paye)} / ${fmtDA(p.montant_du)}`
                        : `Impayé (${fmtDA(p.montant_du)})`;

                html += `
                    <div class="payment-item" style="display:flex;justify-content:space-between;
                        align-items:center;padding:.5rem 0;border-bottom:1px solid rgba(255,255,255,.06);">
                        <span style="color:#94a3b8;font-size:.875rem;">${label}</span>
                        <span style="color:${color};font-weight:600;font-size:.875rem;">
                            ${amount} ${icon}
                        </span>
                    </div>`;
            });
        } else {
            html += '<p style="color:#94a3b8;font-size:.85rem;">Contactez le secrétariat pour votre historique.</p>';
        }

        historyContainer.innerHTML = html;
    }

    card.classList.add('fade-in');
}

// ── Actions ───────────────────────────────────────────────────────────────────
function setupActions() {
    document.querySelector('.btn-edit')?.addEventListener('click', () =>
        showToast('Modification du profil — contactez le secrétariat.', 'warning'));
    document.querySelector('.btn-print')?.addEventListener('click', () => window.print());
    document.querySelector('.btn-change-photo')?.addEventListener('click', () =>
        showToast('Fonctionnalité photo en développement.', 'warning'));
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;

    setupActions();

    // Loading skeletons
    document.querySelectorAll('.value, .stat-value, .att-number').forEach(el => {
        if (!el.innerHTML.includes('<')) el.innerHTML = skeleton();
    });

    // Load student
    const etudiant = await loadEtudiant(user);
    if (!etudiant) {
        showToast('Impossible de charger le profil étudiant.', 'error');
        return;
    }

    // ── FIX: Load groupe ONCE and share across all sections ──
    // This gives us langue + enseignant_nom + nom_groupe in one call
    let groupeData = null;
    const groupeId = etudiant.groupe; // FK integer from EtudiantSerializer
    if (groupeId) {
        const gd = await apiFetch(`/groupes/${groupeId}/`);
        if (!gd?.error) groupeData = gd;
    }

    // Fill static sections immediately (no extra API calls)
    fillProfileHeader(user, etudiant, groupeData);
    fillInfosPersonnelles(user, etudiant);
    fillParentInfo(etudiant);
    fillInfosAcademiques(etudiant, groupeData); // ← gets langue from groupeData

    // Fill async sections in parallel
    await Promise.all([
        fillResumeNotes(etudiant),
        fillAssiduite(etudiant),
        fillPaiements(etudiant),
    ]);

    showToast('Profil chargé avec succès.', 'success');
});