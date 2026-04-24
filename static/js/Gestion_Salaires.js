/**
 * Gestion des Salaires
 * FIXED: dashboard stats sync + all API issues
 */

const API_URL = '/api';

const state = {
    bulletins:   [],
    enseignants: [],
    currentDate: new Date(),
    currentPeriode: '',
};

// ─── JWT ─────────────────────────────────────────────────────────────────────
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
    const h = { 'Content-Type': 'application/json', 'Accept': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

// ─── API ─────────────────────────────────────────────────────────────────────
function flattenErrors(data) {
    if (typeof data === 'string') return data;
    if (data?.detail) return data.detail;
    if (data?.error)  return data.error;
    const msgs = [];
    for (const [k, v] of Object.entries(data || {})) {
        if (Array.isArray(v))         msgs.push(`${k}: ${v.join(', ')}`);
        else if (typeof v === 'object') msgs.push(`${k}: ${flattenErrors(v)}`);
        else msgs.push(`${k}: ${v}`);
    }
    return msgs.join(' | ') || 'Erreur inconnue.';
}

async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
            credentials: 'same-origin',
        });
        if (res.status === 401) { window.location.href = '/login/'; return { error: 'JWT_INVALID' }; }
        if (res.status === 403) {
            let msg = 'Accès refusé.';
            try { const d = await res.json(); msg = d.detail || d.error || msg; } catch {}
            return { error: 'FORBIDDEN', message: msg };
        }
        if (res.status === 204) return { success: true };
        const data = await res.json();
        if (!res.ok) return { error: 'API_ERROR', message: flattenErrors(data), raw: data };
        return data;
    } catch (e) {
        return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible: ' + e.message };
    }
}

// ─── Session ──────────────────────────────────────────────────────────────────
function checkSession() {
    const token = getToken(), user = getUser();
    if (!token || !user) { window.location.href = '/login/'; return null; }
    if (!['Secretariat','Comptable','Dirigeant'].includes(user.role)) {
        window.location.href = '/login/'; return null;
    }
    return user;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    document.querySelector('.toast-sal')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-sal';
    t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
        padding:14px 22px;border-radius:12px;background:${colors[type]};color:white;
        font-weight:500;font-size:.9rem;box-shadow:0 8px 24px rgba(0,0,0,.2);
        display:flex;align-items:center;gap:8px;max-width:420px;
        transform:translateX(120%);opacity:0;transition:all .3s ease;`;
    t.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform='translateX(0)'; t.style.opacity='1'; });
    setTimeout(() => {
        t.style.transform='translateX(120%)'; t.style.opacity='0';
        setTimeout(() => t.remove(), 300);
    }, 5000);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDA(v) {
    if (v == null || v === '' || isNaN(v)) return '—';
    return new Intl.NumberFormat('fr-DZ').format(parseFloat(v)) + ' DA';
}
function fmtDate(d) {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('fr-FR'); } catch { return String(d); }
}
function getInitials(nom) {
    if (!nom) return '??';
    return nom.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0,2);
}
function avatarGrad(i) {
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
function statutBadge(s) {
    const map = {
        'Paye':       { cls:'status-paid',    label:'Payé' },
        'En_attente': { cls:'status-pending', label:'En attente' },
        'Rejete':     { cls:'status-rejected',label:'Rejeté' },
    };
    const x = map[s] || { cls:'status-pending', label: s||'—' };
    return `<span class="status-badge ${x.cls}">${x.label}</span>`;
}
function buildPeriode(date) {
    try {
        return date.toLocaleDateString('fr-FR', { month:'long', year:'numeric' })
                   .replace(/^./, c => c.toUpperCase());
    } catch { return ''; }
}
function inp() {
    return `width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:8px;
            font-size:.9rem;outline:none;box-sizing:border-box;font-family:inherit;background:#f9fafb;`;
}
function lbl() {
    return `font-size:.875rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;`;
}

// ─── Month nav ────────────────────────────────────────────────────────────────
function updateMonthDisplay() {
    state.currentPeriode = buildPeriode(state.currentDate);
    const h2 = document.querySelector('.month-selector h2');
    if (h2) h2.textContent = state.currentPeriode;
}
function prevMonth() { state.currentDate.setMonth(state.currentDate.getMonth()-1); updateMonthDisplay(); loadData(); }
function nextMonth() { state.currentDate.setMonth(state.currentDate.getMonth()+1); updateMonthDisplay(); loadData(); }

// ─── Load data ────────────────────────────────────────────────────────────────
async function loadEnseignants() {
    const data = await apiFetch('/enseignants/');
    if (!data?.error) state.enseignants = Array.isArray(data) ? data : (data.results || []);
}

async function loadBulletins() {
    // Load ALL bulletins then filter client-side by period
    const data = await apiFetch('/bulletins/');
    if (!data?.error) {
        const all = Array.isArray(data) ? data : (data.results || []);
        // Filter by current period
        state.bulletins = all.filter(b =>
            !state.currentPeriode ||
            (b.periode || '').toLowerCase() === state.currentPeriode.toLowerCase()
        );
        // Store all for dashboard sync
        state.allBulletins = all;
    }
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
    syncDashboardStats(); // ← sync dashboard after every load
}

// ─── Dashboard stats sync ─────────────────────────────────────────────────────
// This stores computed salary stats in localStorage so the dashboard can read them
function syncDashboardStats() {
    try {
        const all = state.allBulletins || state.bulletins;
        const totalSalaires = all.reduce((s, b) => s + (parseFloat(b.salaire_net) || 0), 0);
        const totalBrut     = all.reduce((s, b) => s + (parseFloat(b.salaire_brut) || 0), 0);
        const nbPayes       = all.filter(b => b.statut_paiement === 'Paye').length;
        const nbAttente     = all.filter(b => b.statut_paiement === 'En_attente').length;
        const nbEnseignants = state.enseignants.length;

        const stats = {
            totalSalaires,
            totalBrut,
            nbPayes,
            nbAttente,
            nbEnseignants,
            periodeActuelle: state.currentPeriode,
            lastUpdated: new Date().toISOString(),
        };

        localStorage.setItem('salaires_stats', JSON.stringify(stats));

        // Also update dashboard DOM directly if we're on the dashboard page
        updateDashboardDOM(stats);

    } catch (e) {
        console.warn('Dashboard sync error:', e);
    }
}

function updateDashboardDOM(stats) {
    // Try to update dashboard stat cards if they exist on current page
    const selectors = {
        '.stat-salaires-total':  fmtDA(stats.totalSalaires),
        '.stat-salaires-payes':  stats.nbPayes,
        '.stat-salaires-attente':stats.nbAttente,
        '[data-stat="salaires"]':fmtDA(stats.totalSalaires),
    };
    for (const [sel, val] of Object.entries(selectors)) {
        document.querySelectorAll(sel).forEach(el => { el.textContent = val; });
    }
}

// ─── Summary cards ────────────────────────────────────────────────────────────
function updateSummaryCards() {
    const b = state.bulletins;
    const totalHeures = b.reduce((s, x) => s + (parseFloat(x.heures_travaillees)||0), 0);
    const totalBrut   = b.reduce((s, x) => s + (parseFloat(x.salaire_brut)||0), 0);
    const totalDed    = b.reduce((s, x) => s + (parseFloat(x.total_retenues)||0), 0);
    const totalNet    = b.reduce((s, x) => s + (parseFloat(x.salaire_net)||0), 0);

    const sumPs = document.querySelectorAll('.summary-item p');
    if (sumPs[0]) sumPs[0].textContent = totalHeures.toLocaleString('fr-FR') + 'h';
    if (sumPs[1]) sumPs[1].textContent = fmtDA(totalBrut);
    if (sumPs[2]) sumPs[2].textContent = fmtDA(totalDed);
    if (sumPs[3]) sumPs[3].textContent = fmtDA(totalNet);

    const payes   = b.filter(x => x.statut_paiement === 'Paye').length;
    const attente = b.filter(x => x.statut_paiement === 'En_attente').length;
    const total   = Math.max(state.enseignants.length, 1);
    const hSupp   = b.reduce((s, x) => s + Math.max(0,(parseFloat(x.heures_travaillees)||0)-40), 0);

    const statPs = document.querySelectorAll('.stat-box p');
    if (statPs[0]) statPs[0].textContent = `${payes}/${total}`;
    if (statPs[1]) statPs[1].textContent = attente;
    if (statPs[2]) statPs[2].textContent = hSupp + 'h';
    if (statPs[3]) statPs[3].textContent = b.filter(x => x.statut_paiement === 'Rejete').length;
}

// ─── Render table ─────────────────────────────────────────────────────────────
function renderTable() {
    const tbody = document.querySelector('tbody');
    if (!tbody) return;

    if (!state.enseignants.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:3rem;color:#94a3b8;">
            Aucun enseignant trouvé</td></tr>`;
        return;
    }

    tbody.innerHTML = state.enseignants.map((ens, i) => {
        const bulletin = state.bulletins.find(b => b.enseignant === ens.id) || null;
        const nom    = ens.nom_complet || `${ens.user?.first_name||''} ${ens.user?.last_name||''}`.trim() || `#${ens.id}`;
        const tarif  = parseFloat(ens.tarif_horaire) || 0;
        const heures = bulletin ? (parseFloat(bulletin.heures_travaillees)||0) : 0;
        const brut   = bulletin ? (parseFloat(bulletin.salaire_brut)||0) : 0;
        const ded    = bulletin ? (parseFloat(bulletin.total_retenues)||0) : 0;
        const net    = bulletin ? (parseFloat(bulletin.salaire_net)||0) : 0;
        const statut = bulletin ? bulletin.statut_paiement : 'En_attente';
        const bulId  = bulletin ? bulletin.id : null;

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
            : `<button class="action-btn pay" onclick="openModalCalculer(${ens.id})"
                   style="background:#6366f1;color:white;border:none;">
                   <i class="fas fa-calculator"></i> Calculer
               </button>`;

        return `
        <tr data-ens-id="${ens.id}">
            <td>
                <div class="teacher-info">
                    <div class="teacher-avatar" style="background:${avatarGrad(i)};">${getInitials(nom)}</div>
                    <div>
                        <div style="font-weight:600;">${nom}</div>
                        <div style="font-size:.8rem;opacity:.7;">${ens.langue_enseignee||'—'}</div>
                    </div>
                </div>
            </td>
            <td>${fmtDA(tarif)}</td>
            <td>
                <input type="number" class="hours-input" min="0" step=".5"
                       value="${heures}" data-ens-id="${ens.id}"
                       data-bul-id="${bulId||''}" data-tarif="${tarif}"
                       style="width:70px;padding:4px 8px;border:1px solid #e5e7eb;
                              border-radius:6px;font-size:.9rem;text-align:center;"
                       ${statut==='Paye'?'disabled':''}>
            </td>
            <td class="amount">${fmtDA(brut)}</td>
            <td class="deductions">${ded>0?'-'+fmtDA(ded):'—'}</td>
            <td class="amount total">${fmtDA(net)}</td>
            <td>${statutBadge(statut)}</td>
            <td><div class="action-btns">${actionBtn}</div></td>
        </tr>`;
    }).join('');

    // Live hours → brut recalc
    document.querySelectorAll('.hours-input').forEach(input => {
        input.addEventListener('input', e => {
            const row   = e.target.closest('tr');
            const h     = parseFloat(e.target.value)||0;
            const t     = parseFloat(e.target.dataset.tarif)||0;
            const cells = row.querySelectorAll('td');
            if (cells[3]) cells[3].textContent = fmtDA(h*t);
            if (cells[5]) cells[5].textContent = fmtDA(h*t);
        });
    });
}

// ─── Modal: Calculer / Créer bulletin ────────────────────────────────────────
async function openModalCalculer(enseignantId) {
    const ens = state.enseignants.find(e => e.id === enseignantId);
    if (!ens) { showToast('Enseignant introuvable', 'error'); return; }

    const tarif = parseFloat(ens.tarif_horaire)||0;
    const nom   = ens.nom_complet || `${ens.user?.first_name||''} ${ens.user?.last_name||''}`.trim();
    const rowInput  = document.querySelector(`input.hours-input[data-ens-id="${enseignantId}"]`);
    const prefilled = rowInput ? (parseFloat(rowInput.value)||0) : 0;

    removeModal('modal-calculer');
    const modal = createShell('modal-calculer');
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:2rem;width:90%;max-width:480px;
                    max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="margin:0;font-size:1.1rem;">
                    <i class="fas fa-calculator" style="color:#6366f1;margin-right:8px;"></i>
                    Calculer — ${nom}
                </h3>
                <button onclick="removeModal('modal-calculer')"
                    style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">&times;</button>
            </div>

            <div style="background:#f8fafc;border-radius:10px;padding:.75rem 1rem;margin-bottom:1.25rem;
                        display:flex;justify-content:space-between;">
                <span style="color:#64748b;font-size:.875rem;">Tarif horaire</span>
                <strong style="color:#6366f1;">${tarif>0?fmtDA(tarif):'⚠ Non défini'}</strong>
            </div>

            ${tarif<=0 ? `<div style="padding:.75rem;background:#fef2f2;border:1px solid #fecaca;
                border-radius:8px;color:#dc2626;font-size:.85rem;margin-bottom:1rem;">
                ⚠ Tarif horaire non défini pour cet enseignant. Modifiez-le d'abord.</div>` : ''}

            <div style="display:flex;flex-direction:column;gap:.85rem;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="${lbl()}">Heures travaillées *</label>
                        <input id="c_heures" type="number" min="0" step=".5"
                               value="${prefilled}" placeholder="0" style="${inp()}">
                    </div>
                    <div>
                        <label style="${lbl()}">Période *</label>
                        <input id="c_periode" type="text" value="${state.currentPeriode}"
                               placeholder="ex: Avril 2026" style="${inp()}">
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;">
                    <div>
                        <label style="${lbl()}">Assurance (DA)</label>
                        <input id="c_assurance" type="number" min="0" step=".01" value="0" style="${inp()}">
                    </div>
                    <div>
                        <label style="${lbl()}">Cotisations (DA)</label>
                        <input id="c_cotisations" type="number" min="0" step=".01" value="0" style="${inp()}">
                    </div>
                    <div>
                        <label style="${lbl()}">Autres (DA)</label>
                        <input id="c_autres" type="number" min="0" step=".01" value="0" style="${inp()}">
                    </div>
                </div>

                <!-- Aperçu -->
                <div id="calc_preview" style="background:#f0fdf4;border:1px solid #bbf7d0;
                     border-radius:10px;padding:1rem;">
                    <p style="font-size:.8rem;color:#166534;font-weight:700;margin-bottom:.6rem;">Aperçu</p>
                    <div style="display:flex;flex-direction:column;gap:4px;font-size:.875rem;">
                        <div style="display:flex;justify-content:space-between;">
                            <span>Salaire brut</span><span id="prev_brut" style="font-weight:700;">—</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span>Retenues</span><span id="prev_ret" style="font-weight:700;color:#dc2626;">—</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;
                                    padding-top:6px;border-top:1px solid #bbf7d0;margin-top:4px;">
                            <span style="font-weight:700;color:#166534;">Salaire net</span>
                            <span id="prev_net" style="font-weight:800;color:#059669;font-size:1rem;">—</span>
                        </div>
                    </div>
                </div>

                <div id="calcError" style="display:none;padding:.75rem;background:#fef2f2;
                     border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:.85rem;"></div>

                <button id="btnSaveCalc" style="width:100%;padding:.875rem;border:none;border-radius:10px;
                    background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;
                    font-weight:700;font-size:1rem;cursor:pointer;"
                    ${tarif<=0?'disabled':''}>
                    <i class="fas fa-save"></i> Générer le bulletin
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target===modal) removeModal('modal-calculer'); });

    function calcPreview() {
        const h   = parseFloat(document.getElementById('c_heures')?.value)||0;
        const ass = parseFloat(document.getElementById('c_assurance')?.value)||0;
        const cot = parseFloat(document.getElementById('c_cotisations')?.value)||0;
        const aut = parseFloat(document.getElementById('c_autres')?.value)||0;
        const brut = h * tarif;
        const ret  = ass + cot + aut;
        document.getElementById('prev_brut').textContent = fmtDA(brut);
        document.getElementById('prev_ret').textContent  = ret > 0 ? '- ' + fmtDA(ret) : '—';
        document.getElementById('prev_net').textContent  = fmtDA(brut - ret);
    }
    ['c_heures','c_assurance','c_cotisations','c_autres'].forEach(id =>
        document.getElementById(id)?.addEventListener('input', calcPreview));
    calcPreview();

    document.getElementById('btnSaveCalc')?.addEventListener('click', async () => {
        const errEl = document.getElementById('calcError');
        errEl.style.display = 'none';
        const btn = document.getElementById('btnSaveCalc');

        const heures   = parseFloat(document.getElementById('c_heures')?.value);
        const periode  = document.getElementById('c_periode')?.value?.trim();
        const assur    = parseFloat(document.getElementById('c_assurance')?.value)||0;
        const cotis    = parseFloat(document.getElementById('c_cotisations')?.value)||0;
        const autres   = parseFloat(document.getElementById('c_autres')?.value)||0;

        if (!heures || heures <= 0) {
            errEl.textContent = 'Heures travaillées > 0 obligatoires.';
            errEl.style.display = 'block'; return;
        }
        if (!periode) {
            errEl.textContent = 'La période est obligatoire.';
            errEl.style.display = 'block'; return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Génération...';
        btn.disabled  = true;

        const payload = {
            enseignant:         parseInt(enseignantId),
            periode:            periode,
            heures_travaillees: parseFloat(heures.toFixed(2)),
            tarif_horaire:      parseFloat(tarif.toFixed(2)),
            assurance:          parseFloat(assur.toFixed(2)),
            cotisations:        parseFloat(cotis.toFixed(2)),
            autres_retenues:    parseFloat(autres.toFixed(2)),
            statut_paiement:    'En_attente',
            mode_paiement:      null,
            date_paiement:      null,
        };

        const result = await apiFetch('/bulletins/', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        if (result?.error) {
            errEl.textContent = '❌ ' + result.message;
            errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-save"></i> Générer le bulletin';
            btn.disabled = false; return;
        }

        state.bulletins.push(result);
        if (!state.allBulletins) state.allBulletins = [];
        state.allBulletins.push(result);

        removeModal('modal-calculer');
        updateSummaryCards();
        renderTable();
        syncDashboardStats(); // ← push to dashboard
        showToast(`✅ Bulletin de ${nom} généré !`, 'success');
    });
}

// ─── Modal: Payer ─────────────────────────────────────────────────────────────
async function openModalPayer(bulletinId) {
    const b = state.bulletins.find(x => x.id === bulletinId);
    if (!b) { showToast('Bulletin introuvable', 'error'); return; }

    const ens = state.enseignants.find(e => e.id === b.enseignant);
    const nom = b.enseignant_nom || ens?.nom_complet ||
        `${ens?.user?.first_name||''} ${ens?.user?.last_name||''}`.trim();
    const today = new Date().toISOString().split('T')[0];

    removeModal('modal-payer');
    const modal = createShell('modal-payer');
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:2rem;width:90%;max-width:460px;
                    max-height:90vh;overflow-y:auto;" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="margin:0;font-size:1.1rem;">
                    <i class="fas fa-money-bill-wave" style="color:#059669;margin-right:8px;"></i>
                    Payer — ${nom}
                </h3>
                <button onclick="removeModal('modal-payer')"
                    style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">&times;</button>
            </div>

            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;
                        padding:1rem;margin-bottom:1.25rem;">
                <p style="font-size:.8rem;color:#166534;font-weight:700;margin-bottom:.6rem;">
                    Résumé — ${b.periode}
                </p>
                ${[['Heures',(b.heures_travaillees||0)+'h'],
                   ['Salaire brut',fmtDA(b.salaire_brut)],
                   ['Retenues',b.total_retenues>0?'- '+fmtDA(b.total_retenues):'—']
                  ].map(([lb,v])=>`
                    <div style="display:flex;justify-content:space-between;font-size:.875rem;margin-bottom:4px;">
                        <span>${lb}</span><strong>${v}</strong>
                    </div>`).join('')}
                <div style="display:flex;justify-content:space-between;font-size:1rem;
                            padding-top:8px;border-top:1px solid #bbf7d0;margin-top:4px;">
                    <span style="color:#166534;font-weight:700;">Net à payer</span>
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
    modal.addEventListener('click', e => { if (e.target===modal) removeModal('modal-payer'); });

    document.getElementById('btnConfirmPay')?.addEventListener('click', async () => {
        const errEl = document.getElementById('payError');
        errEl.style.display = 'none';
        const btn  = document.getElementById('btnConfirmPay');
        const mode = document.getElementById('p_mode')?.value;
        const date = document.getElementById('p_date')?.value;

        if (!date) { errEl.textContent='Date obligatoire.'; errEl.style.display='block'; return; }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Traitement...';
        btn.disabled  = true;

        const payload = {
            enseignant:         parseInt(b.enseignant),
            periode:            String(b.periode),
            heures_travaillees: parseFloat((b.heures_travaillees||0).toString()),
            tarif_horaire:      parseFloat((b.tarif_horaire||0).toString()),
            assurance:          parseFloat((b.assurance||0).toString()),
            cotisations:        parseFloat((b.cotisations||0).toString()),
            autres_retenues:    parseFloat((b.autres_retenues||0).toString()),
            mode_paiement:      mode,
            date_paiement:      date,
            statut_paiement:    'Paye',
        };

        const result = await apiFetch(`/bulletins/${bulletinId}/`, {
            method: 'PUT',
            body:   JSON.stringify(payload),
        });

        if (result?.error) {
            errEl.textContent = '❌ ' + result.message;
            errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Confirmer le paiement';
            btn.disabled = false; return;
        }

        // Update local state
        const idx = state.bulletins.findIndex(x => x.id === bulletinId);
        if (idx !== -1) state.bulletins[idx] = result;
        const idx2 = (state.allBulletins||[]).findIndex(x => x.id === bulletinId);
        if (idx2 !== -1) state.allBulletins[idx2] = result;

        removeModal('modal-payer');
        updateSummaryCards();
        renderTable();
        syncDashboardStats(); // ← update dashboard
        showToast(`✅ Salaire de ${nom} payé !`, 'success');
    });
}

// ─── Modal: Voir bulletin ─────────────────────────────────────────────────────
function openModalBulletin(bulletinId) {
    const b = state.bulletins.find(x => x.id === bulletinId);
    if (!b) { showToast('Bulletin introuvable', 'error'); return; }

    const ens = state.enseignants.find(e => e.id === b.enseignant);
    const nom = b.enseignant_nom || ens?.nom_complet ||
        `${ens?.user?.first_name||''} ${ens?.user?.last_name||''}`.trim();

    removeModal('modal-bulletin');
    const modal = createShell('modal-bulletin');
    modal.innerHTML = `
        <div style="background:white;border-radius:16px;padding:2rem;width:90%;max-width:460px;"
             onclick="event.stopPropagation()">
            <div style="text-align:center;padding-bottom:1.25rem;border-bottom:2px dashed #e2e8f0;margin-bottom:1.25rem;">
                <i class="fas fa-graduation-cap" style="font-size:2rem;color:#6366f1;"></i>
                <h2 style="margin:.5rem 0 0;font-size:1.2rem;font-weight:800;">EduLang</h2>
                <p style="color:#64748b;font-size:.8rem;margin:4px 0;">Centre de Formation</p>
                <p style="font-weight:700;font-size:.9rem;margin-top:.5rem;">BULLETIN DE SALAIRE</p>
                <p style="font-size:.8rem;color:#94a3b8;">Période : ${b.periode}</p>
            </div>

            <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem;">
                ${[['Enseignant',nom],['N° Bulletin',`#BUL${String(b.id).padStart(5,'0')}`]]
                  .map(([lb,v])=>`
                    <div style="display:flex;justify-content:space-between;">
                        <span style="font-size:.8rem;color:#64748b;">${lb}</span>
                        <strong style="font-size:.875rem;">${v}</strong>
                    </div>`).join('')}
            </div>

            <div style="background:#f8fafc;border-radius:10px;padding:1rem;margin-bottom:1rem;">
                ${[['Tarif horaire',fmtDA(b.tarif_horaire)],
                   ['Heures travaillées',(b.heures_travaillees||0)+'h'],
                   ['Salaire brut',fmtDA(b.salaire_brut)]
                  ].map(([lb,v])=>`
                    <div style="display:flex;justify-content:space-between;
                                padding:.4rem 0;border-bottom:1px solid #f1f5f9;font-size:.875rem;">
                        <span style="color:#64748b;">${lb}</span><strong>${v}</strong>
                    </div>`).join('')}
            </div>

            ${[b.assurance,b.cotisations,b.autres_retenues].some(x=>parseFloat(x)>0) ? `
            <div style="background:#fef2f2;border-radius:10px;padding:1rem;margin-bottom:1rem;">
                <p style="font-size:.8rem;font-weight:700;color:#dc2626;margin-bottom:.5rem;">Retenues</p>
                ${[['Assurance',b.assurance],['Cotisations',b.cotisations],['Autres',b.autres_retenues]]
                  .filter(([,v])=>parseFloat(v)>0).map(([lb,v])=>`
                    <div style="display:flex;justify-content:space-between;font-size:.875rem;margin-bottom:4px;">
                        <span style="color:#64748b;">${lb}</span>
                        <strong style="color:#dc2626;">- ${fmtDA(v)}</strong>
                    </div>`).join('')}
                <div style="display:flex;justify-content:space-between;font-size:.875rem;
                            padding-top:6px;border-top:1px solid #fecaca;margin-top:4px;">
                    <span style="font-weight:700;color:#dc2626;">Total retenues</span>
                    <strong style="color:#dc2626;">- ${fmtDA(b.total_retenues)}</strong>
                </div>
            </div>` : ''}

            <div style="background:linear-gradient(135deg,#ecfdf5,#d1fae5);border-radius:10px;
                        padding:1rem;text-align:center;margin-bottom:1.5rem;">
                <p style="font-size:.8rem;color:#065f46;margin-bottom:4px;">Salaire Net</p>
                <p style="font-size:2rem;font-weight:800;color:#059669;margin:0;">${fmtDA(b.salaire_net)}</p>
                ${b.date_paiement
                    ? `<p style="font-size:.75rem;color:#065f46;margin-top:4px;">
                           Payé le ${fmtDate(b.date_paiement)} via ${b.mode_paiement||'—'}</p>`
                    : `<p style="font-size:.75rem;color:#d97706;margin-top:4px;">⏳ En attente</p>`}
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
                ${b.statut_paiement!=='Paye'?`
                <button onclick="removeModal('modal-bulletin');openModalPayer(${bulletinId});"
                    style="flex:1;padding:.75rem;background:#059669;color:white;
                           border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                    <i class="fas fa-money-bill-wave"></i> Payer
                </button>`:''}
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target===modal) removeModal('modal-bulletin'); });
}

// ─── Calculer tous ────────────────────────────────────────────────────────────
async function calculerTousSalaires() {
    const sans = state.enseignants.filter(e => !state.bulletins.find(b => b.enseignant===e.id));
    if (!sans.length) { showToast('Tous les bulletins sont déjà générés.', 'info'); return; }
    if (!confirm(`Générer ${sans.length} bulletin(s) pour ${state.currentPeriode} ?`)) return;

    const btn = document.querySelector('.btn-primary, .btn.btn-primary');
    if (btn) { btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Calcul...'; btn.disabled=true; }

    let ok=0, err=0, skip=0;

    for (const ens of sans) {
        const input  = document.querySelector(`input.hours-input[data-ens-id="${ens.id}"]`);
        const heures = input ? (parseFloat(input.value)||0) : 0;
        const tarif  = parseFloat(ens.tarif_horaire)||0;

        if (heures<=0 || tarif<=0) { skip++; continue; }

        const result = await apiFetch('/bulletins/', {
            method: 'POST',
            body: JSON.stringify({
                enseignant:         parseInt(ens.id),
                periode:            state.currentPeriode,
                heures_travaillees: parseFloat(heures.toFixed(2)),
                tarif_horaire:      parseFloat(tarif.toFixed(2)),
                assurance:          0,
                cotisations:        0,
                autres_retenues:    0,
                statut_paiement:    'En_attente',
                mode_paiement:      null,
                date_paiement:      null,
            }),
        });

        if (result?.error) { err++; }
        else {
            state.bulletins.push(result);
            if (!state.allBulletins) state.allBulletins = [];
            state.allBulletins.push(result);
            ok++;
        }
    }

    if (btn) { btn.innerHTML='<i class="fas fa-calculator"></i> Calculer tous les salaires'; btn.disabled=false; }

    updateSummaryCards();
    renderTable();
    syncDashboardStats(); // ← push to dashboard after bulk calc

    if (ok>0)   showToast(`✅ ${ok} bulletin(s) généré(s) !`, 'success');
    if (err>0)  showToast(`⚠️ ${err} erreur(s)`, 'warning');
    if (skip>0 && ok===0) showToast(`Saisissez les heures dans le tableau d'abord.`, 'warning');
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV() {
    if (!state.bulletins.length) { showToast('Aucune donnée à exporter.', 'warning'); return; }
    const headers = ['Enseignant','Période','Heures','Tarif/h DA','Brut DA','Retenues DA','Net DA','Mode','Date','Statut'];
    const rows = state.bulletins.map(b => {
        const ens = state.enseignants.find(e=>e.id===b.enseignant);
        const nom = b.enseignant_nom || ens?.nom_complet || `#${b.enseignant}`;
        return [nom, b.periode, b.heures_travaillees, b.tarif_horaire,
                b.salaire_brut, b.total_retenues, b.salaire_net,
                b.mode_paiement||'', b.date_paiement||'', b.statut_paiement];
    });
    const csv  = [headers,...rows].map(r=>r.map(v=>`"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href=url; a.download=`salaires_${state.currentPeriode.replace(/[^a-zA-Z0-9]/g,'_')}.csv`;
    a.click(); URL.revokeObjectURL(url);
    showToast('Export CSV téléchargé !','success');
}

// ─── Utils ────────────────────────────────────────────────────────────────────
function createShell(id) {
    const d = document.createElement('div');
    d.id = id;
    d.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;
        display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);`;
    return d;
}
function removeModal(id) {
    const m = document.getElementById(id);
    if (m) { m.style.opacity='0'; setTimeout(()=>m.remove(),200); }
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('sal-styles')) return;
    const s = document.createElement('style'); s.id='sal-styles';
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
        .status-rejected { background:rgba(239,68,68,.15); color:#dc2626; }`;
    document.head.appendChild(s);
}

// ─── Events ───────────────────────────────────────────────────────────────────
function setupEvents() {
    const navBtns = document.querySelectorAll('.month-selector button');
    if (navBtns[0]) navBtns[0].addEventListener('click', prevMonth);
    if (navBtns[1]) navBtns[1].addEventListener('click', nextMonth);
    document.querySelector('.btn-primary, .btn.btn-primary')
        ?.addEventListener('click', calculerTousSalaires);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;
    injectStyles();
    updateMonthDisplay();
    setupEvents();
    await loadData();
});