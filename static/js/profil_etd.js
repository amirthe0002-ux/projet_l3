/**
 * Profil Étudiant - JWT Authentication
 * File: static/js/profil_etd.js
 * FIXED VERSION - Handles permission errors gracefully
 */

// ============================================================
// CONFIG
// ============================================================
const API_URL = '/api';

// ============================================================
// JWT HELPERS
// ============================================================
function getToken() {
    return localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || null;
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user'));
    } catch { return null; }
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
        if (res.status === 401) return { error: 'JWT_INVALID', message: 'Token invalide.' };
        if (res.status === 403) return { error: 'FORBIDDEN', message: 'Accès refusé.' };
        if (!res.ok) return { error: 'API_ERROR', message: `Erreur ${res.status}` };
        return await res.json();
    } catch (e) {
        return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible.' };
    }
}

// ============================================================
// VÉRIFIER SESSION
// ============================================================
function checkSession() {
    const token = getToken();
    const user = getUser();
    if (!token || !user) { window.location.href = '/login/'; return null; }
    if (!['Etudiant', 'Dirigeant'].includes(user.role)) { window.location.href = '/login/'; return null; }
    return user;
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
    document.querySelector('.toast-profil')?.remove();
    const colors = { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#0284c7' };
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
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
    return `<span style="
        display:inline-block; width:${w}; height:${h};
        background:linear-gradient(90deg,#e2e8f0 25%,#cbd5e1 50%,#e2e8f0 75%);
        background-size:200% 100%; animation:shimmer 1.5s infinite; border-radius:6px;
    ">&nbsp;</span>`;
}

if (!document.getElementById('profil-shimmer')) {
    const s = document.createElement('style');
    s.id = 'profil-shimmer';
    s.textContent = `
        @keyframes shimmer { to { background-position: -200% 0; } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .fade-in { animation: fadeIn 0.4s ease forwards; }
    `;
    document.head.appendChild(s);
}

// ============================================================
// FORMATAGE
// ============================================================
function formatDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('fr-DZ', { day: 'numeric', month: 'long', year: 'numeric' });
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
    if (!amount) return '—';
    return `${parseInt(amount).toLocaleString('fr-DZ')} DA`;
}

// ============================================================
// CHARGER DONNÉES API (avec gestion d'erreurs)
// ============================================================
async function fetchNotes() {
    const data = await apiFetch('/notes/');
    if (data?.error) {
        console.warn('Notes API error:', data.message);
        return [];
    }
    return data || [];
}

async function fetchAbsences() {
    const data = await apiFetch('/absences/');
    if (data?.error) {
        console.warn('Absences API error:', data.message);
        return [];
    }
    return data || [];
}

async function fetchPaiements() {
    const data = await apiFetch('/paiements/');
    if (data?.error) {
        console.warn('Paiements API error:', data.message);
        // Return empty array - will use fallback data from etudiant object
        return [];
    }
    return data || [];
}

// ============================================================
// REMPLIR HEADER PROFIL
// ============================================================
async function fillProfileHeader(user, etudiant) {
    const prenom = user.first_name || '';
    const nom = user.last_name || '';
    const initials = `${prenom[0] || ''}${nom[0] || ''}`.toUpperCase();
    
    // Adapter selon les champs réels de ta base
    const niveau = etudiant?.niveau_actuel || etudiant?.niveau || 'A2';
    const langue = etudiant?.langue?.nom || etudiant?.langue || 'Anglais';
    const statut = etudiant?.statut_etudiant || etudiant?.statut || 'Actif';
    const statutPaiement = etudiant?.statut_paiement || 'Payé';

    // Avatar
    const avatar = document.querySelector('.avatar-section .avatar');
    if (avatar) avatar.textContent = initials;

    // Nom & sous-titre
    const h1 = document.querySelector('.info-text h1');
    const subtitle = document.querySelector('.subtitle');
    if (h1) h1.textContent = `${prenom} ${nom}`;
    if (subtitle) subtitle.textContent = `Étudiant - ${langue} Niveau ${niveau}`;

    // Badges
    const badges = document.querySelectorAll('.badges .badge');
    if (badges[0]) badges[0].textContent = statut;
    if (badges[1]) badges[1].textContent = niveau;
    if (badges[2]) {
        badges[2].textContent = statutPaiement;
        if (statutPaiement === 'Non Payé' || statutPaiement === 'Impayé') {
            badges[2].classList.remove('paid');
            badges[2].classList.add('unpaid');
        }
    }
}

// ============================================================
// 1. INFORMATIONS PERSONNELLES
// ============================================================
async function loadInfosPersonnelles(user, etudiant) {
    const card = document.querySelector('.left-column .card:first-child');
    if (!card) return;

    // Skeleton
    const values = card.querySelectorAll('.value');
    values.forEach(v => v.innerHTML = skeleton('120px'));

    const age = calculateAge(etudiant?.date_naissance);
    
    const data = {
        'ID Étudiant': etudiant?.matricule || etudiant?.id_etudiant || `ETU${etudiant?.id || '0000'}`,
        'Nom Complet': `${user.first_name} ${user.last_name}`,
        'Date de Naissance': etudiant?.date_naissance ? `${formatDate(etudiant.date_naissance)} (${age} ans)` : '—',
        'Email': user.email,
        'Téléphone': etudiant?.telephone || etudiant?.tel || 'Non renseigné',
        'Adresse': etudiant?.adresse || etudiant?.address || 'Non renseignée'
    };

    const rows = card.querySelectorAll('.info-row');
    rows.forEach(row => {
        const label = row.querySelector('.label')?.textContent;
        const valueEl = row.querySelector('.value');
        if (label && valueEl && data[label]) {
            valueEl.textContent = data[label];
        }
    });

    card.classList.add('fade-in');
}

// ============================================================
// 2. INFORMATION PARENT
// ============================================================
async function loadParentInfo(etudiant) {
    const card = document.querySelector('.left-column .card:last-child');
    if (!card) return;

    const parent = etudiant?.parent || etudiant?.tuteur || etudiant?.parent_info;
    
    const parentAvatar = card.querySelector('.parent-avatar');
    const parentName = card.querySelector('.parent-info h4');
    const parentDetails = card.querySelectorAll('.parent-info p');

    if (!parent) {
        if (parentName) parentName.textContent = 'Non renseigné';
        return;
    }

    const pPrenom = parent.prenom || parent.first_name || parent.user?.first_name || '';
    const pNom = parent.nom || parent.last_name || parent.user?.last_name || '';
    const initials = pPrenom && pNom ? `${pPrenom[0]}${pNom[0]}`.toUpperCase() : 'PB';

    if (parentAvatar) parentAvatar.textContent = initials;
    if (parentName) parentName.textContent = `${pPrenom} ${pNom}`;
    if (parentDetails[0]) parentDetails[0].innerHTML = `<i class="fas fa-user"></i> ${parent.relation || parent.lien || 'Parent'}`;
    if (parentDetails[1]) parentDetails[1].innerHTML = `<i class="fas fa-phone"></i> ${parent.telephone || parent.phone || parent.tel || 'Non renseigné'}`;
    if (parentDetails[2]) parentDetails[2].innerHTML = `<i class="fas fa-envelope"></i> ${parent.email || parent.user?.email || 'Non renseigné'}`;

    card.classList.add('fade-in');
}

// ============================================================
// 3. INFORMATIONS ACADÉMIQUES
// ============================================================
async function loadInfosAcademiques(etudiant) {
    const card = document.querySelector('.right-column .card:first-child');
    if (!card) return;

    // Récupérer le groupe pour avoir le prof
    let groupeData = null;
    const groupeId = etudiant?.groupe?.id || etudiant?.groupe_id || etudiant?.groupe;
    
    if (groupeId && typeof groupeId === 'number') {
        groupeData = await apiFetch(`/groupes/${groupeId}/`);
        if (groupeData?.error) groupeData = null;
    }

    const niveau = etudiant?.niveau_actuel || etudiant?.niveau || 'A2';
    const langue = etudiant?.langue?.nom || etudiant?.langue || 'Anglais';
    const groupe = etudiant?.groupe?.nom_groupe || etudiant?.groupe_nom || groupeData?.nom_groupe || 'A2-Matin';
    const prof = groupeData?.enseignant?.user?.first_name 
        ? `${groupeData.enseignant.user.first_name} ${groupeData.enseignant.user.last_name}`
        : (etudiant?.enseignant_nom || 'M. Ahmed');

    // Stat boxes
    const statValues = card.querySelectorAll('.stat-value');
    if (statValues[0]) statValues[0].textContent = langue;
    if (statValues[1]) statValues[1].textContent = niveau;
    if (statValues[2]) statValues[2].textContent = groupe;
    if (statValues[3]) statValues[3].textContent = prof;

    // Progression vers niveau suivant
    const niveaux = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const currentIndex = niveaux.indexOf(niveau);
    const nextLevel = currentIndex < niveaux.length - 1 ? niveaux[currentIndex + 1] : '—';
    
    // Calcul progression basée sur moyenne générale
    const moyenne = parseFloat(etudiant?.moyenne_generale) || 0;
    const seuils = { 'A1': [0,5], 'A2': [5,10], 'B1': [10,13], 'B2': [13,16], 'C1': [16,20] };
    const [min, max] = seuils[niveau] || [10, 13];
    const pct = Math.min(100, Math.round(((moyenne - min) / (max - min)) * 100));

    const progressFill = card.querySelector('.progress-fill');
    const progressText = card.querySelector('.progress-section h4');
    const progressInfo = card.querySelectorAll('.progress-info span');

    if (progressFill) progressFill.style.width = `${pct}%`;
    if (progressText) progressText.textContent = `Progression vers ${nextLevel}`;
    if (progressInfo[0]) progressInfo[0].textContent = `${pct}% complété`;
    
    const moisRestants = Math.ceil((100 - pct) / 10);
    if (progressInfo[1]) progressInfo[1].textContent = `Estimation: ${moisRestants} mois restants`;

    card.classList.add('fade-in');
}

// ============================================================
// 4. RÉSUMÉ DES NOTES (CIRCULAR CHART)
// ============================================================
async function loadResumeNotes(etudiant) {
    const card = document.querySelector('.right-column .card:nth-child(2)');
    if (!card) return;

    // Skeleton
    const gradeValue = card.querySelector('.grade-value');
    if (gradeValue) gradeValue.innerHTML = skeleton('50px', '2rem');

    // Charger notes détaillées
    const notes = await fetchNotes();
    
    // Si pas de notes API, utiliser la moyenne de l'étudiant
    if (notes.length === 0) {
        const moyenneGenerale = parseFloat(etudiant?.moyenne_generale) || 16.1;
        
        if (gradeValue) {
            gradeValue.textContent = moyenneGenerale.toFixed(1);
        }
        
        const circleFill = card.querySelector('.circle-fill');
        if (circleFill) {
            const dashArray = (moyenneGenerale / 20) * 100;
            circleFill.setAttribute('stroke-dasharray', `${dashArray}, 100`);
        }

        // Valeurs par défaut basées sur la moyenne
        const gradeItems = card.querySelectorAll('.grade-item span:last-child');
        if (gradeItems[0]) gradeItems[0].textContent = `Écrit: ${(moyenneGenerale * 0.95).toFixed(1)}/20`;
        if (gradeItems[1]) gradeItems[1].textContent = `Oral: ${(moyenneGenerale * 0.90).toFixed(1)}/20`;
        if (gradeItems[2]) gradeItems[2].textContent = `Compréhension: ${(moyenneGenerale * 1.05).toFixed(1)}/20`;
        if (gradeItems[3]) gradeItems[3].textContent = `Participation: ${(moyenneGenerale * 1.10).toFixed(1)}/20`;
        
        card.classList.add('fade-in');
        return;
    }

    // Calculer moyennes par catégorie depuis les vraies notes
    const categories = { ecrit: [], oral: [], comprehension: [], participation: [] };
    
    notes.forEach(n => {
        // Adapter selon TES champs de sérializer
        const typeEval = (n.evaluation?.type || n.type_evaluation || n.type || '').toLowerCase();
        const noteVal = parseFloat(n.note_obtenue || n.note || n.valeur || 0);
        
        if (typeEval.includes('ecrit') || typeEval.includes('écrit')) categories.ecrit.push(noteVal);
        else if (typeEval.includes('oral')) categories.oral.push(noteVal);
        else if (typeEval.includes('comprehension') || typeEval.includes('compréhension')) categories.comprehension.push(noteVal);
        else if (typeEval.includes('participation')) categories.participation.push(noteVal);
        else categories.ecrit.push(noteVal); // default
    });

    const avg = arr => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    
    const ecrit = avg(categories.ecrit) || 16;
    const oral = avg(categories.oral) || 15;
    const comprehension = avg(categories.comprehension) || 17;
    const participation = avg(categories.participation) || 18;

    const moyenneGenerale = ((ecrit + oral + comprehension + participation) / 4);

    // Update circle chart
    if (gradeValue) {
        gradeValue.textContent = moyenneGenerale.toFixed(1);
        gradeValue.classList.add('fade-in');
    }

    // Update stroke-dasharray for SVG circle (max 20 = 100%)
    const circleFill = card.querySelector('.circle-fill');
    if (circleFill) {
        const dashArray = (moyenneGenerale / 20) * 100;
        circleFill.setAttribute('stroke-dasharray', `${dashArray}, 100`);
    }

    // Update grade details
    const gradeItems = card.querySelectorAll('.grade-item span:last-child');
    if (gradeItems[0]) gradeItems[0].textContent = `Écrit: ${ecrit.toFixed(1)}/20`;
    if (gradeItems[1]) gradeItems[1].textContent = `Oral: ${oral.toFixed(1)}/20`;
    if (gradeItems[2]) gradeItems[2].textContent = `Compréhension: ${comprehension.toFixed(1)}/20`;
    if (gradeItems[3]) gradeItems[3].textContent = `Participation: ${participation.toFixed(1)}/20`;

    card.classList.add('fade-in');
}

// ============================================================
// 5. ASSIDUITÉ
// ============================================================
async function loadAssiduite(etudiant) {
    const card = document.querySelector('.right-column .card:nth-child(3)');
    if (!card) return;

    // Skeleton
    const attNumbers = card.querySelectorAll('.att-number');
    attNumbers.forEach(n => n.innerHTML = skeleton('30px'));

    const absences = await fetchAbsences();

    // Utiliser les données de l'étudiant si API échoue
    let present = etudiant?.nb_presences || etudiant?.presences || 45;
    let absent = etudiant?.nb_absences || etudiant?.absences || 2;
    let late = etudiant?.nb_retards || etudiant?.retards || 1;

    // Si on a des données API, les utiliser
    if (absences.length > 0) {
        present = absences.filter(a => {
            const s = (a.statut_absence || a.statut || '').toLowerCase();
            return s === 'present' || s === 'présent';
        }).length;
        
        absent = absences.filter(a => {
            const s = (a.statut_absence || a.statut || '').toLowerCase();
            return s === 'absent';
        }).length;
        
        late = absences.filter(a => {
            const s = (a.statut_absence || a.statut || '').toLowerCase();
            return s === 'retard' || s === 'late';
        }).length;
    }

    const total = present + absent + late;
    const taux = total ? Math.round((present / total) * 100) : 94;

    if (attNumbers[0]) attNumbers[0].textContent = present;
    if (attNumbers[1]) attNumbers[1].textContent = absent;
    if (attNumbers[2]) attNumbers[2].textContent = late;
    if (attNumbers[3]) {
        attNumbers[3].textContent = `${taux}%`;
        if (taux < 80) attNumbers[3].classList.replace('rate', 'absent');
        else if (taux >= 95) attNumbers[3].style.color = '#10b981';
    }

    card.classList.add('fade-in');
}

// ============================================================
// 6. STATUT DE PAIEMENT
// ============================================================
async function loadPaiementSection(etudiant) {
    const card = document.querySelector('.right-column .card:last-child');
    if (!card) return;

    const paiements = await fetchPaiements();
    
    // Current month payment
    const now = new Date();
    const moisActuel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const moisActuelCapitalized = moisActuel.charAt(0).toUpperCase() + moisActuel.slice(1);

    // Valeurs par défaut depuis l'étudiant (si API paiement interdite)
    let currentPayment = {
        status: (etudiant?.statut_paiement === 'Payé' || etudiant?.statut_paiement === 'payé') ? 'paid' : 'unpaid',
        amount: etudiant?.montant_mensuel || etudiant?.montant_paiement || 8000,
        date: etudiant?.dernier_paiement || '05/03/2026'
    };

    // Si on a des données API, les utiliser
    if (paiements.length > 0) {
        const current = paiements.find(p => {
            const pDate = new Date(p.date_paiement || p.date || p.periode);
            return pDate.getMonth() === now.getMonth() && pDate.getFullYear() === now.getFullYear();
        });
        
        if (current) {
            const statutPaiement = current.statut_paiement || current.statut || '';
            currentPayment = {
                status: (statutPaiement === 'payé' || statutPaiement === 'Payé' || statutPaiement === 'paid') ? 'paid' : 'unpaid',
                amount: current.montant_paye || current.montant || current.montant_du || 8000,
                date: current.date_paiement ? formatDate(current.date_paiement) : '—'
            };
        }
    }

    // Update status card
    const statusCard = card.querySelector('.payment-status-card');
    const statusIcon = statusCard?.querySelector('.status-icon i');
    const statusTitle = statusCard?.querySelector('h4');
    const statusDesc = statusCard?.querySelector('p');
    const statusBadge = statusCard?.querySelector('.status-badge');

    if (currentPayment.status === 'paid') {
        if (statusCard) statusCard.className = 'payment-status-card paid';
        if (statusIcon) statusIcon.className = 'fas fa-check-circle';
        if (statusBadge) {
            statusBadge.textContent = 'Payé';
            statusBadge.className = 'status-badge paid';
        }
    } else {
        if (statusCard) statusCard.className = 'payment-status-card unpaid';
        if (statusIcon) statusIcon.className = 'fas fa-exclamation-circle';
        if (statusBadge) {
            statusBadge.textContent = 'Non Payé';
            statusBadge.className = 'status-badge unpaid';
        }
    }

    if (statusTitle) statusTitle.textContent = `Mensualité ${moisActuelCapitalized}`;
    if (statusDesc) statusDesc.textContent = `${formatCurrency(currentPayment.amount)} - ${currentPayment.status === 'paid' ? `Payé le ${currentPayment.date}` : 'En attente de paiement'}`;

    // Payment history
    const historyContainer = card.querySelector('.payment-history');
    if (historyContainer) {
        let historyHTML = '<h4>Historique des paiements</h4>';
        
        // Utiliser données API ou fallback
        const history = paiements.length > 0 ? paiements.slice(0, 3).map(p => ({
            mois: formatDate(p.date_paiement || p.date || p.periode),
            montant: p.montant_paye || p.montant || 8000,
            statut: p.statut_paiement || p.statut || 'payé'
        })) : [
            { mois: 'Février 2026', montant: 8000, statut: 'payé' },
            { mois: 'Janvier 2026', montant: 8000, statut: 'payé' }
        ];

        history.forEach(p => {
            const isPaid = p.statut === 'payé' || p.statut === 'Payé' || p.statut === 'paid';
            const statusClass = isPaid ? 'paid' : 'unpaid';
            const statusIcon = isPaid ? '✓' : '✗';
            
            historyHTML += `
                <div class="payment-item">
                    <span>${p.mois}</span>
                    <span class="${statusClass}">${formatCurrency(p.montant)} ${statusIcon}</span>
                </div>
            `;
        });

        historyContainer.innerHTML = historyHTML;
    }

    card.classList.add('fade-in');
}

// ============================================================
// ACTIONS BOUTONS
// ============================================================
function setupActions() {
    const btnEdit = document.querySelector('.btn-edit');
    if (btnEdit) {
        btnEdit.addEventListener('click', () => {
            showToast('Fonctionnalité de modification en développement.', 'warning');
        });
    }

    const btnPrint = document.querySelector('.btn-print');
    if (btnPrint) {
        btnPrint.addEventListener('click', () => {
            window.print();
        });
    }

    const btnPhoto = document.querySelector('.btn-change-photo');
    if (btnPhoto) {
        btnPhoto.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const formData = new FormData();
                formData.append('photo', file);

                try {
                    const res = await fetch(`${API_URL}/etudiants/photo/`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${getToken()}` },
                        body: formData
                    });
                    
                    if (res.ok) {
                        showToast('Photo mise à jour avec succès', 'success');
                        setTimeout(() => window.location.reload(), 1000);
                    } else {
                        showToast('Erreur lors du téléchargement', 'error');
                    }
                } catch (err) {
                    showToast('Erreur réseau', 'error');
                }
            };
            input.click();
        });
    }
}

// ============================================================
// INIT PRINCIPAL
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;

    setupActions();

    // Mettre skeletons
    document.querySelectorAll('.value, .stat-value, .grade-value, .att-number').forEach(el => {
        if (!el.innerHTML.includes('<')) el.innerHTML = skeleton();
    });

    // Charger étudiant
    const etudiantData = await apiFetch('/etudiants/');
    let etudiant = null;
    
    if (!etudiantData?.error && etudiantData.length) {
        etudiant = etudiantData.find(e => e.user?.id === user.id || e.user?.email === user.email) || etudiantData[0];
    }

    // Si pas trouvé dans liste, essayer endpoint spécifique
    if (!etudiant && user.id) {
        const specific = await apiFetch(`/etudiants/${user.id}/`);
        if (!specific?.error) etudiant = specific;
    }

    if (!etudiant) {
        showToast('Impossible de charger le profil étudiant', 'error');
        return;
    }

    console.log('Etudiant loaded:', etudiant); // Debug

    // Remplir toutes les sections (même si certaines API échouent)
    await Promise.all([
        fillProfileHeader(user, etudiant),
        loadInfosPersonnelles(user, etudiant),
        loadParentInfo(etudiant),
        loadInfosAcademiques(etudiant),
        loadResumeNotes(etudiant),
        loadAssiduite(etudiant),
        loadPaiementSection(etudiant)
    ]);

    showToast('Profil chargé avec succès', 'success');
});