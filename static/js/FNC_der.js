/**
 * FNC_der.js — Finance Dashboard Dirigeant
 *
 * FIXES:
 *  1. financeChart had no height constraint → now capped at 280px
 *  2. Expense pie was hardcoded → now reads real salaire_net from /api/bulletins/
 *  3. buildCharts() is now async so it can fetch salary data before drawing
 */

document.addEventListener('DOMContentLoaded', async () => {

    // ── 1. AUTH ───────────────────────────────────────────────────────────────
    const TOKEN = (
        localStorage.getItem('access') ||
        sessionStorage.getItem('access') ||
        localStorage.getItem('access_token') ||
        sessionStorage.getItem('access_token') ||
        null
    );
    const USER = (() => {
        try {
            const r = localStorage.getItem('user') || sessionStorage.getItem('user');
            return r ? JSON.parse(r) : null;
        } catch { return null; }
    })();

    if (!TOKEN || !USER) { window.location.href = '/login/'; return; }
    if (USER.role !== 'Dirigeant') { window.location.href = '/login/'; return; }

    // ── 2. STYLES ─────────────────────────────────────────────────────────────
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        .status-paid    { background:#064e3b;color:#34d399;padding:3px 12px;border-radius:20px;font-size:.75rem;font-weight:600;display:inline-block; }
        .status-partial { background:#78350f;color:#fbbf24;padding:3px 12px;border-radius:20px;font-size:.75rem;font-weight:600;display:inline-block; }
        .status-unpaid  { background:#450a0a;color:#f87171;padding:3px 12px;border-radius:20px;font-size:.75rem;font-weight:600;display:inline-block; }
        .btn-success    { background:linear-gradient(135deg,#059669,#10b981);color:white;border:none;
                          border-radius:8px;padding:.4rem .9rem;cursor:pointer;font-weight:600;font-size:.75rem;transition:opacity .2s; }
        .btn-success:hover { opacity:.85; }
        .active-page-btn { background:linear-gradient(135deg,#6366f1,#8b5cf6)!important;color:white!important;border-color:transparent!important; }
        .fnc-toast { position:fixed;bottom:24px;right:24px;z-index:9999;padding:14px 22px;
                     border-radius:12px;color:white;font-weight:600;font-size:.9rem;
                     box-shadow:0 8px 24px rgba(0,0,0,.4);display:flex;align-items:center;
                     gap:10px;max-width:420px;transform:translateX(120%);opacity:0;
                     transition:all .3s ease; }
        .modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:4000;
                         display:flex;align-items:center;justify-content:center;padding:1rem; }
        .modal-box { background:#1e293b;border:1px solid #334155;border-radius:20px;
                     padding:2rem;width:90%;max-width:520px;max-height:90vh;overflow-y:auto; }
        .modal-field { margin-bottom:1rem; }
        .modal-field label { display:block;color:#94a3b8;font-size:.875rem;margin-bottom:6px; }
        .modal-field input,.modal-field select,.modal-field textarea {
            width:100%;padding:.75rem;background:#0f172a;border:1px solid #334155;
            border-radius:8px;color:white;font-family:inherit;box-sizing:border-box;
        }
        .modal-field input:focus,.modal-field select:focus { outline:none;border-color:#6366f1; }
        .modal-row { display:flex;gap:.75rem;margin-top:1.25rem; }
        .modal-btn { flex:1;padding:.75rem;border-radius:8px;cursor:pointer;font-weight:600;font-size:.9rem;border:none; }
        .modal-btn-cancel  { background:transparent;border:1px solid #334155;color:#94a3b8; }
        .modal-btn-primary { background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white; }
        .modal-btn-success { background:#10b981;color:white; }
        .modal-error { display:none;padding:.75rem;background:#450a0a;border:1px solid #f87171;
                       border-radius:8px;color:#fca5a5;font-size:.85rem;margin-bottom:.75rem; }
        .tab-btn { padding:.5rem 1rem;border-radius:8px;border:none;cursor:pointer;
                   font-weight:600;font-size:.875rem;transition:all .2s;
                   background:transparent;color:#94a3b8; }
        .tab-btn.active { background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white; }
        .tab-btn:hover:not(.active) { background:#1e293b;color:white; }

        /* FIX 1: prevent chart canvas from growing unbounded */
        .chart-container { position:relative; height:280px; width:100%; }
    `;
    document.head.appendChild(styleEl);

    // ── 3. HELPERS ────────────────────────────────────────────────────────────
    const API = '/api';

    function headers() {
        return { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
    }

    async function apiFetch(endpoint, opts = {}) {
        try {
            const res = await fetch(`${API}${endpoint}`, {
                ...opts, headers: { ...headers(), ...opts.headers }
            });
            if (res.status === 401) { window.location.href = '/login/'; return { error: true }; }
            if (res.status === 204) return { success: true };
            const data = await res.json();
            if (!res.ok) return { error: true, message: data.detail || data.error || JSON.stringify(data) };
            return data;
        } catch (e) {
            console.error('apiFetch:', e);
            return { error: true, message: 'Serveur inaccessible.' };
        }
    }

    function fmtMoney(v) {
        if (v === null || v === undefined || v === '') return '—';
        return parseFloat(v).toLocaleString('fr-FR', { minimumFractionDigits: 0 }) + ' DA';
    }

    function fmtDate(d) {
        if (!d) return '—';
        return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
    }

    function badge(statut) {
        const map = {
            'Paye':               'status-paid',
            'Partiellement_paye': 'status-partial',
            'Impaye':             'status-unpaid',
            'En_attente':         'status-partial',
            'Rejete':             'status-unpaid',
        };
        const labels = {
            'Paye':'Payé', 'Partiellement_paye':'Partiel',
            'Impaye':'Impayé', 'En_attente':'En attente', 'Rejete':'Rejeté'
        };
        return `<span class="${map[statut] || 'status-partial'}">${labels[statut] || statut}</span>`;
    }

    function avatar(name, bg = '6366f1') {
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bg}&color=fff`;
    }

    function esc(s) {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    function toast(msg, type = 'info') {
        document.querySelector('.fnc-toast')?.remove();
        const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#6366f1' };
        const t = document.createElement('div');
        t.className = 'fnc-toast';
        t.style.background = colors[type] || colors.info;
        t.textContent = msg;
        document.body.appendChild(t);
        requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; t.style.opacity = '1'; });
        setTimeout(() => {
            t.style.transform = 'translateX(120%)'; t.style.opacity = '0';
            setTimeout(() => t.remove(), 300);
        }, 4000);
    }

    // ── 4. STATE ──────────────────────────────────────────────────────────────
    const S = {
        payments:  [],
        salaries:  [],
        filtered:  [],
        page:      1,
        pageSize:  10,
        search:    '',
        status:    'all',
        activeTab: 0,
    };

    // ── 5. CHART.JS LOADER ────────────────────────────────────────────────────
    async function loadChartJS() {
        if (window.Chart) return;
        await new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
            s.onload  = resolve;
            s.onerror = reject;
            document.head.appendChild(s);
        });
    }

    // ── 6. BUILD CHARTS (async — FIX 1 + FIX 2) ──────────────────────────────
    async function buildCharts() {

        // ── Finance bar chart — FIX 1: constrain height ───────────────────
        const ctx1 = document.getElementById('financeChart');
        if (ctx1) {
            // Wrap in a sized container to prevent unbounded growth
            const wrapper = ctx1.parentElement;
            wrapper.style.position = 'relative';
            wrapper.style.height   = '280px';
            wrapper.style.maxHeight = '280px';
            ctx1.style.maxHeight   = '280px';

            new Chart(ctx1, {
                type: 'bar',
                data: {
                    labels: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun'],
                    datasets: [
                        {
                            label: 'Revenus',
                            // Will be updated with real data once payments load
                            data: [0, 0, 0, 0, 0, 0],
                            backgroundColor: '#10b981',
                            borderRadius: 4,
                        },
                        {
                            label: 'Dépenses',
                            data: [0, 0, 0, 0, 0, 0],
                            backgroundColor: '#ef4444',
                            borderRadius: 4,
                        },
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,   // false + explicit wrapper height = fixed size
                    plugins: { legend: { labels: { color:'#94a3b8' } } },
                    scales: {
                        y: { grid:{ color:'#334155' }, ticks:{ color:'#94a3b8' } },
                        x: { grid:{ color:'#334155' }, ticks:{ color:'#94a3b8' } },
                    }
                }
            });
        }

        // ── Payment doughnut ──────────────────────────────────────────────
        const ctx2 = document.getElementById('paymentChart');
        if (ctx2) {
            const wrapper2 = ctx2.parentElement;
            wrapper2.style.position  = 'relative';
            wrapper2.style.height    = '220px';
            wrapper2.style.maxHeight = '220px';

            window._payChart = new Chart(ctx2, {
                type: 'doughnut',
                data: {
                    labels: ['Payés','Partiels','Impayés'],
                    datasets: [{
                        data: [89, 6, 5],
                        backgroundColor: ['#10b981','#f59e0b','#ef4444'],
                        borderWidth: 0,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: { legend: { display: false } }
                }
            });
        }

        // ── Expense pie — FIX 2: real salary data from /api/bulletins/ ────
        const ctx3 = document.getElementById('expenseChart');
        if (ctx3) {
            const wrapper3 = ctx3.parentElement;
            wrapper3.style.position  = 'relative';
            wrapper3.style.height    = '280px';
            wrapper3.style.maxHeight = '280px';

            // Fetch bulletins to get real total salaire_net
            const bulletinData = await apiFetch('/bulletins/');
            const bulletins    = !bulletinData?.error
                ? (Array.isArray(bulletinData) ? bulletinData : (bulletinData.results || []))
                : [];

            const totalSalaires = bulletins.reduce(
                (sum, b) => sum + parseFloat(b.salaire_net || 0), 0
            );

            // Use real payment totals for revenue base (loaded in loadPayments before buildCharts)
            const totalRevenu = S.payments.reduce(
                (sum, p) => sum + parseFloat(p.montant_paye || 0), 0
            );

            // Estimate fixed overheads as % of revenue
            // (adjust these ratios to match your real cost structure)
            const loyer       = totalRevenu * 0.15;
            const services    = totalRevenu * 0.05;
            const fournitures = totalRevenu * 0.03;
            const marketing   = totalRevenu * 0.04;
            const autres      = totalRevenu * 0.05;

            const totalDepenses = totalSalaires + loyer + services + fournitures + marketing + autres;

            // Convert to integer percentages
            function pct(v) {
                return totalDepenses > 0 ? Math.round((v / totalDepenses) * 100) : 0;
            }

            const pieData = [
                pct(totalSalaires),
                pct(loyer),
                pct(services),
                pct(fournitures),
                pct(marketing),
                pct(autres),
            ];

            // Update KPI card for total dépenses (index 1 among .kpi-card h3)
            const kpiH3s = document.querySelectorAll('.kpi-card h3');
            if (kpiH3s[1]) kpiH3s[1].textContent = fmtMoney(totalDepenses);

            // Store chart instance so we can refresh it later
            window._expChart = new Chart(ctx3, {
                type: 'pie',
                data: {
                    labels: ['Salaires','Loyer','Services','Fournitures','Marketing','Autres'],
                    datasets: [{
                        data: pieData,
                        backgroundColor: ['#ef4444','#f59e0b','#3b82f6','#a855f7','#10b981','#64748b'],
                        borderWidth: 0,
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'right',
                            labels: { color:'#94a3b8', font:{ size:11 } }
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => {
                                    const labels = [
                                        totalSalaires, loyer, services,
                                        fournitures, marketing, autres,
                                    ];
                                    const val = labels[ctx.dataIndex] || 0;
                                    return ` ${ctx.label}: ${fmtMoney(val)} (${ctx.parsed}%)`;
                                }
                            }
                        }
                    }
                }
            });

            // Expose a helper to refresh when salary data changes
            window.refreshExpenseChart = async () => {
                const freshData = await apiFetch('/bulletins/');
                const fresh = !freshData?.error
                    ? (Array.isArray(freshData) ? freshData : (freshData.results || []))
                    : bulletins;
                const newSal = fresh.reduce((s, b) => s + parseFloat(b.salaire_net || 0), 0);
                const newRev = S.payments.reduce((s, p) => s + parseFloat(p.montant_paye || 0), 0);
                const newLoyer = newRev * 0.15, newSvc = newRev * 0.05;
                const newFrn = newRev * 0.03, newMkt = newRev * 0.04, newAut = newRev * 0.05;
                const newTot = newSal + newLoyer + newSvc + newFrn + newMkt + newAut;
                const np = v => newTot > 0 ? Math.round((v / newTot) * 100) : 0;
                window._expChart.data.datasets[0].data = [
                    np(newSal), np(newLoyer), np(newSvc), np(newFrn), np(newMkt), np(newAut)
                ];
                window._expChart.update();
                if (kpiH3s[1]) kpiH3s[1].textContent = fmtMoney(newTot);
            };
        }
    }

    // ── 7. USER INFO IN SIDEBAR ───────────────────────────────────────────────
    function injectUser() {
        const nameEl  = document.querySelector('.sidebar-footer .text-sm.font-medium');
        const emailEl = document.querySelector('.sidebar-footer .text-xs.text-slate-400');
        const imgEl   = document.querySelector('.sidebar-footer img');
        const fullName = USER.nom_complet ||
            `${USER.first_name || ''} ${USER.last_name || ''}`.trim() || 'Dirigeant';
        if (nameEl)  nameEl.textContent  = fullName;
        if (emailEl) emailEl.textContent = USER.email || '';
        if (imgEl)   imgEl.src = avatar(fullName);
    }

    // ── 8. KPI UPDATE ─────────────────────────────────────────────────────────
    function updateKPIs() {
        const pays    = S.payments;
        const revenu  = pays.reduce((s, p) => s + parseFloat(p.montant_paye || 0), 0);
        const impayes = pays
            .filter(p => p.statut_paiement === 'Impaye')
            .reduce((s, p) => s + parseFloat(p.solde || 0), 0);

        const totalSalNet = S.salaries.reduce((s, b) => s + parseFloat(b.salaire_net || 0), 0);
        const depenses    = totalSalNet + revenu * 0.32; // salaires + other overheads

        const kpiH3s = document.querySelectorAll('.kpi-card h3');
        if (kpiH3s[0]) kpiH3s[0].textContent = fmtMoney(revenu);
        if (kpiH3s[1]) kpiH3s[1].textContent = fmtMoney(depenses);
        if (kpiH3s[2]) kpiH3s[2].textContent = fmtMoney(revenu - depenses);
        if (kpiH3s[3]) kpiH3s[3].textContent = fmtMoney(impayes);

        // Update doughnut
        const total = pays.length || 1;
        const paye  = Math.round(pays.filter(p => p.statut_paiement === 'Paye').length / total * 100);
        const part  = Math.round(pays.filter(p => p.statut_paiement === 'Partiellement_paye').length / total * 100);
        const impay = 100 - paye - part;

        if (window._payChart) {
            window._payChart.data.datasets[0].data = [paye, part, impay];
            window._payChart.update();
        }

        const legends = document.querySelectorAll('.glass-panel .space-y-2 .font-medium');
        if (legends[0]) legends[0].textContent = paye  + '%';
        if (legends[1]) legends[1].textContent = part  + '%';
        if (legends[2]) legends[2].textContent = impay + '%';

        // Refresh expense pie with updated payment data
        window.refreshExpenseChart?.();
    }

    // ── 9. PAYMENT TABLE ──────────────────────────────────────────────────────
    function applyFilters() {
        let r = [...S.payments];
        if (S.status !== 'all') {
            const map = { 'Payé':'Paye', 'Partiel':'Partiellement_paye', 'Impayé':'Impaye' };
            r = r.filter(p => p.statut_paiement === (map[S.status] || S.status));
        }
        if (S.search) {
            const q = S.search.toLowerCase();
            r = r.filter(p =>
                (p.etudiant_nom || '').toLowerCase().includes(q) ||
                (p.periode      || '').toLowerCase().includes(q) ||
                (p.reference_paiement || '').toLowerCase().includes(q)
            );
        }
        S.filtered = r;
        S.page     = 1;
        renderPayments();
        renderPagination();
    }

    function renderPayments() {
        const tbody = document.querySelector('.glass-panel table tbody');
        if (!tbody) return;

        const start = (S.page - 1) * S.pageSize;
        const slice = S.filtered.slice(start, start + S.pageSize);

        if (!slice.length) {
            tbody.innerHTML = `<tr><td colspan="8"
                style="text-align:center;padding:3rem;color:#94a3b8;">
                Aucun paiement trouvé.</td></tr>`;
            return;
        }

        tbody.innerHTML = slice.map(p => {
            const nom   = p.etudiant_nom || `Étudiant #${p.etudiant}`;
            const bg    = p.statut_paiement === 'Paye' ? '10b981'
                        : p.statut_paiement === 'Impaye' ? 'ef4444' : 'f59e0b';
            const solde = parseFloat(p.solde || 0);
            return `
            <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                <td class="py-4 px-4">
                    <div class="flex items-center gap-3">
                        <img src="${avatar(nom, bg)}" class="w-8 h-8 rounded-full">
                        <div>
                            <p class="font-medium text-white">${esc(nom)}</p>
                            <p class="text-xs text-slate-500">${esc(p.periode || '—')}</p>
                        </div>
                    </div>
                </td>
                <td class="py-4 px-4 text-slate-300">${esc(p.mode_paiement || '—')}</td>
                <td class="py-4 px-4 text-white">${fmtMoney(p.montant_du)}</td>
                <td class="py-4 px-4 ${p.statut_paiement === 'Paye' ? 'text-emerald-400' : 'text-amber-400'}">
                    ${fmtMoney(p.montant_paye)}
                </td>
                <td class="py-4 px-4 ${solde > 0 ? 'text-red-400' : 'text-slate-400'}">
                    ${fmtMoney(solde)}
                </td>
                <td class="py-4 px-4">${badge(p.statut_paiement)}</td>
                <td class="py-4 px-4 text-slate-400">${fmtDate(p.date_paiement)}</td>
                <td class="py-4 px-4 text-center">
                    <button data-action="view-pay" data-id="${p.id}"
                        class="p-2 hover:bg-slate-700 rounded-lg text-slate-400" title="Détails">
                        <i class="fas fa-eye"></i>
                    </button>
                    ${p.statut_paiement === 'Impaye'
                        ? `<button data-action="remind" data-id="${p.id}" data-nom="${esc(nom)}"
                               class="p-2 hover:bg-slate-700 rounded-lg text-red-400" title="Relance">
                               <i class="fas fa-bell"></i>
                           </button>`
                        : `<button data-action="pdf-pay" data-id="${p.id}"
                               class="p-2 hover:bg-slate-700 rounded-lg text-slate-400" title="PDF">
                               <i class="fas fa-file-pdf"></i>
                           </button>`}
                </td>
            </tr>`;
        }).join('');

        const countEl = document.querySelector('.mt-4.flex.items-center.justify-between p');
        if (countEl) {
            const s = Math.min((S.page - 1) * S.pageSize + 1, S.filtered.length);
            const e = Math.min(S.page * S.pageSize, S.filtered.length);
            countEl.textContent = `Affichage ${s}-${e} sur ${S.filtered.length} paiements`;
        }
    }

    function renderPagination() {
        const wrap = document.querySelector('.mt-4.flex.items-center.justify-between .flex.gap-2');
        if (!wrap) return;
        const pages = Math.max(1, Math.ceil(S.filtered.length / S.pageSize));
        const range = [];
        for (let i = Math.max(1, S.page - 1); i <= Math.min(pages, S.page + 1); i++) range.push(i);

        wrap.innerHTML = `
            <button data-action="prev-page"
                class="btn-secondary ${S.page === 1 ? 'opacity-40 cursor-not-allowed' : ''}"
                ${S.page === 1 ? 'disabled' : ''}>
                <i class="fas fa-chevron-left"></i>
            </button>
            ${range.map(n => `
                <button data-action="goto-page" data-page="${n}"
                    class="btn-secondary ${n === S.page ? 'active-page-btn' : ''}">
                    ${n}
                </button>`).join('')}
            <button data-action="next-page"
                class="btn-secondary ${S.page === pages ? 'opacity-40 cursor-not-allowed' : ''}"
                ${S.page === pages ? 'disabled' : ''}>
                <i class="fas fa-chevron-right"></i>
            </button>`;
    }

    // ── 10. SALARY TABLE ─────────────────────────────────────────────────────
    function renderSalaries() {
        const tbodies = document.querySelectorAll('.glass-panel table tbody');
        const tbody   = tbodies[1];
        if (!tbody) return;

        if (!S.salaries.length) {
            tbody.innerHTML = `<tr><td colspan="8"
                style="text-align:center;padding:3rem;color:#94a3b8;">
                Aucun bulletin trouvé.</td></tr>`;
            return;
        }

        tbody.innerHTML = S.salaries.map(b => {
            const nom       = b.enseignant_nom || `Enseignant #${b.enseignant}`;
            const isPaid    = b.statut_paiement === 'Paye';
            const isPending = b.statut_paiement === 'En_attente';
            const netColor  = isPaid ? 'text-emerald-400' : 'text-amber-400';

            return `
            <tr class="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                <td class="py-4 px-4">
                    <div class="flex items-center gap-3">
                        <img src="${avatar(nom)}" class="w-8 h-8 rounded-full">
                        <div>
                            <p class="font-medium text-white">${esc(nom)}</p>
                            <p class="text-xs text-slate-500">${esc(b.periode || '—')}</p>
                        </div>
                    </div>
                </td>
                <td class="py-4 px-4 text-white">${b.heures_travaillees || 0}h</td>
                <td class="py-4 px-4 text-slate-300">${fmtMoney(b.tarif_horaire)}/h</td>
                <td class="py-4 px-4 text-white">${fmtMoney(b.salaire_brut)}</td>
                <td class="py-4 px-4 text-red-400">- ${fmtMoney(b.total_retenues)}</td>
                <td class="py-4 px-4 ${netColor} font-semibold">${fmtMoney(b.salaire_net)}</td>
                <td class="py-4 px-4 text-center">${badge(b.statut_paiement)}</td>
                <td class="py-4 px-4 text-center">
                    ${isPending
                        ? `<button data-action="validate-salary" data-id="${b.id}" class="btn-success">
                               <i class="fas fa-check" style="margin-right:4px;"></i>Valider
                           </button>`
                        : `<button data-action="bulletin-pdf" data-id="${b.id}"
                               class="btn-secondary text-xs">
                               <i class="fas fa-file-pdf" style="margin-right:4px;"></i>Bulletin
                           </button>`}
                </td>
            </tr>`;
        }).join('');
    }

    // ── 11. MODALS ────────────────────────────────────────────────────────────
    function modalWrap(id, content) {
        document.getElementById(id)?.remove();
        const div = document.createElement('div');
        div.id        = id;
        div.className = 'modal-overlay';
        div.innerHTML = `<div class="modal-box" onclick="event.stopPropagation()">${content}</div>`;
        document.body.appendChild(div);
        div.addEventListener('click', e => { if (e.target === div) div.remove(); });
        return div;
    }
    function closeModal(id) { document.getElementById(id)?.remove(); }

    function modalHeader(title, icon, closeId) {
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
            <h3 style="margin:0;color:white;font-size:1.1rem;font-weight:700;">
                <i class="${icon}" style="color:#6366f1;margin-right:8px;"></i>${title}
            </h3>
            <button onclick="document.getElementById('${closeId}').remove()"
                style="background:none;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer;line-height:1;">×</button>
        </div>`;
    }

    function infoRow(label, value, color = 'white') {
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;
                    padding:.65rem 1rem;background:#0f172a;border-radius:8px;">
            <span style="color:#64748b;font-size:.875rem;">${label}</span>
            <strong style="color:${color};font-size:.875rem;">${value}</strong>
        </div>`;
    }

    function openPaymentDetail(id) {
        const p = S.payments.find(x => x.id === id);
        if (!p) return;
        const nom   = p.etudiant_nom || `Étudiant #${p.etudiant}`;
        const solde = parseFloat(p.solde || 0);

        const m = modalWrap('modal-pay-detail', `
            ${modalHeader('Détail du Paiement', 'fas fa-file-invoice', 'modal-pay-detail')}
            <div style="display:flex;align-items:center;gap:1rem;padding:1rem;
                        background:#0f172a;border-radius:12px;margin-bottom:1.25rem;">
                <img src="${avatar(nom)}" style="width:44px;height:44px;border-radius:50%;">
                <div style="flex:1;">
                    <p style="margin:0;font-weight:700;color:white;">${esc(nom)}</p>
                    <p style="margin:0;font-size:.8rem;color:#94a3b8;">Période : ${esc(p.periode || '—')}</p>
                </div>
                ${badge(p.statut_paiement)}
            </div>
            <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1.5rem;">
                ${infoRow('Montant dû',    fmtMoney(p.montant_du))}
                ${infoRow('Montant payé',  fmtMoney(p.montant_paye), p.statut_paiement === 'Paye' ? '#34d399' : '#fbbf24')}
                ${infoRow('Solde restant', fmtMoney(solde), solde > 0 ? '#f87171' : '#94a3b8')}
                ${infoRow('Mode',          p.mode_paiement || '—')}
                ${infoRow('Date paiement', fmtDate(p.date_paiement))}
                ${infoRow('Échéance',      fmtDate(p.date_echeance))}
                ${infoRow('Référence',     p.reference_paiement || '—')}
                ${infoRow('Relances',      p.relances_envoyees || 0)}
            </div>
            <div class="modal-row">
                <button class="modal-btn modal-btn-cancel"
                    onclick="document.getElementById('modal-pay-detail').remove()">Fermer</button>
                ${p.statut_paiement !== 'Paye'
                    ? `<button class="modal-btn modal-btn-primary" id="btn-record-from-detail">
                           <i class="fas fa-check-circle" style="margin-right:6px;"></i>Enregistrer paiement
                       </button>`
                    : ''}
            </div>`);

        document.getElementById('btn-record-from-detail')?.addEventListener('click', () => {
            closeModal('modal-pay-detail');
            openRecordPayment(id);
        });
    }

    function openRecordPayment(payId) {
        const p = S.payments.find(x => x.id === payId);
        if (!p) return;

        modalWrap('modal-record-pay', `
            ${modalHeader('Enregistrer un Paiement', 'fas fa-plus-circle', 'modal-record-pay')}
            <div class="modal-field">
                <label>Montant payé (DA) *</label>
                <input id="rp-montant" type="number" min="0" value="${parseFloat(p.solde || 0)}">
            </div>
            <div class="modal-field">
                <label>Mode de paiement *</label>
                <select id="rp-mode">
                    <option value="Especes">Espèces</option>
                    <option value="Cheque">Chèque</option>
                    <option value="Virement">Virement</option>
                    <option value="Carte">Carte</option>
                </select>
            </div>
            <div class="modal-field">
                <label>Référence</label>
                <input id="rp-ref" type="text" placeholder="REF-2026-...">
            </div>
            <div class="modal-error" id="rp-err"></div>
            <div class="modal-row">
                <button class="modal-btn modal-btn-cancel"
                    onclick="document.getElementById('modal-record-pay').remove()">Annuler</button>
                <button class="modal-btn modal-btn-success" id="rp-save">
                    <i class="fas fa-save" style="margin-right:6px;"></i>Sauvegarder
                </button>
            </div>`);

        document.getElementById('rp-save').addEventListener('click', async () => {
            const montant = parseFloat(document.getElementById('rp-montant').value);
            const mode    = document.getElementById('rp-mode').value;
            const ref     = document.getElementById('rp-ref').value.trim();
            const errEl   = document.getElementById('rp-err');
            const btn     = document.getElementById('rp-save');

            if (!montant || montant <= 0) {
                errEl.textContent = 'Montant invalide.'; errEl.style.display = 'block'; return;
            }

            btn.textContent = '⏳ Enregistrement...'; btn.disabled = true;

            const newPaid   = parseFloat(p.montant_paye || 0) + montant;
            const newStatut = newPaid >= parseFloat(p.montant_du) ? 'Paye' : 'Partiellement_paye';

            const result = await apiFetch(`/paiements/${payId}/`, {
                method: 'PATCH',
                body: JSON.stringify({
                    montant_paye:       newPaid,
                    mode_paiement:      mode,
                    reference_paiement: ref || undefined,
                    statut_paiement:    newStatut,
                    date_paiement:      new Date().toISOString().slice(0, 10),
                }),
            });

            if (result?.error) {
                errEl.textContent   = '❌ ' + (result.message || 'Erreur.');
                errEl.style.display = 'block';
                btn.textContent     = '💾 Sauvegarder'; btn.disabled = false;
                return;
            }

            const idx = S.payments.findIndex(x => x.id === payId);
            if (idx !== -1) S.payments[idx] = result;
            applyFilters();
            updateKPIs();
            closeModal('modal-record-pay');
            toast(`✅ Paiement de ${fmtMoney(montant)} enregistré`, 'success');
        });
    }

    async function openNewPayment() {
        const etudData  = await apiFetch('/etudiants/');
        const etudiants = Array.isArray(etudData) ? etudData : (etudData.results || []);

        modalWrap('modal-new-pay', `
            ${modalHeader('Nouveau Paiement', 'fas fa-plus', 'modal-new-pay')}
            <div class="modal-field">
                <label>Étudiant *</label>
                <select id="np-etudiant">
                    <option value="">-- Sélectionner --</option>
                    ${etudiants.map(e => {
                        const nom = `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.trim() || `#${e.id}`;
                        return `<option value="${e.id}">${esc(nom)} (${esc(e.niveau_actuel || '')})</option>`;
                    }).join('')}
                </select>
            </div>
            <div class="modal-field">
                <label>Montant dû (DA) *</label>
                <input id="np-du" type="number" min="0" placeholder="0">
            </div>
            <div class="modal-field">
                <label>Montant payé (DA)</label>
                <input id="np-paye" type="number" min="0" value="0">
            </div>
            <div class="modal-field">
                <label>Mode de paiement *</label>
                <select id="np-mode">
                    <option value="Especes">Espèces</option>
                    <option value="Cheque">Chèque</option>
                    <option value="Virement">Virement</option>
                    <option value="Carte">Carte</option>
                </select>
            </div>
            <div class="modal-field">
                <label>Période (ex: Avril 2026)</label>
                <input id="np-periode" type="text" placeholder="Avril 2026">
            </div>
            <div class="modal-field">
                <label>Date d'échéance</label>
                <input id="np-echeance" type="date">
            </div>
            <div class="modal-error" id="np-err"></div>
            <div class="modal-row">
                <button class="modal-btn modal-btn-cancel"
                    onclick="document.getElementById('modal-new-pay').remove()">Annuler</button>
                <button class="modal-btn modal-btn-primary" id="np-save">
                    <i class="fas fa-save" style="margin-right:6px;"></i>Créer
                </button>
            </div>`);

        document.getElementById('np-save').addEventListener('click', async () => {
            const etudiant = document.getElementById('np-etudiant').value;
            const du       = parseFloat(document.getElementById('np-du').value);
            const paye     = parseFloat(document.getElementById('np-paye').value || 0);
            const mode     = document.getElementById('np-mode').value;
            const periode  = document.getElementById('np-periode').value.trim();
            const echeance = document.getElementById('np-echeance').value;
            const errEl    = document.getElementById('np-err');
            const btn      = document.getElementById('np-save');

            if (!etudiant) { errEl.textContent = 'Sélectionnez un étudiant.'; errEl.style.display = 'block'; return; }
            if (!du || du <= 0) { errEl.textContent = 'Montant dû invalide.'; errEl.style.display = 'block'; return; }

            const statut = paye >= du ? 'Paye' : paye > 0 ? 'Partiellement_paye' : 'Impaye';
            btn.textContent = '⏳ Création...'; btn.disabled = true;

            const result = await apiFetch('/paiements/', {
                method: 'POST',
                body: JSON.stringify({
                    etudiant:        parseInt(etudiant),
                    montant_du:      du,
                    montant_paye:    paye,
                    mode_paiement:   mode,
                    statut_paiement: statut,
                    date_paiement:   new Date().toISOString().slice(0, 10),
                    periode:         periode  || undefined,
                    date_echeance:   echeance || undefined,
                }),
            });

            if (result?.error) {
                errEl.textContent   = '❌ ' + (result.message || 'Erreur.');
                errEl.style.display = 'block';
                btn.textContent     = '💾 Créer'; btn.disabled = false;
                return;
            }

            S.payments.unshift(result);
            applyFilters();
            updateKPIs();
            closeModal('modal-new-pay');
            toast('✅ Paiement créé avec succès', 'success');
        });
    }

    // ── 12. SALARY ACTIONS ────────────────────────────────────────────────────
    async function validateSalary(id) {
        if (!confirm('Valider et marquer ce salaire comme payé ?')) return;
        const result = await apiFetch(`/bulletins/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify({
                statut_paiement: 'Paye',
                date_paiement:   new Date().toISOString().slice(0, 10),
            }),
        });
        if (result?.error) { toast('❌ ' + (result.message || 'Erreur'), 'error'); return; }
        const idx = S.salaries.findIndex(b => b.id === id);
        if (idx !== -1) S.salaries[idx] = result;
        renderSalaries();
        updateKPIs(); // refresh expense chart too
        toast('✅ Salaire validé', 'success');
    }

    async function sendReminder(id, nom) {
        if (!confirm(`Envoyer une relance à ${nom} ?`)) return;
        const p = S.payments.find(x => x.id === id);
        if (!p) return;
        const result = await apiFetch(`/paiements/${id}/`, {
            method: 'PATCH',
            body: JSON.stringify({
                relances_envoyees: (p.relances_envoyees || 0) + 1,
                derniere_relance:  new Date().toISOString(),
            }),
        });
        if (result?.error) { toast('❌ Erreur lors de l\'envoi', 'error'); return; }
        const idx = S.payments.findIndex(x => x.id === id);
        if (idx !== -1) S.payments[idx] = result;
        toast(`📨 Relance envoyée à ${nom} (total : ${result.relances_envoyees})`, 'success');
    }

    // ── 13. TAB SWITCHING ─────────────────────────────────────────────────────
    function setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const mainDiv = document.querySelector('.p-8.space-y-6');
        if (!mainDiv || !tabBtns.length) return;

        const sectionVis = {
            0: [true,  true,  true,  true,  true ],
            1: [true,  false, true,  false, false],
            2: [false, false, false, true,  false],
            3: [false, false, false, false, true ],
        };

        tabBtns.forEach((btn, i) => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                S.activeTab = i;
                const children = Array.from(mainDiv.children);
                const vis = sectionVis[i] || sectionVis[0];
                children.forEach((child, ci) => {
                    if (ci === 0) return;
                    child.style.display = vis[ci - 1] !== false ? '' : 'none';
                });
            });
        });
    }

    // ── 14. CLICK DELEGATION ─────────────────────────────────────────────────
    function setupClicks() {
        // Header buttons
        document.querySelectorAll('header .flex.items-center.gap-3 button').forEach(btn => {
            if (btn.textContent.includes('Nouveau'))  btn.addEventListener('click', openNewPayment);
            if (btn.textContent.includes('Factures')) btn.addEventListener('click', () =>
                toast('📄 Module factures en cours de développement', 'info'));
        });

        // Calculer tous les salaires
        document.querySelectorAll('button').forEach(btn => {
            if (btn.textContent.trim().includes('Calculer tous')) {
                btn.addEventListener('click', async () => {
                    toast('⏳ Actualisation des salaires...', 'info');
                    await loadSalaries();
                    updateKPIs();
                    toast('✅ Salaires actualisés', 'success');
                });
            }
        });

        // Delegated table actions
        document.addEventListener('click', e => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            e.stopPropagation();
            const action = btn.dataset.action;
            const id     = parseInt(btn.dataset.id);

            switch (action) {
                case 'view-pay':        openPaymentDetail(id); break;
                case 'remind':          sendReminder(id, btn.dataset.nom); break;
                case 'pdf-pay':         toast('📄 Génération PDF... (bientôt)', 'info'); break;
                case 'validate-salary': validateSalary(id); break;
                case 'bulletin-pdf':    toast('📄 Génération bulletin... (bientôt)', 'info'); break;
                case 'prev-page':
                    if (S.page > 1) { S.page--; renderPayments(); renderPagination(); }
                    break;
                case 'next-page': {
                    const pages = Math.ceil(S.filtered.length / S.pageSize);
                    if (S.page < pages) { S.page++; renderPayments(); renderPagination(); }
                    break;
                }
                case 'goto-page':
                    S.page = parseInt(btn.dataset.page);
                    renderPayments(); renderPagination();
                    break;
            }
        });

        // Search
        const searchEl = document.querySelector('.search-input');
        if (searchEl) {
            let timer;
            searchEl.addEventListener('input', e => {
                clearTimeout(timer);
                timer = setTimeout(() => { S.search = e.target.value.trim(); applyFilters(); }, 300);
            });
        }

        // Status filter
        const filterEl = document.querySelector('.filter-select');
        if (filterEl) {
            filterEl.addEventListener('change', e => { S.status = e.target.value; applyFilters(); });
        }

        // Logout
        document.querySelector('.logout-link')?.addEventListener('click', async e => {
            e.preventDefault();
            const refresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh');
            if (refresh) {
                await fetch(`${API}/auth/logout/`, {
                    method: 'POST', headers: headers(),
                    body: JSON.stringify({ refresh }),
                }).catch(() => {});
            }
            localStorage.clear(); sessionStorage.clear();
            window.location.href = '/login/';
        });
    }

    // ── 15. LOAD DATA ─────────────────────────────────────────────────────────
    async function loadPayments() {
        const data = await apiFetch('/paiements/');
        if (data?.error) { toast('Erreur chargement paiements', 'error'); return; }
        S.payments = Array.isArray(data) ? data : (data.results || []);
        S.filtered = [...S.payments];
        renderPayments();
        renderPagination();
        updateKPIs();
    }

    async function loadSalaries() {
        const data = await apiFetch('/bulletins/');
        if (data?.error) { toast('Erreur chargement bulletins', 'error'); return; }
        S.salaries = Array.isArray(data) ? data : (data.results || []);
        renderSalaries();
    }

    // ── 16. BOOT ──────────────────────────────────────────────────────────────
    injectUser();
    setupTabs();
    setupClicks();

    // Load payments first so buildCharts() can use S.payments for revenue ratio
    await loadPayments();
    await loadSalaries();

    await loadChartJS();
    await buildCharts(); // FIX 3: await because it's now async

    toast('✅ Dashboard chargé', 'success');
});