/**
 * Gestion des Groupes - Secrétariat
 * JWT Authentication + Django REST API
 * FIXED: Modal visibility with dark theme
 */

const API_URL = '/api';

const state = {
    groupes: [],
    enseignants: [],
    searchTerm: '',
};

// JWT HELPERS
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

// API
async function apiFetch(endpoint, options = {}) {
    console.log('API CALL:', endpoint, options.method || 'GET');
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });
        console.log('Response status:', res.status);
        
        if (res.status === 401) return { error: 'JWT_INVALID', message: 'Token invalide.' };
        if (res.status === 403) return { error: 'FORBIDDEN', message: 'Accès refusé.' };
        if (!res.ok) {
            const text = await res.text();
            console.error('Error response:', text);
            return { error: 'API_ERROR', message: `Erreur ${res.status}: ${text}` };
        }
        if (res.status === 204) return { success: true };
        
        const data = await res.json();
        console.log('Response data:', data);
        return data;
    } catch (e) {
        console.error('Network error:', e);
        return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible.' };
    }
}

// SESSION
function checkSession() {
    const token = getToken();
    const user = getUser();
    console.log('Checking session:', { token: !!token, user: user?.role });
    
    if (!token || !user) { 
        window.location.href = '/login/'; 
        return null; 
    }
    if (!['Secretariat', 'Comptable', 'Dirigeant'].includes(user.role)) {
        window.location.href = '/login/';
        return null;
    }
    return user;
}

// TOAST
function showToast(message, type = 'info') {
    const colors = { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#0284c7' };
    const t = document.createElement('div');
    t.style.cssText = `
        position:fixed; bottom:24px; right:24px; z-index:9999;
        padding:14px 22px; border-radius:12px;
        background:${colors[type]}; color:white;
        font-weight:500; font-size:0.9rem;
        box-shadow:0 8px 24px rgba(0,0,0,0.2);
        transition:all 0.3s ease;
    `;
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

// HELPERS
function langueFlag(langue) {
    if (!langue) return '🌐';
    const l = langue.toLowerCase();
    if (l.includes('angl')) return '🇬🇧';
    if (l.includes('franc')) return '🇫🇷';
    if (l.includes('allem')) return '🇩🇪';
    if (l.includes('espag')) return '🇪🇸';
    if (l.includes('ital')) return '🇮🇹';
    return '🌐';
}

function formatPrice(price) {
    if (!price) return '0';
    const num = parseFloat(price);
    if (num >= 1000) return (num / 1000) + 'k';
    return num.toString();
}

// LOAD ENSEIGNANTS
async function loadEnseignants() {
    console.log('Loading enseignants...');
    const data = await apiFetch('/enseignants/');
    
    if (data?.error) {
        console.error('Failed to load enseignants:', data);
        state.enseignants = [];
        showToast('Erreur chargement professeurs: ' + data.message, 'error');
    } else {
        state.enseignants = Array.isArray(data) ? data : (data.results || []);
        console.log('Loaded enseignants:', state.enseignants.length);
    }
}

// LOAD GROUPES
async function loadGroupes() {
    console.log('Loading groupes...');
    
    const timeline = document.querySelector('.groups-timeline');
    console.log('Timeline element found:', !!timeline);
    
    if (!timeline) {
        console.error('ERROR: .groups-timeline not found in HTML!');
        showToast('Erreur: conteneur non trouvé', 'error');
        return;
    }

    // Show loading
    timeline.innerHTML = `
        <div style="text-align:center; padding:3rem; color:#94a3b8;">
            <i class="fas fa-spinner fa-spin" style="font-size:2rem; margin-bottom:1rem; display:block;"></i>
            <p>Chargement des groupes...</p>
        </div>`;

    const data = await apiFetch('/groupes/');
    console.log('Groupes API response:', data);

    if (data?.error) {
        showToast('Erreur: ' + data.message, 'error');
        timeline.innerHTML = `
            <div style="text-align:center; padding:3rem; color:#dc2626;">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem; margin-bottom:1rem; display:block;"></i>
                <p>${data.message}</p>
                <button onclick="loadGroupes()" style="
                    margin-top:1rem; padding:8px 16px; background:#6366f1;
                    color:white; border:none; border-radius:8px; cursor:pointer;">
                    Réessayer
                </button>
            </div>`;
        return;
    }

    state.groupes = Array.isArray(data) ? data : (data.results || []);
    console.log('Stored groupes:', state.groupes.length, state.groupes);

    if (state.groupes.length === 0) {
        console.log('No groups found in database');
        timeline.innerHTML = `
            <div style="text-align:center; padding:3rem; color:#94a3b8;">
                <i class="fas fa-layer-group" style="font-size:3rem; margin-bottom:1rem; display:block;"></i>
                <p style="font-size:1.1rem; font-weight:600;">Aucun groupe trouvé</p>
                <p style="font-size:0.875rem; margin-top:0.5rem;">Créez votre premier groupe avec le bouton ci-dessus</p>
            </div>`;
        return;
    }

    renderGroupes();
    showToast(`${state.groupes.length} groupe(s) chargé(s)`, 'success');
}

// RENDER GROUPES
function renderGroupes() {
    console.log('Rendering groupes...');
    
    const timeline = document.querySelector('.groups-timeline');
    if (!timeline) {
        console.error('Timeline not found during render!');
        return;
    }

    timeline.innerHTML = '';

    const slots = {};
    state.groupes.forEach(g => {
        const timeKey = extractTimeSlot(g);
        if (!slots[timeKey]) slots[timeKey] = [];
        slots[timeKey].push(g);
    });
    console.log('Time slots:', Object.keys(slots));

    Object.keys(slots).forEach((timeKey, index) => {
        const slotGroupes = slots[timeKey];
        const firstGroupe = slotGroupes[0];

        const isEvening = timeKey.includes('18:00');
        const icon = isEvening ? 'fa-moon' : 'fa-sun';
        const gradient = isEvening ? 'background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);' : '';

        const slotDiv = document.createElement('div');
        slotDiv.className = 'time-slot';
        
        const headerHtml = `
            <div class="time-header">
                <span class="time-badge" style="${gradient}">
                    <i class="fas ${icon}"></i> ${timeKey}
                </span>
                <span class="time-info">Créneau • ${firstGroupe.salle || 'Salle non définie'}</span>
            </div>
        `;
        
        const rowDiv = document.createElement('div');
        rowDiv.className = 'groups-row';
        
        slotGroupes.forEach(g => {
            const card = createGroupCardElement(g);
            rowDiv.appendChild(card);
        });

        slotDiv.innerHTML = headerHtml;
        slotDiv.appendChild(rowDiv);
        timeline.appendChild(slotDiv);
    });

    console.log('Render complete');
}

function extractTimeSlot(groupe) {
    if (groupe.planning && Array.isArray(groupe.planning) && groupe.planning.length > 0) {
        const p = groupe.planning[0];
        return `${p.heure_debut || '09:00'} - ${p.heure_fin || '11:00'}`;
    }
    const name = (groupe.nom_groupe || '').toLowerCase();
    if (name.includes('soir') || name.includes('18')) return '18:00 - 20:00';
    if (name.includes('midi') || name.includes('11')) return '11:00 - 13:00';
    if (name.includes('apres') || name.includes('14')) return '14:00 - 16:00';
    return '09:00 - 11:00';
}

function createGroupCardElement(groupe) {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.dataset.id = groupe.id;
    card.dataset.lang = (groupe.langue || '').toLowerCase();

    const enseignantNom = groupe.enseignant_nom || 'Non assigné';
    const langue = groupe.langue || 'Non défini';
    const price = formatPrice(groupe.tarif_mensuel);
    const students = groupe.nombre_etudiants || 0;
    const capacity = groupe.capacite_max || 15;

    card.innerHTML = `
        <div class="group-header">
            <span class="group-level">${groupe.niveau || 'N/A'}</span>
            <span class="group-lang">${langueFlag(langue)} ${langue}</span>
        </div>
        <h3 class="group-name">${groupe.nom_groupe}</h3>
        <p class="group-teacher">
            <i class="fas fa-chalkboard-teacher"></i> Prof. ${enseignantNom}
        </p>
        <div class="group-stats">
            <div class="g-stat">
                <div class="g-stat-value">${students}</div>
                <div class="g-stat-label">Étudiants</div>
            </div>
            <div class="g-stat">
                <div class="g-stat-value">${capacity}</div>
                <div class="g-stat-label">Capacité</div>
            </div>
            <div class="g-stat">
                <div class="g-stat-value">${price}</div>
                <div class="g-stat-label">Prix</div>
            </div>
        </div>
        <div class="group-footer">
            <button class="btn-group btn-view" onclick="openModalDetails(${groupe.id})">
                <i class="fas fa-eye"></i> Voir
            </button>
            <button class="btn-group btn-edit" onclick="openModalModifier(${groupe.id})">
                <i class="fas fa-edit"></i> Modifier
            </button>
        </div>
    `;

    return card;
}

// ============================================================
// MODAL NOUVEAU GROUPE - FIXED DARK THEME
// ============================================================
async function openModalNouveau() {
    console.log('Opening new group modal, enseignants:', state.enseignants.length);
    
    if (state.enseignants.length === 0) {
        showToast('Chargement des professeurs...', 'info');
        await loadEnseignants();
    }

    let options = '<option value="">-- Sélectionner --</option>';
    state.enseignants.forEach(e => {
        const nom = e.nom_complet || `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.trim() || `Prof #${e.id}`;
        options += `<option value="${e.id}">${nom}</option>`;
    });

    const modal = document.createElement('div');
    modal.id = 'modal-groupe';
    modal.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:2000;
        display:flex; align-items:center; justify-content:center;`;

    // DARK THEME MODAL - FIXED VISIBILITY
    modal.innerHTML = `
        <div style="background:#0f172a !important;border:2px solid #6366f1 !important;border-radius:16px;padding:2rem;width:90%;max-width:500px;max-height:90vh;overflow-y:auto;color:#ffffff !important;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);" onclick="event.stopPropagation()">
            <h3 style="margin-bottom:1rem;color:#ffffff !important;font-size:1.2rem;">
                <i class="fas fa-plus-circle" style="color:#6366f1;margin-right:8px;"></i>Nouveau Groupe
            </h3>
            
            <div style="display:grid;gap:1rem;">
                <div>
                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Nom *</label>
                    <input type="text" id="new_nom" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Niveau *</label>
                        <select id="new_niveau" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                            <option value="A1">A1</option>
                            <option value="A2">A2</option>
                            <option value="B1">B1</option>
                            <option value="B2">B2</option>
                            <option value="C1">C1</option>
                            <option value="C2">C2</option>
                        </select>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Langue *</label>
                        <select id="new_langue" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                            <option value="Anglais">🇬🇧 Anglais</option>
                            <option value="Français">🇫🇷 Français</option>
                            <option value="Allemand">🇩🇪 Allemand</option>
                            <option value="Espagnol">🇪🇸 Espagnol</option>
                            <option value="Italien">🇮🇹 Italien</option>
                        </select>
                    </div>
                </div>

                <div>
                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Professeur *</label>
                    <select id="new_enseignant" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                        ${options}
                    </select>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Salle</label>
                        <input type="text" id="new_salle" placeholder="Salle 101" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Capacité *</label>
                        <input type="number" id="new_capacite" value="15" min="1" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                    </div>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Tarif (DA) *</label>
                        <input type="number" id="new_tarif" placeholder="8000" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Date début *</label>
                        <input type="date" id="new_date_debut" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                    </div>
                </div>

                <div style="display:flex;gap:1rem;margin-top:1rem;">
                    <button onclick="document.getElementById('modal-groupe').remove()" style="flex:1;padding:0.875rem;border:2px solid #475569 !important;background:#334155 !important;color:#ffffff !important;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.9rem;">
                        Annuler
                    </button>
                    <button id="btnCreate" style="flex:1;padding:0.875rem;background:#6366f1 !important;color:#ffffff !important;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.9rem;">
                        <i class="fas fa-save"></i> Créer
                    </button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);

    // Handle create
    document.getElementById('btnCreate').onclick = async () => {
        const btn = document.getElementById('btnCreate');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';
        btn.disabled = true;

        const payload = {
            nom_groupe: document.getElementById('new_nom').value,
            niveau: document.getElementById('new_niveau').value,
            langue: document.getElementById('new_langue').value,
            enseignant: parseInt(document.getElementById('new_enseignant').value),
            salle: document.getElementById('new_salle').value,
            capacite_max: parseInt(document.getElementById('new_capacite').value),
            tarif_mensuel: parseFloat(document.getElementById('new_tarif').value),
            date_debut: document.getElementById('new_date_debut').value,
            statut_groupe: 'Actif'
        };

        console.log('Creating group with payload:', payload);

        // Validation
        if (!payload.nom_groupe || !payload.enseignant || !payload.tarif_mensuel || !payload.date_debut) {
            showToast('Remplissez tous les champs obligatoires (*)', 'warning');
            btn.innerHTML = '<i class="fas fa-save"></i> Créer';
            btn.disabled = false;
            return;
        }

        const result = await apiFetch('/groupes/', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        if (result?.error) {
            showToast('Erreur: ' + result.message, 'error');
            btn.innerHTML = '<i class="fas fa-save"></i> Créer';
            btn.disabled = false;
            return;
        }

        console.log('Created group:', result);
        
        document.getElementById('modal-groupe').remove();
        
        state.groupes.push(result);
        renderGroupes();
        
        showToast('Groupe créé avec succès !', 'success');
    };
}

// ============================================================
// MODAL DETAILS - FIXED DARK THEME
// ============================================================
async function openModalDetails(groupeId) {
    const g = state.groupes.find(x => x.id === groupeId);
    if (!g) return;

    const modal = document.createElement('div');
    modal.id = 'modal-details';
    modal.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:2000;
        display:flex; align-items:center; justify-content:center;`;

    // DARK THEME MODAL
    modal.innerHTML = `
        <div style="background:#0f172a !important;border:2px solid #6366f1 !important;border-radius:16px;padding:2rem;width:90%;max-width:450px;color:#ffffff !important;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="margin:0;font-size:1.3rem;color:#ffffff !important;">${g.nom_groupe}</h3>
                <button onclick="document.getElementById('modal-details').remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#ffffff !important;">&times;</button>
            </div>
            
            <div style="display:grid;gap:0.75rem;margin-bottom:1.5rem;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1rem;background:#1e293b !important;border:1px solid #475569 !important;border-radius:8px;">
                    <span style="color:#94a3b8 !important;font-size:0.875rem;">Niveau</span>
                    <strong style="color:#ffffff !important;">${g.niveau || 'N/A'}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1rem;background:#1e293b !important;border:1px solid #475569 !important;border-radius:8px;">
                    <span style="color:#94a3b8 !important;font-size:0.875rem;">Langue</span>
                    <strong style="color:#ffffff !important;">${langueFlag(g.langue)} ${g.langue || 'Non défini'}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1rem;background:#1e293b !important;border:1px solid #475569 !important;border-radius:8px;">
                    <span style="color:#94a3b8 !important;font-size:0.875rem;">Professeur</span>
                    <strong style="color:#ffffff !important;">${g.enseignant_nom || 'Non assigné'}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1rem;background:#1e293b !important;border:1px solid #475569 !important;border-radius:8px;">
                    <span style="color:#94a3b8 !important;font-size:0.875rem;">Salle</span>
                    <strong style="color:#ffffff !important;">${g.salle || 'Non définie'}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1rem;background:#1e293b !important;border:1px solid #475569 !important;border-radius:8px;">
                    <span style="color:#94a3b8 !important;font-size:0.875rem;">Étudiants</span>
                    <strong style="color:#ffffff !important;">${g.nombre_etudiants || 0} / ${g.capacite_max || 15}</strong>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0.75rem 1rem;background:#1e293b !important;border:1px solid #475569 !important;border-radius:8px;">
                    <span style="color:#94a3b8 !important;font-size:0.875rem;">Prix</span>
                    <strong style="color:#ffffff !important;">${formatPrice(g.tarif_mensuel)} DA/mois</strong>
                </div>
            </div>
            
            <div style="display:flex;gap:0.75rem;">
                <button onclick="document.getElementById('modal-details').remove()" style="flex:1;padding:0.75rem;border:2px solid #475569 !important;background:#334155 !important;color:#ffffff !important;border-radius:8px;cursor:pointer;font-weight:600;">
                    Fermer
                </button>
                <button onclick="document.getElementById('modal-details').remove(); openModalModifier(${groupeId})" style="flex:1;padding:0.75rem;background:#3b82f6 !important;color:#ffffff !important;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                    <i class="fas fa-edit"></i> Modifier
                </button>
                <button onclick="supprimerGroupe(${groupeId})" style="flex:1;padding:0.75rem;background:#ef4444 !important;color:#ffffff !important;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                    <i class="fas fa-trash"></i> Supprimer
                </button>
            </div>
        </div>`;

    document.body.appendChild(modal);
}

// ============================================================
// MODAL MODIFIER - FIXED DARK THEME
// ============================================================
async function openModalModifier(groupeId) {
    const g = state.groupes.find(x => x.id === groupeId);
    if (!g) return;

    let options = '<option value="">-- Sélectionner --</option>';
    state.enseignants.forEach(e => {
        const nom = e.nom_complet || `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.trim() || `Prof #${e.id}`;
        const selected = e.id === g.enseignant ? 'selected' : '';
        options += `<option value="${e.id}" ${selected}>${nom}</option>`;
    });

    const modal = document.createElement('div');
    modal.id = 'modal-modifier';
    modal.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:2000;
        display:flex; align-items:center; justify-content:center;`;

    // DARK THEME MODAL
    modal.innerHTML = `
        <div style="background:#0f172a !important;border:2px solid #6366f1 !important;border-radius:16px;padding:2rem;width:90%;max-width:500px;max-height:90vh;overflow-y:auto;color:#ffffff !important;box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);" onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.25rem;">
                <h3 style="margin:0;font-size:1.2rem;color:#ffffff !important;">
                    <i class="fas fa-edit" style="color:#3b82f6;margin-right:8px;"></i>Modifier Groupe
                </h3>
                <button onclick="document.getElementById('modal-modifier').remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#ffffff !important;">&times;</button>
            </div>
            
            <div style="display:grid;gap:1rem;">
                <div>
                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Nom</label>
                    <input type="text" id="mod_nom" value="${g.nom_groupe}" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                </div>
                
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Niveau</label>
                        <select id="mod_niveau" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                            ${['A1','A2','B1','B2','C1','C2'].map(n => `<option value="${n}" ${g.niveau===n?'selected':''}>${n}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Langue</label>
                        <select id="mod_langue" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                            ${['Anglais','Français','Allemand','Espagnol','Italien'].map(l => `<option value="${l}" ${g.langue===l?'selected':''}>${l}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div>
                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Professeur</label>
                    <select id="mod_enseignant" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                        ${options}
                    </select>
                </div>

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Salle</label>
                        <input type="text" id="mod_salle" value="${g.salle || ''}" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Capacité</label>
                        <input type="number" id="mod_capacite" value="${g.capacite_max}" min="1" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                    </div>
                </div>

                <div>
                    <label style="display:block;margin-bottom:0.5rem;font-weight:600;color:#ffffff !important;">Tarif (DA)</label>
                    <input type="number" id="mod_tarif" value="${g.tarif_mensuel}" style="width:100%;padding:0.75rem;border:2px solid #475569 !important;border-radius:8px;background:#1e293b !important;color:#ffffff !important;font-size:0.9rem;">
                </div>
                
                <div style="display:flex;gap:0.75rem;margin-top:1rem;">
                    <button onclick="document.getElementById('modal-modifier').remove()" style="flex:1;padding:0.875rem;border:2px solid #475569 !important;background:#334155 !important;color:#ffffff !important;border-radius:8px;cursor:pointer;font-weight:600;">
                        Annuler
                    </button>
                    <button id="btnSave" style="flex:1;padding:0.875rem;background:#3b82f6 !important;color:#ffffff !important;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                        <i class="fas fa-save"></i> Enregistrer
                    </button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);

    document.getElementById('btnSave').onclick = async () => {
        const btn = document.getElementById('btnSave');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enregistrement...';
        btn.disabled = true;

        const payload = {
            nom_groupe: document.getElementById('mod_nom').value,
            niveau: document.getElementById('mod_niveau').value,
            langue: document.getElementById('mod_langue').value,
            enseignant: parseInt(document.getElementById('mod_enseignant').value),
            salle: document.getElementById('mod_salle').value,
            capacite_max: parseInt(document.getElementById('mod_capacite').value),
            tarif_mensuel: parseFloat(document.getElementById('mod_tarif').value),
        };

        const result = await apiFetch(`/groupes/${groupeId}/`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });

        if (result?.error) {
            showToast('Erreur: ' + result.message, 'error');
            btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer';
            btn.disabled = false;
            return;
        }

        const idx = state.groupes.findIndex(x => x.id === groupeId);
        if (idx !== -1) state.groupes[idx] = result;

        document.getElementById('modal-modifier').remove();
        renderGroupes();
        showToast('Groupe modifié !', 'success');
    };
}

// SUPPRIMER
async function supprimerGroupe(groupeId) {
    if (!confirm('Supprimer ce groupe ?')) return;
    
    const result = await apiFetch(`/groupes/${groupeId}/`, { method: 'DELETE' });
    if (result?.error) {
        showToast('Erreur: ' + result.message, 'error');
        return;
    }
    
    state.groupes = state.groupes.filter(g => g.id !== groupeId);
    
    // Close any open modals
    document.getElementById('modal-details')?.remove();
    document.getElementById('modal-modifier')?.remove();
    
    renderGroupes();
    showToast('Groupe supprimé', 'success');
}

// INIT
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Page loaded, initializing...');
    
    const user = checkSession();
    if (!user) return;

    // Setup button
    const btn = document.querySelector('.btn-primary');
    if (btn) {
        btn.addEventListener('click', openModalNouveau);
        console.log('Button event attached');
    } else {
        console.error('Button .btn-primary not found!');
    }

    // Load data
    await loadEnseignants();
    await loadGroupes();
});