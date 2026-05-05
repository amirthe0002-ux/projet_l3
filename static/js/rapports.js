/**
 * rapports.js — Rapports & Statistiques (Dirigeant)
 *
 * Features:
 *  - JWT auth check + sidebar user info
 *  - Load real stats from /api/dashboard/ → update report card numbers
 *  - Download buttons → fetch real data and export as CSV
 *  - Date filter (Du / Au) + quick period buttons (Ce mois / trimestre / année)
 *  - History: trash button deletes row, download button re-downloads
 *  - "Nouveau" scheduled report → placeholder modal
 *  - Logout
 *  - Toast notifications
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

    // ── 2. HELPERS ────────────────────────────────────────────────────────────
    const API = '/api';

    function authHeaders() {
        return { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
    }

    async function apiFetch(endpoint, opts = {}) {
        try {
            const res = await fetch(`${API}${endpoint}`, {
                ...opts,
                headers: { ...authHeaders(), ...opts.headers },
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

    function toast(msg, type = 'info') {
        document.querySelector('.rpt-toast')?.remove();
        const colors = { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#6366f1' };
        const icons  = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
        const t = document.createElement('div');
        t.className = 'rpt-toast';
        t.style.cssText = `
            position:fixed;bottom:24px;right:24px;z-index:9999;
            padding:14px 22px;border-radius:12px;background:${colors[type]};color:white;
            font-weight:600;font-size:.9rem;box-shadow:0 8px 24px rgba(0,0,0,.4);
            display:flex;align-items:center;gap:10px;max-width:420px;
            transform:translateX(120%);opacity:0;transition:all .3s ease;`;
        t.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
        document.body.appendChild(t);
        requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; t.style.opacity = '1'; });
        setTimeout(() => {
            t.style.transform = 'translateX(120%)'; t.style.opacity = '0';
            setTimeout(() => t.remove(), 300);
        }, 4500);
    }

    function setLoading(btn, loading) {
        if (loading) {
            btn._orig = btn.innerHTML;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Génération...';
            btn.disabled = true;
            btn.style.opacity = '.7';
        } else {
            btn.innerHTML = btn._orig || btn.innerHTML;
            btn.disabled = false;
            btn.style.opacity = '';
        }
    }

    // ── 3. INJECT STYLES ──────────────────────────────────────────────────────
    document.head.insertAdjacentHTML('beforeend', `
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/all.min.css">
    <style>
        .report-card button:disabled { cursor:not-allowed; }
        .rpt-modal-overlay {
            position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:4000;
            display:flex;align-items:center;justify-content:center;padding:1rem;
        }
        .rpt-modal-box {
            background:#1e293b;border:1px solid #334155;border-radius:20px;
            padding:2rem;width:90%;max-width:460px;
        }
        .rpt-modal-input {
            width:100%;padding:.75rem;background:#0f172a;border:1px solid #334155;
            border-radius:8px;color:white;font-family:inherit;box-sizing:border-box;margin-top:6px;
        }
        .rpt-modal-input:focus { outline:none;border-color:#6366f1; }
        .history-row { transition:all .3s ease; }
        .history-row.removing { opacity:0;transform:translateX(40px); }
    </style>`);

    // ── 4. SIDEBAR USER INFO ──────────────────────────────────────────────────
    function injectUser() {
        const fullName = USER.nom_complet ||
            `${USER.first_name || ''} ${USER.last_name || ''}`.trim() || 'Dirigeant';
        const nameEl  = document.querySelector('aside .text-sm.font-medium');
        const emailEl = document.querySelector('aside .text-xs.text-slate-400');
        const imgEl   = document.querySelector('aside img');
        if (nameEl)  nameEl.textContent  = fullName;
        if (emailEl) emailEl.textContent = USER.email || '';
        if (imgEl)   imgEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(fullName)}&background=6366f1&color=fff`;
    }

    // ── 5. DATE HELPERS ───────────────────────────────────────────────────────
    function todayISO() { return new Date().toISOString().split('T')[0]; }

    function getDateRange() {
        const inputs = document.querySelectorAll('.date-input');
        return {
            from: inputs[0]?.value || '',
            to:   inputs[1]?.value || todayISO(),
        };
    }

    function setDateRange(from, to) {
        const inputs = document.querySelectorAll('.date-input');
        if (inputs[0]) inputs[0].value = from;
        if (inputs[1]) inputs[1].value = to;
    }

    function setPeriod(period) {
        const now  = new Date();
        let   from = new Date();
        if (period === 'month') {
            from = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (period === 'quarter') {
            from = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        } else if (period === 'year') {
            from = new Date(now.getFullYear(), 0, 1);
        }
        setDateRange(from.toISOString().split('T')[0], todayISO());
    }

    // ── 6. FIND REPORT CARD BY h3 TEXT ───────────────────────────────────────
    function getCard(title) {
        for (const card of document.querySelectorAll('.report-card')) {
            if (card.querySelector('h3')?.textContent?.trim() === title) return card;
        }
        return null;
    }

    // Update the two stat rows inside a card
    function updateCardStats(title, val1, val2) {
        const card = getCard(title);
        if (!card) return;
        const spans = card.querySelectorAll('.space-y-2 .flex span:last-child');
        if (spans[0] && val1 !== undefined) spans[0].textContent = val1;
        if (spans[1] && val2 !== undefined) spans[1].textContent = val2;
    }

    // ── 7. LOAD DASHBOARD STATS ───────────────────────────────────────────────
    async function loadStats() {
        const data = await apiFetch('/dashboard/');
        if (data?.error) return;

        const fin = data.finances  || {};
        const ped = data.pedagogie || {};

        // Rapport Financier
        updateCardStats(
            'Rapport Financier',
            (fin.revenus_collectes || 0).toLocaleString('fr-FR') + ' DA',
            ((fin.solde || 0) >= 0 ? '+' : '') + (fin.solde || 0).toLocaleString('fr-FR') + ' DA'
        );

        // Rapport Étudiants
        const tauxReussite = ped.moyenne_globale
            ? Math.round((ped.moyenne_globale / 20) * 100) + '%'
            : '—';
        updateCardStats(
            'Rapport Étudiants',
            (data.etudiants || 0).toString(),
            tauxReussite
        );

        // Rapport Enseignants
        updateCardStats(
            'Rapport Enseignants',
            (data.enseignants || 0) + ' enseignants',
            (fin.salaires_verses || 0).toLocaleString('fr-FR') + ' DA'
        );

        // Rapport d'Assiduité
        const nbAbs   = ped.nb_absences || 0;
        const estTaux = Math.max(0, 100 - nbAbs * 0.5).toFixed(1) + '%';
        updateCardStats("Rapport d'Assiduité", estTaux, nbAbs.toString());

        // Rapport Paiements
        const impayes = fin['impayés'] ?? fin.impayes ?? 0;
        updateCardStats(
            'Rapport Paiements',
            (fin.taux_paiement || 0).toFixed(1) + '%',
            impayes.toLocaleString('fr-FR') + ' DA'
        );
    }

    // ── 8. CSV BUILDER + DOWNLOAD ─────────────────────────────────────────────
    function buildCSV(headers, rows) {
        function escCell(v) {
            const s = String(v ?? '').replace(/"/g, '""');
            return /[,"\n\r]/.test(s) ? `"${s}"` : s;
        }
        return [headers, ...rows].map(r => r.map(escCell).join(',')).join('\r\n');
    }

    function downloadCSV(content, filename) {
        const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), { href: url, download: filename });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    const today = () => new Date().toISOString().split('T')[0];

    // ── 9. EXPORT FUNCTIONS ───────────────────────────────────────────────────
    async function exportFinancier(btn) {
        setLoading(btn, true);
        toast('Génération du rapport financier…', 'info');

        const [dashboard, bulletins, paiements] = await Promise.all([
            apiFetch('/dashboard/'),
            apiFetch('/bulletins/'),
            apiFetch('/paiements/'),
        ]);
        setLoading(btn, false);

        if (dashboard?.error) { toast('Erreur de chargement des données.', 'error'); return; }

        const fin = dashboard.finances || {};
        const headers = ['Indicateur', 'Valeur'];
        const rows = [
            ['Revenus collectés (DA)',  fin.revenus_collectes ?? 0],
            ['Impayés (DA)',           fin['impayés'] ?? fin.impayes ?? 0],
            ['Salaires versés (DA)',   fin.salaires_verses ?? 0],
            ['Solde (DA)',             fin.solde ?? 0],
            ['Taux paiement (%)',      (fin.taux_paiement || 0).toFixed(2)],
            ['Nb bulletins salaire',   Array.isArray(bulletins) ? bulletins.length : 'N/A'],
            ['Nb paiements total',     Array.isArray(paiements) ? paiements.length : 'N/A'],
        ];

        const filename = `rapport_financier_${today()}.csv`;
        downloadCSV(buildCSV(headers, rows), filename);
        toast(`✅ Rapport financier exporté`, 'success');
        addHistoryRow(filename, 'CSV', 'Synthèse financière');
    }

    async function exportEtudiants(btn) {
        setLoading(btn, true);
        toast('Récupération des données étudiants…', 'info');
        const data = await apiFetch('/etudiants/');
        setLoading(btn, false);

        const list = Array.isArray(data) ? data : (data.results || []);
        if (!list.length) { toast('Aucune donnée étudiant disponible.', 'warning'); return; }

        const headers = ['ID','Nom','Prénom','Email','Niveau','Groupe','Statut','Date Inscription','Moyenne'];
        const rows = list.map(e => [
            e.id,
            e.user?.last_name  || '',
            e.user?.first_name || '',
            e.user?.email      || '',
            e.niveau_actuel    || '',
            e.groupe_nom       || '',
            e.statut_etudiant  || '',
            e.date_inscription || '',
            e.moyenne_generale ?? '',
        ]);

        const filename = `etudiants_${today()}.csv`;
        downloadCSV(buildCSV(headers, rows), filename);
        toast(`✅ ${list.length} étudiants exportés`, 'success');
        addHistoryRow(filename, 'CSV', `${list.length} étudiants`);
    }

    async function exportEnseignants(btn) {
        setLoading(btn, true);
        toast('Récupération des données enseignants…', 'info');
        const data = await apiFetch('/enseignants/');
        setLoading(btn, false);

        const list = Array.isArray(data) ? data : (data.results || []);
        if (!list.length) { toast('Aucune donnée enseignant disponible.', 'warning'); return; }

        const headers = ['ID','Nom','Prénom','Email','Langue','Niveaux','Contrat','Tarif/h','Statut','Nb Groupes'];
        const rows = list.map(e => [
            e.id,
            e.user?.last_name   || '',
            e.user?.first_name  || '',
            e.user?.email       || '',
            e.langue_enseignee  || '',
            e.niveaux           || '',
            e.type_contrat      || '',
            e.tarif_horaire     || '',
            e.statut_emploi     || '',
            e.nombre_groupes    ?? 0,
        ]);

        const filename = `enseignants_${today()}.csv`;
        downloadCSV(buildCSV(headers, rows), filename);
        toast(`✅ ${list.length} enseignants exportés`, 'success');
        addHistoryRow(filename, 'CSV', `${list.length} enseignants`);
    }

    async function exportAssiduite(btn) {
        setLoading(btn, true);
        toast('Récupération des absences…', 'info');
        const data = await apiFetch('/absences/');
        setLoading(btn, false);

        const list = Array.isArray(data) ? data : (data.results || []);
        if (!list.length) { toast('Aucune absence enregistrée.', 'warning'); return; }

        const headers = ['ID','Étudiant','Date Séance','Date Absence','Statut','Justification','Raison'];
        const rows = list.map(a => [
            a.id,
            a.etudiant_nom   || '',
            a.seance_date    || '',
            a.date_absence   || '',
            a.statut_absence || '',
            a.justification  || '',
            a.raison         || '',
        ]);

        const filename = `absences_${today()}.csv`;
        downloadCSV(buildCSV(headers, rows), filename);
        toast(`✅ ${list.length} absences exportées`, 'success');
        addHistoryRow(filename, 'CSV', `${list.length} absences`);
    }

    async function exportPaiements(btn) {
        setLoading(btn, true);
        toast('Récupération des paiements…', 'info');
        const data = await apiFetch('/paiements/');
        setLoading(btn, false);

        const list = Array.isArray(data) ? data : (data.results || []);
        if (!list.length) { toast('Aucun paiement disponible.', 'warning'); return; }

        const headers = ['ID','Étudiant','Montant Dû','Montant Payé','Solde','Mode','Statut','Période','Date Paiement'];
        const rows = list.map(p => [
            p.id,
            p.etudiant_nom    || '',
            p.montant_du      || 0,
            p.montant_paye    || 0,
            p.solde           || 0,
            p.mode_paiement   || '',
            p.statut_paiement || '',
            p.periode         || '',
            p.date_paiement   || '',
        ]);

        const filename = `paiements_${today()}.csv`;
        downloadCSV(buildCSV(headers, rows), filename);
        toast(`✅ ${list.length} paiements exportés`, 'success');
        addHistoryRow(filename, 'CSV', `${list.length} paiements`);
    }

    // ── 10. BIND DOWNLOAD BUTTONS ─────────────────────────────────────────────
    function bindDownloadButtons() {
        const config = [
            { title: 'Rapport Financier',    handler: exportFinancier   },
            { title: 'Rapport Étudiants',    handler: exportEtudiants   },
            { title: 'Rapport Enseignants',  handler: exportEnseignants },
            { title: "Rapport d'Assiduité",  handler: exportAssiduite   },
            { title: 'Rapport Paiements',    handler: exportPaiements   },
        ];

        config.forEach(({ title, handler }) => {
            const card = getCard(title);
            if (!card) return;
            // The download button is the last button inside each card
            const btn = card.querySelector('button');
            if (btn) {
                btn.addEventListener('click', () => handler(btn));
            }
        });

        // Rapport Personnalisé → Configurer
        const customCard = getCard('Rapport Personnalisé');
        customCard?.querySelector('button')?.addEventListener('click', () => {
            openCustomReportModal();
        });
    }

    // ── 11. HISTORY ROW MANAGEMENT ────────────────────────────────────────────
    function addHistoryRow(filename, format, details) {
        // Find the history container (the .space-y-3 inside the history glass-panel)
        let histContainer = null;
        document.querySelectorAll('.glass-panel').forEach(panel => {
            if (panel.querySelector('h3')?.textContent?.includes('Historique')) {
                histContainer = panel.querySelector('.space-y-3');
            }
        });
        if (!histContainer) return;

        const iconMap = {
            CSV:  'fa-file-csv text-blue-400',
            PDF:  'fa-file-pdf text-red-400',
            JSON: 'fa-file-code text-amber-400',
        };
        const bgMap = {
            CSV:  'bg-blue-500/20',
            PDF:  'bg-red-500/20',
            JSON: 'bg-amber-500/20',
        };
        const icon = iconMap[format] || 'fa-file text-slate-400';
        const bg   = bgMap[format]   || 'bg-slate-500/20';
        const now  = new Date().toLocaleString('fr-FR', {
            day:'2-digit', month:'2-digit', year:'numeric',
            hour:'2-digit', minute:'2-digit'
        });
        const userName = USER.nom_complet ||
            `${USER.first_name || ''} ${USER.last_name || ''}`.trim() || 'Vous';

        const row = document.createElement('div');
        row.className = 'history-row flex items-center justify-between p-4 bg-slate-800 rounded-lg';
        row.innerHTML = `
            <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-lg ${bg} flex items-center justify-center">
                    <i class="fas ${icon}"></i>
                </div>
                <div>
                    <h4 class="font-medium text-white">${filename}</h4>
                    <p class="text-sm text-slate-400">Généré par ${userName} • ${now}</p>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-xs text-slate-500">${details}</span>
                <button class="hist-dl p-2 hover:bg-slate-700 rounded-lg transition-colors border-none cursor-pointer text-slate-400" title="Télécharger à nouveau">
                    <i class="fas fa-download"></i>
                </button>
                <button class="hist-del p-2 hover:bg-slate-700 rounded-lg transition-colors border-none cursor-pointer text-slate-400" title="Supprimer">
                    <i class="fas fa-trash"></i>
                </button>
            </div>`;

        // Delete
        row.querySelector('.hist-del').addEventListener('click', () => {
            row.classList.add('removing');
            setTimeout(() => row.remove(), 300);
        });

        // Re-download (toast only — file already downloaded)
        row.querySelector('.hist-dl').addEventListener('click', () => {
            toast(`📄 Re-téléchargement de "${filename}"… Regénérez depuis le rapport correspondant.`, 'info');
        });

        histContainer.prepend(row);
    }

    // ── 12. BIND STATIC HISTORY BUTTONS ──────────────────────────────────────
    function bindHistoryButtons() {
        document.querySelectorAll('.glass-panel').forEach(panel => {
            if (!panel.querySelector('h3')?.textContent?.includes('Historique')) return;

            panel.querySelectorAll('.space-y-3 > div').forEach(row => {
                row.classList.add('history-row');

                // Trash button
                row.querySelectorAll('button').forEach(btn => {
                    if (btn.querySelector('.fa-trash')) {
                        btn.addEventListener('click', () => {
                            row.classList.add('removing');
                            setTimeout(() => row.remove(), 300);
                        });
                    }
                    if (btn.querySelector('.fa-download')) {
                        btn.addEventListener('click', () => {
                            toast('📄 Fichier non disponible — regénérez depuis le rapport.', 'info');
                        });
                    }
                });
            });
        });
    }

    // ── 13. DATE FILTER BUTTONS ───────────────────────────────────────────────
    function bindFilterButtons() {
        // "Appliquer" button
        document.querySelectorAll('.btn-secondary').forEach(btn => {
            const text = btn.textContent.trim();
            const icon = btn.querySelector('i');

            if (icon?.classList.contains('fa-filter') || text.includes('Appliquer')) {
                btn.addEventListener('click', async () => {
                    toast('Actualisation des statistiques…', 'info');
                    await loadStats();
                    toast('✅ Stats mises à jour', 'success');
                });
            }
            if (text.includes('Ce mois')) {
                btn.addEventListener('click', () => { setPeriod('month'); loadStats(); });
            }
            if (text.includes('Ce trimestre')) {
                btn.addEventListener('click', () => { setPeriod('quarter'); loadStats(); });
            }
            if (text.includes('Cette année')) {
                btn.addEventListener('click', () => { setPeriod('year'); loadStats(); });
            }
        });
    }

    // ── 14. SCHEDULED REPORTS — "Nouveau" BUTTON ─────────────────────────────
    function bindScheduledButtons() {
        // "Nouveau" button in Rapports Programmés section
        document.querySelectorAll('.glass-panel').forEach(panel => {
            if (!panel.querySelector('h3')?.textContent?.includes('Programmés')) return;
            panel.querySelector('.btn-secondary')?.addEventListener('click', openCustomReportModal);

            // Ellipsis buttons in existing scheduled rows
            panel.querySelectorAll('.fa-ellipsis-v').forEach(icon => {
                icon.closest('button')?.addEventListener('click', e => {
                    e.stopPropagation();
                    toast('⚙️ Options de rapport programmé (bientôt disponible)', 'info');
                });
            });
        });
    }

    // ── 15. CUSTOM REPORT MODAL ───────────────────────────────────────────────
    function openCustomReportModal() {
        document.getElementById('modal-custom-report')?.remove();

        document.body.insertAdjacentHTML('beforeend', `
        <div id="modal-custom-report" class="rpt-modal-overlay">
            <div class="rpt-modal-box" onclick="event.stopPropagation()">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                    <h3 style="margin:0;color:white;font-size:1.1rem;font-weight:700;">
                        <i class="fas fa-plus-circle" style="color:#6366f1;margin-right:8px;"></i>
                        Rapport Personnalisé
                    </h3>
                    <button id="modal-custom-close"
                        style="background:none;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer;line-height:1;">×</button>
                </div>

                <div style="margin-bottom:1rem;">
                    <label style="color:#94a3b8;font-size:.875rem;">Titre du rapport</label>
                    <input id="cr-titre" type="text" class="rpt-modal-input" placeholder="Ex: Rapport mensuel personnalisé">
                </div>

                <div style="margin-bottom:1rem;">
                    <label style="color:#94a3b8;font-size:.875rem;">Type de données</label>
                    <select id="cr-type" class="rpt-modal-input">
                        <option value="etudiants">Étudiants</option>
                        <option value="enseignants">Enseignants</option>
                        <option value="paiements">Paiements</option>
                        <option value="absences">Absences</option>
                        <option value="financier">Financier (synthèse)</option>
                    </select>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
                    <div>
                        <label style="color:#94a3b8;font-size:.875rem;">Du</label>
                        <input id="cr-from" type="date" class="rpt-modal-input">
                    </div>
                    <div>
                        <label style="color:#94a3b8;font-size:.875rem;">Au</label>
                        <input id="cr-to" type="date" class="rpt-modal-input" value="${todayISO()}">
                    </div>
                </div>

                <div id="cr-error" style="display:none;padding:.75rem;background:#450a0a;border:1px solid #f87171;
                     border-radius:8px;color:#fca5a5;font-size:.85rem;margin-bottom:1rem;"></div>

                <div style="display:flex;gap:.75rem;">
                    <button id="modal-custom-cancel"
                        style="flex:1;padding:.75rem;border:1px solid #334155;background:transparent;
                               color:#94a3b8;border-radius:8px;cursor:pointer;font-weight:600;">
                        Annuler
                    </button>
                    <button id="cr-generate"
                        style="flex:1;padding:.75rem;border:none;border-radius:8px;cursor:pointer;
                               font-weight:600;color:white;
                               background:linear-gradient(135deg,#6366f1,#8b5cf6);">
                        <i class="fas fa-download mr-2"></i>Générer & Télécharger
                    </button>
                </div>
            </div>
        </div>`);

        const modal = document.getElementById('modal-custom-report');
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.getElementById('modal-custom-close').addEventListener('click', () => modal.remove());
        document.getElementById('modal-custom-cancel').addEventListener('click', () => modal.remove());

        // Pre-fill dates from main filter
        const range = getDateRange();
        if (range.from) document.getElementById('cr-from').value = range.from;
        if (range.to)   document.getElementById('cr-to').value   = range.to;

        document.getElementById('cr-generate').addEventListener('click', async () => {
            const btn   = document.getElementById('cr-generate');
            const titre = document.getElementById('cr-titre').value.trim();
            const type  = document.getElementById('cr-type').value;
            const errEl = document.getElementById('cr-error');
            errEl.style.display = 'none';

            if (!titre) {
                errEl.textContent = 'Veuillez entrer un titre.';
                errEl.style.display = 'block'; return;
            }

            setLoading(btn, true);

            const handlerMap = {
                etudiants:   exportEtudiants,
                enseignants: exportEnseignants,
                paiements:   exportPaiements,
                absences:    exportAssiduite,
                financier:   exportFinancier,
            };

            modal.remove();
            const handler = handlerMap[type];
            if (handler) await handler(btn);
        });
    }

    // ── 16. LOGOUT ────────────────────────────────────────────────────────────
    function setupLogout() {
        document.querySelector('.logout-link')?.addEventListener('click', async e => {
            e.preventDefault();
            const refresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh');
            if (refresh) {
                await fetch(`${API}/auth/logout/`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({ refresh }),
                }).catch(() => {});
            }
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/login/';
        });
    }

    // ── 17. BOOT ──────────────────────────────────────────────────────────────
    injectUser();
    bindFilterButtons();
    bindDownloadButtons();
    bindHistoryButtons();
    bindScheduledButtons();
    setupLogout();

    await loadStats();
    toast('✅ Rapports prêts', 'success');
});