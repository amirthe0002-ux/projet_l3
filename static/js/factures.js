/**
 * Générateur de Factures - Centre de Langues
 * JWT Authentication + Django REST API
 * File: static/js/factures.js
 */

// ============================================================
// CONFIG
// ============================================================
const API_URL = '/api';

// État global
const state = {
    currentTemplate: 1,
    services:        [],          // lignes de services
    savedInvoices:   [],          // factures sauvegardées (localStorage + API)
    students:        [],          // étudiants chargés depuis l'API
    invoiceCounter:  1,
};

// Templates couleurs
const TEMPLATES = {
    1: { primary: '#6366f1', secondary: '#8b5cf6', bg: '#f5f3ff', name: 'Violet' },
    2: { primary: '#0ea5e9', secondary: '#38bdf8', bg: '#f0f9ff', name: 'Bleu'   },
    3: { primary: '#10b981', secondary: '#34d399', bg: '#f0fdf4', name: 'Vert'   },
    4: { primary: '#f59e0b', secondary: '#fbbf24', bg: '#fffbeb', name: 'Doré'   },
};

// ============================================================
// JWT HELPERS
// ============================================================
function getToken() {
    return localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
        || localStorage.getItem('access') || sessionStorage.getItem('access') || null;
}
function getUser() {
    try { return JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user')); }
    catch { return null; }
}
function authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    const t = getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
}

// ============================================================
// API
// ============================================================
async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });
        if (res.status === 401) return { error: 'JWT', message: 'Token invalide.' };
        if (res.status === 403) return { error: 'FORBIDDEN', message: 'Accès refusé.' };
        if (res.status === 204) return { success: true };
        return await res.json();
    } catch { return { error: 'NETWORK', message: 'Serveur inaccessible.' }; }
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
    document.querySelector('.toast-fac')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-fac';
    t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
        padding:14px 22px;border-radius:12px;background:${colors[type]};color:white;
        font-weight:500;font-size:.9rem;box-shadow:0 8px 24px rgba(0,0,0,.2);
        display:flex;align-items:center;gap:8px;max-width:360px;
        transform:translateX(120%);opacity:0;transition:all .3s ease;`;
    t.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform='translateX(0)'; t.style.opacity='1'; });
    setTimeout(() => { t.style.transform='translateX(120%)'; t.style.opacity='0';
        setTimeout(() => t.remove(), 300); }, 3500);
}

// ============================================================
// FORMATAGE
// ============================================================
function fmtDA(v) {
    const n = parseFloat(v) || 0;
    return new Intl.NumberFormat('fr-DZ').format(Math.round(n)) + ' DA';
}
function fmtDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-DZ', { day:'numeric', month:'long', year:'numeric' });
}
function today() {
    return new Date().toISOString().split('T')[0];
}
function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}
function nextInvoiceNum() {
    const year = new Date().getFullYear();
    const num  = String(state.invoiceCounter).padStart(3, '0');
    return `FAC-${year}-${num}`;
}

// ============================================================
// INIT — AJOUTER UN SERVICE PAR DÉFAUT
// ============================================================
function initDefaults() {
    // Dates par défaut
    const dateEl = document.getElementById('invoiceDate');
    const dueEl  = document.getElementById('dueDate');
    if (dateEl && !dateEl.value) dateEl.value = today();
    if (dueEl  && !dueEl.value)  dueEl.value  = addDays(today(), 30);

    // Numéro de facture
    const numEl = document.getElementById('invoiceNum');
    if (numEl) numEl.value = nextInvoiceNum();

    // Un service par défaut
    if (!state.services.length) {
        addService('Cours de Langue - Mensualité', 1, 8000);
    }

    updatePreview();
    loadHistory();
}

// ============================================================
// GESTION DES SERVICES
// ============================================================
function addService(description = '', qty = 1, price = 0) {
    const id = Date.now();
    state.services.push({ id, description, qty, price });
    renderServicesList();
    updatePreview();
}

function removeService(id) {
    state.services = state.services.filter(s => s.id !== id);
    renderServicesList();
    updatePreview();
}

function updateService(id, field, value) {
    const s = state.services.find(x => x.id === id);
    if (!s) return;
    s[field] = field === 'description' ? value : parseFloat(value) || 0;
    updatePreview();
}

function renderServicesList() {
    const container = document.getElementById('servicesList');
    if (!container) return;

    if (!state.services.length) {
        container.innerHTML = `
            <div style="text-align:center;padding:1.5rem;color:#94a3b8;font-size:.875rem;">
                Aucun service ajouté. Cliquez sur "+ Ajouter un service".
            </div>`;
        return;
    }

    container.innerHTML = state.services.map(s => `
        <div class="service-item" data-id="${s.id}" style="
            display:grid; grid-template-columns:1fr 80px 100px 36px;
            gap:.5rem; align-items:center; margin-bottom:.75rem;
            padding:.75rem; background:#f8fafc; border-radius:10px;
            border:1px solid #e2e8f0;">
            <input type="text" value="${s.description}"
                   placeholder="Description du service"
                   onchange="updateService(${s.id},'description',this.value)"
                   oninput="updateService(${s.id},'description',this.value)"
                   style="padding:8px 10px;border:1.5px solid #e2e8f0;border-radius:8px;
                          font-size:.875rem;outline:none;width:100%;box-sizing:border-box;">
            <input type="number" value="${s.qty}" min="1" placeholder="Qté"
                   onchange="updateService(${s.id},'qty',this.value)"
                   style="padding:8px;border:1.5px solid #e2e8f0;border-radius:8px;
                          font-size:.875rem;outline:none;text-align:center;width:100%;box-sizing:border-box;">
            <input type="number" value="${s.price}" min="0" placeholder="Prix DA"
                   onchange="updateService(${s.id},'price',this.value)"
                   style="padding:8px;border:1.5px solid #e2e8f0;border-radius:8px;
                          font-size:.875rem;outline:none;text-align:right;width:100%;box-sizing:border-box;">
            <button onclick="removeService(${s.id})"
                    style="width:36px;height:36px;border:none;background:#fee2e2;color:#dc2626;
                           border-radius:8px;cursor:pointer;font-size:1rem;display:flex;
                           align-items:center;justify-content:center;">×</button>
        </div>`).join('');
}

// ============================================================
// CALCULS
// ============================================================
function calcTotals() {
    const subtotal  = state.services.reduce((sum, s) => sum + (s.qty * s.price), 0);
    const discount  = parseFloat(document.getElementById('discount')?.value) || 0;
    const tva       = parseFloat(document.getElementById('tva')?.value) || 0;
    const discountAmt = subtotal * (discount / 100);
    const afterDiscount = subtotal - discountAmt;
    const tvaAmt    = afterDiscount * (tva / 100);
    const total     = afterDiscount + tvaAmt;
    return { subtotal, discount, discountAmt, tva, tvaAmt, total };
}

// ============================================================
// CHANGER TEMPLATE
// ============================================================
function changeTemplate(num) {
    state.currentTemplate = num;
    document.querySelectorAll('.template-option').forEach(el => el.classList.remove('active'));
    document.querySelector(`.template-${num}`)?.classList.add('active');
    updatePreview();
}

// ============================================================
// MISE À JOUR DE L'APERÇU
// ============================================================
function updatePreview() {
    const preview = document.getElementById('invoicePreview');
    if (!preview) return;

    const tpl = TEMPLATES[state.currentTemplate];
    const { subtotal, discount, discountAmt, tva, tvaAmt, total } = calcTotals();

    const num     = document.getElementById('invoiceNum')?.value    || nextInvoiceNum();
    const date    = document.getElementById('invoiceDate')?.value   || today();
    const due     = document.getElementById('dueDate')?.value       || addDays(today(), 30);
    const status  = document.getElementById('invoiceStatus')?.value || 'en attente';
    const name    = document.getElementById('clientName')?.value    || 'Client';
    const email   = document.getElementById('clientEmail')?.value   || '';
    const phone   = document.getElementById('clientPhone')?.value   || '';
    const address = document.getElementById('clientAddress')?.value || '';
    const notes   = document.getElementById('notes')?.value         || '';

    const statusColors = {
        'payée':      { bg:'#d1fae5', color:'#065f46', label:'✓ Payée' },
        'en attente': { bg:'#fef3c7', color:'#92400e', label:'⏳ En attente' },
        'en retard':  { bg:'#fee2e2', color:'#991b1b', label:'⚠ En retard' },
    };
    const sc = statusColors[status] || statusColors['en attente'];

    const servicesRows = state.services.length
        ? state.services.map(s => `
            <tr>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;font-size:.875rem;">${s.description || '—'}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:center;font-size:.875rem;">${s.qty}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-size:.875rem;">${fmtDA(s.price)}</td>
                <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;font-size:.875rem;">${fmtDA(s.qty * s.price)}</td>
            </tr>`).join('')
        : `<tr><td colspan="4" style="padding:2rem;text-align:center;color:#94a3b8;font-size:.875rem;">Aucun service</td></tr>`;

    preview.innerHTML = `
        <div id="printableInvoice" style="
            background:white; max-width:720px; margin:0 auto;
            box-shadow:0 4px 24px rgba(0,0,0,.1); border-radius:16px; overflow:hidden;
            font-family:'Segoe UI',sans-serif; color:#1e293b;">

            <!-- En-tête coloré -->
            <div style="background:linear-gradient(135deg,${tpl.primary},${tpl.secondary});
                        padding:2rem; color:white; position:relative;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:1rem;">
                    <div>
                        <div style="font-size:1.8rem;font-weight:800;letter-spacing:-.5px;">🎓 Centre de Langues</div>
                        <div style="opacity:.85;font-size:.875rem;margin-top:4px;">Secrétariat • Alger, Algérie</div>
                        <div style="opacity:.75;font-size:.8rem;margin-top:2px;">contact@centrelangues.dz</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:1.5rem;font-weight:800;">FACTURE</div>
                        <div style="opacity:.9;font-size:1rem;margin-top:4px;">${num}</div>
                        <div style="margin-top:8px;display:inline-block;
                                    background:${sc.bg};color:${sc.color};
                                    padding:4px 14px;border-radius:20px;font-size:.8rem;font-weight:700;">
                            ${sc.label}
                        </div>
                    </div>
                </div>
            </div>

            <!-- Infos date + client -->
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;padding:1.5rem 2rem;
                        background:${tpl.bg};border-bottom:2px solid ${tpl.primary}20;">
                <div>
                    <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700;margin-bottom:.5rem;">
                        Informations
                    </div>
                    <table style="font-size:.85rem;">
                        <tr><td style="color:#64748b;padding:2px 0;padding-right:1rem;">Date :</td>
                            <td style="font-weight:600;">${fmtDate(date)}</td></tr>
                        <tr><td style="color:#64748b;padding:2px 0;padding-right:1rem;">Échéance :</td>
                            <td style="font-weight:600;color:${status==='en retard'?'#dc2626':'inherit'}">${fmtDate(due)}</td></tr>
                    </table>
                </div>
                <div>
                    <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#64748b;font-weight:700;margin-bottom:.5rem;">
                        Facturer à
                    </div>
                    <div style="font-weight:700;font-size:1rem;">${name}</div>
                    ${email   ? `<div style="color:#64748b;font-size:.85rem;margin-top:2px;">📧 ${email}</div>`   : ''}
                    ${phone   ? `<div style="color:#64748b;font-size:.85rem;margin-top:2px;">📞 ${phone}</div>`   : ''}
                    ${address ? `<div style="color:#64748b;font-size:.85rem;margin-top:2px;">📍 ${address}</div>` : ''}
                </div>
            </div>

            <!-- Tableau services -->
            <div style="padding:1.5rem 2rem;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead>
                        <tr style="background:${tpl.primary};color:white;border-radius:8px;">
                            <th style="padding:12px 14px;text-align:left;font-size:.8rem;font-weight:700;border-radius:8px 0 0 8px;">DESCRIPTION</th>
                            <th style="padding:12px 14px;text-align:center;font-size:.8rem;font-weight:700;">QTÉ</th>
                            <th style="padding:12px 14px;text-align:right;font-size:.8rem;font-weight:700;">P.U.</th>
                            <th style="padding:12px 14px;text-align:right;font-size:.8rem;font-weight:700;border-radius:0 8px 8px 0;">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>${servicesRows}</tbody>
                </table>
            </div>

            <!-- Totaux -->
            <div style="padding:0 2rem 2rem;display:flex;justify-content:flex-end;">
                <div style="width:280px;">
                    <div style="display:flex;justify-content:space-between;padding:8px 0;
                                border-bottom:1px solid #f1f5f9;font-size:.875rem;">
                        <span style="color:#64748b;">Sous-total</span>
                        <span style="font-weight:600;">${fmtDA(subtotal)}</span>
                    </div>
                    ${discount > 0 ? `
                    <div style="display:flex;justify-content:space-between;padding:8px 0;
                                border-bottom:1px solid #f1f5f9;font-size:.875rem;">
                        <span style="color:#64748b;">Remise (${discount}%)</span>
                        <span style="font-weight:600;color:#dc2626;">- ${fmtDA(discountAmt)}</span>
                    </div>` : ''}
                    ${tva > 0 ? `
                    <div style="display:flex;justify-content:space-between;padding:8px 0;
                                border-bottom:1px solid #f1f5f9;font-size:.875rem;">
                        <span style="color:#64748b;">TVA (${tva}%)</span>
                        <span style="font-weight:600;">${fmtDA(tvaAmt)}</span>
                    </div>` : ''}
                    <div style="display:flex;justify-content:space-between;padding:12px 16px;
                                background:${tpl.primary};color:white;border-radius:10px;margin-top:.75rem;">
                        <span style="font-weight:700;font-size:1rem;">TOTAL</span>
                        <span style="font-weight:800;font-size:1.1rem;">${fmtDA(total)}</span>
                    </div>
                </div>
            </div>

            <!-- Notes -->
            ${notes ? `
            <div style="margin:0 2rem 2rem;padding:1rem 1.25rem;background:${tpl.bg};
                        border-left:4px solid ${tpl.primary};border-radius:0 8px 8px 0;">
                <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;
                            color:${tpl.primary};font-weight:700;margin-bottom:.5rem;">Notes</div>
                <p style="font-size:.875rem;color:#475569;margin:0;line-height:1.6;">${notes}</p>
            </div>` : ''}

            <!-- Pied de page -->
            <div style="background:#f8fafc;border-top:2px solid ${tpl.primary}20;
                        padding:1rem 2rem;text-align:center;
                        font-size:.75rem;color:#94a3b8;">
                Merci pour votre confiance • Centre de Langues — ${new Date().getFullYear()}
            </div>
        </div>`;
}

// ============================================================
// IMPRIMER
// ============================================================
function printInvoice() {
    const content = document.getElementById('printableInvoice');
    if (!content) { showToast('Générez d\'abord une facture.', 'warning'); return; }

    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html lang="fr"><head>
        <meta charset="UTF-8">
        <title>Facture - ${document.getElementById('invoiceNum')?.value || 'FAC'}</title>
        <style>
            body { margin:0; padding:20px; font-family:'Segoe UI',sans-serif; }
            @media print { body { padding:0; } }
        </style>
    </head><body>${content.outerHTML}<script>window.onload=()=>window.print();<\/script></body></html>`);
    win.document.close();
}

// ============================================================
// GÉNÉRER PDF (via impression)
// ============================================================
function generatePDF() {
    showToast('Ouverture de la fenêtre d\'impression PDF...', 'info');
    printInvoice();
}

// ============================================================
// SAUVEGARDER FACTURE
// ============================================================
async function saveInvoice() {
    const name   = document.getElementById('clientName')?.value?.trim();
    const total  = calcTotals().total;

    if (!name) {
        showToast('Ajoutez le nom du client avant de sauvegarder.', 'warning');
        document.getElementById('clientName')?.focus();
        return;
    }
    if (!state.services.length) {
        showToast('Ajoutez au moins un service.', 'warning');
        return;
    }

    const invoice = {
        id:          Date.now(),
        num:         document.getElementById('invoiceNum')?.value    || nextInvoiceNum(),
        date:        document.getElementById('invoiceDate')?.value   || today(),
        due:         document.getElementById('dueDate')?.value       || '',
        status:      document.getElementById('invoiceStatus')?.value || 'en attente',
        client:      name,
        email:       document.getElementById('clientEmail')?.value   || '',
        phone:       document.getElementById('clientPhone')?.value   || '',
        address:     document.getElementById('clientAddress')?.value || '',
        services:    [...state.services],
        discount:    parseFloat(document.getElementById('discount')?.value) || 0,
        tva:         parseFloat(document.getElementById('tva')?.value) || 0,
        notes:       document.getElementById('notes')?.value         || '',
        total,
        template:    state.currentTemplate,
        savedAt:     new Date().toISOString(),
    };

    // Sauvegarder en localStorage
    const history = JSON.parse(localStorage.getItem('factures_history') || '[]');
    history.unshift(invoice);
    localStorage.setItem('factures_history', JSON.stringify(history.slice(0, 50)));

    // Essayer aussi de sauvegarder en DB via paiement (si étudiant sélectionné)
    await trySaveToAPI(invoice);

    state.savedInvoices = history;
    state.invoiceCounter++;

    showToast(`✅ Facture ${invoice.num} sauvegardée !`, 'success');
    loadHistory();

    // Incrémenter le numéro pour la prochaine facture
    const numEl = document.getElementById('invoiceNum');
    if (numEl) numEl.value = nextInvoiceNum();
}

async function trySaveToAPI(invoice) {
    // Si un étudiant a été sélectionné et que la facture a des services → créer un paiement
    const etudiantId = document.getElementById('clientName')?.dataset?.etudiantId;
    if (!etudiantId || !invoice.services.length) return;

    await apiFetch('/paiements/', {
        method: 'POST',
        body: JSON.stringify({
            etudiant:        parseInt(etudiantId),
            montant_du:      invoice.total,
            montant_paye:    invoice.status === 'payée' ? invoice.total : 0,
            mode_paiement:   'Virement',
            date_paiement:   invoice.date,
            periode:         invoice.services[0]?.description || 'Facture',
            statut_paiement: invoice.status === 'payée' ? 'Paye'
                           : invoice.status === 'en retard' ? 'Impaye' : 'En_attente',
            reference_paiement: invoice.num,
        }),
    });
}

// ============================================================
// CHARGER HISTORIQUE
// ============================================================
function loadHistory() {
    const history = JSON.parse(localStorage.getItem('factures_history') || '[]');
    state.savedInvoices = history;
    renderHistory(history);
}

function renderHistory(history) {
    const grid = document.getElementById('historyGrid');
    if (!grid) return;

    if (!history.length) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:2rem;color:#94a3b8;">
                <i class="fas fa-file-invoice" style="font-size:2.5rem;margin-bottom:1rem;display:block;opacity:.4;"></i>
                <p>Aucune facture sauvegardée</p>
            </div>`;
        return;
    }

    const statusColors = {
        'payée':      '#059669',
        'en attente': '#d97706',
        'en retard':  '#dc2626',
    };

    grid.innerHTML = history.slice(0, 12).map(inv => {
        const tpl   = TEMPLATES[inv.template || 1];
        const color = statusColors[inv.status] || '#64748b';
        return `
            <div style="background:white;border-radius:12px;padding:1.25rem;
                        box-shadow:0 2px 8px rgba(0,0,0,.08);border:1px solid #f1f5f9;
                        cursor:pointer;transition:all .2s;border-top:4px solid ${tpl.primary};"
                 onmouseover="this.style.transform='translateY(-3px)';this.style.boxShadow='0 8px 20px rgba(0,0,0,.12)'"
                 onmouseout="this.style.transform='';this.style.boxShadow='0 2px 8px rgba(0,0,0,.08)'"
                 onclick="loadInvoice(${inv.id})">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:.75rem;">
                    <div>
                        <div style="font-weight:700;font-size:.9rem;color:#1e293b;">${inv.num}</div>
                        <div style="font-size:.8rem;color:#64748b;margin-top:2px;">${inv.client}</div>
                    </div>
                    <span style="background:${color}20;color:${color};padding:2px 8px;
                                 border-radius:20px;font-size:.75rem;font-weight:700;white-space:nowrap;">
                        ${inv.status}
                    </span>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-size:.75rem;color:#94a3b8;">${fmtDate(inv.date)}</span>
                    <span style="font-weight:800;font-size:1rem;color:${tpl.primary};">${fmtDA(inv.total)}</span>
                </div>
                <div style="display:flex;gap:.5rem;margin-top:.75rem;">
                    <button onclick="event.stopPropagation();loadInvoice(${inv.id})"
                            style="flex:1;padding:5px;border:1px solid #e2e8f0;border-radius:6px;
                                   background:white;color:#475569;cursor:pointer;font-size:.75rem;">
                        <i class="fas fa-eye"></i> Voir
                    </button>
                    <button onclick="event.stopPropagation();printFromHistory(${inv.id})"
                            style="flex:1;padding:5px;border:none;border-radius:6px;
                                   background:${tpl.primary};color:white;cursor:pointer;font-size:.75rem;">
                        <i class="fas fa-print"></i> Print
                    </button>
                    <button onclick="event.stopPropagation();deleteInvoice(${inv.id})"
                            style="padding:5px 8px;border:1px solid #fee2e2;border-radius:6px;
                                   background:white;color:#dc2626;cursor:pointer;font-size:.75rem;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>`;
    }).join('');
}

// ============================================================
// CHARGER UNE FACTURE DEPUIS L'HISTORIQUE
// ============================================================
function loadInvoice(id) {
    const inv = state.savedInvoices.find(x => x.id === id);
    if (!inv) return;

    // Remplir les champs du formulaire
    const set = (elId, val) => {
        const el = document.getElementById(elId);
        if (el) el.value = val || '';
    };

    set('invoiceNum',    inv.num);
    set('invoiceDate',   inv.date);
    set('dueDate',       inv.due);
    set('invoiceStatus', inv.status);
    set('clientName',    inv.client);
    set('clientEmail',   inv.email);
    set('clientPhone',   inv.phone);
    set('clientAddress', inv.address);
    set('discount',      inv.discount);
    set('tva',           inv.tva);
    set('notes',         inv.notes);

    state.services        = inv.services.map(s => ({ ...s, id: s.id || Date.now() + Math.random() }));
    state.currentTemplate = inv.template || 1;

    // Mettre à jour les sélecteurs visuels
    document.querySelectorAll('.template-option').forEach(el => el.classList.remove('active'));
    document.querySelector(`.template-${state.currentTemplate}`)?.classList.add('active');

    renderServicesList();
    updatePreview();

    // Scroll vers le haut
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Facture ${inv.num} chargée.`, 'info');
}

// ============================================================
// IMPRIMER DEPUIS L'HISTORIQUE
// ============================================================
function printFromHistory(id) {
    loadInvoice(id);
    setTimeout(() => printInvoice(), 300);
}

// ============================================================
// SUPPRIMER UNE FACTURE
// ============================================================
function deleteInvoice(id) {
    if (!confirm('Supprimer cette facture ?')) return;
    const history = state.savedInvoices.filter(x => x.id !== id);
    localStorage.setItem('factures_history', JSON.stringify(history));
    state.savedInvoices = history;
    renderHistory(history);
    showToast('Facture supprimée.', 'info');
}

// ============================================================
// RESET FORMULAIRE
// ============================================================
function resetForm() {
    state.services = [];
    state.invoiceCounter++;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    set('invoiceNum',    nextInvoiceNum());
    set('invoiceDate',   today());
    set('dueDate',       addDays(today(), 30));
    set('invoiceStatus', 'en attente');
    set('clientName',    '');
    set('clientEmail',   '');
    set('clientPhone',   '');
    set('clientAddress', '');
    set('discount',      '0');
    set('tva',           '19');
    set('notes',         '');

    // Réinitialiser l'attribut data-etudiantId
    const nameEl = document.getElementById('clientName');
    if (nameEl) delete nameEl.dataset.etudiantId;

    addService('Cours de Langue - Mensualité', 1, 8000);
    showToast('Nouveau formulaire prêt.', 'info');
}

// ============================================================
// SÉLECTEUR D'ÉTUDIANT (depuis la DB)
// ============================================================
async function openStudentSelector() {
    // Charger les étudiants depuis l'API
    if (!state.students.length) {
        const data = await apiFetch('/etudiants/');
        if (!data?.error) {
            state.students = Array.isArray(data) ? data : (data.results || []);
        }
    }

    const modal = document.createElement('div');
    modal.id = 'studentModal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);
        display:flex;align-items:center;justify-content:center;z-index:2000;`;

    modal.innerHTML = `
        <div style="background:white;border-radius:20px;padding:2rem;width:90%;max-width:520px;
                    max-height:80vh;display:flex;flex-direction:column;animation:fadeIn .3s ease;"
             onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                <h3 style="font-size:1.1rem;font-weight:700;color:#1e293b;">
                    <i class="fas fa-search" style="color:#6366f1;margin-right:8px;"></i>
                    Sélectionner un étudiant
                </h3>
                <button onclick="document.getElementById('studentModal').remove()"
                        style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">×</button>
            </div>
            <input type="text" placeholder="🔍 Rechercher par nom ou email..."
                   id="studentSearch"
                   style="width:100%;padding:10px 14px;border:2px solid #e2e8f0;border-radius:10px;
                          font-size:.9rem;outline:none;box-sizing:border-box;margin-bottom:1rem;"
                   oninput="filterStudentList(this.value)">
            <div id="studentList" style="overflow-y:auto;flex:1;border:1px solid #f1f5f9;border-radius:10px;">
                ${state.students.length
                    ? state.students.map(s => {
                        const nom   = s.user?.nom_complet || `${s.user?.first_name||''} ${s.user?.last_name||''}`.trim() || '—';
                        const email = s.user?.email || '—';
                        const tel   = s.user?.telephone || '—';
                        return `
                            <div class="student-sel-item" data-id="${s.id}"
                                 data-nom="${nom}" data-email="${email}" data-tel="${tel}"
                                 onclick="selectStudent(${s.id},'${nom.replace(/'/g,"\\'")}','${email}','${tel}')"
                                 style="display:flex;align-items:center;gap:.75rem;padding:.875rem 1rem;
                                        cursor:pointer;border-bottom:1px solid #f8fafc;transition:background .15s;"
                                 onmouseover="this.style.background='#f8fafc'"
                                 onmouseout="this.style.background='white'">
                                <div style="width:40px;height:40px;border-radius:50%;flex-shrink:0;
                                            background:linear-gradient(135deg,#6366f1,#8b5cf6);
                                            display:flex;align-items:center;justify-content:center;
                                            color:white;font-weight:700;font-size:.85rem;">
                                    ${nom.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)}
                                </div>
                                <div style="min-width:0;">
                                    <div style="font-weight:600;color:#1e293b;font-size:.9rem;">${nom}</div>
                                    <div style="color:#64748b;font-size:.8rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                        ${email} ${tel !== '—' ? '· '+tel : ''}
                                    </div>
                                </div>
                                <span style="margin-left:auto;background:#dbeafe;color:#1e40af;
                                             padding:2px 8px;border-radius:20px;font-size:.75rem;font-weight:700;flex-shrink:0;">
                                    ${s.niveau_actuel || '—'}
                                </span>
                            </div>`;
                    }).join('')
                    : `<div style="text-align:center;padding:2rem;color:#94a3b8;">
                           <i class="fas fa-user-slash" style="font-size:2rem;display:block;margin-bottom:.5rem;"></i>
                           Aucun étudiant chargé depuis l'API
                       </div>`}
            </div>
        </div>`;

    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    setTimeout(() => document.getElementById('studentSearch')?.focus(), 100);
}

function filterStudentList(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.student-sel-item').forEach(item => {
        const text = (item.dataset.nom + item.dataset.email).toLowerCase();
        item.style.display = text.includes(q) ? 'flex' : 'none';
    });
}

function selectStudent(id, nom, email, tel) {
    const nameEl  = document.getElementById('clientName');
    const emailEl = document.getElementById('clientEmail');
    const phoneEl = document.getElementById('clientPhone');

    if (nameEl)  { nameEl.value = nom; nameEl.dataset.etudiantId = id; }
    if (emailEl)   emailEl.value = email !== '—' ? email : '';
    if (phoneEl)   phoneEl.value = tel   !== '—' ? tel   : '';

    // Charger aussi les infos de paiement récentes pour pré-remplir
    loadStudentPaymentInfo(id);

    document.getElementById('studentModal')?.remove();
    updatePreview();
    showToast(`Étudiant ${nom} sélectionné.`, 'success');
}

async function loadStudentPaymentInfo(etudiantId) {
    const paiements = await apiFetch(`/paiements/?etudiant=${etudiantId}`);
    if (paiements?.error || !paiements.length) return;

    // Préremplir le service avec la dernière mensualité
    const latest = paiements.sort((a, b) => new Date(b.date_paiement) - new Date(a.date_paiement))[0];
    if (latest.montant_du && state.services.length > 0) {
        state.services[0].price = parseFloat(latest.montant_du);
        state.services[0].description = latest.periode || 'Mensualité';
        renderServicesList();
        updatePreview();
    }
}

// ============================================================
// INJECT STYLES ANIMATION
// ============================================================
function injectStyles() {
    if (document.getElementById('fac-styles')) return;
    const s = document.createElement('style');
    s.id = 'fac-styles';
    s.textContent = `
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .animate-in { animation: fadeIn .5s ease forwards; }
    `;
    document.head.appendChild(s);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    injectStyles();

    // Mettre à jour le preview à chaque changement de champs simples
    ['invoiceNum','invoiceDate','dueDate','invoiceStatus',
     'clientName','clientEmail','clientPhone','clientAddress',
     'discount','tva','notes'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updatePreview);
        if (el) el.addEventListener('change', updatePreview);
    });

    // Charger le compteur depuis l'historique
    const history = JSON.parse(localStorage.getItem('factures_history') || '[]');
    if (history.length) {
        const lastNum = history[0]?.num || '';
        const match   = lastNum.match(/(\d+)$/);
        if (match) state.invoiceCounter = parseInt(match[1]) + 1;
    }

    initDefaults();
});