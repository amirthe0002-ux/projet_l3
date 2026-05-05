/**
 * Gestion des Paiements - Secrétariat / Comptable / Dirigeant
 * JWT Authentication + Django REST API
 *
 * FIXES:
 *  1. Overdue detection: every 1st of month, unpaid/partial paiements
 *     whose date_echeance has passed are flagged visually (red row +
 *     "En retard" badge) and a notification is pushed to the student.
 *  2. Dashboard secretariat now shows teacher salary expenses.
 *
 * File: static/js/Gestion_Paiements.js
 */

const API_URL = '/api';

const state = {
    paiements:    [],
    filtered:     [],
    etudiants:    [],
    searchTerm:   '',
    filterStatut: 'all',
    filterPeriode:'all',
    filterMode:   'all',
    // ids of paiements flagged overdue this session
    overdueIds:   new Set(),
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
// API — with DRF error flattening
// ============================================================
function flattenDRFErrors(data) {
    if (typeof data === 'string') return data;
    if (data.detail) return data.detail;
    if (data.error)  return data.error;
    const msgs = [];
    for (const [key, val] of Object.entries(data)) {
        if (Array.isArray(val))           msgs.push(`${key}: ${val.join(', ')}`);
        else if (typeof val === 'object') msgs.push(`${key}: ${flattenDRFErrors(val)}`);
        else                              msgs.push(`${key}: ${val}`);
    }
    return msgs.join(' | ') || 'Erreur inconnue.';
}

async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });
        if (res.status === 401) {
            let msg = 'Token invalide ou expiré. Reconnectez-vous.';
            try { const d = await res.json(); msg = d.detail || d.error || msg; } catch {}
            return { error: 'JWT_INVALID', message: msg };
        }
        if (res.status === 403) {
            let msg = 'Accès refusé.';
            try { const d = await res.json(); msg = d.detail || d.error || msg; } catch {}
            return { error: 'FORBIDDEN', message: msg };
        }
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
    document.querySelector('.toast-pay')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-pay';
    t.style.cssText = `
        position:fixed;bottom:24px;right:24px;z-index:9999;
        padding:14px 22px;border-radius:12px;background:${colors[type]};color:white;
        font-weight:500;font-size:0.9rem;box-shadow:0 8px 24px rgba(0,0,0,0.2);
        display:flex;align-items:center;gap:8px;max-width:420px;
        transform:translateX(120%);opacity:0;transition:all 0.3s ease;`;
    t.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform='translateX(0)'; t.style.opacity='1'; });
    setTimeout(() => {
        t.style.transform='translateX(120%)'; t.style.opacity='0';
        setTimeout(() => t.remove(), 300);
    }, 4000);
}

// ============================================================
// HELPERS
// ============================================================
function fmtDA(v) {
    if (v === null || v === undefined || v === '') return '—';
    return new Intl.NumberFormat('fr-DZ').format(parseFloat(v)) + ' DA';
}
function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-DZ');
}
function statutBadge(statut) {
    const map = {
        'Paye':              { cls: 'status-paid',    label: 'Payé' },
        'Partiellement_paye':{ cls: 'status-partial', label: 'Partiel' },
        'Impaye':            { cls: 'status-unpaid',  label: 'Impayé' },
    };
    const s = map[statut] || { cls: '', label: statut };
    return `<span class="payment-status ${s.cls}">${s.label}</span>`;
}
function modeLabel(m) {
    return { Especes:'Espèces', Cheque:'Chèque', Virement:'Virement', Carte:'Carte' }[m] || m || '—';
}
function inp() {
    return `width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:8px;
            font-size:0.9rem;outline:none;box-sizing:border-box;font-family:inherit;background:#f9fafb;`;
}
function lbl() {
    return `font-size:0.875rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;`;
}

// ============================================================
// OVERDUE DETECTION
// ============================================================

/**
 * Returns true if today is the 1st of the month OR if we are
 * running for the first time this session (so we always check
 * on first load, not just on the 1st).
 */
function shouldRunOverdueCheck() {
    const today = new Date();
    const lastRun = sessionStorage.getItem('overdue_last_run');
    const todayKey = today.toISOString().split('T')[0]; // "YYYY-MM-DD"

    // Always run once per session; also re-run every 1st of the month
    if (!lastRun || lastRun !== todayKey) {
        sessionStorage.setItem('overdue_last_run', todayKey);
        return true;
    }
    return today.getDate() === 1;
}

/**
 * For each unpaid/partial paiement whose date_echeance has passed,
 * flag it locally and push a notification to the student via the API.
 */
async function checkAndNotifyOverdue(paiements) {
    if (!shouldRunOverdueCheck()) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdue = paiements.filter(p => {
        if (p.statut_paiement === 'Paye') return false;
        if (!p.date_echeance) return false;
        const due = new Date(p.date_echeance);
        due.setHours(0, 0, 0, 0);
        return due < today;
    });

    if (!overdue.length) return;

    // Mark locally
    overdue.forEach(p => state.overdueIds.add(p.id));

    // Show a global banner
    showOverdueBanner(overdue.length);

    // Push a notification to each student (fire-and-forget, soft errors)
    for (const p of overdue) {
        try {
            await apiFetch('/notifications/', {
                method: 'POST',
                body: JSON.stringify({
                    utilisateur:      p.etudiant,
                    type_notification:'Paiement',
                    titre:            '⚠️ Paiement en retard',
                    contenu: `Votre paiement de ${fmtDA(p.montant_du)} (période : ${p.periode || '—'}) `
                           + `était dû le ${fmtDate(p.date_echeance)}. Veuillez régulariser votre situation.`,
                    canal:            'App',
                    statut_notification: 'Non_lu',
                    urgent:           true,
                    lien_action:      '/profil/',
                }),
            });

            // Also increment relances_envoyees on the paiement
            await apiFetch(`/paiements/${p.id}/`, {
                method: 'PUT',
                body: JSON.stringify({
                    etudiant:          p.etudiant,
                    montant_du:        parseFloat(p.montant_du),
                    montant_paye:      parseFloat(p.montant_paye),
                    mode_paiement:     p.mode_paiement,
                    date_paiement:     p.date_paiement,
                    reference_paiement: p.reference_paiement || null,
                    statut_paiement:   p.statut_paiement,
                    periode:           p.periode || null,
                    date_echeance:     p.date_echeance || null,
                    relances_envoyees: (p.relances_envoyees || 0) + 1,
                    derniere_relance:  new Date().toISOString(),
                }),
            });
        } catch (_) { /* silent */ }
    }
}

/** Red dismissible banner at the top of the page */
function showOverdueBanner(count) {
    document.getElementById('overdue-banner')?.remove();
    const banner = document.createElement('div');
    banner.id = 'overdue-banner';
    banner.style.cssText = `
        position:fixed;top:0;left:0;right:0;z-index:8888;
        background:linear-gradient(135deg,#dc2626,#b91c1c);
        color:white;padding:12px 24px;
        display:flex;align-items:center;justify-content:space-between;
        font-size:0.9rem;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.3);`;
    banner.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;">
            <span style="font-size:1.2rem;">⚠️</span>
            <span>
                <strong>${count} paiement${count > 1 ? 's' : ''} en retard</strong>
                détecté${count > 1 ? 's' : ''} ce mois-ci.
                Les étudiants concernés ont été notifiés automatiquement.
            </span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
            <button onclick="applyOverdueFilter()"
                style="background:white;color:#dc2626;border:none;padding:6px 14px;
                       border-radius:6px;cursor:pointer;font-weight:700;font-size:0.85rem;">
                Voir les retards
            </button>
            <button onclick="document.getElementById('overdue-banner').remove()"
                style="background:transparent;border:2px solid rgba(255,255,255,0.6);
                       color:white;padding:6px 14px;border-radius:6px;cursor:pointer;
                       font-weight:600;font-size:0.85rem;">
                Ignorer
            </button>
        </div>`;
    document.body.prepend(banner);
    // Push content down so the banner doesn't hide the page header
    document.body.style.paddingTop = '52px';
}

/** Filter the table to show only overdue rows */
function applyOverdueFilter() {
    document.getElementById('overdue-banner')?.remove();
    document.body.style.paddingTop = '';

    state.filtered = state.paiements.filter(p => state.overdueIds.has(p.id));
    updateSummaryCards(state.filtered);
    renderTable(state.filtered);
    showToast(`${state.overdueIds.size} paiement(s) en retard affiché(s).`, 'warning');
}

/** True if a paiement is overdue (due date passed, not fully paid) */
function isOverdue(p) {
    if (p.statut_paiement === 'Paye') return false;
    if (!p.date_echeance) return false;
    const today = new Date(); today.setHours(0,0,0,0);
    const due   = new Date(p.date_echeance); due.setHours(0,0,0,0);
    return due < today;
}

// ============================================================
// LOAD DATA
// ============================================================
async function loadEtudiants() {
    const data = await apiFetch('/etudiants/');
    if (!data?.error) state.etudiants = Array.isArray(data) ? data : (data.results || []);
}

async function loadPaiements() {
    const tbody = document.querySelector('tbody');
    if (tbody) tbody.innerHTML = `
        <tr><td colspan="9" style="text-align:center;padding:3rem;color:#94a3b8;">
            <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;display:block;margin-bottom:0.5rem;"></i>
            Chargement...
        </td></tr>`;

    const data = await apiFetch('/paiements/');
    if (data?.error) {
        showToast(data.message, 'error');
        if (tbody) tbody.innerHTML = `
            <tr><td colspan="9" style="text-align:center;padding:3rem;color:#dc2626;">
                ${data.message}
                <br><button onclick="loadPaiements()" style="margin-top:1rem;padding:8px 16px;
                    background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer;">
                    Réessayer
                </button>
            </td></tr>`;
        return;
    }

    state.paiements = Array.isArray(data) ? data : (data.results || []);
    state.filtered  = [...state.paiements];

    updateSummaryCards(state.paiements);
    renderTable(state.paiements);

    // Run overdue check after data is loaded
    await checkAndNotifyOverdue(state.paiements);
    // Re-render so overdue rows get their styling
    renderTable(state.filtered);
}

// ============================================================
// SUMMARY CARDS  (FIXED: includes salary expenses)
// ============================================================
async function updateSummaryCards(paiements) {
    const totalPaye  = paiements.reduce((s, p) => s + parseFloat(p.montant_paye || 0), 0);
    const totalReste = paiements
        .filter(p => p.statut_paiement !== 'Paye')
        .reduce((s, p) => s + parseFloat(p.solde || 0), 0);
    const retards    = paiements.filter(p => isOverdue(p)).length;

    const cards = document.querySelectorAll('.summary-card .amount-large');
    if (cards[0]) cards[0].textContent = fmtDA(totalPaye);
    if (cards[1]) cards[1].textContent = fmtDA(totalReste);
    if (cards[2]) {
        cards[2].textContent = retards;
        // Color the retard card red when there are overdue payments
        const retardCard = cards[2].closest('.summary-card');
        if (retardCard && retards > 0) {
            retardCard.style.borderLeft = '4px solid #dc2626';
        }
    }

    // Stat boxes
    const statPs   = document.querySelectorAll('.stat-box p');
    const complets = paiements.filter(p => p.statut_paiement === 'Paye').length;
    const partiels = paiements.filter(p => p.statut_paiement === 'Partiellement_paye').length;
    const impayes  = paiements.filter(p => p.statut_paiement === 'Impaye').length;
    const total    = paiements.length || 1;
    const taux     = Math.round((complets / total) * 100);

    if (statPs[0]) statPs[0].textContent = complets;
    if (statPs[1]) statPs[1].textContent = partiels;
    if (statPs[2]) statPs[2].textContent = impayes;
    if (statPs[3]) statPs[3].textContent = taux + '%';

    // ── FIXED: load salary expenses and inject into dashboard ──────────────
    loadSalaryExpenses();
}

/**
 * Fetch bulletins salaire and push the total into any element that has
 * id="total-salaires" or class="salaires-montant" on the page.
 * Works on both the paiements page AND the secretariat dashboard.
 */
async function loadSalaryExpenses() {
    const targets = [
        ...document.querySelectorAll('#total-salaires, .salaires-montant, [data-salaires]')
    ];
    if (!targets.length) return; // no slot on this page — skip

    const data = await apiFetch('/bulletins/');
    if (data?.error) return;

    const bulletins = Array.isArray(data) ? data : (data.results || []);
    const totalNet  = bulletins.reduce((s, b) => s + parseFloat(b.salaire_net || 0), 0);
    const totalBrut = bulletins.reduce((s, b) => s + parseFloat(b.salaire_brut || 0), 0);

    targets.forEach(el => {
        el.textContent = fmtDA(totalNet);
        el.title       = `Brut: ${fmtDA(totalBrut)}`;
    });

    // Also update a solde/bénéfice element if present
    const soldeEls = document.querySelectorAll('#solde-net, .solde-net, [data-solde]');
    const totalRevenu = state.paiements.reduce((s, p) => s + parseFloat(p.montant_paye || 0), 0);
    soldeEls.forEach(el => {
        const solde = totalRevenu - totalNet;
        el.textContent = fmtDA(solde);
        el.style.color = solde >= 0 ? '#059669' : '#dc2626';
    });
}

// ============================================================
// RENDER TABLE  (FIXED: overdue rows highlighted)
// ============================================================
function renderTable(paiements) {
    const tbody = document.querySelector('tbody');
    if (!tbody) return;

    if (!paiements.length) {
        tbody.innerHTML = `
            <tr><td colspan="9" style="text-align:center;padding:3rem;color:#94a3b8;">
                <i class="fas fa-search" style="font-size:2rem;display:block;margin-bottom:0.5rem;"></i>
                <p style="font-weight:600;">Aucun paiement trouvé</p>
                <p style="font-size:0.875rem;margin-top:4px;">
                    ${state.searchTerm ? `Aucun résultat pour "${state.searchTerm}"` : 'Modifiez vos filtres'}
                </p>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = paiements.map(p => {
        const nomEtudiant = p.etudiant_nom || '—';
        const solde       = parseFloat(p.solde || 0);
        const isPaye      = p.statut_paiement === 'Paye';
        const overdue     = isOverdue(p) || state.overdueIds.has(p.id);

        // Row styling: red-tinted background for overdue
        const rowStyle = overdue
            ? 'background:rgba(220,38,38,0.06);border-left:4px solid #dc2626;'
            : '';

        // Overdue badge appended next to student name
        const overdueBadge = overdue
            ? `<span style="display:inline-block;margin-left:6px;padding:1px 7px;
                background:#fef2f2;color:#dc2626;border:1px solid #fecaca;
                border-radius:10px;font-size:0.72rem;font-weight:700;vertical-align:middle;">
                ⏰ En retard
               </span>`
            : '';

        // Days overdue
        let daysOverdueLabel = '';
        if (overdue && p.date_echeance) {
            const today = new Date(); today.setHours(0,0,0,0);
            const due   = new Date(p.date_echeance); due.setHours(0,0,0,0);
            const days  = Math.round((today - due) / 86400000);
            daysOverdueLabel = `<div style="font-size:0.72rem;color:#dc2626;margin-top:2px;">
                ${days} jour${days>1?'s':''} de retard
            </div>`;
        }

        let actionBtn = '';
        if (isPaye) {
            actionBtn = `<button class="action-btn validate" onclick="openModalRecu(${p.id})"
                title="Voir le reçu">
                <i class="fas fa-receipt"></i> Reçu
            </button>`;
        } else {
            actionBtn = `
                <button class="action-btn remind" onclick="relancerPaiement(${p.id})"
                    title="Envoyer une relance"
                    style="${overdue ? 'background:#dc2626;color:white;border:none;' : ''}">
                    <i class="fas fa-bell"></i> Relancer
                </button>
                <button class="action-btn validate" onclick="openModalModifier(${p.id})"
                    title="Enregistrer un paiement"
                    style="background:#059669;color:white;border:none;">
                    <i class="fas fa-money-bill"></i> Payer
                </button>`;
        }

        return `
        <tr data-id="${p.id}" style="${rowStyle}">
            <td>
                <div style="font-weight:600;">${nomEtudiant}${overdueBadge}</div>
                <div style="font-size:0.8rem;color:#64748b;">${p.periode || '—'}</div>
                ${daysOverdueLabel}
            </td>
            <td>${p.periode || '—'}</td>
            <td class="amount">${fmtDA(p.montant_du)}</td>
            <td class="amount paid">${fmtDA(p.montant_paye)}</td>
            <td class="${solde > 0 ? 'amount unpaid' : ''}">${solde > 0 ? fmtDA(solde) : '—'}</td>
            <td>${modeLabel(p.mode_paiement)}</td>
            <td>
                ${fmtDate(p.date_paiement)}
                ${p.date_echeance && !isPaye
                    ? `<div style="font-size:0.75rem;color:${overdue?'#dc2626':'#64748b'};">
                        Échéance: ${fmtDate(p.date_echeance)}
                       </div>`
                    : ''}
            </td>
            <td>
                ${statutBadge(p.statut_paiement)}
                ${overdue ? `<br><span style="font-size:0.72rem;color:#dc2626;font-weight:700;">
                    ⏰ En retard
                </span>` : ''}
            </td>
            <td style="white-space:nowrap;">
                ${actionBtn}
                <button class="action-btn" onclick="openModalDetails(${p.id})"
                    title="Voir les détails" style="margin-left:4px;">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

// ============================================================
// FILTERS
// ============================================================
function applyFilters() {
    let r = [...state.paiements];

    if (state.searchTerm) {
        const t = state.searchTerm.toLowerCase();
        r = r.filter(p =>
            (p.etudiant_nom || '').toLowerCase().includes(t) ||
            (p.reference_paiement || '').toLowerCase().includes(t) ||
            (p.periode || '').toLowerCase().includes(t)
        );
    }
    if (state.filterStatut !== 'all')
        r = r.filter(p => p.statut_paiement === state.filterStatut);
    if (state.filterMode !== 'all')
        r = r.filter(p => p.mode_paiement === state.filterMode);
    if (state.filterPeriode !== 'all')
        r = r.filter(p => (p.periode || '').includes(state.filterPeriode));

    state.filtered = r;
    updateSummaryCards(r);
    renderTable(r);
}

// ============================================================
// MODAL — DETAILS
// ============================================================
function openModalDetails(paiementId) {
    const p = state.paiements.find(x => x.id === paiementId);
    if (!p) return;
    const overdue = isOverdue(p) || state.overdueIds.has(p.id);

    removeModal('modal-details');
    const modal = createShell('modal-details');
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:2rem;width:90%;max-width:480px;
                    max-height:90vh;overflow-y:auto;
                    ${overdue ? 'border-top:4px solid #dc2626;' : ''}"
             onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="margin:0;font-size:1.1rem;">
                    <i class="fas fa-file-invoice" style="color:#6366f1;margin-right:8px;"></i>Détail Paiement
                    ${overdue ? '<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:8px;font-size:0.75rem;margin-left:8px;">⏰ En retard</span>' : ''}
                </h3>
                <button onclick="removeModal('modal-details')"
                    style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">&times;</button>
            </div>

            ${overdue ? `
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;
                        padding:0.875rem;margin-bottom:1.25rem;">
                <div style="color:#dc2626;font-weight:700;font-size:0.875rem;margin-bottom:4px;">
                    ⏰ Paiement en retard
                </div>
                <div style="color:#7f1d1d;font-size:0.825rem;">
                    Échéance dépassée depuis le ${fmtDate(p.date_echeance)}.
                    L'étudiant a été notifié automatiquement.
                </div>
            </div>` : ''}

            <div style="display:flex;flex-direction:column;gap:0.75rem;margin-bottom:1.5rem;">
                ${[
                    ['👤', 'Étudiant',    p.etudiant_nom || '—'],
                    ['📅', 'Période',     p.periode || '—'],
                    ['💵', 'Montant dû',  fmtDA(p.montant_du)],
                    ['✅', 'Montant payé',fmtDA(p.montant_paye)],
                    ['🔴', 'Reste',       parseFloat(p.solde||0) > 0 ? fmtDA(p.solde) : '—'],
                    ['💳', 'Mode',        modeLabel(p.mode_paiement)],
                    ['🗓', 'Date paiement',fmtDate(p.date_paiement)],
                    ['📆', 'Échéance',    fmtDate(p.date_echeance)],
                    ['📋', 'Référence',   p.reference_paiement || '—'],
                    ['🔔', 'Relances',    p.relances_envoyees || 0],
                ].map(([ic, lb, v]) => `
                    <div style="display:flex;justify-content:space-between;align-items:center;
                                padding:0.65rem 1rem;background:#f8fafc;border-radius:8px;">
                        <span style="color:#64748b;font-size:0.875rem;">${ic} ${lb}</span>
                        <strong style="font-size:0.875rem;text-align:right;max-width:55%;">${v}</strong>
                    </div>`).join('')}
                <div style="display:flex;justify-content:space-between;align-items:center;
                            padding:0.65rem 1rem;background:#f8fafc;border-radius:8px;">
                    <span style="color:#64748b;font-size:0.875rem;">📊 Statut</span>
                    <div>${statutBadge(p.statut_paiement)}</div>
                </div>
            </div>

            <div style="display:flex;gap:0.75rem;">
                <button onclick="removeModal('modal-details')"
                    style="flex:1;padding:0.75rem;border:1px solid #ddd;background:white;
                           border-radius:8px;cursor:pointer;font-weight:600;">Fermer</button>
                ${p.statut_paiement !== 'Paye' ? `
                <button onclick="removeModal('modal-details');openModalModifier(${p.id});"
                    style="flex:1;padding:0.75rem;background:#059669;color:white;
                           border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                    <i class="fas fa-money-bill"></i> Enregistrer paiement
                </button>` : `
                <button onclick="openModalRecu(${p.id})"
                    style="flex:1;padding:0.75rem;background:#6366f1;color:white;
                           border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                    <i class="fas fa-receipt"></i> Voir reçu
                </button>`}
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal('modal-details'); });
}

// ============================================================
// MODAL — ENREGISTRER / MODIFIER PAIEMENT
// ============================================================
async function openModalModifier(paiementId) {
    const p = state.paiements.find(x => x.id === paiementId);
    if (!p) return;

    const today = new Date().toISOString().split('T')[0];

    removeModal('modal-modifier');
    const modal = createShell('modal-modifier');
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:2rem;width:90%;max-width:480px;
                    max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="margin:0;font-size:1.1rem;">
                    <i class="fas fa-edit" style="color:#059669;margin-right:8px;"></i>
                    Enregistrer Paiement — ${p.etudiant_nom || ''}
                </h3>
                <button onclick="removeModal('modal-modifier')"
                    style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">&times;</button>
            </div>

            <!-- Info résumée -->
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;
                        padding:1rem;margin-bottom:1.25rem;">
                <div style="display:flex;justify-content:space-between;font-size:0.875rem;margin-bottom:4px;">
                    <span style="color:#374151;">Montant dû</span>
                    <strong style="color:#1e293b;">${fmtDA(p.montant_du)}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:0.875rem;margin-bottom:4px;">
                    <span style="color:#374151;">Déjà payé</span>
                    <strong style="color:#059669;">${fmtDA(p.montant_paye)}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;font-size:1rem;
                            padding-top:8px;border-top:1px solid #bbf7d0;margin-top:4px;">
                    <span style="color:#166534;font-weight:700;">Reste à payer</span>
                    <strong style="color:#dc2626;font-size:1.1rem;">${fmtDA(p.solde)}</strong>
                </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:0.85rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="${lbl()}">Montant payé (DA) *</label>
                        <input id="m_montant" type="number" min="0"
                               step="0.01" value="${p.solde || p.montant_du}"
                               max="${p.montant_du}" style="${inp()}">
                    </div>
                    <div>
                        <label style="${lbl()}">Date paiement *</label>
                        <input id="m_date" type="date" value="${today}" style="${inp()}">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="${lbl()}">Mode de paiement *</label>
                        <select id="m_mode" style="${inp()}">
                            <option value="Especes">Espèces</option>
                            <option value="Cheque">Chèque</option>
                            <option value="Virement" ${p.mode_paiement==='Virement'?'selected':''}>Virement</option>
                            <option value="Carte">Carte bancaire</option>
                        </select>
                    </div>
                    <div>
                        <label style="${lbl()}">Référence</label>
                        <input id="m_ref" type="text" value="${p.reference_paiement||''}"
                               placeholder="N° chèque / reçu" style="${inp()}">
                    </div>
                </div>
                <div>
                    <label style="${lbl()}">Statut paiement</label>
                    <select id="m_statut" style="${inp()}">
                        <option value="Paye" ${p.statut_paiement==='Paye'?'selected':''}>Payé (complet)</option>
                        <option value="Partiellement_paye" ${p.statut_paiement==='Partiellement_paye'?'selected':''}>Partiellement payé</option>
                        <option value="Impaye" ${p.statut_paiement==='Impaye'?'selected':''}>Impayé</option>
                    </select>
                </div>

                <!-- Live preview -->
                <div id="preview_solde" style="background:#fef2f2;border:1px solid #fecaca;
                     border-radius:8px;padding:0.75rem;display:none;">
                    <div style="display:flex;justify-content:space-between;font-size:0.875rem;">
                        <span>Nouveau solde après paiement</span>
                        <strong id="prev_solde" style="color:#dc2626;">—</strong>
                    </div>
                </div>

                <div id="modError" style="display:none;padding:0.75rem;background:#fef2f2;
                     border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:0.85rem;"></div>

                <button id="btnSaveMod" style="width:100%;padding:0.875rem;border:none;border-radius:10px;
                    background:linear-gradient(135deg,#059669,#10b981);color:white;
                    font-weight:700;font-size:1rem;cursor:pointer;margin-top:0.25rem;">
                    <i class="fas fa-save"></i> Enregistrer le paiement
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal('modal-modifier'); });

    // Live solde preview
    const montantInput = document.getElementById('m_montant');
    function updatePreview() {
        const montantDu   = parseFloat(p.montant_du) || 0;
        const dejaPayé    = parseFloat(p.montant_paye) || 0;
        const nouveauPmt  = parseFloat(montantInput.value) || 0;
        const totalPayé   = dejaPayé + nouveauPmt;
        const soldeFinal  = montantDu - totalPayé;
        const prev        = document.getElementById('preview_solde');
        const prevSolde   = document.getElementById('prev_solde');
        if (prev && prevSolde && nouveauPmt > 0) {
            prev.style.display = 'block';
            prevSolde.textContent = soldeFinal > 0 ? fmtDA(soldeFinal) : '✅ Soldé';
            prevSolde.style.color = soldeFinal <= 0 ? '#059669' : '#dc2626';
        }
    }
    montantInput?.addEventListener('input', updatePreview);

    document.getElementById('btnSaveMod')?.addEventListener('click', async () => {
        const errEl = document.getElementById('modError');
        errEl.style.display = 'none';
        const btn = document.getElementById('btnSaveMod');

        const montantPayeNouveau = parseFloat(document.getElementById('m_montant')?.value);
        const date    = document.getElementById('m_date')?.value;
        const mode    = document.getElementById('m_mode')?.value;
        const ref     = document.getElementById('m_ref')?.value?.trim();
        const statut  = document.getElementById('m_statut')?.value;

        if (!montantPayeNouveau || montantPayeNouveau <= 0) {
            errEl.textContent = 'Le montant payé doit être supérieur à 0.';
            errEl.style.display = 'block'; return;
        }
        if (!date) {
            errEl.textContent = 'La date de paiement est obligatoire.';
            errEl.style.display = 'block'; return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled  = true;

        const totalPaye = Math.min(
            parseFloat(p.montant_paye || 0) + montantPayeNouveau,
            parseFloat(p.montant_du)
        );

        const payload = {
            etudiant:          p.etudiant,
            montant_du:        parseFloat(p.montant_du),
            montant_paye:      totalPaye,
            mode_paiement:     mode,
            date_paiement:     date,
            reference_paiement: ref || null,
            statut_paiement:   statut,
            periode:           p.periode || null,
            date_echeance:     p.date_echeance || null,
        };

        const result = await apiFetch(`/paiements/${paiementId}/`, {
            method: 'PUT',
            body:   JSON.stringify(payload),
        });

        if (result?.error) {
            errEl.textContent = '❌ ' + result.message;
            errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer le paiement';
            btn.disabled = false; return;
        }

        // Remove from overdue set if now paid
        if (result.statut_paiement === 'Paye') {
            state.overdueIds.delete(paiementId);
        }

        const idx = state.paiements.findIndex(x => x.id === paiementId);
        if (idx !== -1) state.paiements[idx] = result;
        state.filtered = [...state.paiements];

        removeModal('modal-modifier');
        applyFilters();
        showToast('✅ Paiement enregistré avec succès !', 'success');
    });
}

// ============================================================
// MODAL — NOUVEAU PAIEMENT
// ============================================================
async function openModalNouveauPaiement() {
    if (!state.etudiants.length) await loadEtudiants();

    const today = new Date().toISOString().split('T')[0];
    const etudiantsOpts = '<option value="">-- Sélectionner un étudiant --</option>' +
        state.etudiants.map(e => {
            const nom = e.user?.first_name
                ? `${e.user.first_name} ${e.user.last_name}`.trim()
                : (e.user?.nom_complet || `#${e.id}`);
            return `<option value="${e.id}">${nom}</option>`;
        }).join('');

    removeModal('modal-nouveau');
    const modal = createShell('modal-nouveau');
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:2rem;width:90%;max-width:500px;
                    max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="margin:0;font-size:1.1rem;">
                    <i class="fas fa-plus-circle" style="color:#059669;margin-right:8px;"></i>Nouveau Paiement
                </h3>
                <button onclick="removeModal('modal-nouveau')"
                    style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">&times;</button>
            </div>

            <div style="display:flex;flex-direction:column;gap:0.85rem;">
                <div>
                    <label style="${lbl()}">Étudiant *</label>
                    <select id="n_etudiant" style="${inp()}">${etudiantsOpts}</select>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="${lbl()}">Montant dû (DA) *</label>
                        <input id="n_du" type="number" min="0" step="0.01"
                               placeholder="2500" style="${inp()}">
                    </div>
                    <div>
                        <label style="${lbl()}">Montant payé (DA) *</label>
                        <input id="n_paye" type="number" min="0" step="0.01"
                               placeholder="2500" style="${inp()}">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="${lbl()}">Mode de paiement *</label>
                        <select id="n_mode" style="${inp()}">
                            <option value="Especes">Espèces</option>
                            <option value="Cheque">Chèque</option>
                            <option value="Virement">Virement</option>
                            <option value="Carte">Carte bancaire</option>
                        </select>
                    </div>
                    <div>
                        <label style="${lbl()}">Date paiement *</label>
                        <input id="n_date" type="date" value="${today}" style="${inp()}">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="${lbl()}">Période (ex: Mars 2025)</label>
                        <input id="n_periode" type="text" placeholder="Mars 2025" style="${inp()}">
                    </div>
                    <div>
                        <label style="${lbl()}">Date d'échéance *</label>
                        <input id="n_echeance" type="date" style="${inp()}">
                    </div>
                </div>
                <div>
                    <label style="${lbl()}">Référence (N° chèque, reçu…)</label>
                    <input id="n_ref" type="text" placeholder="REF-2025-001" style="${inp()}">
                </div>
                <div>
                    <label style="${lbl()}">Statut *</label>
                    <select id="n_statut" style="${inp()}">
                        <option value="Paye">Payé (complet)</option>
                        <option value="Partiellement_paye">Partiellement payé</option>
                        <option value="Impaye">Impayé</option>
                    </select>
                </div>

                <div id="newError" style="display:none;padding:0.75rem;background:#fef2f2;
                     border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:0.85rem;"></div>

                <button id="btnSaveNew" style="width:100%;padding:0.875rem;border:none;border-radius:10px;
                    background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;
                    font-weight:700;font-size:1rem;cursor:pointer;">
                    <i class="fas fa-plus"></i> Enregistrer le paiement
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal('modal-nouveau'); });

    document.getElementById('btnSaveNew')?.addEventListener('click', async () => {
        const errEl = document.getElementById('newError');
        errEl.style.display = 'none';
        const btn = document.getElementById('btnSaveNew');

        const etudiant = parseInt(document.getElementById('n_etudiant')?.value);
        const du       = parseFloat(document.getElementById('n_du')?.value);
        const paye     = parseFloat(document.getElementById('n_paye')?.value);
        const mode     = document.getElementById('n_mode')?.value;
        const date     = document.getElementById('n_date')?.value;
        const periode  = document.getElementById('n_periode')?.value?.trim();
        const echeance = document.getElementById('n_echeance')?.value || null;
        const ref      = document.getElementById('n_ref')?.value?.trim();
        const statut   = document.getElementById('n_statut')?.value;

        if (!etudiant) { errEl.textContent = 'Sélectionnez un étudiant.'; errEl.style.display='block'; return; }
        if (isNaN(du) || du <= 0) { errEl.textContent = 'Montant dû invalide.'; errEl.style.display='block'; return; }
        if (isNaN(paye) || paye < 0) { errEl.textContent = 'Montant payé invalide.'; errEl.style.display='block'; return; }
        if (!date) { errEl.textContent = 'Date obligatoire.'; errEl.style.display='block'; return; }
        if (!echeance) { errEl.textContent = 'La date d\'échéance est obligatoire pour détecter les retards.'; errEl.style.display='block'; return; }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled  = true;

        const result = await apiFetch('/paiements/', {
            method: 'POST',
            body:   JSON.stringify({
                etudiant,
                montant_du:        du,
                montant_paye:      paye,
                mode_paiement:     mode,
                date_paiement:     date,
                reference_paiement: ref || null,
                statut_paiement:   statut,
                periode:           periode || null,
                date_echeance:     echeance,
            }),
        });

        if (result?.error) {
            errEl.textContent = '❌ ' + result.message;
            errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-plus"></i> Enregistrer le paiement';
            btn.disabled = false; return;
        }

        state.paiements.unshift(result);
        state.filtered = [...state.paiements];
        removeModal('modal-nouveau');
        applyFilters();
        showToast(`✅ Paiement enregistré pour ${result.etudiant_nom || 'l\'étudiant'} !`, 'success');
    });
}

// ============================================================
// MODAL — REÇU
// ============================================================
function openModalRecu(paiementId) {
    const p = state.paiements.find(x => x.id === paiementId);
    if (!p) return;

    removeModal('modal-recu');
    const modal = createShell('modal-recu');
    modal.innerHTML = `
        <div id="recu-content" style="background:white;border-radius:16px;padding:2rem;
                    width:90%;max-width:460px;" onclick="event.stopPropagation()">
            <div style="text-align:center;margin-bottom:1.5rem;padding-bottom:1rem;
                        border-bottom:2px dashed #e2e8f0;">
                <i class="fas fa-graduation-cap" style="font-size:2rem;color:#6366f1;"></i>
                <h2 style="margin:0.5rem 0 0;font-size:1.3rem;font-weight:800;color:#1e293b;">LanguePro</h2>
                <p style="color:#64748b;font-size:0.8rem;margin:4px 0;">Centre de Formation en Langues</p>
                <p style="font-size:0.75rem;color:#94a3b8;">REÇU DE PAIEMENT</p>
            </div>

            <div style="display:flex;justify-content:space-between;margin-bottom:1rem;">
                <span style="font-size:0.8rem;color:#64748b;">N° Reçu</span>
                <strong style="font-size:0.8rem;">#PAY${String(p.id).padStart(5,'0')}</strong>
            </div>

            <div style="display:flex;flex-direction:column;gap:0.6rem;margin-bottom:1.5rem;">
                ${[
                    ['Étudiant',    p.etudiant_nom || '—'],
                    ['Période',     p.periode || '—'],
                    ['Montant dû',  fmtDA(p.montant_du)],
                    ['Montant payé',fmtDA(p.montant_paye)],
                    ['Mode',        modeLabel(p.mode_paiement)],
                    ['Référence',   p.reference_paiement || '—'],
                    ['Date',        fmtDate(p.date_paiement)],
                ].map(([lb, v]) => `
                    <div style="display:flex;justify-content:space-between;
                                padding:0.5rem 0;border-bottom:1px solid #f1f5f9;">
                        <span style="color:#64748b;font-size:0.875rem;">${lb}</span>
                        <strong style="font-size:0.875rem;">${v}</strong>
                    </div>`).join('')}
            </div>

            <div style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:10px;
                        padding:1rem;text-align:center;margin-bottom:1.5rem;">
                <p style="font-size:0.8rem;color:#065f46;margin-bottom:4px;">Montant Total Payé</p>
                <p style="font-size:1.8rem;font-weight:800;color:#059669;">${fmtDA(p.montant_paye)}</p>
                <span style="display:inline-block;padding:4px 12px;background:#059669;
                             color:white;border-radius:20px;font-size:0.75rem;font-weight:700;">
                    ${p.statut_paiement === 'Paye' ? '✓ SOLDÉ' : '⚠ PARTIEL'}
                </span>
            </div>

            <div style="display:flex;gap:0.75rem;">
                <button onclick="removeModal('modal-recu')"
                    style="flex:1;padding:0.75rem;border:1px solid #ddd;background:white;
                           border-radius:8px;cursor:pointer;font-weight:600;">Fermer</button>
                <button onclick="window.print()"
                    style="flex:1;padding:0.75rem;background:#6366f1;color:white;
                           border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                    <i class="fas fa-print"></i> Imprimer
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) removeModal('modal-recu'); });
}

// ============================================================
// RELANCER PAIEMENT
// ============================================================
async function relancerPaiement(paiementId) {
    const p = state.paiements.find(x => x.id === paiementId);
    if (!p) return;
    const nom = p.etudiant_nom || 'cet étudiant';

    if (!confirm(`Envoyer une relance de paiement à ${nom} ?`)) return;

    const result = await apiFetch(`/paiements/${paiementId}/`, {
        method: 'PUT',
        body: JSON.stringify({
            etudiant:          p.etudiant,
            montant_du:        parseFloat(p.montant_du),
            montant_paye:      parseFloat(p.montant_paye),
            mode_paiement:     p.mode_paiement,
            date_paiement:     p.date_paiement,
            reference_paiement: p.reference_paiement || null,
            statut_paiement:   p.statut_paiement,
            periode:           p.periode || null,
            date_echeance:     p.date_echeance || null,
            relances_envoyees: (p.relances_envoyees || 0) + 1,
            derniere_relance:  new Date().toISOString(),
        }),
    });

    if (result?.error) {
        showToast('Erreur relance: ' + result.message, 'error'); return;
    }

    // Also push a notification to the student
    await apiFetch('/notifications/', {
        method: 'POST',
        body: JSON.stringify({
            utilisateur:      p.etudiant,
            type_notification:'Paiement',
            titre:            '🔔 Rappel de paiement',
            contenu: `Rappel : votre paiement de ${fmtDA(p.montant_du)} (${p.periode || '—'}) `
                   + `n'a pas encore été réglé. Merci de vous mettre à jour.`,
            canal:            'App',
            statut_notification: 'Non_lu',
            urgent:           false,
            lien_action:      '/profil/',
        }),
    });

    const idx = state.paiements.findIndex(x => x.id === paiementId);
    if (idx !== -1) state.paiements[idx] = result;

    showToast(`📧 Relance envoyée à ${nom} (${result.relances_envoyees}ème relance)`, 'success');
    applyFilters();
}

// ============================================================
// EXPORT CSV
// ============================================================
function exportCSV() {
    if (!state.filtered.length) { showToast('Aucune donnée à exporter.', 'warning'); return; }
    const headers = ['ID','Étudiant','Période','Montant dû (DA)','Montant payé (DA)',
                     'Solde (DA)','Mode','Date paiement','Échéance','Référence','Statut','Retard','Relances'];
    const rows = state.filtered.map(p => [
        p.id,
        p.etudiant_nom || '',
        p.periode || '',
        p.montant_du || '',
        p.montant_paye || '',
        p.solde || '',
        modeLabel(p.mode_paiement),
        p.date_paiement || '',
        p.date_echeance || '',
        p.reference_paiement || '',
        p.statut_paiement || '',
        isOverdue(p) ? 'Oui' : 'Non',
        p.relances_envoyees || 0,
    ]);
    const csv  = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `paiements_${new Date().toISOString().split('T')[0]}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast('Export CSV téléchargé !', 'success');
}

// ============================================================
// UTILITIES
// ============================================================
function createShell(id) {
    const div = document.createElement('div');
    div.id = id;
    div.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;
        display:flex;align-items:center;justify-content:center;`;
    return div;
}
function removeModal(id) { document.getElementById(id)?.remove(); }

// ============================================================
// INJECT STYLES
// ============================================================
function injectStyles() {
    if (document.getElementById('pay-styles')) return;
    const s = document.createElement('style'); s.id = 'pay-styles';
    s.textContent = `
        @media print {
            body > *:not(#modal-recu) { display: none !important; }
            #modal-recu { position: static !important; background: none !important; }
            #modal-recu > div { box-shadow: none !important; }
            #modal-recu button { display: none !important; }
        }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        tbody tr { animation: fadeIn 0.2s ease both; }
        tbody tr:not([style*="background"]):hover { background: #f8fafc; }
        .action-btn { cursor: pointer; transition: all 0.15s; }
        .action-btn:hover { transform: translateY(-1px); opacity: 0.9; }
        /* Overdue row pulse on first load */
        @keyframes overdueFlash {
            0%,100% { background: rgba(220,38,38,0.06); }
            50%      { background: rgba(220,38,38,0.14); }
        }
        tr[data-overdue] { animation: overdueFlash 2s ease 3; }`;
    document.head.appendChild(s);
}

// ============================================================
// SETUP EVENTS
// ============================================================
function setupEvents() {
    document.querySelector('.btn-success, .btn.btn-success')
        ?.addEventListener('click', openModalNouveauPaiement);

    const searchInput = document.querySelector('.search-box input');
    if (searchInput) {
        let tmr;
        searchInput.addEventListener('input', e => {
            clearTimeout(tmr);
            tmr = setTimeout(() => { state.searchTerm = e.target.value.trim(); applyFilters(); }, 300);
        });
    }

    const selects = document.querySelectorAll('.filter-select');

    if (selects[0]) {
        selects[0].addEventListener('change', e => {
            const map = {
                'Payé':    'Paye',
                'Partiel': 'Partiellement_paye',
                'Impayé':  'Impaye',
                'En retard': '__overdue__',
            };
            const val = map[e.target.value];
            if (val === '__overdue__') {
                // Special pseudo-filter: show only overdue
                state.filtered = state.paiements.filter(p => isOverdue(p));
                updateSummaryCards(state.filtered);
                renderTable(state.filtered);
                return;
            }
            state.filterStatut = val || 'all';
            applyFilters();
        });
    }
    if (selects[1]) {
        selects[1].addEventListener('change', e => {
            const v = e.target.value;
            state.filterPeriode = (v === 'Ce mois' || v === 'Mois dernier' || v === 'Cette année') ? v : 'all';
            applyFilters();
        });
    }
    if (selects[2]) {
        selects[2].addEventListener('change', e => {
            const map = { 'Espèces':'Especes', 'Chèque':'Cheque', 'Virement':'Virement' };
            state.filterMode = map[e.target.value] || 'all';
            applyFilters();
        });
    }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;

    injectStyles();
    setupEvents();

    await Promise.all([loadPaiements(), loadEtudiants()]);
});