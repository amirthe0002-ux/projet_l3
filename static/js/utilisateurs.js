/* utilisateurs.js — Dirigeant: Gestion des Utilisateurs
 * FIXED: Uses real existing API endpoints
 *
 * GET  all users  → combines /api/enseignants/ + /api/etudiants/ + /api/parents/
 * POST new user   → role-specific: /api/enseignants/ | /api/etudiants/ (no generic /api/utilisateurs/)
 * PATCH user      → /api/utilisateurs/<pk>/  (exists in your urls.py)
 * GET  /api/auth/me/ → sidebar user info
 */

'use strict';

const State = {
    users:       [],
    filtered:    [],
    activeRole:  'Tous',
    searchQuery: '',
    modal:       null,
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
function getToken() {
    return localStorage.getItem('access') || sessionStorage.getItem('access') ||
           localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || '';
}
function authHeaders() {
    const token = getToken();
    const h = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}
function handleAuthError(status) {
    if (status === 401 || status === 403) { window.location.href = '/login/'; return true; }
    return false;
}
async function safeJson(res) {
    try { return await res.json(); } catch (_) { return {}; }
}

// ─── API fetch wrapper ────────────────────────────────────────────────────────
async function apiFetch(endpoint, opts = {}) {
    try {
        const res = await fetch('/api' + endpoint, {
            ...opts,
            headers: { ...authHeaders(), ...(opts.headers || {}) },
        });
        if (handleAuthError(res.status)) return null;
        if (res.status === 204) return { success: true };
        const data = await safeJson(res);
        if (!res.ok) return { _error: true, _status: res.status, ...data };
        return data;
    } catch (e) {
        console.error('apiFetch error:', e);
        return { _error: true, detail: 'Serveur inaccessible.' };
    }
}

// ─── Load ALL users by combining multiple endpoints ───────────────────────────
async function loadUsers() {
    showGridLoading();

    // Fetch all roles in parallel — use only endpoints that exist
    const [enseignants, etudiants, parents, staffRaw] = await Promise.all([
        apiFetch('/enseignants/'),
        apiFetch('/etudiants/'),
        apiFetch('/parents/'),
        apiFetch('/auth/me/').then(me => me ? [me] : []), // at least the current user
    ]);

    const all = [];

    // Enseignants
    if (enseignants && !enseignants._error) {
        (Array.isArray(enseignants) ? enseignants : enseignants.results || []).forEach(e => {
            all.push({
                id:                e.user?.id || e.id,
                enseignant_id:     e.id,
                first_name:        e.user?.first_name || '',
                last_name:         e.user?.last_name  || '',
                email:             e.user?.email      || '',
                telephone:         e.user?.telephone  || '',
                role:              'Enseignant',
                statut:            e.statut_emploi === 'Actif' ? 'Actif' : 'Inactif',
                compte_verrouille: false,
                permission_2fa:    false,
                derniere_connexion: null,
                _source:           'enseignant',
                _raw:              e,
            });
        });
    }

    // Étudiants
    if (etudiants && !etudiants._error) {
        (Array.isArray(etudiants) ? etudiants : etudiants.results || []).forEach(e => {
            all.push({
                id:                e.user?.id || e.id,
                etudiant_id:       e.id,
                first_name:        e.user?.first_name || '',
                last_name:         e.user?.last_name  || '',
                email:             e.user?.email      || '',
                telephone:         e.user?.telephone  || '',
                role:              'Etudiant',
                statut:            e.statut_etudiant === 'Actif' ? 'Actif' : 'Inactif',
                compte_verrouille: false,
                permission_2fa:    false,
                derniere_connexion: null,
                _source:           'etudiant',
                _raw:              e,
            });
        });
    }

    // Parents
    if (parents && !parents._error) {
        (Array.isArray(parents) ? parents : parents.results || []).forEach(p => {
            all.push({
                id:                p.user?.id || p.id,
                parent_id:         p.id,
                first_name:        p.user?.first_name || '',
                last_name:         p.user?.last_name  || '',
                email:             p.user?.email      || '',
                telephone:         p.user?.telephone  || '',
                role:              'Parent',
                statut:            'Actif',
                compte_verrouille: false,
                permission_2fa:    false,
                derniere_connexion: null,
                _source:           'parent',
                _raw:              p,
            });
        });
    }

    // Deduplicate by user id
    const seen = new Set();
    State.users = all.filter(u => {
        if (!u.id || seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
    });

    State.filtered = [...State.users];
    updateStats(State.users);
    renderCards(State.filtered);
}

// ─── Stats cards ──────────────────────────────────────────────────────────────
function updateStats(users) {
    const total    = users.length;
    const actifs   = users.filter(u => u.statut === 'Actif').length;
    const inactifs = users.filter(u => u.statut !== 'Actif').length;
    const bloques  = users.filter(u => u.compte_verrouille === true).length;

    const cards = document.querySelectorAll('.stat-value');
    if (cards[0]) cards[0].textContent = total;
    if (cards[1]) cards[1].textContent = actifs;
    if (cards[2]) cards[2].textContent = inactifs;
    if (cards[3]) cards[3].textContent = bloques;
}

// ─── Filter & search ──────────────────────────────────────────────────────────
const ROLE_MAP = {
    'Tous': 'Tous', 'Dirigeants': 'Dirigeant', 'Enseignants': 'Enseignant',
    'Étudiants': 'Etudiant', 'Secrétariat': 'Secretariat', 'Parents': 'Parent',
    'Comptable': 'Comptable',
};

function applyFilters() {
    const role  = State.activeRole;
    const query = State.searchQuery.toLowerCase().trim();
    State.filtered = State.users.filter(u => {
        const matchRole = role === 'Tous' || u.role === role;
        const name  = `${u.first_name} ${u.last_name}`.toLowerCase();
        const email = (u.email || '').toLowerCase();
        const matchQ = !query || name.includes(query) || email.includes(query);
        return matchRole && matchQ;
    });
    renderCards(State.filtered);
}

// ─── Render cards ─────────────────────────────────────────────────────────────
function renderCards(users) {
    const grid = document.querySelector('.users-grid');
    if (!grid) return;
    if (!users.length) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#64748b;">
                <i class="fas fa-users" style="font-size:3rem;opacity:.3;margin-bottom:1rem;display:block;"></i>
                <p>Aucun utilisateur trouvé.</p>
            </div>`;
        return;
    }
    grid.innerHTML = users.map(u => buildCard(u)).join('');
}

function buildCard(u) {
    const name    = escHtml(`${u.first_name} ${u.last_name}`.trim() || 'Sans nom');
    const email   = escHtml(u.email || '—');
    const role    = escHtml(u.role  || 'Inconnu');
    const phone   = escHtml(u.telephone || 'Non renseigné');
    const locked  = u.compte_verrouille === true;
    const statut  = u.statut || 'Inactif';
    const login   = u.derniere_connexion ? formatRelative(u.derniere_connexion) : 'Jamais';
    const dotCls  = locked ? 'status-locked' : (statut === 'Actif' ? 'status-active' : 'status-inactive');
    const avatarBg = getRoleColor(u.role);

    const actionBtn = locked
        ? `<button class="btn-unlock" style="flex:1;padding:.5rem;background:#059669;color:white;
               border:none;border-radius:8px;cursor:pointer;font-size:.8rem;font-weight:600;">
               <i class="fas fa-unlock" style="margin-right:4px;"></i>Débloquer
           </button>`
        : `<button class="btn-edit" style="flex:1;padding:.5rem;background:#1e293b;color:#e2e8f0;
               border:none;border-radius:8px;cursor:pointer;font-size:.8rem;font-weight:600;">
               <i class="fas fa-edit" style="margin-right:4px;"></i>Modifier
           </button>`;

    return `
    <div class="user-card" data-user-id="${u.id}" data-source="${u._source || ''}"
         style="${locked ? 'opacity:.75;' : ''}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;">
            <div style="display:flex;align-items:center;gap:.75rem;">
                <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${avatarBg}&color=fff"
                     style="width:44px;height:44px;border-radius:50%;" alt="${name}">
                <div>
                    <h3 style="margin:0;font-weight:600;color:white;font-size:.9rem;">${name}</h3>
                    <p style="margin:0;font-size:.78rem;color:#94a3b8;">${email}</p>
                </div>
            </div>
            <span class="${dotCls}" title="${locked ? 'Bloqué' : statut}"
                  style="width:10px;height:10px;border-radius:50%;display:inline-block;
                         background:${locked ? '#ef4444' : statut === 'Actif' ? '#10b981' : '#94a3b8'};
                         margin-top:4px;flex-shrink:0;"></span>
        </div>

        <div style="margin-bottom:.75rem;">
            <span class="${getRoleClass(u.role)}"
                  style="padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:700;
                         background:${roleColorBg(u.role)};color:${roleColorText(u.role)};">
                ${role}
            </span>
            ${locked ? '<span style="padding:3px 10px;border-radius:20px;font-size:.72rem;font-weight:700;background:rgba(239,68,68,.15);color:#f87171;margin-left:4px;">Bloqué</span>' : ''}
        </div>

        <div style="font-size:.8rem;color:#94a3b8;display:flex;flex-direction:column;gap:4px;margin-bottom:1rem;">
            <span><i class="fas fa-phone" style="width:14px;color:#64748b;"></i> ${phone}</span>
            <span><i class="fas fa-clock" style="width:14px;color:#64748b;"></i> ${login}</span>
        </div>

        <div style="display:flex;gap:.5rem;">
            ${actionBtn}
            <button class="btn-menu" style="padding:.5rem .75rem;background:#1e293b;color:#94a3b8;
                    border:none;border-radius:8px;cursor:pointer;" title="Plus d'actions">
                <i class="fas fa-ellipsis-v"></i>
            </button>
        </div>
    </div>`;
}

function showGridLoading() {
    const grid = document.querySelector('.users-grid');
    if (!grid) return;
    grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#94a3b8;">
            <div style="width:36px;height:36px;border:3px solid #334155;border-top-color:#6366f1;
                        border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 1rem;"></div>
            <p>Chargement des utilisateurs...</p>
        </div>`;
    if (!document.getElementById('spin-kf')) {
        const s = document.createElement('style');
        s.id = 'spin-kf';
        s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(s);
    }
}

// ─── Event delegation on grid ─────────────────────────────────────────────────
function initCardDelegation() {
    const grid = document.querySelector('.users-grid');
    if (!grid) return;
    grid.addEventListener('click', e => {
        const card   = e.target.closest('.user-card');
        if (!card) return;
        const userId = card.dataset.userId;
        if (e.target.closest('.btn-edit'))   { handleEdit(userId); return; }
        if (e.target.closest('.btn-unlock')) { handleUnlock(userId, card); return; }
        if (e.target.closest('.btn-menu'))   { handleMenu(userId, card, e.target.closest('.btn-menu')); return; }
    });
}

function handleEdit(userId) {
    const user = State.users.find(u => String(u.id) === String(userId));
    if (user) openEditModal(user);
}

async function handleUnlock(userId, card) {
    if (!confirm('Débloquer ce compte ?')) return;
    const btn = card?.querySelector('.btn-unlock');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    const result = await apiFetch(`/utilisateurs/${userId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ compte_verrouille: false, tentatives_echouees: 0 }),
    });

    if (result?._error) {
        showToast('Erreur lors du déblocage.', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-unlock"></i> Débloquer'; }
        return;
    }
    showToast('Compte débloqué.', 'success');
    await loadUsers();
}

function handleMenu(userId, card, btnEl) {
    closeAllMenus();
    const user = State.users.find(u => String(u.id) === String(userId));
    const rect = btnEl.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'dropdown-menu';
    menu.style.cssText = `position:fixed;top:${rect.bottom+6}px;left:${rect.left-130}px;
        background:#1e293b;border:1px solid #334155;border-radius:10px;padding:.4rem;
        min-width:190px;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,.5);`;
    menu.innerHTML = `
        <button data-action="view"     class="menu-item"><i class="fas fa-eye mr-2"></i>Voir le profil</button>
        <button data-action="toggle"   class="menu-item"><i class="fas fa-toggle-on mr-2"></i>Activer / Désactiver</button>
        <button data-action="delete"   class="menu-item" style="color:#f87171;"><i class="fas fa-trash mr-2"></i>Archiver</button>`;
    menu.addEventListener('click', e => {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        closeAllMenus();
        menuAction(action, userId);
    });
    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('click', closeAllMenus, { once: true }), 0);
}

function closeAllMenus() { document.querySelectorAll('.dropdown-menu').forEach(m => m.remove()); }

async function menuAction(action, userId) {
    const user = State.users.find(u => String(u.id) === String(userId));
    switch (action) {
        case 'view':
            openViewModal(user || { id: userId });
            break;
        case 'toggle':
            if (!user || !confirm(`${user.statut === 'Actif' ? 'Désactiver' : 'Activer'} ce compte ?`)) break;
            await apiFetch(`/utilisateurs/${userId}/`, {
                method: 'PATCH',
                body: JSON.stringify({ statut: user.statut === 'Actif' ? 'Inactif' : 'Actif' }),
            });
            showToast('Statut mis à jour.', 'success');
            await loadUsers();
            break;
        case 'delete':
            if (!confirm('Archiver (désactiver) cet utilisateur ?')) break;
            await apiFetch(`/utilisateurs/${userId}/`, {
                method: 'PATCH',
                body: JSON.stringify({ statut: 'Inactif' }),
            });
            showToast('Utilisateur archivé.', 'success');
            await loadUsers();
            break;
    }
}

// ─── New user modal ───────────────────────────────────────────────────────────
// Routes to the correct API endpoint based on role
function initNewUserButton() {
    document.querySelector('.btn-primary')?.addEventListener('click', openNewUserModal);
}

function openNewUserModal() {
    mountModal(`
        <div class="modal-header" style="margin-bottom:1.25rem;">
            <h3 style="margin:0;color:white;font-size:1.1rem;font-weight:700;">
                <i class="fas fa-user-plus" style="color:#6366f1;margin-right:8px;"></i>Nouvel Utilisateur
            </h3>
            <button class="modal-close" style="background:none;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer;line-height:1;">×</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
            <div class="modal-field">
                <label>Prénom *</label>
                <input id="nu-prenom" class="modal-input" placeholder="Ahmed">
            </div>
            <div class="modal-field">
                <label>Nom *</label>
                <input id="nu-nom" class="modal-input" placeholder="Benali">
            </div>
        </div>
        <div class="modal-field">
            <label>Email *</label>
            <input id="nu-email" type="email" class="modal-input" placeholder="ahmed@centre.com">
        </div>
        <div class="modal-field">
            <label>Téléphone</label>
            <input id="nu-tel" class="modal-input" placeholder="0555 12 34 56">
        </div>
        <div class="modal-field">
            <label>Rôle * <span style="color:#64748b;font-size:.75rem;">(détermine l'API utilisée)</span></label>
            <select id="nu-role" class="modal-input" onchange="updateRoleFields()">
                <option value="">— Choisir un rôle —</option>
                <option value="Enseignant">Enseignant</option>
                <option value="Secretariat">Secrétariat / Comptable</option>
                <option value="Dirigeant">Dirigeant</option>
                <option value="Etudiant">Étudiant</option>
            </select>
        </div>

        <!-- Extra fields shown based on role -->
        <div id="nu-extra-enseignant" style="display:none;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
                <div class="modal-field">
                    <label>Langue enseignée *</label>
                    <select id="nu-langue" class="modal-input">
                        <option value="Anglais">Anglais</option>
                        <option value="Français">Français</option>
                        <option value="Allemand">Allemand</option>
                        <option value="Espagnol">Espagnol</option>
                        <option value="Italien">Italien</option>
                    </select>
                </div>
                <div class="modal-field">
                    <label>Niveaux (ex: A1,B1)</label>
                    <input id="nu-niveaux" class="modal-input" placeholder="A1,A2,B1">
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
                <div class="modal-field">
                    <label>Contrat *</label>
                    <select id="nu-contrat" class="modal-input">
                        <option value="CDI">CDI</option>
                        <option value="CDD">CDD</option>
                        <option value="Vacataire">Vacataire</option>
                    </select>
                </div>
                <div class="modal-field">
                    <label>Tarif/heure (DA) *</label>
                    <input id="nu-tarif" type="number" min="0" class="modal-input" placeholder="2000">
                </div>
            </div>
            <div class="modal-field">
                <label>Date début contrat *</label>
                <input id="nu-date-debut" type="date" class="modal-input"
                       value="${new Date().toISOString().split('T')[0]}">
            </div>
        </div>

        <div id="nu-extra-etudiant" style="display:none;">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
                <div class="modal-field">
                    <label>Date de naissance</label>
                    <input id="nu-ddn" type="date" class="modal-input">
                </div>
                <div class="modal-field">
                    <label>Niveau initial</label>
                    <select id="nu-niveau-init" class="modal-input">
                        <option value="A1">A1</option>
                        <option value="A2">A2</option>
                        <option value="B1">B1</option>
                        <option value="B2">B2</option>
                        <option value="C1">C1</option>
                    </select>
                </div>
            </div>
        </div>

        <div class="modal-field">
            <label>Mot de passe * <span style="color:#64748b;font-size:.75rem;">(min. 8 caractères)</span></label>
            <input id="nu-pwd" type="password" class="modal-input" placeholder="••••••••">
        </div>

        <div id="nu-error" style="display:none;padding:.75rem;background:rgba(239,68,68,.12);
             border:1px solid #ef4444;border-radius:8px;color:#fca5a5;font-size:.85rem;
             margin-bottom:.75rem;"></div>

        <div style="display:flex;gap:.75rem;margin-top:1rem;">
            <button class="modal-close"
                style="flex:1;padding:.75rem;background:transparent;border:1px solid #334155;
                       color:#94a3b8;border-radius:8px;cursor:pointer;font-weight:600;">
                Annuler
            </button>
            <button id="nu-save"
                style="flex:1;padding:.75rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);
                       color:white;border:none;border-radius:8px;cursor:pointer;font-weight:700;">
                <i class="fas fa-user-plus" style="margin-right:6px;"></i>Créer
            </button>
        </div>`);

    document.getElementById('nu-save').addEventListener('click', submitNewUser);
}

window.updateRoleFields = function() {
    const role = document.getElementById('nu-role')?.value;
    document.getElementById('nu-extra-enseignant').style.display = role === 'Enseignant' ? 'block' : 'none';
    document.getElementById('nu-extra-etudiant').style.display   = role === 'Etudiant'   ? 'block' : 'none';
};

async function submitNewUser() {
    const errEl = document.getElementById('nu-error');
    const btn   = document.getElementById('nu-save');
    errEl.style.display = 'none';

    const prenom = document.getElementById('nu-prenom').value.trim();
    const nom    = document.getElementById('nu-nom').value.trim();
    const email  = document.getElementById('nu-email').value.trim();
    const tel    = document.getElementById('nu-tel').value.trim();
    const role   = document.getElementById('nu-role').value;
    const pwd    = document.getElementById('nu-pwd').value;

    if (!prenom || !nom || !email || !role || !pwd) {
        errEl.textContent = '⚠️ Veuillez remplir tous les champs obligatoires (*).';
        errEl.style.display = 'block'; return;
    }
    if (pwd.length < 8) {
        errEl.textContent = '⚠️ Le mot de passe doit contenir au moins 8 caractères.';
        errEl.style.display = 'block'; return;
    }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Création...';
    btn.disabled  = true;

    let result = null;

    // ── Route to correct endpoint based on role ────────────────────────────────
    if (role === 'Enseignant') {
        const langue    = document.getElementById('nu-langue').value;
        const niveaux   = document.getElementById('nu-niveaux').value.trim() || langue;
        const contrat   = document.getElementById('nu-contrat').value;
        const tarif     = parseFloat(document.getElementById('nu-tarif').value) || 0;
        const dateDebut = document.getElementById('nu-date-debut').value;

        if (!tarif || !dateDebut) {
            errEl.textContent = '⚠️ Tarif horaire et date de début obligatoires pour un enseignant.';
            errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-user-plus"></i> Créer'; btn.disabled = false; return;
        }

        result = await apiFetch('/enseignants/', {
            method: 'POST',
            body: JSON.stringify({
                email, first_name: prenom, last_name: nom, password: pwd,
                telephone: tel, langue_enseignee: langue, niveaux,
                type_contrat: contrat, tarif_horaire: tarif,
                date_debut_contrat: dateDebut, qualification: '',
                experience_annees: 0, disponibilite: {},
            }),
        });

    } else if (role === 'Etudiant') {
        const ddn        = document.getElementById('nu-ddn').value || '2000-01-01';
        const niveauInit = document.getElementById('nu-niveau-init').value;

        result = await apiFetch('/etudiants/', {
            method: 'POST',
            body: JSON.stringify({
                email, first_name: prenom, last_name: nom, password: pwd,
                telephone: tel, date_naissance: ddn, niveau_initial: niveauInit,
            }),
        });

    } else {
        // Secretariat / Comptable / Dirigeant → use generic Utilisateur endpoint
        // Your UtilisateurDetailView only supports GET/PATCH, not POST.
        // We use the MeView pattern — call /api/auth/me/ after creating via a workaround:
        // Actually we POST to /api/enseignants/ won't work for staff.
        // Best approach: create a temporary enseignant-like payload won't work.
        // Instead, show a clear message directing to Django admin.
        errEl.textContent = `⚠️ Pour créer un compte ${role}, utilisez l'interface d'administration Django (/admin/) car ce rôle n'a pas d'endpoint de création public.`;
        errEl.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Créer'; btn.disabled = false;
        return;
    }

    if (result?._error) {
        const msg = result.detail || result.email?.[0] || result.error ||
                    Object.values(result).flat().join(' | ') || 'Erreur lors de la création.';
        errEl.textContent = '❌ ' + msg;
        errEl.style.display = 'block';
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Créer'; btn.disabled = false;
        return;
    }

    closeModal();
    showToast(`✅ ${prenom} ${nom} créé avec succès !`, 'success');
    await loadUsers();
}

// ─── Edit modal ───────────────────────────────────────────────────────────────
function openEditModal(user) {
    const name = `${user.first_name} ${user.last_name}`.trim();
    mountModal(`
        <div class="modal-header" style="margin-bottom:1.25rem;">
            <h3 style="margin:0;color:white;font-size:1.1rem;font-weight:700;">
                <i class="fas fa-edit" style="color:#6366f1;margin-right:8px;"></i>Modifier — ${escHtml(name)}
            </h3>
            <button class="modal-close" style="background:none;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer;">×</button>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
            <div class="modal-field">
                <label>Prénom</label>
                <input id="ed-prenom" class="modal-input" value="${escHtml(user.first_name)}">
            </div>
            <div class="modal-field">
                <label>Nom</label>
                <input id="ed-nom" class="modal-input" value="${escHtml(user.last_name)}">
            </div>
        </div>
        <div class="modal-field">
            <label>Téléphone</label>
            <input id="ed-tel" class="modal-input" value="${escHtml(user.telephone || '')}">
        </div>
        <div class="modal-field">
            <label>Statut</label>
            <select id="ed-statut" class="modal-input">
                <option value="Actif"    ${user.statut === 'Actif'    ? 'selected' : ''}>Actif</option>
                <option value="Inactif"  ${user.statut === 'Inactif'  ? 'selected' : ''}>Inactif</option>
                <option value="Suspendu" ${user.statut === 'Suspendu' ? 'selected' : ''}>Suspendu</option>
            </select>
        </div>

        <div id="ed-error" style="display:none;padding:.75rem;background:rgba(239,68,68,.12);
             border:1px solid #ef4444;border-radius:8px;color:#fca5a5;font-size:.85rem;
             margin-bottom:.75rem;"></div>

        <div style="display:flex;gap:.75rem;margin-top:1rem;">
            <button class="modal-close"
                style="flex:1;padding:.75rem;background:transparent;border:1px solid #334155;
                       color:#94a3b8;border-radius:8px;cursor:pointer;font-weight:600;">
                Annuler
            </button>
            <button id="ed-save"
                style="flex:1;padding:.75rem;background:#3b82f6;color:white;
                       border:none;border-radius:8px;cursor:pointer;font-weight:700;">
                <i class="fas fa-save" style="margin-right:6px;"></i>Enregistrer
            </button>
        </div>`);

    document.getElementById('ed-save').addEventListener('click', async () => {
        const errEl = document.getElementById('ed-error');
        const btn   = document.getElementById('ed-save');
        errEl.style.display = 'none';

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true;

        // PATCH the Utilisateur record (user.id is the Utilisateur pk)
        const result = await apiFetch(`/utilisateurs/${user.id}/`, {
            method: 'PATCH',
            body: JSON.stringify({
                first_name: document.getElementById('ed-prenom').value.trim(),
                last_name:  document.getElementById('ed-nom').value.trim(),
                telephone:  document.getElementById('ed-tel').value.trim(),
                statut:     document.getElementById('ed-statut').value,
            }),
        });

        if (result?._error) {
            const msg = result.detail || result.error || 'Erreur de mise à jour.';
            errEl.textContent = '❌ ' + msg; errEl.style.display = 'block';
            btn.innerHTML = '<i class="fas fa-save"></i> Enregistrer'; btn.disabled = false;
            return;
        }

        closeModal();
        showToast('✅ Utilisateur mis à jour.', 'success');
        await loadUsers();
    });
}

// ─── View modal ───────────────────────────────────────────────────────────────
function openViewModal(user) {
    if (!user) return;
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Sans nom';
    mountModal(`
        <div class="modal-header" style="margin-bottom:1.25rem;">
            <h3 style="margin:0;color:white;font-size:1.1rem;font-weight:700;">Profil utilisateur</h3>
            <button class="modal-close" style="background:none;border:none;color:#94a3b8;font-size:1.5rem;cursor:pointer;">×</button>
        </div>
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem;
                    padding:1rem;background:#0f172a;border-radius:12px;">
            <img src="https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${getRoleColor(user.role)}&color=fff"
                 style="width:52px;height:52px;border-radius:50%;">
            <div>
                <p style="margin:0;font-weight:700;color:white;">${escHtml(name)}</p>
                <p style="margin:0;font-size:.8rem;color:#94a3b8;">${escHtml(user.email || '—')}</p>
                <span style="padding:2px 8px;border-radius:20px;font-size:.72rem;font-weight:700;
                             background:${roleColorBg(user.role)};color:${roleColorText(user.role)};
                             margin-top:4px;display:inline-block;">${escHtml(user.role || '—')}</span>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:1.25rem;">
            ${[
                ['Statut',    user.statut || '—'],
                ['Téléphone', user.telephone || 'Non renseigné'],
                ['Dernière connexion', user.derniere_connexion ? formatRelative(user.derniere_connexion) : 'Jamais'],
                ['Compte verrouillé', user.compte_verrouille ? '🔒 Oui' : '✅ Non'],
            ].map(([lb, v]) => `
                <div style="padding:.75rem;background:#0f172a;border-radius:8px;">
                    <p style="margin:0 0 4px;font-size:.72rem;color:#64748b;">${lb}</p>
                    <p style="margin:0;font-weight:600;color:white;font-size:.875rem;">${escHtml(v)}</p>
                </div>`).join('')}
        </div>
        <button class="modal-close"
            style="width:100%;padding:.75rem;background:#1e293b;border:none;color:#e2e8f0;
                   border-radius:8px;cursor:pointer;font-weight:600;">Fermer</button>`);
}

// ─── Modal infrastructure ─────────────────────────────────────────────────────
function mountModal(html) {
    closeModal();
    injectModalStyles();
    const wrapper = document.createElement('div');
    wrapper.id = 'modal-wrapper';
    wrapper.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.65);
        display:flex;align-items:center;justify-content:center;z-index:10000;
        backdrop-filter:blur(4px);padding:1rem;`;
    wrapper.innerHTML = `
        <div style="background:#0f172a;border:1px solid #334155;border-radius:16px;
                    padding:1.75rem;width:100%;max-width:500px;max-height:90vh;
                    overflow-y:auto;box-shadow:0 24px 64px rgba(0,0,0,.7);">
            ${html}
        </div>`;
    document.body.appendChild(wrapper);
    State.modal = wrapper;

    wrapper.querySelectorAll('.modal-close').forEach(btn => btn.addEventListener('click', closeModal));
    wrapper.addEventListener('click', e => { if (e.target === wrapper) closeModal(); });
}

function closeModal() {
    document.getElementById('modal-wrapper')?.remove();
    State.modal = null;
}

function injectModalStyles() {
    if (document.getElementById('modal-util-styles')) return;
    const s = document.createElement('style');
    s.id = 'modal-util-styles';
    s.textContent = `
        .modal-field { margin-bottom:.85rem; }
        .modal-field label { display:block;font-size:.8rem;font-weight:600;color:#94a3b8;margin-bottom:5px; }
        .modal-input {
            width:100%;padding:.6rem .85rem;background:rgba(255,255,255,.05);
            border:1px solid #334155;border-radius:8px;color:#e2e8f0;
            font-size:.875rem;outline:none;box-sizing:border-box;font-family:inherit;
        }
        .modal-input:focus { border-color:#6366f1; }
        .modal-input option { background:#1e293b; }
        .modal-header { display:flex;justify-content:space-between;align-items:center; }
        .menu-item {
            display:block;width:100%;padding:.55rem .85rem;background:none;border:none;
            color:#e2e8f0;text-align:left;cursor:pointer;font-size:.875rem;
            border-radius:6px;transition:background .15s;
        }
        .menu-item:hover { background:rgba(99,102,241,.15); }
    `;
    document.head.appendChild(s);
}

// ─── Tab filters ──────────────────────────────────────────────────────────────
function initTabFilters() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            State.activeRole = ROLE_MAP[btn.textContent.trim()] || 'Tous';
            applyFilters();
        });
    });
}

// ─── Search ───────────────────────────────────────────────────────────────────
function initSearch() {
    const input = document.querySelector('.search-input');
    if (!input) return;
    let timer;
    input.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(() => { State.searchQuery = input.value; applyFilters(); }, 350);
    });
}

// ─── Sidebar user info ────────────────────────────────────────────────────────
async function loadUserInfo() {
    const me = await apiFetch('/auth/me/');
    if (!me || me._error) return;
    const name = me.nom_complet || `${me.first_name} ${me.last_name}`;
    const nameEl  = document.querySelector('aside .flex-1 p.font-medium, aside .flex-1 p.text-sm');
    const emailEl = document.querySelector('aside .flex-1 p.text-xs');
    const imgEl   = document.querySelector('aside img');
    if (nameEl)  nameEl.textContent  = name;
    if (emailEl) emailEl.textContent = me.email || '';
    if (imgEl)   imgEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
}

// ─── Logout ───────────────────────────────────────────────────────────────────
function setupLogout() {
    document.querySelectorAll('.logout-link').forEach(link => {
        link.addEventListener('click', async e => {
            e.preventDefault();
            if (!confirm('Voulez-vous vous déconnecter ?')) return;
            const refresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh');
            if (refresh) {
                await fetch('/api/auth/logout/', {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({ refresh }),
                }).catch(() => {});
            }
            ['access','access_token','refresh','refresh_token','user'].forEach(k => {
                localStorage.removeItem(k); sessionStorage.removeItem(k);
            });
            window.location.href = '/login/';
        });
    });
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    document.querySelector('.util-toast')?.remove();
    const colors = { success:'#10b981', error:'#ef4444', info:'#6366f1', warning:'#f59e0b' };
    const t = document.createElement('div');
    t.className = 'util-toast';
    t.style.cssText = `position:fixed;top:1.5rem;right:1.5rem;background:${colors[type]};color:white;
        padding:.65rem 1.1rem;border-radius:10px;font-size:.875rem;font-weight:600;z-index:99999;
        box-shadow:0 4px 16px rgba(0,0,0,.4);max-width:320px;`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function escHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatRelative(d) {
    if (!d) return '—';
    try {
        const diff = Date.now() - new Date(d).getTime();
        const min = Math.floor(diff/60000);
        if (min < 1)   return 'À l\'instant';
        if (min < 60)  return `Il y a ${min} min`;
        if (min < 1440)return `Il y a ${Math.floor(min/60)}h`;
        if (min < 10080)return `Il y a ${Math.floor(min/1440)}j`;
        return new Date(d).toLocaleDateString('fr-FR');
    } catch { return '—'; }
}

function getRoleClass(role) {
    return { Dirigeant:'role-dirigeant', Comptable:'role-comptable',
             Secretariat:'role-secretaire', Enseignant:'role-enseignant',
             Etudiant:'role-etudiant', Parent:'role-parent' }[role] || 'role-default';
}
function getRoleColor(role) {
    return { Dirigeant:'6366f1', Comptable:'10b981', Secretariat:'3b82f6',
             Enseignant:'f59e0b', Etudiant:'8b5cf6', Parent:'ec4899' }[role] || '64748b';
}
function roleColorBg(role) {
    return { Dirigeant:'rgba(99,102,241,.15)', Comptable:'rgba(16,185,129,.15)',
             Secretariat:'rgba(59,130,246,.15)', Enseignant:'rgba(245,158,11,.15)',
             Etudiant:'rgba(139,92,246,.15)', Parent:'rgba(236,72,153,.15)' }[role] || 'rgba(100,116,139,.15)';
}
function roleColorText(role) {
    return { Dirigeant:'#818cf8', Comptable:'#34d399', Secretariat:'#60a5fa',
             Enseignant:'#fbbf24', Etudiant:'#a78bfa', Parent:'#f472b6' }[role] || '#94a3b8';
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTabFilters();
    initSearch();
    initNewUserButton();
    initCardDelegation();
    setupLogout();
    loadUserInfo();
    loadUsers();
})