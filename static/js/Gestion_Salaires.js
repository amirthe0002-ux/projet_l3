/**
 * Gestion des Salaires - Secrétariat / Comptable / Dirigeant
 * JWT Authentication + Django REST API
 * File: static/js/Gestion_Salaires.js
 *
 * FULLY FIXED VERSION - JWT only, no CSRF issues
 */

const API_URL = '/api';

const state = {
    bulletins:    [],
    enseignants:  [],
    currentDate:  new Date(),
    currentPeriode: '',
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
    const h = { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

// ============================================================
// API - FIXED FOR JWT (NO CSRF)
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
    const fullUrl = `${API_URL}${endpoint}`;
    
    try {
        const res = await fetch(fullUrl, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
            // IMPORTANT: No credentials mode to avoid CSRF cookies
            credentials: 'same-origin'
        });
        
        if (res.status === 401) {
            localStorage.removeItem('access');
            localStorage.removeItem('user');
            window.location.href = '/login/';
            return { error: 'JWT_INVALID', message: 'Session expirée' };
        }
        if (res.status === 403) {
            let msg = 'Accès refusé.';
            try { const d = await res.json(); msg = d.detail || d.error || msg; } catch {}
            return { error: 'FORBIDDEN', message: msg };
        }
        if (res.status === 500) {
            let errorData = {};
            try { errorData = await res.json(); } catch {}
            console.error('🔥 SERVER 500 ERROR:', errorData);
            return { 
                error: 'SERVER_ERROR', 
                message: errorData.error || errorData.detail || 'Erreur serveur interne',
                traceback: errorData.traceback 
            };
        }
        if (res.status === 400) {
            let errorData = {};
            try { errorData = await res.json(); } catch {}
            return { 
                error: 'VALIDATION_ERROR', 
                message: flattenDRFErrors(errorData),
                raw: errorData 
            };
        }
        if (res.status === 204) return { success: true };
        
        const data = await res.json();
        if (!res.ok) return { error: 'API_ERROR', message: flattenDRFErrors(data), raw: data };
        return data;
        
    } catch (err) {
        console.error('Network error:', err);
        return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible: ' + err.message };
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
    document.querySelector('.toast-sal')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-sal';
    t.style.cssText = `
        position:fixed;bottom:24px;right:24px;z-index:9999;
        padding:14px 22px;border-radius:12px;background:${colors[type]};color:white;
        font-weight:500;font-size:0.9rem;box-shadow:0 8px 24px rgba(0,0,0,0.2);
        display:flex;align-items:center;gap:8px;max-width:420px;
        transform:translateX(120%);opacity:0;transition:all 0.3s ease;
        white-space: pre-line;
    `;
    t.innerHTML = `<span style="font-size:1.2rem;">${icons[type]}</span><span>${message}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; t.style.opacity = '1'; });
    setTimeout(() => {
        t.style.transform = 'translateX(120%)'; t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 5000);
}

// ============================================================
// HELPERS
// ============================================================
function fmtDA(v) {
    if (v === null || v === undefined || v === '' || isNaN(v)) return '—';
    try {
        return new Intl.NumberFormat('fr-DZ').format(parseFloat(v)) + ' DA';
    } catch {
        return v + ' DA';
    }
}

function fmtDate(d) { 
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('fr-DZ'); } 
    catch { return String(d); }
}

function getInitials(nom) {
    if (!nom) return '??';
    return nom.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function avatarGradient(i) {
    const g = [
        'linear-gradient(135deg,#3b82f6,#8b5cf6)',
        'linear-gradient(135deg,#ec4899,#f472b6)',
        'linear-gradient(135deg,#f59e0b,#fbbf24)',
        'linear-gradient(135deg,#10b981,#34d399)',
        'linear-gradient(135deg,#6366f1,#a855f7)',
        'linear-gradient(135deg,#ef4444,#f87171)',
        'linear-gradient(135deg,#14b8a6,#2dd4bf)',
        'linear-gradient(135deg,#f97316,#fb923c)',
    ];
    return g[i % g.length];
}

function statutBadge(statut) {
    const map = {
        'Paye':      { cls: 'status-paid',    label: 'Payé' },
        'En_attente':{ cls: 'status-pending',  label: 'En attente' },
        'Rejete':    { cls: 'status-rejected', label: 'Rejeté' },
    };
    const s = map[statut] || { cls: 'status-pending', label: statut || '—' };
    return `<span class="status-badge ${s.cls}">${s.label}</span>`;
}

function buildPeriode(date) {
    try {
        return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
                   .replace(/^./, c => c.toUpperCase());
    } catch { return ''; }
}

function inp() {
    return `width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:8px;
            font-size:0.9rem;outline:none;box-sizing:border-box;font-family:inherit;background:#f9fafb;`;
}

function lbl() {
    return `font-size:0.875rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;`;
}

// ============================================================
// MONTH NAVIGATION
// ============================================================
function updateMonthDisplay() {
    state.currentPeriode = buildPeriode(state.currentDate);
    const h2 = document.querySelector('.month-selector h2');
    if (h2) h2.textContent = state.currentPeriode;
}

function prevMonth() {
    state.currentDate.setMonth(state.currentDate.getMonth() - 1);
    updateMonthDisplay();
    loadData();
}

function nextMonth() {
    state.currentDate.setMonth(state.currentDate.getMonth() + 1);
    updateMonthDisplay();
    loadData();
}

// ============================================================
// LOAD DATA
// ============================================================
async function loadEnseignants() {
    const data = await apiFetch('/enseignants/');
    if (!data?.error) state.enseignants = Array.isArray(data) ? data : (data.results || []);
}

async function loadBulletins() {
    const url = `/bulletins/${state.currentPeriode ? '?periode=' + encodeURIComponent(state.currentPeriode) : ''}`;
    const data = await apiFetch(url);
    if (!data?.error) state.bulletins = Array.isArray(data) ? data : (data.results || []);
}

async function loadData() {
    const tbody = document.querySelector('tbody');
    if (tbody) tbody.innerHTML = `
        <tr><td colspan="8" style="text-align:center;padding:3rem;color:#94a3b8;">
            <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;display:block;margin-bottom:.5rem;"></i>
            Chargement...
        </td></tr>`;

    await Promise.all([loadEnseignants(), loadBulletins()]);
    updateSummaryCards();
    renderTable();
}

// ============================================================
// SUMMARY CARDS
// ============================================================
function updateSummaryCards() {
    const b = state.bulletins;
    const totalHeures = b.reduce((s, x) => s + (parseFloat(x.heures_travaillees) || 0), 0);
    const totalBrut   = b.reduce((s, x) => s + (parseFloat(x.salaire_brut) || 0), 0);
    const totalDed    = b.reduce((s, x) => s + (parseFloat(x.total_retenues) || 0), 0);
    const totalNet    = b.reduce((s, x) => s + (parseFloat(x.salaire_net) || 0), 0);

    const sumPs = document.querySelectorAll('.summary-item p');
    if (sumPs[0]) sumPs[0].textContent = totalHeures.toLocaleString('fr-DZ') + 'h';
    if (sumPs[1]) sumPs[1].textContent = fmtDA(totalBrut);
    if (sumPs[2]) sumPs[2].textContent = fmtDA(totalDed);
    if (sumPs[3]) sumPs[3].textContent = fmtDA(totalNet);

    const payes = b.filter(x => x.statut_paiement === 'Paye').length;
    const total = Math.max(state.enseignants.length, 1);
    const attente = b.filter(x => x.statut_paiement === 'En_attente').length;
    const hSupp = b.reduce((s, x) => {
        const normal = 40;
        const h = parseFloat(x.heures_travaillees) || 0;
        return s + Math.max(0, h - normal);
    }, 0);

    const statPs = document.querySelectorAll('.stat-box p');
    if (statPs[0]) statPs[0].textContent = `${payes}/${total}`;
    if (statPs[1]) statPs[1].textContent = attente;
    if (statPs[2]) statPs[2].textContent = hSupp + 'h';
    if (statPs[3]) statPs[3].textContent = b.filter(x => x.statut_paiement === 'Rejete').length;
}

// ============================================================
// RENDER TABLE
// ============================================================
function renderTable() {
    const tbody = document.querySelector('tbody');
    if (!tbody) return;

    const rows = state.enseignants.map((ens, i) => {
        const bulletin = state.bulletins.find(b => b.enseignant === ens.id) || null;
        return { ens, bulletin, i };
    });

    if (!rows.length) {
        tbody.innerHTML = `
            <tr><td colspan="8" style="text-align:center;padding:3rem;color:#94a3b8;">
                <i class="fas fa-users-slash" style="font-size:2rem;display:block;margin-bottom:.5rem;"></i>
                <p style="font-weight:600;">Aucun enseignant trouvé</p>
            </td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(({ ens, bulletin, i }) => {
        const nom = ens.nom_complet ||
            `${ens.user?.first_name || ''} ${ens.user?.last_name || ''}`.trim() || `#${ens.id}`;
        const langue = ens.langue_enseignee || '—';
        const tarif = parseFloat(ens.tarif_horaire) || 0;
        const heures = bulletin ? (parseFloat(bulletin.heures_travaillees) || 0) : 0;
        const brut = bulletin ? (parseFloat(bulletin.salaire_brut) || 0) : 0;
        const deductions = bulletin ? (parseFloat(bulletin.total_retenues) || 0) : 0;
        const net = bulletin ? (parseFloat(bulletin.salaire_net) || 0) : 0;
        const statut = bulletin ? bulletin.statut_paiement : 'En_attente';
        const bulId = bulletin ? bulletin.id : null;

        const actionBtn = bulletin
            ? (statut === 'Paye'
                ? `<button class="action-btn payslip" onclick="openModalBulletin(${bulId})">
                       <i class="fas fa-file-pdf"></i> Bulletin
                   </button>`
                : `<button class="action-btn pay" onclick="openModalPayer(${bulId})">
                       <i class="fas fa-money-bill-wave"></i> Payer
                   </button>
                   <button class="action-btn payslip" onclick="openModalBulletin(${bulId})" style="margin-left:4px;">
                       <i class="fas fa-eye"></i>
                   </button>`)
            : `<button class="action-btn pay" onclick="openModalCalculer(${ens.id})" style="background:#6366f1;color:white;border:none;">
                   <i class="fas fa-calculator"></i> Calculer
               </button>`;

        return `
        <tr data-ens-id="${ens.id}" data-bul-id="${bulId || ''}">
            <td>
                <div class="teacher-info">
                    <div class="teacher-avatar" style="background:${avatarGradient(i)};">${getInitials(nom)}</div>
                    <div>
                        <div style="font-weight:600;">${nom}</div>
                        <div style="font-size:0.8rem;opacity:0.7;">${langue}</div>
                    </div>
                </div>
            </td>
            <td>${fmtDA(tarif)}</td>
            <td>
                <input type="number" class="hours-input" min="0" step="0.5"
                       value="${heures}" data-ens-id="${ens.id}" data-bul-id="${bulId || ''}"
                       data-tarif="${tarif}"
                       style="width:70px;padding:4px 8px;border:1px solid #e5e7eb;
                              border-radius:6px;font-size:0.9rem;text-align:center;"
                       ${statut === 'Paye' ? 'disabled' : ''}>
            </td>
            <td class="amount">${fmtDA(brut)}</td>
            <td class="deductions">${deductions > 0 ? '-' + fmtDA(deductions) : '—'}</td>
            <td class="amount total">${fmtDA(net)}</td>
            <td>${statutBadge(statut)}</td>
            <td>
                <div class="action-btns">${actionBtn}</div>
            </td>
        </tr>`;
    }).join('');

    document.querySelectorAll('.hours-input').forEach(input => {
        input.addEventListener('input', e => {
            const row = e.target.closest('tr');
            const heures = parseFloat(e.target.value) || 0;
            const tarif = parseFloat(e.target.dataset.tarif) || 0;
            const brut = heures * tarif;
            const cells = row.querySelectorAll('td');
            if (cells[3]) cells[3].textContent = fmtDA(brut);
            if (cells[5]) cells[5].textContent = fmtDA(brut);
        });
    });
}

// ============================================================
// MODAL — CALCULER / CRÉER BULLETIN
// ============================================================
async function openModalCalculer(enseignantId) {
    const ens = state.enseignants.find(e => e.id === enseignantId);
    if (!ens) {
        showToast('Erreur: Enseignant non trouvé', 'error');
        return;
    }

    const tarif = parseFloat(ens.tarif_horaire) || 0;
    if (!tarif || tarif <= 0) {
        showToast(`Erreur: Tarif horaire non défini pour ${ens.nom_complet || 'cet enseignant'}`, 'error');
        return;
    }

    const rowInput = document.querySelector(`input.hours-input[data-ens-id="${enseignantId}"]`);
    const prefilledHeures = rowInput ? (parseFloat(rowInput.value) || 0) : 0;

    const nom = ens.nom_complet ||
        `${ens.user?.first_name || ''} ${ens.user?.last_name || ''}`.trim() || `Enseignant #${ens.id}`;
    const today = new Date().toISOString().split('T')[0];

    removeModal('modal-calculer');
    const modal = createShell('modal-calculer');
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:2rem;width:90%;max-width:480px;
                    max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="margin:0;font-size:1.1rem;">
                    <i class="fas fa-calculator" style="color:#6366f1;margin-right:8px;"></i>
                    Calculer Salaire — ${nom}
                </h3>
                <button onclick="removeModal('modal-calculer')"
                    style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">&times;</button>
            </div>

            <div style="background:#f8fafc;border-radius:10px;padding:1rem;margin-bottom:1.25rem;
                        display:flex;justify-content:space-between;">
                <span style="color:#64748b;font-size:0.875rem;">Tarif horaire</span>
                <strong style="color:#6366f1;">${fmtDA(tarif)}</strong>
            </div>

            <div style="display:flex;flex-direction:column;gap:.85rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="${lbl()}">Heures travaillées *</label>
                        <input id="c_heures" type="number" min="0" step="0.5"
                               value="${prefilledHeures}" placeholder="0" style="${inp()}">
                    </div>
                    <div>
                        <label style="${lbl()}">Période</label>
                        <input id="c_periode" type="text" value="${state.currentPeriode}"
                               placeholder="Mars 2025" style="${inp()}">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
                    <div>
                        <label style="${lbl()}">Assurance (DA)</label>
                        <input id="c_assurance" type="number" min="0" step="0.01" value="0" style="${inp()}">
                    </div>
                    <div>
                        <label style="${lbl()}">Cotisations (DA)</label>
                        <input id="c_cotisations" type="number" min="0" step="0.01" value="0" style="${inp()}">
                    </div>
                    <div>
                        <label style="${lbl()}">Autres (DA)</label>
                        <input id="c_autres" type="number" min="0" step="0.01" value="0" style="${inp()}">
                    </div>
                </div>

                <div id="calc_preview" style="background:#f0fdf4;border:1px solid #bbf7d0;
                     border-radius:10px;padding:1rem;">
                    <p style="font-size:0.8rem;color:#166534;font-weight:700;margin-bottom:.6rem;">
                        Aperçu du calcul
                    </p>
                    <div style="display:flex;flex-direction:column;gap:4px;font-size:0.875rem;">
                        <div style="display:flex;justify-content:space-between;">
                            <span style="color:#374151;">Salaire brut</span>
                            <span id="prev_brut" style="font-weight:700;">—</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="color:#374151;">Total retenues</span>
                            <span id="prev_ret" style="font-weight:700;color:#dc2626;">—</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;
                                    padding-top:6px;border-top:1px solid #bbf7d0;margin-top:4px;">
                            <span style="color:#166534;font-weight:700;">Salaire net</span>
                            <span id="prev_net" style="font-weight:800;color:#059669;font-size:1rem;">—</span>
                        </div>
                    </div>
                </div>

                <div id="calcError" style="display:none;padding:.75rem;background:#fef2f2;
                     border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:.85rem;"></div>

                <button id="btnSaveCalc" style="width:100%;padding:.875rem;border:none;border-radius:10px;
                    background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;
                    font-weight:700;font-size:1rem;cursor:pointer;">
                    <i class="fas fa-save"></i> Générer le bulletin
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);

    function calcPreview() {
        const h = parseFloat(document.getElementById('c_heures')?.value) || 0;
        const ass = parseFloat(document.getElementById('c_assurance')?.value) || 0;
        const cot = parseFloat(document.getElementById('c_cotisations')?.value) || 0;
        const aut = parseFloat(document.getElementById('c_autres')?.value) || 0;
        const brut = h * tarif;
        const ret = ass + cot + aut;
        const net = brut - ret;
        
        const elBrut = document.getElementById('prev_brut');
        const elRet = document.getElementById('prev_ret');
        const elNet = document.getElementById('prev_net');
        
        if (elBrut) elBrut.textContent = fmtDA(brut);
        if (elRet) elRet.textContent = ret > 0 ? '- ' + fmtDA(ret) : '—';
        if (elNet) elNet.textContent = fmtDA(net);
    }
    
    ['c_heures', 'c_assurance', 'c_cotisations', 'c_autres'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', calcPreview);
    });
    calcPreview();

    document.getElementById('btnSaveCalc')?.addEventListener('click', async () => {
        const errEl = document.getElementById('calcError');
        errEl.style.display = 'none';
        
        const btn = document.getElementById('btnSaveCalc');
        const heuresVal = document.getElementById('c_heures')?.value;
        const periode = document.getElementById('c_periode')?.value?.trim();
        const assuranceVal = document.getElementById('c_assurance')?.value;
        const cotisationsVal = document.getElementById('c_cotisations')?.value;
        const autresVal = document.getElementById('c_autres')?.value;

        const heures = parseFloat(heuresVal);
        if (!heuresVal || isNaN(heures) || heures <= 0) {
            errEl.textContent = 'Les heures travaillées doivent être > 0.';
            errEl.style.display = 'block';
            return;
        }
        
        if (!periode) {
            errEl.textContent = 'La période est obligatoire.';
            errEl.style.display = 'block';
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération...';
        btn.disabled = true;

        // Build payload with proper types for Django
    const payload = {
    enseignant: parseInt(enseignantId),
    periode: String(periode),
    heures_travaillees: parseFloat(heures.toFixed(2)),
    tarif_horaire: parseFloat(tarif.toFixed(2)),
    assurance: parseFloat((parseFloat(assuranceVal) || 0).toFixed(2)),
    cotisations: parseFloat((parseFloat(cotisationsVal) || 0).toFixed(2)),
    autres_retenues: parseFloat((parseFloat(autresVal) || 0).toFixed(2)),
    statut_paiement: 'En_attente',
    mode_paiement: null,
    date_paiement: null,
};
        
        console.log('📤 Sending payload:', JSON.stringify(payload, null, 2));

        const result = await apiFetch('/bulletins/', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        console.log('📥 Result:', result);

        if (result?.error) {
            let errorMsg = result.message;
            if (result.traceback) {
                console.error('Server traceback:', result.traceback);
            }
            errEl.textContent = '❌ ' + errorMsg;
            errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-save"></i> Générer le bulletin';
            btn.disabled = false;
            return;
        }

        state.bulletins.push(result);
        removeModal('modal-calculer');
        updateSummaryCards();
        renderTable();
        showToast(`✅ Bulletin de ${nom} généré pour ${periode} !`, 'success');
    });
}

// ============================================================
// MODAL — PAYER UN BULLETIN
// ============================================================
async function openModalPayer(bulletinId) {
    const b = state.bulletins.find(x => x.id === bulletinId);
    if (!b) {
        showToast('Erreur: Bulletin non trouvé', 'error');
        return;
    }

    const ens = state.enseignants.find(e => e.id === b.enseignant);
    const nom = b.enseignant_nom || ens?.nom_complet ||
        `${ens?.user?.first_name || ''} ${ens?.user?.last_name || ''}`.trim() || `#${b.enseignant}`;
    const today = new Date().toISOString().split('T')[0];

    removeModal('modal-payer');
    const modal = createShell('modal-payer');
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:2rem;width:90%;max-width:460px;
                    max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="margin:0;font-size:1.1rem;">
                    <i class="fas fa-money-bill-wave" style="color:#059669;margin-right:8px;"></i>
                    Payer Salaire — ${nom}
                </h3>
                <button onclick="removeModal('modal-payer')"
                    style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">&times;</button>
            </div>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;
                        padding:1rem;margin-bottom:1.25rem;">
                <p style="font-size:0.8rem;color:#166534;font-weight:700;margin-bottom:.6rem;">
                    Résumé — ${b.periode}
                </p>
                ${[
                    ['Heures', (b.heures_travaillees || 0) + 'h'],
                    ['Salaire brut', fmtDA(b.salaire_brut)],
                    ['Retenues', b.total_retenues > 0 ? '- ' + fmtDA(b.total_retenues) : '—'],
                ].map(([lb, v]) => `
                    <div style="display:flex;justify-content:space-between;font-size:.875rem;margin-bottom:4px;">
                        <span style="color:#374151;">${lb}</span><strong>${v}</strong>
                    </div>`).join('')}
                <div style="display:flex;justify-content:space-between;font-size:1rem;
                            padding-top:8px;border-top:1px solid #bbf7d0;margin-top:4px;">
                    <span style="color:#166534;font-weight:700;">Salaire net à payer</span>
                    <strong style="color:#059669;font-size:1.2rem;">${fmtDA(b.salaire_net)}</strong>
                </div>
            </div>

            <div style="display:flex;flex-direction:column;gap:.85rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="${lbl()}">Mode de paiement *</label>
                        <select id="p_mode" style="${inp()}">
                            <option value="Virement">Virement bancaire</option>
                            <option value="Especes">Espèces</option>
                            <option value="Cheque">Chèque</option>
                        </select>
                    </div>
                    <div>
                        <label style="${lbl()}">Date de paiement *</label>
                        <input id="p_date" type="date" value="${today}" style="${inp()}">
                    </div>
                </div>

                <div id="payError" style="display:none;padding:.75rem;background:#fef2f2;
                     border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:.85rem;"></div>

                <button id="btnConfirmPay" style="width:100%;padding:.875rem;border:none;border-radius:10px;
                    background:linear-gradient(135deg,#059669,#10b981);color:white;
                    font-weight:700;font-size:1rem;cursor:pointer;">
                    <i class="fas fa-check-circle"></i> Confirmer le paiement
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);

    document.getElementById('btnConfirmPay')?.addEventListener('click', async () => {
        const errEl = document.getElementById('payError');
        errEl.style.display = 'none';
        
        const btn = document.getElementById('btnConfirmPay');
        const mode = document.getElementById('p_mode')?.value;
        const date = document.getElementById('p_date')?.value;

        if (!date) {
            errEl.textContent = 'Date obligatoire.';
            errEl.style.display = 'block';
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement...';
        btn.disabled = true;

        const payload = {
            enseignant: parseInt(b.enseignant),
            periode: String(b.periode),
            heures_travaillees: parseFloat(parseFloat(b.heures_travaillees).toFixed(2)),
            tarif_horaire: parseFloat(parseFloat(b.tarif_horaire).toFixed(2)),
            assurance: b.assurance ? parseFloat(parseFloat(b.assurance).toFixed(2)) : 0,
            cotisations: b.cotisations ? parseFloat(parseFloat(b.cotisations).toFixed(2)) : 0,
            autres_retenues: b.autres_retenues ? parseFloat(parseFloat(b.autres_retenues).toFixed(2)) : 0,
            mode_paiement: String(mode),
            date_paiement: date,
            statut_paiement: 'Paye',
        };
        
        console.log('📤 Updating bulletin:', JSON.stringify(payload, null, 2));

        const result = await apiFetch(`/bulletins/${bulletinId}/`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });

        console.log('📥 Result:', result);

        if (result?.error) {
            let errorMsg = result.message;
            if (result.traceback) {
                console.error('Server traceback:', result.traceback);
            }
            errEl.textContent = '❌ ' + errorMsg;
            errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Confirmer le paiement';
            btn.disabled = false;
            return;
        }

        const idx = state.bulletins.findIndex(x => x.id === bulletinId);
        if (idx !== -1) state.bulletins[idx] = result;

        removeModal('modal-payer');
        updateSummaryCards();
        renderTable();
        showToast(`✅ Salaire de ${nom} marqué comme payé !`, 'success');
    });
}

// ============================================================
// MODAL — VOIR / IMPRIMER BULLETIN
// ============================================================
function openModalBulletin(bulletinId) {
    const b = state.bulletins.find(x => x.id === bulletinId);
    if (!b) {
        showToast('Erreur: Bulletin non trouvé', 'error');
        return;
    }

    const ens = state.enseignants.find(e => e.id === b.enseignant);
    const nom = b.enseignant_nom || ens?.nom_complet ||
        `${ens?.user?.first_name || ''} ${ens?.user?.last_name || ''}`.trim() || 'Enseignant';

    removeModal('modal-bulletin');
    const modal = createShell('modal-bulletin');
    modal.innerHTML = `
        <div id="bulletin-print" style="background:white;border-radius:16px;padding:2rem;
                    width:90%;max-width:460px;" onclick="event.stopPropagation()">
            <div style="text-align:center;padding-bottom:1.25rem;border-bottom:2px dashed #e2e8f0;
                        margin-bottom:1.25rem;">
                <i class="fas fa-graduation-cap" style="font-size:2rem;color:#6366f1;"></i>
                <h2 style="margin:.5rem 0 0;font-size:1.2rem;font-weight:800;color:#1e293b;">LanguePro</h2>
                <p style="color:#64748b;font-size:.8rem;margin:4px 0;">Centre de Formation en Langues</p>
                <p style="font-weight:700;font-size:.9rem;margin-top:.5rem;color:#374151;">
                    BULLETIN DE SALAIRE
                </p>
                <p style="font-size:.8rem;color:#94a3b8;">Période : ${b.periode}</p>
            </div>

            <div style="display:flex;justify-content:space-between;margin-bottom:1rem;">
                <span style="font-size:.8rem;color:#64748b;">Enseignant</span>
                <strong style="font-size:.875rem;">${nom}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:1rem;">
                <span style="font-size:.8rem;color:#64748b;">N° Bulletin</span>
                <strong style="font-size:.875rem;">#BUL${String(b.id).padStart(5, '0')}</strong>
            </div>

            <div style="background:#f8fafc;border-radius:10px;padding:1rem;margin-bottom:1rem;">
                ${[
                    ['Tarif horaire', fmtDA(b.tarif_horaire)],
                    ['Heures travaillées', (b.heures_travaillees || 0) + 'h'],
                ].map(([lb, v]) => `
                    <div style="display:flex;justify-content:space-between;
                                padding:.4rem 0;border-bottom:1px solid #f1f5f9;font-size:.875rem;">
                        <span style="color:#64748b;">${lb}</span><strong>${v}</strong>
                    </div>`).join('')}
                <div style="display:flex;justify-content:space-between;
                            padding:.6rem 0;font-size:.95rem;margin-top:4px;">
                    <span style="color:#1e293b;font-weight:700;">Salaire brut</span>
                    <strong style="color:#1e293b;">${fmtDA(b.salaire_brut)}</strong>
                </div>
            </div>

            <div style="background:#fef2f2;border-radius:10px;padding:1rem;margin-bottom:1rem;">
                <p style="font-size:.8rem;font-weight:700;color:#dc2626;margin-bottom:.5rem;">Retenues</p>
                ${[
                    ['Assurance', b.assurance],
                    ['Cotisations', b.cotisations],
                    ['Autres retenues', b.autres_retenues],
                ].filter(([, v]) => v && parseFloat(v) > 0).map(([lb, v]) => `
                    <div style="display:flex;justify-content:space-between;font-size:.875rem;margin-bottom:4px;">
                        <span style="color:#64748b;">${lb}</span>
                        <strong style="color:#dc2626;">- ${fmtDA(v)}</strong>
                    </div>`).join('') || '<p style="color:#94a3b8;font-size:.8rem;text-align:center;">Aucune retenue</p>'}
                <div style="display:flex;justify-content:space-between;font-size:.875rem;
                            padding-top:6px;border-top:1px solid #fecaca;margin-top:4px;">
                    <span style="color:#dc2626;font-weight:700;">Total retenues</span>
                    <strong style="color:#dc2626;">- ${fmtDA(b.total_retenues)}</strong>
                </div>
            </div>

            <div style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:10px;
                        padding:1rem;text-align:center;margin-bottom:1.5rem;">
                <p style="font-size:.8rem;color:#065f46;margin-bottom:4px;">Salaire Net à Percevoir</p>
                <p style="font-size:2rem;font-weight:800;color:#059669;margin:0;">${fmtDA(b.salaire_net)}</p>
                ${b.date_paiement
                    ? `<p style="font-size:.75rem;color:#065f46;margin-top:4px;">
                          Payé le ${fmtDate(b.date_paiement)} via ${b.mode_paiement || '—'}
                       </p>`
                    : `<p style="font-size:.75rem;color:#d97706;margin-top:4px;">⏳ En attente de paiement</p>`}
                ${statutBadge(b.statut_paiement)}
            </div>

            <div style="display:flex;gap:.75rem;">
                <button onclick="removeModal('modal-bulletin')"
                    style="flex:1;padding:.75rem;border:1px solid #ddd;background:white;
                           border-radius:8px;cursor:pointer;font-weight:600;">Fermer</button>
                <button onclick="window.print()"
                    style="flex:1;padding:.75rem;background:#6366f1;color:white;
                           border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                    <i class="fas fa-print"></i> Imprimer
                </button>
                ${b.statut_paiement !== 'Paye'
                    ? `<button onclick="removeModal('modal-bulletin');openModalPayer(${bulletinId});"
                           style="flex:1;padding:.75rem;background:#059669;color:white;
                                  border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                           <i class="fas fa-money-bill-wave"></i> Payer
                       </button>` : ''}
            </div>
        </div>`;

    document.body.appendChild(modal);
}

// ============================================================
// CALCULER TOUS LES SALAIRES
// ============================================================
async function calculerTousSalaires() {
    const enseignantsSansBulletin = state.enseignants.filter(
        e => !state.bulletins.find(b => b.enseignant === e.id)
    );

    if (!enseignantsSansBulletin.length) {
        showToast('Tous les bulletins ont déjà été générés pour cette période.', 'info');
        return;
    }

    if (!confirm(`Générer ${enseignantsSansBulletin.length} bulletin(s) pour ${state.currentPeriode} ?`)) return;

    const btn = document.querySelector('.btn-primary, .btn.btn-primary');
    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Calcul...';
        btn.disabled = true;
    }

    let success = 0;
    let errors = 0;
    let skipped = 0;

    for (const ens of enseignantsSansBulletin) {
        const rowInput = document.querySelector(`input.hours-input[data-ens-id="${ens.id}"]`);
        const heures = rowInput ? (parseFloat(rowInput.value) || 0) : 0;
        
        if (heures <= 0) {
            skipped++;
            continue;
        }

        const tarif = parseFloat(ens.tarif_horaire) || 0;
        if (!tarif) {
            skipped++;
            continue;
        }

        const payload = {
            enseignant: parseInt(ens.id),
            periode: String(state.currentPeriode),
            heures_travaillees: parseFloat(heures.toFixed(2)),
            tarif_horaire: parseFloat(tarif.toFixed(2)),
            assurance: 0,
            cotisations: 0,
            autres_retenues: 0,
            statut_paiement: 'En_attente',
            mode_paiement: null,
            date_paiement: null,
        };

        const result = await apiFetch('/bulletins/', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        if (result?.error) {
            console.error('Failed for', ens.nom_complet, result.message);
            errors++;
        } else {
            state.bulletins.push(result);
            success++;
        }
    }

    if (btn) {
        btn.innerHTML = '<i class="fas fa-calculator"></i> Calculer tous les salaires';
        btn.disabled = false;
    }

    updateSummaryCards();
    renderTable();
    
    if (success > 0) showToast(`✅ ${success} bulletin(s) généré(s) !`, 'success');
    if (errors > 0) showToast(`⚠️ ${errors} erreur(s)`, 'warning');
    if (skipped > 0 && success === 0) {
        showToast(`${skipped} sans heures saisies. Renseignez les heures d'abord.`, 'warning');
    }
}

// ============================================================
// EXPORT CSV
// ============================================================
function exportCSV() {
    if (!state.bulletins.length) {
        showToast('Aucune donnée à exporter.', 'warning');
        return;
    }
    
    const headers = ['Enseignant', 'Période', 'Heures', 'Tarif/h (DA)', 'Brut (DA)',
                     'Retenues (DA)', 'Net (DA)', 'Mode', 'Date paiement', 'Statut'];
    
    const rows = state.bulletins.map(b => {
        const ens = state.enseignants.find(e => e.id === b.enseignant);
        const nom = b.enseignant_nom || ens?.nom_complet || `#${b.enseignant}`;
        return [
            nom,
            b.periode,
            b.heures_travaillees,
            b.tarif_horaire,
            b.salaire_brut,
            b.total_retenues,
            b.salaire_net,
            b.mode_paiement || '',
            b.date_paiement || '',
            b.statut_paiement,
        ];
    });
    
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salaires_${state.currentPeriode.replace(/[^a-zA-Z0-9]/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast('Export CSV téléchargé !', 'success');
}

// ============================================================
// UTILITIES
// ============================================================
function createShell(id) {
    const div = document.createElement('div');
    div.id = id;
    div.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:2000;
        display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);`;
    return div;
}

function removeModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.opacity = '0';
        setTimeout(() => modal.remove(), 200);
    }
}

// ============================================================
// INJECT STYLES
// ============================================================
function injectStyles() {
    if (document.getElementById('sal-styles')) return;
    
    const s = document.createElement('style');
    s.id = 'sal-styles';
    s.textContent = `
        @media print {
            body > *:not(#modal-bulletin) { display:none !important; }
            #modal-bulletin { position:static !important; background:none !important; }
            #modal-bulletin button { display:none !important; }
        }
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        tbody tr { animation:fadeIn .2s ease both; }
        tbody tr:hover { background:#f8fafc; }
        .hours-input:focus { border-color:#6366f1; outline:none; }
        .action-btn { cursor:pointer; transition:all .15s; }
        .action-btn:hover { transform:translateY(-1px); opacity:.9; }
        .status-rejected { background:rgba(239,68,68,.15); color:#dc2626; }
    `;
    document.head.appendChild(s);
}

// ============================================================
// SETUP EVENTS
// ============================================================
function setupEvents() {
    const navBtns = document.querySelectorAll('.month-selector button');
    if (navBtns[0]) navBtns[0].addEventListener('click', prevMonth);
    if (navBtns[1]) navBtns[1].addEventListener('click', nextMonth);

    document.querySelector('.btn-primary, .btn.btn-primary')
        ?.addEventListener('click', calculerTousSalaires);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;

    injectStyles();
    updateMonthDisplay();
    setupEvents();
    await loadData();
});