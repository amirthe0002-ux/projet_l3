/**
 * Messagerie - Espace Étudiant
 * JWT Authentication + Django REST API
 * File: static/js/messagerie.js
 */

// ============================================================
// CONFIG
// ============================================================
const API_URL = '/api';

// État global
const state = {
    messages:           [],     // tous les messages chargés
    conversations:      [],     // liste des conversations (groupées par interlocuteur)
    activeUserId:       null,   // ID utilisateur de la conversation ouverte
    activeUserInfo:     null,   // infos de l'interlocuteur actif
    currentUser:        null,   // utilisateur connecté
    searchTerm:         '',
    sending:            false,
    pollInterval:       null,   // pour auto-refresh messages
};

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
async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });
        if (res.status === 401) return { error: 'JWT_INVALID', message: 'Token invalide.' };
        if (res.status === 403) return { error: 'FORBIDDEN',   message: 'Accès refusé.' };
        if (!res.ok)            return { error: 'API_ERROR',   message: `Erreur ${res.status}` };
        if (res.status === 204) return { success: true };
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
    const user  = getUser();
    if (!token || !user) { window.location.href = '/login/'; return null; }
    return user;
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
    document.querySelector('.toast-msg')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-msg';
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
// FORMATAGE
// ============================================================
function formatTime(dateStr) {
    if (!dateStr) return '';
    const d   = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);

    if (diff < 60)     return 'À l\'instant';
    if (diff < 3600)   return `${Math.floor(diff / 60)} min`;
    if (diff < 86400)  return d.toLocaleTimeString('fr-DZ', { hour:'2-digit', minute:'2-digit' });
    if (diff < 172800) return 'Hier';
    if (diff < 604800) {
        const jours = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
        return jours[d.getDay()];
    }
    return d.toLocaleDateString('fr-DZ', { day:'numeric', month:'short' });
}

function formatMessageTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('fr-DZ', { hour:'2-digit', minute:'2-digit' });
}

function getInitials(nom) {
    if (!nom) return '??';
    return nom.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth()    === d2.getMonth()    &&
           d1.getDate()     === d2.getDate();
}

function dayLabel(dateStr) {
    const d   = new Date(dateStr);
    const now = new Date();
    if (isSameDay(d, now)) return "Aujourd'hui";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (isSameDay(d, yesterday)) return 'Hier';
    return d.toLocaleDateString('fr-DZ', { weekday:'long', day:'numeric', month:'long' });
}

// ============================================================
// CHARGER TOUTES LES CONVERSATIONS
// ============================================================
async function loadConversations() {
    const data = await apiFetch('/messages/');
    if (data?.error) {
        showToast('Erreur chargement messages: ' + data.message, 'error');
        return;
    }

    state.messages = data;

    // Grouper par interlocuteur
    const convMap = {};
    const user    = state.currentUser;

    data.forEach(msg => {
        // Déterminer l'interlocuteur
        const isEnvoyé     = msg.expediteur === user.id ||
                             msg.expediteur_nom === `${user.first_name} ${user.last_name}`;
        const interlocId   = isEnvoyé ? msg.destinataire : msg.expediteur;
        const interlocNom  = isEnvoyé ? msg.destinataire_nom : msg.expediteur_nom;

        if (!convMap[interlocId]) {
            convMap[interlocId] = {
                userId:    interlocId,
                nom:       interlocNom || 'Utilisateur',
                messages:  [],
                nonLus:    0,
                dernierMsg: null,
            };
        }

        convMap[interlocId].messages.push(msg);

        // Compter non lus reçus
        if (!isEnvoyé && !msg.lu) {
            convMap[interlocId].nonLus++;
        }

        // Garder le dernier message
        if (!convMap[interlocId].dernierMsg ||
            new Date(msg.date_envoi) > new Date(convMap[interlocId].dernierMsg.date_envoi)) {
            convMap[interlocId].dernierMsg = msg;
        }
    });

    // Trier par date du dernier message
    state.conversations = Object.values(convMap).sort((a, b) =>
        new Date(b.dernierMsg?.date_envoi) - new Date(a.dernierMsg?.date_envoi)
    );

    renderConversationsList();

    // Ouvrir la première conversation automatiquement si aucune active
    if (!state.activeUserId && state.conversations.length) {
        openConversation(state.conversations[0].userId, state.conversations[0].nom);
    }
}

// ============================================================
// RENDU LISTE CONVERSATIONS (sidebar)
// ============================================================
function renderConversationsList() {
    const list = document.querySelector('.conversations-list');
    if (!list) return;

    // Filtrer par recherche
    const filtered = state.searchTerm
        ? state.conversations.filter(c =>
            c.nom.toLowerCase().includes(state.searchTerm.toLowerCase()))
        : state.conversations;

    if (!filtered.length) {
        list.innerHTML = `
            <div style="text-align:center; padding:2rem; color:#94a3b8;">
                <div style="font-size:2rem; margin-bottom:0.5rem;">💬</div>
                <p>${state.searchTerm ? 'Aucune conversation trouvée' : 'Aucune conversation'}</p>
            </div>`;
        return;
    }

    list.innerHTML = filtered.map(conv => {
        const isActive  = conv.userId === state.activeUserId;
        const initials  = getInitials(conv.nom);
        const preview   = conv.dernierMsg?.contenu || '';
        const previewShort = preview.length > 45 ? preview.slice(0, 45) + '…' : preview;
        const time      = formatTime(conv.dernierMsg?.date_envoi);
        const hasUnread = conv.nonLus > 0;

        return `
            <div class="conversation-item ${isActive ? 'active' : ''}"
                 data-user-id="${conv.userId}"
                 onclick="openConversation(${conv.userId}, '${conv.nom.replace(/'/g, "\\'")}')">
                <div class="conversation-avatar">${initials}</div>
                <div class="conversation-info">
                    <div class="conversation-name">
                        ${conv.nom}
                        <span class="conversation-time">${time}</span>
                    </div>
                    <div class="conversation-preview ${hasUnread ? 'unread' : ''}">
                        ${previewShort || '—'}
                    </div>
                </div>
                ${hasUnread ? `<span class="unread-badge">${conv.nonLus}</span>` : ''}
            </div>`;
    }).join('');
}

// ============================================================
// OUVRIR UNE CONVERSATION
// ============================================================
async function openConversation(userId, nom) {
    state.activeUserId   = userId;
    state.activeUserInfo = { userId, nom };

    // Mettre à jour header conversation
    const initials = getInitials(nom);
    const headerAvatar  = document.querySelector('.chat-user-avatar');
    const headerName    = document.querySelector('.chat-user-details h3');
    const headerStatus  = document.querySelector('.chat-user-details p');

    if (headerAvatar) headerAvatar.innerHTML = `${initials}<span class="status-indicator"></span>`;
    if (headerName)   headerName.textContent   = nom;
    if (headerStatus) headerStatus.textContent = 'En ligne';

    // Mettre à jour active dans la sidebar
    document.querySelectorAll('.conversation-item').forEach(el => {
        el.classList.toggle('active', parseInt(el.dataset.userId) === userId);
    });

    // Charger les messages de cette conversation
    await loadMessages(userId);

    // Marquer comme lus
    await markConversationAsRead(userId);

    // Mettre à jour le badge non lus
    const conv = state.conversations.find(c => c.userId === userId);
    if (conv) {
        conv.nonLus = 0;
        renderConversationsList();
    }
}

// ============================================================
// CHARGER MESSAGES D'UNE CONVERSATION
// ============================================================
async function loadMessages(userId) {
    const container = document.querySelector('.messages-container');
    if (!container) return;

    container.innerHTML = `
        <div style="text-align:center; padding:2rem; color:#94a3b8;">
            <div style="font-size:1.5rem;">⏳</div>
            <p>Chargement...</p>
        </div>`;

    // Filtrer les messages avec cet utilisateur
    const conv = state.conversations.find(c => c.userId === userId);
    const msgs = conv?.messages || [];

    if (!msgs.length) {
        container.innerHTML = `
            <div style="text-align:center; padding:3rem; color:#94a3b8;">
                <div style="font-size:3rem; margin-bottom:1rem;">💬</div>
                <p>Aucun message avec ${state.activeUserInfo?.nom || 'cet utilisateur'}</p>
                <p style="font-size:0.875rem; margin-top:0.5rem;">
                    Envoyez le premier message !
                </p>
            </div>`;
        return;
    }

    // Trier par date croissante
    const sorted = [...msgs].sort((a, b) =>
        new Date(a.date_envoi) - new Date(b.date_envoi)
    );

    renderMessages(sorted);
}

// ============================================================
// RENDU DES MESSAGES
// ============================================================
function renderMessages(msgs) {
    const container = document.querySelector('.messages-container');
    if (!container) return;

    const user = state.currentUser;
    let lastDate = null;
    let html = '';

    msgs.forEach(msg => {
        const dateEnvoi  = new Date(msg.date_envoi);
        const isSent     = msg.expediteur === user.id ||
                           msg.expediteur_nom === `${user.first_name} ${user.last_name}`;
        const senderNom  = isSent ? `${user.first_name} ${user.last_name}` : (msg.expediteur_nom || '??');
        const initials   = getInitials(senderNom);
        const time       = formatMessageTime(msg.date_envoi);
        const tickStatus = msg.lu ? '✓✓' : '✓';

        // Séparateur de date
        if (!lastDate || !isSameDay(lastDate, dateEnvoi)) {
            html += `
                <div class="message-date">
                    <span>${dayLabel(msg.date_envoi)}</span>
                </div>`;
            lastDate = dateEnvoi;
        }

        // Pièce jointe ?
        const piecesJointes = msg.pieces_jointes || [];
        const attachmentHtml = piecesJointes.map(p => `
            <div class="message-attachment" style="cursor:pointer;"
                 onclick="window.open('${p.chemin_fichier}', '_blank')">
                <div class="attachment-icon">📄</div>
                <div class="attachment-info">
                    <div class="attachment-name">${p.nom_fichier}</div>
                    <div class="attachment-size">
                        ${p.taille_fichier ? (p.taille_fichier / 1024 / 1024).toFixed(1) + ' MB' : ''}
                    </div>
                </div>
            </div>`).join('');

        html += `
            <div class="message ${isSent ? 'sent' : 'received'}"
                 style="animation:fadeIn 0.3s ease;">
                <div class="message-avatar">${initials}</div>
                <div class="message-content">
                    <div class="message-text">${escapeHtml(msg.contenu)}</div>
                    ${attachmentHtml}
                    <div class="message-time">
                        ${time}${isSent ? ' ' + tickStatus : ''}
                    </div>
                </div>
            </div>`;
    });

    container.innerHTML = html;

    // Scroll automatique vers le bas
    scrollToBottom();
}

// ============================================================
// SCROLL EN BAS DES MESSAGES
// ============================================================
function scrollToBottom() {
    const container = document.querySelector('.messages-container');
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}

// ============================================================
// MARQUER MESSAGES COMME LUS
// ============================================================
async function markConversationAsRead(userId) {
    const conv = state.conversations.find(c => c.userId === userId);
    if (!conv) return;

    const nonLus = conv.messages.filter(m => {
        const isMine = m.expediteur === state.currentUser.id;
        return !isMine && !m.lu;
    });

    for (const msg of nonLus) {
        await apiFetch(`/messages/${msg.id}/`, { method: 'GET' });
        msg.lu = true;
    }
}

// ============================================================
// ENVOYER UN MESSAGE
// ============================================================
async function sendMessage() {
    if (state.sending) return;

    const textarea = document.querySelector('.message-input');
    const contenu  = textarea?.value?.trim();

    if (!contenu) {
        showToast('Écrivez un message avant d\'envoyer.', 'warning');
        return;
    }

    if (!state.activeUserId) {
        showToast('Sélectionnez une conversation d\'abord.', 'warning');
        return;
    }

    state.sending = true;
    const sendBtn = document.querySelector('.send-btn');
    if (sendBtn) { sendBtn.textContent = '⏳'; sendBtn.disabled = true; }

    const payload = {
        destinataire: state.activeUserId,
        contenu,
        sujet: '',
    };

    const result = await apiFetch('/messages/', {
        method: 'POST',
        body:   JSON.stringify(payload),
    });

    state.sending = false;
    if (sendBtn) { sendBtn.textContent = '➤'; sendBtn.disabled = false; }

    if (result?.error) {
        showToast('Erreur envoi: ' + result.message, 'error');
        return;
    }

    // Vider l'input
    if (textarea) { textarea.value = ''; textarea.style.height = 'auto'; }

    // Ajouter le message localement sans recharger toute la liste
    const conv = state.conversations.find(c => c.userId === state.activeUserId);
    if (conv) {
        conv.messages.push(result);
        conv.dernierMsg = result;
    } else {
        // Nouvelle conversation
        state.conversations.unshift({
            userId:     state.activeUserId,
            nom:        state.activeUserInfo?.nom || 'Utilisateur',
            messages:   [result],
            nonLus:     0,
            dernierMsg: result,
        });
    }

    // Refresh
    renderConversationsList();
    const conv2 = state.conversations.find(c => c.userId === state.activeUserId);
    if (conv2) {
        const sorted = [...conv2.messages].sort((a, b) =>
            new Date(a.date_envoi) - new Date(b.date_envoi)
        );
        renderMessages(sorted);
    }
}

// ============================================================
// NOUVEAU MESSAGE — MODAL SÉLECTION DESTINATAIRE
// ============================================================
async function openNewMessageModal() {
    // Charger les enseignants
    const enseignants = await apiFetch('/enseignants/');

    const contacts = [];
    if (!enseignants?.error && enseignants.length) {
        enseignants.forEach(e => {
            const userId = e.user?.id;
            const nom    = e.user?.nom_complet ||
                           `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.trim();
            if (userId && nom) {
                contacts.push({ id: userId, nom, role: 'Enseignant' });
            }
        });
    }

    // État interne du modal
    let selectedContact = null;

    // Créer le modal
    const modal = document.createElement('div');
    modal.id = 'newMsgModal';
    modal.style.cssText = `
        position:fixed; inset:0; background:rgba(0,0,0,0.5);
        display:flex; align-items:center; justify-content:center; z-index:2000;`;

    modal.innerHTML = `
        <div style="background:white; border-radius:20px; padding:2rem;
                    width:90%; max-width:480px; animation:fadeIn 0.3s ease;"
             onclick="event.stopPropagation()">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem;">
                <h3 style="font-size:1.2rem; font-weight:700; color:#1e293b;">✏️ Nouveau message</h3>
                <button id="modalCloseBtn"
                        style="background:none; border:none; font-size:1.5rem; cursor:pointer; color:#94a3b8; line-height:1;">
                    ×
                </button>
            </div>

            <div style="margin-bottom:1rem;">
                <label style="font-size:0.9rem; font-weight:600; color:#374151; display:block; margin-bottom:0.5rem;">
                    Destinataire
                </label>
                <div id="selectedContactDisplay" style="
                    display:none; padding:8px 12px; background:#eff6ff;
                    border-radius:8px; margin-bottom:8px; font-size:0.875rem;
                    color:#1e40af; font-weight:600; align-items:center; justify-content:space-between;">
                    <span id="selectedContactName"></span>
                    <button id="clearContactBtn" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:1rem;">×</button>
                </div>
                <input type="text" id="contactSearch" placeholder="Rechercher un professeur..."
                       style="width:100%; padding:10px 14px; border:2px solid #e5e7eb;
                              border-radius:10px; font-size:0.9rem;
                              box-sizing:border-box; outline:none; transition:border-color 0.2s;">
            </div>

            <div id="contactsList" style="
                max-height:200px; overflow-y:auto; margin-bottom:1rem;
                border:1px solid #e5e7eb; border-radius:10px;"></div>

            <div style="margin-bottom:1.25rem;">
                <label style="font-size:0.9rem; font-weight:600; color:#374151; display:block; margin-bottom:0.5rem;">
                    Message
                </label>
                <textarea id="newMsgContent" rows="4" placeholder="Votre message..."
                          style="width:100%; padding:10px 14px; border:2px solid #e5e7eb;
                                 border-radius:10px; font-size:0.9rem; outline:none;
                                 resize:vertical; box-sizing:border-box;
                                 transition:border-color 0.2s; font-family:inherit;"></textarea>
            </div>

            <button id="btnSendNew"
                    style="width:100%; padding:0.875rem; border:none; border-radius:10px;
                           background:linear-gradient(135deg,#6366f1,#8b5cf6);
                           color:white; font-weight:700; font-size:1rem; cursor:pointer;
                           transition:opacity 0.2s;">
                ➤ Envoyer
            </button>
        </div>`;

    document.body.appendChild(modal);

    // ---- Fonction interne pour rendre la liste ----
    function renderContactsList(list) {
        const container = document.getElementById('contactsList');
        if (!container) return;

        if (!list.length) {
            container.innerHTML = `
                <div style="text-align:center; padding:1.5rem; color:#94a3b8; font-size:0.875rem;">
                    Aucun contact trouvé
                </div>`;
            return;
        }

        container.innerHTML = '';
        list.forEach(c => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding:12px 16px; cursor:pointer; display:flex; align-items:center;
                gap:10px; border-bottom:1px solid #f1f5f9; transition:background 0.15s;`;
            item.innerHTML = `
                <div style="width:36px; height:36px; border-radius:50%;
                            background:linear-gradient(135deg,#6366f1,#8b5cf6);
                            display:flex; align-items:center; justify-content:center;
                            color:white; font-weight:700; font-size:0.8rem; flex-shrink:0;">
                    ${getInitials(c.nom)}
                </div>
                <div>
                    <div style="font-weight:600; color:#1e293b; font-size:0.9rem;">${c.nom}</div>
                    <div style="font-size:0.75rem; color:#94a3b8;">${c.role}</div>
                </div>`;

            // ✅ Event listener propre — pas de onclick inline
            item.addEventListener('mouseenter', () => { item.style.background = '#f8fafc'; });
            item.addEventListener('mouseleave', () => {
                item.style.background = selectedContact?.id === c.id ? '#eff6ff' : 'white';
            });

            item.addEventListener('click', () => {
                // Mettre à jour la sélection
                selectedContact = c;

                // Highlight visuel
                container.querySelectorAll('div').forEach(d => d.style.background = 'white');
                item.style.background = '#eff6ff';

                // Afficher le contact sélectionné en haut
                const display = document.getElementById('selectedContactDisplay');
                const nameEl  = document.getElementById('selectedContactName');
                if (display && nameEl) {
                    nameEl.textContent  = `✓ ${c.nom}`;
                    display.style.display = 'flex';
                }

                // Focus sur le textarea
                document.getElementById('newMsgContent')?.focus();
            });

            container.appendChild(item);
        });
    }

    // Render initial
    renderContactsList(contacts);

    // ---- Recherche ----
    document.getElementById('contactSearch')?.addEventListener('input', e => {
        const term     = e.target.value.trim().toLowerCase();
        const filtered = term
            ? contacts.filter(c => c.nom.toLowerCase().includes(term))
            : contacts;
        renderContactsList(filtered);
    });

    // ---- Fermer le modal ----
    function closeModal() { modal.remove(); }
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);

    // ---- Désélectionner contact ----
    document.getElementById('clearContactBtn')?.addEventListener('click', () => {
        selectedContact = null;
        const display = document.getElementById('selectedContactDisplay');
        if (display) display.style.display = 'none';
        document.getElementById('contactSearch').value = '';
        renderContactsList(contacts);
    });

    // ---- Bouton Envoyer ----
    document.getElementById('btnSendNew')?.addEventListener('click', async () => {
        const contenu = document.getElementById('newMsgContent')?.value?.trim();

        if (!selectedContact) {
            showToast('Sélectionnez un destinataire dans la liste.', 'warning');
            document.getElementById('contactSearch')?.focus();
            return;
        }
        if (!contenu) {
            showToast('Écrivez un message avant d\'envoyer.', 'warning');
            document.getElementById('newMsgContent')?.focus();
            return;
        }

        const btn = document.getElementById('btnSendNew');
        if (btn) { btn.textContent = '⏳ Envoi...'; btn.disabled = true; btn.style.opacity = '0.7'; }

        const result = await apiFetch('/messages/', {
            method: 'POST',
            body:   JSON.stringify({
                destinataire: selectedContact.id,
                contenu,
                sujet: '',
            }),
        });

        if (result?.error) {
            showToast('Erreur: ' + result.message, 'error');
            if (btn) { btn.textContent = '➤ Envoyer'; btn.disabled = false; btn.style.opacity = '1'; }
            return;
        }

        // Succès
        closeModal();
        showToast(`Message envoyé à ${selectedContact.nom} !`, 'success');
        await loadConversations();
        openConversation(selectedContact.id, selectedContact.nom);
    });

    // Focus sur la recherche au démarrage
    setTimeout(() => document.getElementById('contactSearch')?.focus(), 100);
}

// ============================================================
// ACTIONS RAPIDES
// ============================================================
function setupQuickActions() {
    const btns = document.querySelectorAll('.quick-action-btn');
    const templates = [
        '📎 Je voudrais joindre un fichier.',
        '📅 Pourriez-vous m\'accorder un rendez-vous ?',
        '❓ J\'ai une question concernant le cours.',
        '📊 Pourriez-vous me donner un retour sur mes notes ?',
    ];

    btns.forEach((btn, i) => {
        btn.addEventListener('click', () => {
            const textarea = document.querySelector('.message-input');
            if (textarea) {
                textarea.value = templates[i] || '';
                textarea.focus();
                adjustTextareaHeight(textarea);
            }
        });
    });
}

// ============================================================
// AUTO-RESIZE TEXTAREA
// ============================================================
function adjustTextareaHeight(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ============================================================
// ÉCHAPPER HTML (sécurité XSS)
// ============================================================
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\n/g, '<br>');
}

// ============================================================
// INJECT STYLES MANQUANTS
// ============================================================
function injectStyles() {
    if (document.getElementById('msg-extra-styles')) return;
    const s = document.createElement('style');
    s.id = 'msg-extra-styles';
    s.textContent = `
        @keyframes fadeIn {
            from { opacity:0; transform:translateY(6px); }
            to   { opacity:1; transform:translateY(0); }
        }
        .messages-container {
            scroll-behavior: smooth;
        }
        .message-input:focus { outline: none; }
        .conversation-item { cursor: pointer; transition: background 0.15s; }
        .send-btn:hover     { opacity: 0.85; transform: scale(1.05); }
        .quick-action-btn   { transition: all 0.2s; }
        .quick-action-btn:hover { transform: translateY(-2px); }
    `;
    document.head.appendChild(s);
}

// ============================================================
// AUTO-REFRESH MESSAGES (polling toutes les 15 sec)
// ============================================================
function startPolling() {
    state.pollInterval = setInterval(async () => {
        await loadConversations();
        // Si une conversation est ouverte, refresh les messages
        if (state.activeUserId) {
            const conv = state.conversations.find(c => c.userId === state.activeUserId);
            if (conv) {
                const sorted = [...conv.messages].sort((a, b) =>
                    new Date(a.date_envoi) - new Date(b.date_envoi)
                );
                renderMessages(sorted);
            }
        }
    }, 15000);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;

    state.currentUser = user;

    injectStyles();

    // Bouton nouveau message
    document.querySelector('.new-message-btn')
        ?.addEventListener('click', openNewMessageModal);

    // Recherche conversations
    document.querySelector('.search-conversations input')
        ?.addEventListener('input', e => {
            state.searchTerm = e.target.value.trim();
            renderConversationsList();
        });

    // Bouton envoyer
    document.querySelector('.send-btn')
        ?.addEventListener('click', sendMessage);

    // Envoyer avec Entrée (Shift+Entrée = nouvelle ligne)
    document.querySelector('.message-input')
        ?.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

    // Auto-resize textarea
    document.querySelector('.message-input')
        ?.addEventListener('input', e => adjustTextareaHeight(e.target));

    // Actions rapides
    setupQuickActions();

    // Charger les conversations
    await loadConversations();

    // Démarrer le polling
    startPolling();
});

// Nettoyer le polling quand on quitte la page
window.addEventListener('beforeunload', () => {
    if (state.pollInterval) clearInterval(state.pollInterval);
});