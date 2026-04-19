/**
 * Invoice Generator - Centre de Langues
 * File: static/js/factures.js
 * Integrated with JWT Authentication & Real Database API
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    apiUrl: '/api',
    currency: 'DA',
    defaultTVA: 19,
    defaultDiscount: 0
};

// ============================================
// JWT HELPERS (Matching your dash_secr.js)
// ============================================
function getToken() {
    return localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || null;
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user'));
    } catch { 
        return null; 
    }
}

function authHeaders() {
    const token = getToken();
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

// ============================================
// API FETCH HELPER (Matching your dash_secr.js)
// ============================================
async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${CONFIG.apiUrl}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });
        
        if (res.status === 401) {
            showToast('Session expirée. Veuillez vous reconnecter.', 'error');
            setTimeout(() => window.location.href = '/login/', 2000);
            return { error: 'JWT_INVALID', message: 'Token invalide.' };
        }
        if (res.status === 403) return { error: 'FORBIDDEN', message: 'Accès refusé.' };
        if (!res.ok) return { error: 'API_ERROR', message: `Erreur ${res.status}` };
        if (res.status === 204) return { success: true };
        
        return await res.json();
    } catch (e) {
        return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible.' };
    }
}

// ============================================
// STATE MANAGEMENT
// ============================================
let state = {
    currentTemplate: 1,
    services: [],
    invoiceHistory: [],
    currentInvoiceId: null,
    etudiants: [],
    groupes: []
};

// Template gradients
const TEMPLATES = {
    1: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    2: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    3: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    4: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
};

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    const user = checkSession();
    if (!user) return;
    
    initializeDates();
    loadInitialData();
    setupEventListeners();
});

function checkSession() {
    const token = getToken();
    const user = getUser();
    
    if (!token || !user) { 
        window.location.href = '/login/'; 
        return null; 
    }
    
    if (!['Secretariat', 'Comptable', 'Dirigeant'].includes(user.role)) {
        window.location.href = '/login/';
        return null;
    }
    
    updateHeaderWithUser(user);
    return user;
}

function updateHeaderWithUser(user) {
    const headerText = document.querySelector('.header-text p');
    if (headerText && user) {
        headerText.textContent = `Centre de Langues - ${user.role} | ${user.first_name || ''} ${user.last_name || ''}`;
    }
}

function initializeDates() {
    const today = new Date();
    const due = new Date();
    due.setDate(due.getDate() + 30);
    
    document.getElementById('invoiceDate').valueAsDate = today;
    document.getElementById('dueDate').valueAsDate = due;
}

async function loadInitialData() {
    await Promise.all([
        loadEtudiants(),
        loadGroupes(),
        loadRecentInvoices()
    ]);
    
    addService('', '', 1);
    updatePreview();
}

function setupEventListeners() {
    const inputs = document.querySelectorAll('.form-input, .form-select, .form-textarea');
    inputs.forEach(input => {
        input.addEventListener('input', debounce(updatePreview, 100));
        input.addEventListener('change', updatePreview);
    });
}

// ============================================
// DATA LOADING FROM REAL API
// ============================================
async function loadEtudiants() {
    const data = await apiFetch('/etudiants/?statut=Actif');
    if (data?.error) {
        showToast('Erreur chargement étudiants: ' + data.message, 'error');
        return;
    }
    state.etudiants = data || [];
}

async function loadGroupes() {
    const data = await apiFetch('/groupes/?statut=Actif');
    if (data?.error) {
        showToast('Erreur chargement groupes: ' + data.message, 'error');
        return;
    }
    state.groupes = data || [];
}

async function loadRecentInvoices() {
    showToast('Chargement des factures...', 'info');
    
    const data = await apiFetch('/factures/?limit=6');
    if (data?.error) {
        showToast('Erreur chargement factures: ' + data.message, 'error');
        loadSampleHistory();
        return;
    }
    
    state.invoiceHistory = data.results || data || [];
    renderHistory();
}

// ============================================
// SERVICE MANAGEMENT
// ============================================
function addService(description = '', price = '', qty = 1) {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    const service = {
        id,
        description: description || '',
        price: parseFloat(price) || 0,
        qty: parseInt(qty) || 1
    };
    state.services.push(service);
    renderServices();
    updatePreview();
}

function removeService(id) {
    state.services = state.services.filter(s => s.id !== id);
    renderServices();
    updatePreview();
}

function updateService(id, field, value) {
    const service = state.services.find(s => s.id === id);
    if (!service) return;

    if (field === 'price' || field === 'qty') {
        service[field] = parseFloat(value) || 0;
    } else {
        service[field] = value;
    }
    updatePreview();
}

function renderServices() {
    const container = document.getElementById('servicesList');
    
    if (state.services.length === 0) {
        container.innerHTML = '<p style="color: #64748b; text-align: center; padding: 1rem;">Aucun service ajouté</p>';
        return;
    }

    container.innerHTML = state.services.map(s => `
        <div class="service-item" data-id="${s.id}">
            <input type="text" 
                   class="service-input" 
                   placeholder="Description du service" 
                   value="${escapeHtml(s.description)}" 
                   oninput="updateService('${s.id}', 'description', this.value)">
            <input type="number" 
                   class="service-input service-price" 
                   placeholder="Prix" 
                   value="${s.price || ''}" 
                   min="0"
                   step="100"
                   oninput="updateService('${s.id}', 'price', this.value)">
            <input type="number" 
                   class="service-input service-qty" 
                   placeholder="Qté" 
                   value="${s.qty}" 
                   min="1"
                   oninput="updateService('${s.id}', 'qty', this.value)">
            <button class="btn-remove" onclick="removeService('${s.id}')" title="Supprimer">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

// ============================================
// TEMPLATE SYSTEM
// ============================================
function changeTemplate(templateNum) {
    state.currentTemplate = templateNum;
    
    document.querySelectorAll('.template-option').forEach((el, index) => {
        el.classList.toggle('active', index + 1 === templateNum);
    });
    
    updatePreview();
}

// ============================================
// PREVIEW GENERATION
// ============================================
function updatePreview() {
    const data = collectFormData();
    const calculations = calculateTotals();
    const preview = document.getElementById('invoicePreview');
    
    preview.innerHTML = generateInvoiceHTML(data, calculations);
}

function collectFormData() {
    return {
        invoiceNum: getValue('invoiceNum'),
        date: getValue('invoiceDate'),
        dueDate: getValue('dueDate'),
        status: getValue('invoiceStatus'),
        clientName: getValue('clientName'),
        clientEmail: getValue('clientEmail'),
        clientPhone: getValue('clientPhone'),
        clientAddress: getValue('clientAddress'),
        discount: parseFloat(getValue('discount')) || 0,
        tva: parseFloat(getValue('tva')) || 0,
        notes: getValue('notes')
    };
}

function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}

function calculateTotals() {
    const subtotal = state.services.reduce((sum, s) => sum + (s.price * s.qty), 0);
    const discountPercent = parseFloat(getValue('discount')) || 0;
    const discountAmount = subtotal * (discountPercent / 100);
    const afterDiscount = subtotal - discountAmount;
    const tvaPercent = parseFloat(getValue('tva')) || 0;
    const tvaAmount = afterDiscount * (tvaPercent / 100);
    const total = afterDiscount + tvaAmount;

    return {
        subtotal,
        discountAmount,
        afterDiscount,
        tvaAmount,
        total
    };
}

function generateInvoiceHTML(data, calc) {
    const template = TEMPLATES[state.currentTemplate];
    
    const etudiant = state.etudiants.find(e => {
        const nom = `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.trim();
        return nom === data.clientName;
    });
    
    const groupeInfo = etudiant && etudiant.id_groupe ? 
        state.groupes.find(g => g.id === etudiant.id_groupe) : null;
    
    return `
        <div class="invoice-header" style="background: ${template}">
            <div class="invoice-header-content">
                <div class="invoice-brand">
                    <div class="brand-logo">
                        <i class="fas fa-graduation-cap"></i>
                    </div>
                    <div class="brand-info">
                        <h3>Centre de Langues</h3>
                        <p>Formation & Éducation<br>Alger, Algérie</p>
                    </div>
                </div>
                <div class="invoice-meta">
                    <div class="invoice-number">FACTURE ${escapeHtml(data.invoiceNum)}</div>
                    <div class="invoice-date">Date: ${formatDate(data.date)}</div>
                    <div class="invoice-date">Échéance: ${formatDate(data.dueDate)}</div>
                    <span class="invoice-status">${escapeHtml(data.status)}</span>
                </div>
            </div>
        </div>
        
        <div class="invoice-body">
            <div class="invoice-parties">
                <div class="party-section">
                    <h4>Facturer à</h4>
                    <div class="party-name">${escapeHtml(data.clientName) || 'Client'}</div>
                    <div class="party-details">
                        ${escapeHtml(data.clientEmail) ? escapeHtml(data.clientEmail) + '<br>' : ''}
                        ${escapeHtml(data.clientPhone) ? escapeHtml(data.clientPhone) + '<br>' : ''}
                        ${escapeHtml(data.clientAddress) ? escapeHtml(data.clientAddress).replace(/\n/g, '<br>') : ''}
                    </div>
                </div>
                <div class="party-section">
                    <h4>Informations</h4>
                    <div class="party-details">
                        ${etudiant ? `
                            <strong>N° Étudiant:</strong> ETU-${String(etudiant.id).padStart(4, '0')}<br>
                        ` : ''}
                        ${groupeInfo ? `
                            <strong>Groupe:</strong> ${escapeHtml(groupeInfo.nom_groupe)}<br>
                            <strong>Niveau:</strong> ${escapeHtml(groupeInfo.niveau)}<br>
                        ` : ''}
                        ${etudiant?.professeur ? `
                            <strong>Professeur:</strong> ${escapeHtml(etudiant.professeur)}<br>
                        ` : '<strong>Professeur:</strong> Mme. Dupont'}
                    </div>
                </div>
            </div>
            
            <div class="invoice-table-container">
                <table class="invoice-table">
                    <thead>
                        <tr>
                            <th>Description</th>
                            <th class="text-center">Qté</th>
                            <th class="text-right">Prix Unitaire</th>
                            <th class="text-right">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${state.services.map(s => `
                            <tr>
                                <td class="item-description">
                                    <strong>${escapeHtml(s.description) || 'Service'}</strong>
                                    <span>Cours de langue</span>
                                </td>
                                <td class="text-center">${s.qty}</td>
                                <td class="text-right">${formatMoney(s.price)} ${CONFIG.currency}</td>
                                <td class="text-right"><strong>${formatMoney(s.price * s.qty)} ${CONFIG.currency}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            
            <div class="invoice-totals">
                <div class="total-row">
                    <span>Sous-total</span>
                    <span>${formatMoney(calc.subtotal)} ${CONFIG.currency}</span>
                </div>
                ${data.discount > 0 ? `
                    <div class="total-row discount">
                        <span>Remise (${data.discount}%)</span>
                        <span>-${formatMoney(calc.discountAmount)} ${CONFIG.currency}</span>
                    </div>
                ` : ''}
                <div class="total-row">
                    <span>Total HT</span>
                    <span>${formatMoney(calc.afterDiscount)} ${CONFIG.currency}</span>
                </div>
                <div class="total-row">
                    <span>TVA (${data.tva}%)</span>
                    <span>${formatMoney(calc.tvaAmount)} ${CONFIG.currency}</span>
                </div>
                <div class="total-row grand-total">
                    <span>TOTAL TTC</span>
                    <span>${formatMoney(calc.total)} ${CONFIG.currency}</span>
                </div>
            </div>
            
            ${data.notes ? `
                <div style="margin-top: 1.5rem; padding: 1rem; background: #f8fafc; border-radius: 8px; font-size: 0.9rem; color: #64748b;">
                    <strong>Notes:</strong> ${escapeHtml(data.notes).replace(/\n/g, '<br>')}
                </div>
            ` : ''}
        </div>
        
        <div class="invoice-footer">
            <div class="payment-info">
                <h4>Coordonnées bancaires</h4>
                <p>Centre de Langues SARL<br>RIB: 007 99999 9999999999 99<br>Banque: BADR</p>
            </div>
            <div class="qr-placeholder">
                <i class="fas fa-qrcode"></i>
            </div>
        </div>
    `;
}

// ============================================
// STUDENT SELECTION (IMPROVED WITH MODAL)
// ============================================
function openStudentSelector() {
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    
    const loadingHtml = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Sélectionner un étudiant</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
            </div>
            <div class="modal-body" style="padding: 3rem; text-align: center;">
                <div class="loading-spinner" style="width: 40px; height: 40px; border-color: #e2e8f0; border-top-color: var(--primary); margin: 0 auto 1rem;"></div>
                <p style="color: #64748b;">Chargement des étudiants...</p>
            </div>
        </div>
    `;
    
    modal.innerHTML = loadingHtml;
    document.body.appendChild(modal);
    
    if (state.etudiants.length === 0) {
        loadEtudiants().then(() => renderStudentList(modal));
    } else {
        renderStudentList(modal);
    }
}

function renderStudentList(modal) {
    const studentsList = state.etudiants.map(e => {
        const nom = `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.trim();
        const email = e.user?.email || '';
        const tel = e.telephone || '';
        const groupe = e.groupe_nom || (e.id_groupe ? state.groupes.find(g => g.id === e.id_groupe)?.nom_groupe : '');
        
        return `
            <div class="student-option" onclick="selectStudent('${e.id}', '${escapeHtml(nom)}', '${escapeHtml(email)}', '${escapeHtml(tel)}')">
                <div class="student-name">${escapeHtml(nom)}</div>
                <div class="student-info">
                    ${email ? escapeHtml(email) + ' | ' : ''}
                    ${tel ? escapeHtml(tel) : ''}
                    ${groupe ? '<br>Groupe: ' + escapeHtml(groupe) : ''}
                </div>
            </div>
        `;
    }).join('');
    
    modal.querySelector('.modal-body').innerHTML = studentsList || `
        <div class="empty-state">
            <i class="fas fa-user-slash"></i>
            <p>Aucun étudiant trouvé</p>
        </div>
    `;
}

function selectStudent(id, nom, email, tel) {
    document.getElementById('clientName').value = nom;
    document.getElementById('clientEmail').value = email;
    document.getElementById('clientPhone').value = tel;
    
    document.querySelector('.modal-overlay')?.remove();
    
    updatePreview();
    showToast('Étudiant sélectionné', 'success');
}

// ============================================
// SAVE INVOICE TO DATABASE
// ============================================
async function saveInvoice() {
    const data = collectFormData();
    const calc = calculateTotals();
    
    // Validation
    if (!data.clientName) {
        showToast('Veuillez entrer le nom du client', 'warning');
        document.getElementById('clientName').focus();
        return;
    }
    if (state.services.length === 0 || state.services.every(s => !s.description)) {
        showToast('Veuillez ajouter au moins un service', 'warning');
        return;
    }
    
    // Show loading state on button
    const saveBtn = document.querySelector('.btn-success');
    const originalContent = saveBtn.innerHTML;
    saveBtn.innerHTML = '<div class="loading-spinner" style="width: 16px; height: 16px; border-width: 2px;"></div> Sauvegarde...';
    saveBtn.disabled = true;
    
    const payload = {
        numero_facture: data.invoiceNum,
        date_emission: data.date,
        date_echeance: data.dueDate,
        statut: data.status,
        client_nom: data.clientName,
        client_email: data.clientEmail,
        client_telephone: data.clientPhone,
        client_adresse: data.clientAddress,
        services: state.services.filter(s => s.description).map(s => ({
            description: s.description,
            quantite: s.qty,
            prix_unitaire: s.price,
            total: s.price * s.qty
        })),
        remise_pourcentage: data.discount,
        remise_montant: calc.discountAmount,
        tva_pourcentage: data.tva,
        tva_montant: calc.tvaAmount,
        total_ht: calc.afterDiscount,
        total_ttc: calc.total,
        notes: data.notes,
        template: state.currentTemplate
    };
    
    const result = await apiFetch('/factures/', {
        method: 'POST',
        body: JSON.stringify(payload)
    });
    
    // Restore button
    saveBtn.innerHTML = originalContent;
    saveBtn.disabled = false;
    
    if (result?.error) {
        showToast('Erreur: ' + result.message, 'error');
        return;
    }
    
    state.currentInvoiceId = result.id;
    showToast('Facture sauvegardée avec succès!', 'success');
    
    // Refresh history
    await loadRecentInvoices();
    
    return result;
}

// ============================================
// ACTIONS
// ============================================
async function resetForm() {
    if (state.services.some(s => s.description) && !confirm('Créer une nouvelle facture ? Les données actuelles seront perdues.')) {
        return;
    }
    
    const newNum = await generateInvoiceNumber();
    document.getElementById('invoiceNum').value = newNum;
    
    document.getElementById('clientName').value = '';
    document.getElementById('clientEmail').value = '';
    document.getElementById('clientPhone').value = '';
    document.getElementById('clientAddress').value = '';
    document.getElementById('notes').value = '';
    document.getElementById('discount').value = '0';
    document.getElementById('tva').value = CONFIG.defaultTVA;
    
    state.services = [];
    state.currentInvoiceId = null;
    addService('', '', 1);
    
    updatePreview();
    showToast('Nouvelle facture créée', 'success');
}

async function generateInvoiceNumber() {
    try {
        const response = await apiFetch('/factures/next-number/');
        if (response && !response.error) {
            return response.numero;
        }
    } catch (e) {}
    
    const date = new Date();
    const year = date.getFullYear();
    const random = String(Math.floor(Math.random() * 999)).padStart(3, '0');
    return `FAC-${year}-${random}`;
}

async function generatePDF() {
    if (!state.currentInvoiceId) {
        const saved = await saveInvoice();
        if (!saved) return;
    }
    
    showToast('Génération du PDF...', 'info');
    
    try {
        const response = await fetch(`${CONFIG.apiUrl}/factures/${state.currentInvoiceId}/pdf/`, {
            headers: authHeaders()
        });
        
        if (!response.ok) throw new Error('Erreur génération PDF');
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Facture_${state.currentInvoiceId}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        
        showToast('PDF téléchargé!', 'success');
    } catch (e) {
        showToast('Utilisation de l\'impression PDF...', 'info');
        setTimeout(() => printInvoice(), 500);
    }
}

function printInvoice() {
    if (!state.currentInvoiceId) {
        showToast('Veuillez d\'abord sauvegarder la facture', 'warning');
        return;
    }
    window.print();
}

// ============================================
// HISTORY MANAGEMENT
// ============================================
function loadSampleHistory() {
    state.invoiceHistory = [
        { id: 'FAC-2026-042', client: 'Sarah Moussaoui', date: '2026-04-15', amount: 22000, status: 'payée' },
        { id: 'FAC-2026-041', client: 'Karim Hadj', date: '2026-04-14', amount: 8000, status: 'en attente' },
        { id: 'FAC-2026-040', client: 'Yasmine Kadiri', date: '2026-04-12', amount: 15000, status: 'payée' },
        { id: 'FAC-2026-039', client: 'Mohamed Lamine', date: '2026-04-10', amount: 12000, status: 'en retard' }
    ];
    renderHistory();
}

function renderHistory() {
    const grid = document.getElementById('historyGrid');
    
    if (state.invoiceHistory.length === 0) {
        grid.innerHTML = '<p style="color: #94a3b8; text-align: center; padding: 2rem;">Aucune facture récente</p>';
        return;
    }
    
    grid.innerHTML = state.invoiceHistory.map(h => `
        <div class="history-card" onclick="loadExistingInvoice('${h.id}')">
            <div class="history-header">
                <span class="history-id">${escapeHtml(h.numero_facture || h.id)}</span>
                <span class="history-status status-${(h.statut || h.status || 'en-attente').replace(/\s+/g, '-')}">${h.statut || h.status || 'en attente'}</span>
            </div>
            <div class="history-client">${escapeHtml(h.client_nom || h.client || 'Client')}</div>
            <div class="history-date">${formatDate(h.date_emission || h.date)}</div>
            <div class="history-amount">${formatMoney(h.total_ttc || h.amount || 0)} ${CONFIG.currency}</div>
        </div>
    `).join('');
}

async function loadExistingInvoice(id) {
    showToast('Chargement de la facture...', 'info');
    
    const data = await apiFetch(`/factures/${id}/`);
    if (data?.error) {
        showToast('Erreur: ' + data.message, 'error');
        return;
    }
    
    state.currentInvoiceId = data.id;
    document.getElementById('invoiceNum').value = data.numero_facture || '';
    document.getElementById('invoiceDate').value = data.date_emission || '';
    document.getElementById('dueDate').value = data.date_echeance || '';
    document.getElementById('invoiceStatus').value = data.statut || 'en attente';
    document.getElementById('clientName').value = data.client_nom || '';
    document.getElementById('clientEmail').value = data.client_email || '';
    document.getElementById('clientPhone').value = data.client_telephone || '';
    document.getElementById('clientAddress').value = data.client_adresse || '';
    document.getElementById('discount').value = data.remise_pourcentage || 0;
    document.getElementById('tva').value = data.tva_pourcentage || CONFIG.defaultTVA;
    document.getElementById('notes').value = data.notes || '';
    
    if (data.services && data.services.length > 0) {
        state.services = data.services.map((s, index) => ({
            id: Date.now() + index,
            description: s.description,
            price: s.prix_unitaire,
            qty: s.quantite
        }));
    } else {
        state.services = [];
        addService('', '', 1);
    }
    
    if (data.template) {
        changeTemplate(data.template);
    }
    
    renderServices();
    updatePreview();
    showToast('Facture chargée', 'success');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================
// UTILITIES
// ============================================
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('fr-FR', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
    });
}

function formatMoney(amount) {
    return new Intl.NumberFormat('fr-DZ').format(Math.round(amount));
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ============================================
// TOAST NOTIFICATIONS (Matching dash_secr.js)
// ============================================
function showToast(message, type = 'info') {
    const existing = document.querySelector('.toast-secr');
    if (existing) existing.remove();
    
    const colors = { 
        success: '#059669', 
        error: '#dc2626', 
        warning: '#d97706', 
        info: '#0284c7' 
    };
    const icons = { 
        success: '✓', 
        error: '✕', 
        warning: '⚠', 
        info: 'ℹ' 
    };
    
    const toast = document.createElement('div');
    toast.className = 'toast-secr';
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 9999;
        padding: 14px 22px;
        border-radius: 12px;
        background: ${colors[type]};
        color: white;
        font-weight: 500;
        font-size: 0.9rem;
        box-shadow: 0 8px 24px rgba(0,0,0,0.2);
        display: flex;
        align-items: center;
        gap: 8px;
        transform: translateX(120%);
        opacity: 0;
        transition: all 0.3s ease;
    `;
    toast.innerHTML = `<span>${icons[type]}</span>${escapeHtml(message)}`;
    document.body.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(0)';
        toast.style.opacity = '1';
    });
    
    setTimeout(() => {
        toast.style.transform = 'translateX(120%)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ============================================
// AUTO-REFRESH
// ============================================
setInterval(() => {
    if (!document.hidden && state.invoiceHistory.length > 0) {
        loadRecentInvoices();
    }
}, 120000);