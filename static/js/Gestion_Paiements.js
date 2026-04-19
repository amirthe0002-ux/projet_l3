/**
 * Gestion des Paiements - Secrétariat / Comptable / Dirigeant
 * JWT Authentication + Django REST API
 * File: static/js/Gestion_Paiements.js
 *
 * API endpoints used:
 *   GET    /api/paiements/          → list (filters: etudiant, statut, periode)
 *   POST   /api/paiements/          → create
 *   GET    /api/paiements/<pk>/     → detail
 *   PUT    /api/paiements/<pk>/     → update
 *   DELETE /api/paiements/<pk>/     → delete
 *   GET    /api/etudiants/          → for student selector in modal
 *
 * Paiement model fields:
 *   etudiant, montant_du, montant_paye, solde (read-only, computed),
 *   mode_paiement, date_paiement, reference_paiement,
 *   statut_paiement, periode, date_echeance
 *
 * statut_paiement choices: Paye | Partiellement_paye | Impaye
 * mode_paiement choices:   Especes | Cheque | Virement | Carte
 */

const API_URL = '/api';

const state = {
    paiements:  [],
    filtered:   [],
    etudiants:  [],
    searchTerm: '',
    filterStatut: 'all',
    filterPeriode: 'all',
    filterMode:   'all',
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
    // IsComptable permission = Secretariat + Comptable + Dirigeant
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
}

// ============================================================
// SUMMARY CARDS
// ============================================================
function updateSummaryCards(paiements) {
    const totalPaye  = paiements
        .reduce((s, p) => s + parseFloat(p.montant_paye || 0), 0);
    const totalReste = paiements
        .filter(p => p.statut_paiement !== 'Paye')
        .reduce((s, p) => s + parseFloat(p.solde || 0), 0);
    const retards    = paiements.filter(p => p.statut_paiement === 'Impaye').length;

    // Summary cards (3 big ones)
    const cards = document.querySelectorAll('.summary-card .amount-large');
    if (cards[0]) cards[0].textContent = fmtDA(totalPaye);
    if (cards[1]) cards[1].textContent = fmtDA(totalReste);
    if (cards[2]) cards[2].textContent = retards;

    // Stat boxes
    const statPs = document.querySelectorAll('.stat-box p');
    const complets   = paiements.filter(p => p.statut_paiement === 'Paye').length;
    const partiels   = paiements.filter(p => p.statut_paiement === 'Partiellement_paye').length;
    const impayes    = paiements.filter(p => p.statut_paiement === 'Impaye').length;
    const total      = paiements.length || 1;
    const taux       = Math.round((complets / total) * 100);

    if (statPs[0]) statPs[0].textContent = complets;
    if (statPs[1]) statPs[1].textContent = partiels;
    if (statPs[2]) statPs[2].textContent = impayes;
    if (statPs[3]) statPs[3].textContent = taux + '%';
}

// ============================================================
// RENDER TABLE
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
        const groupe      = '—'; // not in PaiementSerializer, shown separately
        const solde       = parseFloat(p.solde || 0);
        const isPaye      = p.statut_paiement === 'Paye';

        // Action buttons based on status
        let actionBtn = '';
        if (isPaye) {
            actionBtn = `<button class="action-btn validate" onclick="openModalRecu(${p.id})"
                title="Voir le reçu">
                <i class="fas fa-receipt"></i> Reçu
            </button>`;
        } else {
            actionBtn = `
                <button class="action-btn remind" onclick="relancerPaiement(${p.id})"
                    title="Envoyer une relance">
                    <i class="fas fa-bell"></i> Relancer
                </button>
                <button class="action-btn validate" onclick="openModalModifier(${p.id})"
                    title="Enregistrer un paiement" style="background:#059669;color:white;border:none;">
                    <i class="fas fa-money-bill"></i> Payer
                </button>`;
        }

        return `
        <tr data-id="${p.id}">
            <td>
                <div style="font-weight:600;">${nomEtudiant}</div>
                <div style="font-size:0.8rem;color:#64748b;">${p.periode || '—'}</div>
            </td>
            <td>${p.periode || '—'}</td>
            <td class="amount">${fmtDA(p.montant_du)}</td>
            <td class="amount paid">${fmtDA(p.montant_paye)}</td>
            <td class="${solde > 0 ? 'amount unpaid' : ''}">${solde > 0 ? fmtDA(solde) : '—'}</td>
            <td>${modeLabel(p.mode_paiement)}</td>
            <td>${fmtDate(p.date_paiement)}</td>
            <td>${statutBadge(p.statut_paiement)}</td>
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

    removeModal('modal-details');
    const modal = createShell('modal-details');
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:2rem;width:90%;max-width:480px;
                    max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="margin:0;font-size:1.1rem;">
                    <i class="fas fa-file-invoice" style="color:#6366f1;margin-right:8px;"></i>Détail Paiement
                </h3>
                <button onclick="removeModal('modal-details')"
                    style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">&times;</button>
            </div>

            <div style="display:flex;flex-direction:column;gap:0.75rem;margin-bottom:1.5rem;">
                ${[
                    ['👤', 'Étudiant',    p.etudiant_nom || '—'],
                    ['📅', 'Période',     p.periode || '—'],
                    ['💵', 'Montant dû',  fmtDA(p.montant_du)],
                    ['✅', 'Montant payé',fmtDA(p.montant_paye)],
                    ['🔴', 'Reste',       parseFloat(p.solde||0) > 0 ? fmtDA(p.solde) : '—'],
                    ['💳', 'Mode',        modeLabel(p.mode_paiement)],
                    ['🗓', 'Date paiement',fmtDate(p.date_paiement)],
                    ['📋', 'Référence',   p.reference_paiement || '—'],
                    ['📆', 'Échéance',    fmtDate(p.date_echeance)],
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

        // Total paid = previous amount + new amount (capped at montant_du)
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

        // Update local state
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
                        <label style="${lbl()}">Date d'échéance</label>
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
// MODAL — REÇU (print-friendly)
// ============================================================
function openModalRecu(paiementId) {
    const p = state.paiements.find(x => x.id === paiementId);
    if (!p) return;

    removeModal('modal-recu');
    const modal = createShell('modal-recu');
    modal.innerHTML = `
        <div id="recu-content" style="background:white;border-radius:16px;padding:2rem;
                    width:90%;max-width:460px;" onclick="event.stopPropagation()">
            <!-- Header reçu -->
            <div style="text-align:center;margin-bottom:1.5rem;padding-bottom:1rem;
                        border-bottom:2px dashed #e2e8f0;">
                <i class="fas fa-graduation-cap" style="font-size:2rem;color:#6366f1;"></i>
                <h2 style="margin:0.5rem 0 0;font-size:1.3rem;font-weight:800;color:#1e293b;">LanguePro</h2>
                <p style="color:#64748b;font-size:0.8rem;margin:4px 0;">Centre de Formation en Langues</p>
                <p style="font-size:0.75rem;color:#94a3b8;">REÇU DE PAIEMENT</p>
            </div>

            <!-- Référence -->
            <div style="display:flex;justify-content:space-between;margin-bottom:1rem;">
                <span style="font-size:0.8rem;color:#64748b;">N° Reçu</span>
                <strong style="font-size:0.8rem;">#PAY${String(p.id).padStart(5,'0')}</strong>
            </div>

            <!-- Corps reçu -->
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

            <!-- Total -->
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
// RELANCER PAIEMENT (send reminder notification)
// ============================================================
async function relancerPaiement(paiementId) {
    const p = state.paiements.find(x => x.id === paiementId);
    if (!p) return;
    const nom = p.etudiant_nom || 'cet étudiant';

    if (!confirm(`Envoyer une relance de paiement à ${nom} ?`)) return;

    // Increment relances_envoyees on the paiement record
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

    // Update local state
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
                     'Solde (DA)','Mode','Date paiement','Référence','Statut','Relances'];
    const rows = state.filtered.map(p => [
        p.id,
        p.etudiant_nom || '',
        p.periode || '',
        p.montant_du || '',
        p.montant_paye || '',
        p.solde || '',
        modeLabel(p.mode_paiement),
        p.date_paiement || '',
        p.reference_paiement || '',
        p.statut_paiement || '',
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
// INJECT PRINT STYLE (for reçu)
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
        tbody tr:hover { background: #f8fafc; }
        .action-btn { cursor: pointer; transition: all 0.15s; }
        .action-btn:hover { transform: translateY(-1px); opacity: 0.9; }`;
    document.head.appendChild(s);
}

// ============================================================
// SETUP EVENTS
// ============================================================
function setupEvents() {
    // "Enregistrer un paiement" button
    document.querySelector('.btn-success, .btn.btn-success')
        ?.addEventListener('click', openModalNouveauPaiement);

    // Search
    const searchInput = document.querySelector('.search-box input');
    if (searchInput) {
        let tmr;
        searchInput.addEventListener('input', e => {
            clearTimeout(tmr);
            tmr = setTimeout(() => { state.searchTerm = e.target.value.trim(); applyFilters(); }, 300);
        });
    }

    // Filters — 3 selects: statut | periode | mode
    const selects = document.querySelectorAll('.filter-select');

    if (selects[0]) {
        selects[0].addEventListener('change', e => {
            const map = { 'Payé':'Paye', 'Partiel':'Partiellement_paye', 'Impayé':'Impaye' };
            state.filterStatut = map[e.target.value] || 'all';
            applyFilters();
        });
    }
    if (selects[1]) {
        selects[1].addEventListener('change', e => {
            const v = e.target.value;
            state.filterPeriode = (v === 'Ce mois' || v === 'Mois dernier' || v === 'Cette année') ? v : 'all';
            // Simple text match — server-side filtering would be better for large datasets
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

    // Load etudiants in background, paiements immediately
    await Promise.all([loadPaiements(), loadEtudiants()]);
});