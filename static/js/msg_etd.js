/**
 * Messagerie - Espace Étudiant
 * FIXED: WebSocket temps réel au lieu du polling HTTP
 * File: static/js/messagerie.js
 */

const API_URL = '/api';

const state = {
    conversations:    [],
    activeUserId:     null,
    activeUserInfo:   null,
    currentUser:      null,
    searchTerm:       '',
    sending:          false,
    ws:               null,
    wsReconnectTimer: null,
    wsReconnectDelay: 3000,
    displayedMsgIds:  new Set(),
};

// ── JWT ────────────────────────────────────────────────────────────────────────
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

// ── API REST ───────────────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_URL}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });
        if (res.status === 401) return { error: 'JWT_INVALID' };
        if (res.status === 403) return { error: 'FORBIDDEN' };
        if (res.status === 204) return { success: true };
        if (!res.ok)            return { error: 'API_ERROR', message: `Erreur ${res.status}` };
        return await res.json();
    } catch { return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible.' }; }
}

function checkSession() {
    const token = getToken(), user = getUser();
    if (!token || !user) { window.location.href = '/login/'; return null; }
    return user;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    document.querySelector('.toast-msg')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const t = document.createElement('div');
    t.className = 'toast-msg';
    t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
        padding:14px 22px;border-radius:12px;background:${colors[type]};color:white;
        font-weight:500;font-size:.9rem;box-shadow:0 8px 24px rgba(0,0,0,.2);
        display:flex;align-items:center;gap:8px;
        transform:translateX(120%);opacity:0;transition:all .3s ease;`;
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform='translateX(0)'; t.style.opacity='1'; });
    setTimeout(() => { t.style.transform='translateX(120%)'; t.style.opacity='0';
        setTimeout(() => t.remove(), 300); }, 3500);
}

// ── Formatage ─────────────────────────────────────────────────────────────────
function formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr), now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60)     return 'À l\'instant';
    if (diff < 3600)   return `${Math.floor(diff / 60)} min`;
    if (diff < 86400)  return d.toLocaleTimeString('fr-DZ', { hour:'2-digit', minute:'2-digit' });
    if (diff < 172800) return 'Hier';
    if (diff < 604800) return ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][d.getDay()];
    return d.toLocaleDateString('fr-DZ', { day:'numeric', month:'short' });
}
function formatMessageTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('fr-DZ', { hour:'2-digit', minute:'2-digit' });
}
function getInitials(nom) {
    if (!nom) return '??';
    return nom.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
function isSameDay(d1, d2) {
    return d1.getFullYear()===d2.getFullYear() && d1.getMonth()===d2.getMonth() && d1.getDate()===d2.getDate();
}
function dayLabel(dateStr) {
    const d = new Date(dateStr), now = new Date();
    if (isSameDay(d, now)) return "Aujourd'hui";
    const yest = new Date(now); yest.setDate(now.getDate()-1);
    if (isSameDay(d, yest)) return 'Hier';
    return d.toLocaleDateString('fr-DZ', { weekday:'long', day:'numeric', month:'long' });
}
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
              .replace(/"/g,'&quot;').replace(/'/g,'&#039;').replace(/\n/g,'<br>');
}

// ══════════════════════════════════════════════════════════════
// WEBSOCKET
// ══════════════════════════════════════════════════════════════

function connectWS(otherUserId) {
    // Fermer l'ancienne connexion proprement
    if (state.ws) {
        state.ws.onclose = null;
        state.ws.close();
        state.ws = null;
    }
    clearTimeout(state.wsReconnectTimer);

    const token = getToken();
    if (!token) return;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const host  = location.hostname;
    const port  = '8000';
    const url   = `${proto}://${host}:${port}/ws/chat/${otherUserId}/?token=${token}`;

    const ws = new WebSocket(url);
    state.ws = ws;

    ws.onopen = () => {
        console.log(`[Chat WS] Connecté — user ${otherUserId}`);
        state.wsReconnectDelay = 3000;
        setWsStatus(true);
    };

    ws.onmessage = (event) => {
        try { handleWsMessage(JSON.parse(event.data)); }
        catch (e) { console.error('[Chat WS]', e); }
    };

    ws.onclose = (event) => {
        setWsStatus(false);
        if (event.code === 4001) return; // auth failed, pas de retry
        state.wsReconnectTimer = setTimeout(() => {
            state.wsReconnectDelay = Math.min(state.wsReconnectDelay * 1.5, 30000);
            if (state.activeUserId === otherUserId) connectWS(otherUserId);
        }, state.wsReconnectDelay);
    };

    ws.onerror = () => ws.close();
}

function setWsStatus(connected) {
    const el = document.querySelector('.ws-indicator');
    if (el) {
        el.style.background = connected ? '#10b981' : '#ef4444';
        el.title = connected ? '🟢 Temps réel actif' : '🔴 Reconnexion...';
    }
    const status = document.querySelector('.chat-user-details p');
    if (status) {
        status.innerHTML = `
            <span class="ws-indicator" style="display:inline-block;width:8px;height:8px;
                border-radius:50%;background:${connected?'#10b981':'#ef4444'};
                margin-right:5px;transition:background .3s;"
                title="${connected?'Temps réel actif':'Reconnexion...'}"></span>
            ${connected ? 'En ligne' : 'Reconnexion...'}`;
    }
}

function handleWsMessage(data) {
    switch (data.type) {
        case 'history':
            renderHistory(data.messages);
            break;
        case 'message':
            appendSingleMessage(data);
            updateConvPreview(
                String(data.expediteur) === String(state.currentUser?.id)
                    ? data.destinataire : data.expediteur,
                data.contenu, data.date_envoi
            );
            break;
        case 'read':
            markAllAsSeen();
            break;
        case 'pong':
            break;
    }
}

function startWsPing() {
    setInterval(() => {
        if (state.ws?.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ action: 'ping' }));
        }
    }, 25000);
}

// ══════════════════════════════════════════════════════════════
// CONVERSATIONS (REST — sidebar seulement)
// ══════════════════════════════════════════════════════════════

async function loadConversations() {
    const data = await apiFetch('/messages/');
    if (data?.error) { showToast('Erreur chargement', 'error'); return; }

    const myId    = String(state.currentUser?.id);
    const convMap = {};

    data.forEach(msg => {
        const isSent  = String(msg.expediteur) === myId;
        const otherId = isSent ? String(msg.destinataire) : String(msg.expediteur);
        const otherNom = isSent ? (msg.destinataire_nom||'—') : (msg.expediteur_nom||'—');
        if (!convMap[otherId]) {
            convMap[otherId] = { userId:parseInt(otherId), nom:otherNom, nonLus:0, dernierMsg:null };
        }
        if (!isSent && !msg.lu) convMap[otherId].nonLus++;
        if (!convMap[otherId].dernierMsg ||
            new Date(msg.date_envoi) > new Date(convMap[otherId].dernierMsg.date_envoi)) {
            convMap[otherId].dernierMsg = msg;
        }
    });

    state.conversations = Object.values(convMap)
        .sort((a,b) => new Date(b.dernierMsg?.date_envoi) - new Date(a.dernierMsg?.date_envoi));

    renderConversationsList();

    if (!state.activeUserId && state.conversations.length) {
        openConversation(state.conversations[0].userId, state.conversations[0].nom);
    }
}

function renderConversationsList() {
    const list = document.querySelector('.conversations-list');
    if (!list) return;
    const filtered = state.searchTerm
        ? state.conversations.filter(c => c.nom.toLowerCase().includes(state.searchTerm.toLowerCase()))
        : state.conversations;

    if (!filtered.length) {
        list.innerHTML = `<div style="text-align:center;padding:2rem;color:#94a3b8;">
            <div style="font-size:2rem;margin-bottom:.5rem;">💬</div>
            <p>${state.searchTerm ? 'Aucun résultat' : 'Aucune conversation'}</p>
        </div>`;
        return;
    }

    list.innerHTML = filtered.map(conv => `
        <div class="conversation-item ${conv.userId===state.activeUserId?'active':''}"
             data-user-id="${conv.userId}"
             onclick="openConversation(${conv.userId}, '${conv.nom.replace(/'/g,"\\'")}')">
            <div class="conversation-avatar">${getInitials(conv.nom)}</div>
            <div class="conversation-info">
                <div class="conversation-name">
                    ${escapeHtml(conv.nom)}
                    <span class="conversation-time">${formatTime(conv.dernierMsg?.date_envoi)}</span>
                </div>
                <div class="conversation-preview ${conv.nonLus>0?'unread':''}">
                    ${(conv.dernierMsg?.contenu||'').slice(0,45)}
                    ${(conv.dernierMsg?.contenu?.length>45)?'…':''}
                </div>
            </div>
            ${conv.nonLus>0 ? `<span class="unread-badge">${conv.nonLus}</span>` : ''}
        </div>`).join('');
}

// ══════════════════════════════════════════════════════════════
// OUVRIR CONVERSATION → connecte WebSocket
// ══════════════════════════════════════════════════════════════

async function openConversation(userId, nom) {
    state.activeUserId   = userId;
    state.activeUserInfo = { userId, nom };
    state.displayedMsgIds.clear();

    // Header
    const headerAvatar = document.querySelector('.chat-user-avatar');
    const headerName   = document.querySelector('.chat-user-details h3');
    if (headerAvatar) headerAvatar.innerHTML = `${getInitials(nom)}<span class="status-indicator"></span>`;
    if (headerName)   headerName.textContent  = nom;
    setWsStatus(false); // gris pendant connexion

    // Activer item sidebar
    document.querySelectorAll('.conversation-item').forEach(el =>
        el.classList.toggle('active', parseInt(el.dataset.userId) === userId));

    // Loading
    const container = document.querySelector('.messages-container');
    if (container) container.innerHTML = `
        <div style="text-align:center;padding:3rem;color:#94a3b8;">
            <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;display:block;margin-bottom:.5rem;"></i>
            Connexion...
        </div>`;

    // ✅ WebSocket — l'historique arrive via event 'history'
    connectWS(userId);

    // Reset badges
    const conv = state.conversations.find(c => c.userId === userId);
    if (conv) { conv.nonLus = 0; renderConversationsList(); }
}

// ══════════════════════════════════════════════════════════════
// RENDER
// ══════════════════════════════════════════════════════════════

function renderHistory(msgs) {
    const container = document.querySelector('.messages-container');
    if (!container) return;

    if (!msgs.length) {
        container.innerHTML = `<div style="text-align:center;padding:3rem;color:#94a3b8;">
            <div style="font-size:3rem;margin-bottom:1rem;">💬</div>
            <p>Aucun message. Envoyez le premier !</p>
        </div>`;
        return;
    }

    const myId   = String(state.currentUser?.id);
    let lastDate = null;
    let html     = '';

    msgs.forEach(msg => {
        const dateEnvoi = new Date(msg.date_envoi);
        const isSent    = String(msg.expediteur) === myId;
        const nom       = isSent
            ? `${state.currentUser.first_name||''} ${state.currentUser.last_name||''}`.trim()
            : (msg.expediteur_nom || '??');

        if (!lastDate || !isSameDay(lastDate, dateEnvoi)) {
            html += `<div class="message-date" data-date="${msg.date_envoi}">
                <span>${dayLabel(msg.date_envoi)}</span>
            </div>`;
            lastDate = dateEnvoi;
        }

        html += `
            <div class="message ${isSent?'sent':'received'}" data-id="${msg.id}">
                <div class="message-avatar">${getInitials(nom)}</div>
                <div class="message-content">
                    <div class="message-text">${escapeHtml(msg.contenu)}</div>
                    <div class="message-time">
                        ${formatMessageTime(msg.date_envoi)}
                        ${isSent ? `<span class="tick-status">${msg.lu?'✓✓':'✓'}</span>` : ''}
                    </div>
                </div>
            </div>`;

        state.displayedMsgIds.add(String(msg.id));
    });

    container.innerHTML = html;
    scrollToBottom();
}

function appendSingleMessage(msg) {
    if (state.displayedMsgIds.has(String(msg.id))) return;
    state.displayedMsgIds.add(String(msg.id));

    const container = document.querySelector('.messages-container');
    if (!container) return;

    const myId   = String(state.currentUser?.id);
    const isSent = String(msg.expediteur) === myId;
    const nom    = isSent
        ? `${state.currentUser.first_name||''} ${state.currentUser.last_name||''}`.trim()
        : (msg.expediteur_nom || '??');

    // Séparateur date
    const dateEnvoi = new Date(msg.date_envoi);
    const lastDateEl = container.querySelector('.message-date:last-of-type');
    const needsSep   = !lastDateEl ||
        !isSameDay(new Date(lastDateEl.dataset.date || 0), dateEnvoi);

    if (needsSep) {
        container.insertAdjacentHTML('beforeend',
            `<div class="message-date" data-date="${msg.date_envoi}">
                <span>${dayLabel(msg.date_envoi)}</span>
            </div>`);
    }

    container.insertAdjacentHTML('beforeend', `
        <div class="message ${isSent?'sent':'received'}" data-id="${msg.id}"
             style="animation:fadeIn .3s ease;">
            <div class="message-avatar">${getInitials(nom)}</div>
            <div class="message-content">
                <div class="message-text">${escapeHtml(msg.contenu)}</div>
                <div class="message-time">
                    ${formatMessageTime(msg.date_envoi)}
                    ${isSent ? '<span class="tick-status">✓</span>' : ''}
                </div>
            </div>
        </div>`);

    scrollToBottom();
}

function markAllAsSeen() {
    document.querySelectorAll('.tick-status').forEach(el => { el.textContent = '✓✓'; });
}

function updateConvPreview(userId, contenu, date) {
    const conv = state.conversations.find(c => String(c.userId) === String(userId));
    if (conv) { conv.dernierMsg = { contenu, date_envoi: date }; renderConversationsList(); }
}

function scrollToBottom() {
    const c = document.querySelector('.messages-container');
    if (c) c.scrollTop = c.scrollHeight;
}

// ══════════════════════════════════════════════════════════════
// ENVOYER — WebSocket prioritaire, fallback REST
// ══════════════════════════════════════════════════════════════

async function sendMessage() {
    if (state.sending) return;
    const textarea = document.querySelector('.message-input');
    const contenu  = textarea?.value?.trim();
    if (!contenu) { showToast('Écrivez un message.', 'warning'); return; }
    if (!state.activeUserId) { showToast('Sélectionnez une conversation.', 'warning'); return; }

    if (textarea) { textarea.value = ''; textarea.style.height = 'auto'; }

    // ✅ Envoyer via WebSocket si disponible → le serveur broadcaste aux 2 participants
    if (state.ws?.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({ action: 'send', contenu }));
        return; // le message revient via event 'message', appendSingleMessage s'en occupe
    }

    // Fallback REST si WS indisponible
    state.sending = true;
    const sendBtn = document.querySelector('.send-btn');
    if (sendBtn) { sendBtn.textContent = '⏳'; sendBtn.disabled = true; }

    const result = await apiFetch('/messages/', {
        method: 'POST',
        body:   JSON.stringify({ destinataire: state.activeUserId, contenu, sujet: '' }),
    });

    state.sending = false;
    if (sendBtn) { sendBtn.textContent = '➤'; sendBtn.disabled = false; }

    if (result?.error) { showToast('Erreur: ' + result.message, 'error'); return; }

    appendSingleMessage({
        ...result,
        expediteur:     state.currentUser?.id,
        expediteur_nom: `${state.currentUser?.first_name||''} ${state.currentUser?.last_name||''}`.trim(),
    });
    updateConvPreview(state.activeUserId, contenu, result.date_envoi || new Date().toISOString());
}

// ══════════════════════════════════════════════════════════════
// MODAL NOUVEAU MESSAGE
// ══════════════════════════════════════════════════════════════

async function openNewMessageModal() {
    const enseignants = await apiFetch('/enseignants/');
    const contacts    = [];
    if (!enseignants?.error && Array.isArray(enseignants)) {
        enseignants.forEach(e => {
            const uid = e.user?.id;
            const nom = e.user?.nom_complet || `${e.user?.first_name||''} ${e.user?.last_name||''}`.trim();
            if (uid && nom) contacts.push({ id: uid, nom, role: 'Enseignant' });
        });
    }

    let selectedContact = null;
    const modal = document.createElement('div');
    modal.id = 'newMsgModal';
    modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.5);
        display:flex;align-items:center;justify-content:center;z-index:2000;`;
    modal.innerHTML = `
        <div style="background:white;border-radius:20px;padding:2rem;
                    width:90%;max-width:480px;animation:fadeIn .3s ease;"
             onclick="event.stopPropagation()">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                <h3 style="font-size:1.2rem;font-weight:700;color:#1e293b;">✏️ Nouveau message</h3>
                <button id="modalCloseBtn" style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">×</button>
            </div>
            <div style="margin-bottom:1rem;">
                <label style="font-size:.9rem;font-weight:600;color:#374151;display:block;margin-bottom:.5rem;">Destinataire</label>
                <div id="selectedContactDisplay"
                     style="display:none;padding:8px 12px;background:#eff6ff;border-radius:8px;
                            margin-bottom:8px;font-size:.875rem;color:#1e40af;font-weight:600;
                            align-items:center;justify-content:space-between;">
                    <span id="selectedContactName"></span>
                    <button id="clearContactBtn" style="background:none;border:none;cursor:pointer;color:#94a3b8;font-size:1rem;">×</button>
                </div>
                <input type="text" id="contactSearch" placeholder="Rechercher un professeur..."
                       style="width:100%;padding:10px 14px;border:2px solid #e5e7eb;
                              border-radius:10px;font-size:.9rem;box-sizing:border-box;outline:none;">
            </div>
            <div id="contactsList" style="max-height:200px;overflow-y:auto;margin-bottom:1rem;
                                          border:1px solid #e5e7eb;border-radius:10px;"></div>
            <button id="btnOpenConv"
                    style="width:100%;padding:.875rem;border:none;border-radius:10px;
                           background:linear-gradient(135deg,#6366f1,#8b5cf6);
                           color:white;font-weight:700;font-size:1rem;cursor:pointer;">
                💬 Ouvrir la conversation
            </button>
        </div>`;
    document.body.appendChild(modal);

    function renderContacts(list) {
        const c = document.getElementById('contactsList');
        if (!c) return;
        if (!list.length) {
            c.innerHTML = `<div style="text-align:center;padding:1.5rem;color:#94a3b8;">Aucun contact trouvé</div>`;
            return;
        }
        c.innerHTML = '';
        list.forEach(contact => {
            const item = document.createElement('div');
            item.style.cssText = `padding:12px 16px;cursor:pointer;display:flex;align-items:center;
                gap:10px;border-bottom:1px solid #f1f5f9;transition:background .15s;`;
            item.innerHTML = `
                <div style="width:36px;height:36px;border-radius:50%;flex-shrink:0;
                            background:linear-gradient(135deg,#6366f1,#8b5cf6);
                            display:flex;align-items:center;justify-content:center;
                            color:white;font-weight:700;font-size:.8rem;">${getInitials(contact.nom)}</div>
                <div>
                    <div style="font-weight:600;color:#1e293b;font-size:.9rem;">${escapeHtml(contact.nom)}</div>
                    <div style="font-size:.75rem;color:#94a3b8;">${contact.role}</div>
                </div>`;
            item.addEventListener('mouseenter', () => { item.style.background='#f8fafc'; });
            item.addEventListener('mouseleave', () => {
                item.style.background = selectedContact?.id===contact.id ? '#eff6ff' : '';
            });
            item.addEventListener('click', () => {
                selectedContact = contact;
                c.querySelectorAll('[style]').forEach(d => d.style.background='');
                item.style.background='#eff6ff';
                const disp = document.getElementById('selectedContactDisplay');
                const name = document.getElementById('selectedContactName');
                if (disp && name) { name.textContent=`✓ ${contact.nom}`; disp.style.display='flex'; }
            });
            c.appendChild(item);
        });
    }

    renderContacts(contacts);
    document.getElementById('contactSearch')?.addEventListener('input', e => {
        const t = e.target.value.trim().toLowerCase();
        renderContacts(t ? contacts.filter(c => c.nom.toLowerCase().includes(t)) : contacts);
    });
    const closeModal = () => modal.remove();
    modal.addEventListener('click', e => { if (e.target===modal) closeModal(); });
    document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);
    document.getElementById('clearContactBtn')?.addEventListener('click', () => {
        selectedContact = null;
        const d = document.getElementById('selectedContactDisplay');
        if (d) d.style.display = 'none';
        document.getElementById('contactSearch').value = '';
        renderContacts(contacts);
    });
    document.getElementById('btnOpenConv')?.addEventListener('click', () => {
        if (!selectedContact) { showToast('Sélectionnez un contact.', 'warning'); return; }
        closeModal();
        if (!state.conversations.find(c => c.userId === selectedContact.id)) {
            state.conversations.unshift({ userId:selectedContact.id, nom:selectedContact.nom, nonLus:0, dernierMsg:null });
        }
        openConversation(selectedContact.id, selectedContact.nom);
    });
    setTimeout(() => document.getElementById('contactSearch')?.focus(), 100);
}

// ── Actions rapides ────────────────────────────────────────────────────────────
function setupQuickActions() {
    const templates = [
        '📎 Je voudrais joindre un fichier.',
        '📅 Pourriez-vous m\'accorder un rendez-vous ?',
        '❓ J\'ai une question concernant le cours.',
        '📊 Pourriez-vous me donner un retour sur mes notes ?',
    ];
    document.querySelectorAll('.quick-action-btn').forEach((btn, i) => {
        btn.addEventListener('click', () => {
            const ta = document.querySelector('.message-input');
            if (ta) { ta.value=templates[i]||''; ta.focus(); adjustHeight(ta); }
        });
    });
}
function adjustHeight(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── Styles ────────────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('msg-extra-styles')) return;
    const s = document.createElement('style');
    s.id = 'msg-extra-styles';
    s.textContent = `
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .messages-container { scroll-behavior:smooth; }
        .conversation-item  { cursor:pointer; transition:background .15s; }
        .send-btn:hover     { opacity:.85; transform:scale(1.05); }
        .tick-status        { color:#93c5fd; font-size:.75rem; margin-left:3px; }
    `;
    document.head.appendChild(s);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;
    state.currentUser = user;

    injectStyles();
    document.querySelector('.new-message-btn')?.addEventListener('click', openNewMessageModal);
    document.querySelector('.search-conversations input')?.addEventListener('input', e => {
        state.searchTerm = e.target.value.trim(); renderConversationsList();
    });
    document.querySelector('.send-btn')?.addEventListener('click', sendMessage);
    document.querySelector('.message-input')?.addEventListener('keydown', e => {
        if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    document.querySelector('.message-input')?.addEventListener('input', e => adjustHeight(e.target));

    setupQuickActions();
    startWsPing();
    await loadConversations();
});

window.addEventListener('beforeunload', () => { state.ws?.close(); });