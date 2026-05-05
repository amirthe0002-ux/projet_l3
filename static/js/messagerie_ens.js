/**
 * messagerie_ens.js - Messaging System for Teachers
 * CONVERTED: HTTP polling → WebSocket (same pattern as messagerie.js)
 *
 * Changes from polling version:
 *  - startPolling() / pollingInterval → removed
 *  - connectWS(userId) replaces polling in selectConversation()
 *  - sendMessage() sends via WS if open, falls back to REST
 *  - handleWsMessage() handles history / message / read / pong events
 *  - setWsStatus() updates the online indicator in the chat header
 *  - startWsPing() keeps the connection alive every 25s
 */

document.addEventListener('DOMContentLoaded', function () {

    // ─── JWT ──────────────────────────────────────────────────────────────────
    function getToken() {
        return localStorage.getItem('access_token') || sessionStorage.getItem('access_token')
            || localStorage.getItem('access') || sessionStorage.getItem('access') || null;
    }
    function getUser() {
        try { return JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user')); }
        catch { return null; }
    }

    // ─── State ────────────────────────────────────────────────────────────────
    const state = {
        conversations:       [],
        currentConversation: null,
        messages:            [],
        apiBaseUrl:          '/api',
        authToken:           getToken(),
        currentUser:         getUser(),
        displayedMsgIds:     new Set(),

        // WebSocket state (replaces pollingInterval)
        ws:               null,
        wsReconnectTimer: null,
        wsReconnectDelay: 3000,

        // Modal cache
        groupes:     [],
        etudiants:   [],
        parents:     [],
        enseignants: [],
    };

    // ─── DOM ──────────────────────────────────────────────────────────────────
    const els = {
        convList:    document.querySelector('.conversations-list'),
        msgContainer:document.querySelector('.messages-container'),
        msgInput:    document.querySelector('.message-input'),
        sendBtn:     document.querySelector('.send-btn'),
        newMsgBtn:   document.querySelector('.new-message-btn'),
        searchInput: document.querySelector('.search-messages input'),
        chatHeader:  document.querySelector('.chat-header'),
        quickResp:   document.querySelectorAll('.quick-response'),
        inputBtns:   document.querySelectorAll('.input-btn'),
    };

    function authHeaders() {
        return {
            'Authorization': `Bearer ${state.authToken}`,
            'Content-Type':  'application/json',
        };
    }

    async function apiFetch(endpoint, options = {}) {
        try {
            const res = await fetch(`${state.apiBaseUrl}${endpoint}`, {
                ...options,
                headers: { ...authHeaders(), ...options.headers },
            });
            if (res.status === 401) { handleAuthError(); return { error: true }; }
            if (res.status === 403) return { error: true, message: 'Accès refusé.' };
            if (res.status === 204) return { success: true };
            return await res.json();
        } catch { return { error: true, message: 'Serveur inaccessible.' }; }
    }

    // ══════════════════════════════════════════════════════════════
    // WEBSOCKET  (ported from messagerie.js)
    // ══════════════════════════════════════════════════════════════

    function connectWS(otherUserId) {
        // Close previous connection cleanly
        if (state.ws) {
            state.ws.onclose = null;   // prevent reconnect loop for old user
            state.ws.close();
            state.ws = null;
        }
        clearTimeout(state.wsReconnectTimer);

        const token = state.authToken;
        if (!token) return;

        const proto = location.protocol === 'https:' ? 'wss' : 'ws';
        const host  = location.hostname;
        const port  = '8000';
        const url   = `${proto}://${host}:${port}/ws/chat/${otherUserId}/?token=${token}`;

        const ws  = new WebSocket(url);
        state.ws  = ws;

        ws.onopen = () => {
            state.wsReconnectDelay = 3000;
            setWsStatus(true);
        };

        ws.onmessage = (event) => {
            try { handleWsMessage(JSON.parse(event.data)); }
            catch (e) { console.error('[Chat WS]', e); }
        };

        ws.onclose = (event) => {
            setWsStatus(false);
            if (event.code === 4001) return;  // auth failed — don't retry
            state.wsReconnectTimer = setTimeout(() => {
                state.wsReconnectDelay = Math.min(state.wsReconnectDelay * 1.5, 30000);
                // Only reconnect if this user is still the active conversation
                if (String(state.currentConversation?.userId) === String(otherUserId)) {
                    connectWS(otherUserId);
                }
            }, state.wsReconnectDelay);
        };

        ws.onerror = () => ws.close();
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
                        ? data.destinataire
                        : data.expediteur,
                    data.contenu,
                    data.date_envoi
                );
                break;
            case 'read':
                markAllAsSeen();
                break;
            case 'pong':
                break;
        }
    }

    function setWsStatus(connected) {
        // Update the "En ligne / Reconnexion..." status in the chat header
        const statusEl = document.querySelector('.chat-user-info p');
        if (statusEl) {
            statusEl.innerHTML = `
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;
                    background:${connected ? '#10b981' : '#ef4444'};
                    margin-right:5px;transition:background .3s;"
                    title="${connected ? 'Temps réel actif' : 'Reconnexion...'}"></span>
                ${connected ? 'En ligne' : 'Reconnexion...'}`;
        }
    }

    function startWsPing() {
        setInterval(() => {
            if (state.ws?.readyState === WebSocket.OPEN) {
                state.ws.send(JSON.stringify({ action: 'ping' }));
            }
        }, 25000);
    }

    function markAllAsSeen() {
        document.querySelectorAll('.tick-status').forEach(el => { el.textContent = '✓✓'; });
    }

    // ── Render full history (arrives via WS 'history' event) ──────────────────
    function renderHistory(msgs) {
        const container = els.msgContainer;
        if (!container) return;

        state.displayedMsgIds.clear();

        if (!msgs.length) {
            container.innerHTML = `
                <div style="text-align:center;padding:3rem;color:#64748b;">
                    Aucun message. Commencez la conversation !
                </div>`;
            return;
        }

        let html = '';
        let lastDate = null;

        msgs.forEach(msg => {
            const d = new Date(msg.date_envoi).toDateString();
            if (d !== lastDate) {
                lastDate = d;
                html += `<div class="message-date"><span>${fmtDate(msg.date_envoi)}</span></div>`;
            }
            const isOwn = String(msg.expediteur) === String(state.currentUser?.id);
            html += bubbleHTML(msg, isOwn);
            state.displayedMsgIds.add(String(msg.id));
        });

        container.innerHTML = html;
        scrollBottom();
    }

    // ── Append a single incoming message (no duplicate check needed — WS guarantees order) ──
    function appendSingleMessage(msg) {
        if (state.displayedMsgIds.has(String(msg.id))) return;
        state.displayedMsgIds.add(String(msg.id));

        const container = els.msgContainer;
        if (!container) return;

        const isOwn = String(msg.expediteur) === String(state.currentUser?.id);

        // Date separator if needed
        const lastDateEl = container.querySelector('.message-date:last-of-type');
        const msgDate    = new Date(msg.date_envoi);
        const needsSep   = !lastDateEl ||
            new Date(lastDateEl.dataset?.date || 0).toDateString() !== msgDate.toDateString();

        if (needsSep) {
            container.insertAdjacentHTML('beforeend',
                `<div class="message-date" data-date="${msg.date_envoi}">
                    <span>${fmtDate(msg.date_envoi)}</span>
                </div>`);
        }

        container.insertAdjacentHTML('beforeend', bubbleHTML(msg, isOwn));
        scrollBottom();
    }

    function bubbleHTML(msg, isOwn) {
        const name = isOwn
            ? `${state.currentUser?.first_name||''} ${state.currentUser?.last_name||''}`.trim()
            : (msg.expediteur_nom || state.currentConversation?.userName || '??');
        return `
            <div class="message ${isOwn ? 'own' : ''}" data-id="${msg.id}"
                 style="animation:fadeIn .3s ease;">
                <div class="message-avatar">${initials(name)}</div>
                <div class="message-content">
                    <div class="message-bubble">${esc(msg.contenu)}</div>
                    <div class="message-time">
                        <span class="tick-status">${fmtTime(msg.date_envoi)}${isOwn ? (msg.lu ? ' ✓✓' : ' ✓') : ''}</span>
                    </div>
                </div>
            </div>`;
    }

    // ══════════════════════════════════════════════════════════════
    // CONVERSATIONS (REST — sidebar only)
    // ══════════════════════════════════════════════════════════════

    async function loadConversationsFromAPI() {
        const data = await apiFetch('/messages/');
        if (data?.error || !Array.isArray(data)) {
            renderConversationsFromHTML(); return;
        }

        const map  = new Map();
        const myId = String(state.currentUser?.id);

        data.forEach(msg => {
            const isSender  = String(msg.expediteur) === myId;
            const otherId   = isSender ? msg.destinataire : msg.expediteur;
            const otherName = isSender ? (msg.destinataire_nom || '—') : (msg.expediteur_nom || '—');

            if (!map.has(otherId)) {
                map.set(otherId, {
                    id:        `conv-${otherId}`,
                    userId:    otherId,
                    name:      otherName,
                    lastMsg:   msg.contenu,
                    lastTime:  msg.date_envoi,
                    unreadCnt: (!msg.lu && !isSender) ? 1 : 0,
                });
            } else {
                const c = map.get(otherId);
                if (new Date(msg.date_envoi) > new Date(c.lastTime)) {
                    c.lastMsg  = msg.contenu;
                    c.lastTime = msg.date_envoi;
                }
                if (!msg.lu && !isSender) c.unreadCnt++;
            }
        });

        state.conversations = [...map.values()]
            .sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));

        renderConversations(state.conversations);

        const first = els.convList?.querySelector('.conversation-item');
        if (first) selectConversation(first);
    }

    function renderConversationsFromHTML() {
        const first = els.convList?.querySelector('.conversation-item');
        if (first) selectConversation(first);
    }

    function renderConversations(convs) {
        if (!convs.length) {
            els.convList.innerHTML = `
                <div style="padding:2rem;text-align:center;color:#64748b;">Aucune conversation</div>`;
            return;
        }
        els.convList.innerHTML = convs.map(c => `
            <div class="conversation-item ${c.unreadCnt > 0 ? 'unread' : ''}"
                 data-id="${c.id}" data-user-id="${c.userId}">
                <div class="conversation-avatar">${initials(c.name)}</div>
                <div class="conversation-info">
                    <div class="conversation-name">
                        ${esc(c.name)}
                        <span class="conversation-time">${fmtTime(c.lastTime)}</span>
                    </div>
                    <div class="conversation-preview">${esc(c.lastMsg || '')}</div>
                </div>
                ${c.unreadCnt > 0 ? `<span class="unread-badge">${c.unreadCnt}</span>` : ''}
            </div>`).join('');
    }

    // ── Select conversation → connect WS (replaces loadMessages + polling) ────
    async function selectConversation(el) {
        document.querySelectorAll('.conversation-item').forEach(x => x.classList.remove('active'));
        el.classList.add('active');
        el.querySelector('.unread-badge')?.remove();
        el.classList.remove('unread');

        const userId   = el.dataset.userId;
        const userName = el.querySelector('.conversation-name')
            ?.childNodes[0]?.textContent?.trim()
            || el.querySelector('.conversation-name')?.textContent?.trim()
            || 'Contact';

        state.currentConversation = { id: el.dataset.id, userId, userName };
        state.displayedMsgIds.clear();

        updateChatHeader(userName);
        setWsStatus(false);  // grey while connecting

        // Show loading in message area
        els.msgContainer.innerHTML = `
            <div style="text-align:center;padding:3rem;color:#64748b;">
                <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;display:block;margin-bottom:.5rem;"></i>
                Connexion...
            </div>`;

        // ✅ Connect WebSocket — history arrives via 'history' event
        connectWS(userId);
    }

    function updateChatHeader(name) {
        if (!els.chatHeader) return;
        els.chatHeader.innerHTML = `
            <div class="chat-user">
                <div class="chat-user-avatar">${initials(name)}</div>
                <div class="chat-user-info">
                    <h3>${esc(name)}</h3>
                    <p>
                        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;
                            background:#ef4444;margin-right:5px;"></span>
                        Connexion...
                    </p>
                </div>
            </div>
            <div class="chat-actions">
                <button class="chat-action-btn">📞</button>
                <button class="chat-action-btn">📹</button>
                <button class="chat-action-btn">ℹ️</button>
            </div>`;
        document.querySelectorAll('.chat-action-btn').forEach(btn =>
            btn.addEventListener('click', () => showNotif('Fonctionnalité à venir', 'info')));
    }

    function updateConvPreview(userId, text, date) {
        const el = document.querySelector(`.conversation-item[data-user-id="${userId}"]`);
        if (!el) return;
        const prev = el.querySelector('.conversation-preview');
        const time = el.querySelector('.conversation-time');
        if (prev) prev.textContent = (text || '').substring(0, 35) + ((text?.length || 0) > 35 ? '…' : '');
        if (time) time.textContent = date ? fmtTime(date) : 'Maintenant';
        els.convList?.prepend(el);
    }

    // ══════════════════════════════════════════════════════════════
    // SEND MESSAGE — WS first, REST fallback
    // ══════════════════════════════════════════════════════════════

    async function sendMessage() {
        const content = els.msgInput?.value?.trim();
        if (!content || !state.currentConversation) return;

        els.msgInput.value = '';

        // ✅ Send via WebSocket if open — server broadcasts back to both users
        if (state.ws?.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ action: 'send', contenu: content }));
            return;  // message returns via 'message' event → appendSingleMessage
        }

        // Fallback REST
        const sendBtn = els.sendBtn;
        if (sendBtn) { sendBtn.textContent = '⏳'; sendBtn.disabled = true; }

        const result = await apiFetch('/messages/', {
            method: 'POST',
            body:   JSON.stringify({
                destinataire: parseInt(state.currentConversation.userId),
                contenu:      content,
                sujet:        'Message',
            }),
        });

        if (sendBtn) { sendBtn.textContent = '➤'; sendBtn.disabled = false; }

        if (result?.error) {
            showNotif("❌ Erreur d'envoi", 'error');
            return;
        }

        // Manually append since WS didn't broadcast it
        appendSingleMessage({
            ...result,
            expediteur:     state.currentUser?.id,
            expediteur_nom: `${state.currentUser?.first_name||''} ${state.currentUser?.last_name||''}`.trim(),
        });
        updateConvPreview(state.currentConversation.userId, content, result.date_envoi);
    }

    // ══════════════════════════════════════════════════════════════
    // NEW MESSAGE MODAL (unchanged from polling version)
    // ══════════════════════════════════════════════════════════════

    async function showNewMessageModal() {
        if (!state.groupes.length || !state.etudiants.length) {
            showNotif('Chargement des contacts...', 'info');
            const [gData, eData, pData, ensData] = await Promise.all([
                apiFetch('/groupes/'),
                apiFetch('/etudiants/'),
                apiFetch('/parents/'),
                apiFetch('/enseignants/'),
            ]);
            state.groupes     = !gData?.error   ? (Array.isArray(gData)   ? gData   : gData.results   || []) : [];
            state.etudiants   = !eData?.error   ? (Array.isArray(eData)   ? eData   : eData.results   || []) : [];
            state.parents     = !pData?.error   ? (Array.isArray(pData)   ? pData   : pData.results   || []) : [];
            state.enseignants = !ensData?.error ? (Array.isArray(ensData) ? ensData : ensData.results || []) : [];
        }

        document.getElementById('newMsgModal')?.remove();

        const modal = document.createElement('div');
        modal.id    = 'newMsgModal';
        modal.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);
            display:flex;align-items:center;justify-content:center;z-index:10000;`;

        modal.innerHTML = `
            <div style="background:white;border-radius:20px;padding:2rem;
                        width:90%;max-width:520px;max-height:90vh;overflow-y:auto;
                        box-shadow:0 25px 50px rgba(0,0,0,.25);"
                 onclick="event.stopPropagation()">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                    <h3 style="font-size:1.15rem;font-weight:700;color:#1e293b;margin:0;">
                        <i class="fas fa-paper-plane" style="color:#6366f1;margin-right:8px;"></i>
                        Nouveau Message
                    </h3>
                    <button id="closeNewMsg"
                            style="background:none;border:none;font-size:1.4rem;cursor:pointer;color:#94a3b8;">×</button>
                </div>

                <!-- Type buttons -->
                <div style="margin-bottom:1.25rem;">
                    <label style="${lbl()}">Type de contact</label>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;" id="typeButtons">
                        ${[
                            ['etudiant',   'fas fa-user-graduate',       'Étudiant',    '#6366f1'],
                            ['parent',     'fas fa-user-shield',         'Parent',      '#10b981'],
                            ['enseignant', 'fas fa-chalkboard-teacher',  'Enseignant',  '#f59e0b'],
                        ].map(([type, icon, label, color]) => `
                            <button data-type="${type}"
                                    style="padding:.75rem;border:2px solid #e2e8f0;border-radius:12px;
                                           background:white;cursor:pointer;font-size:.875rem;font-weight:600;
                                           color:#475569;transition:all .2s;display:flex;flex-direction:column;
                                           align-items:center;gap:.4rem;"
                                    onmouseover="this.style.borderColor='${color}';this.style.color='${color}'"
                                    onmouseout="if(!this.classList.contains('active')){this.style.borderColor='#e2e8f0';this.style.color='#475569'}">
                                <i class="${icon}" style="font-size:1.25rem;"></i>
                                ${label}
                            </button>`).join('')}
                    </div>
                </div>

                <!-- Groupe filter -->
                <div id="groupeFilter" style="display:none;margin-bottom:1.25rem;">
                    <label style="${lbl()}">Filtrer par groupe <span style="color:#94a3b8;font-weight:400;">(optionnel)</span></label>
                    <select id="selGroupe" style="${inp()}">
                        <option value="">— Tous les groupes —</option>
                        ${state.groupes.map(g =>
                            `<option value="${g.id}">${g.nom_groupe} — ${g.niveau} (${g.langue||''})</option>`
                        ).join('')}
                    </select>
                </div>

                <!-- Contact list -->
                <div id="contactsSection" style="display:none;margin-bottom:1.25rem;">
                    <label style="${lbl()}">Sélectionner un contact</label>
                    <input type="text" id="contactSearch" placeholder="🔍 Rechercher..."
                           style="${inp()} margin-bottom:.75rem;">
                    <div id="contactsList"
                         style="max-height:260px;overflow-y:auto;border:2px solid #e2e8f0;
                                border-radius:12px;background:#fafafa;">
                        <div style="padding:1.5rem;text-align:center;color:#94a3b8;font-size:.875rem;">
                            Sélectionnez un type ci-dessus
                        </div>
                    </div>
                </div>

                <!-- Pre-written message -->
                <div id="msgPreSection" style="display:none;margin-bottom:1.25rem;">
                    <label style="${lbl()}">Message (optionnel)</label>
                    <textarea id="firstMsg" rows="3" placeholder="Tapez votre premier message..."
                              style="${inp()} resize:vertical;"></textarea>
                </div>

                <button id="btnStartConv"
                        style="width:100%;padding:.875rem;border:none;border-radius:12px;
                               background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white;
                               font-weight:700;font-size:1rem;cursor:pointer;display:none;">
                    <i class="fas fa-paper-plane"></i> Démarrer la conversation
                </button>
            </div>`;

        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.getElementById('closeNewMsg').addEventListener('click', () => modal.remove());

        let selectedType    = null;
        let selectedContact = null;

        // Contact search
        document.getElementById('contactSearch').addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('.contact-item').forEach(item => {
                item.style.display = item.dataset.name.toLowerCase().includes(q) ? 'flex' : 'none';
            });
        });

        // Type selection
        document.getElementById('typeButtons').addEventListener('click', e => {
            const btn = e.target.closest('[data-type]');
            if (!btn) return;
            selectedType    = btn.dataset.type;
            selectedContact = null;

            document.querySelectorAll('#typeButtons [data-type]').forEach(b => {
                b.classList.remove('active');
                b.style.cssText += ';border-color:#e2e8f0;color:#475569;background:white;';
            });
            const colors = { etudiant:'#6366f1', parent:'#10b981', enseignant:'#f59e0b' };
            const c = colors[selectedType];
            btn.classList.add('active');
            btn.style.borderColor = c;
            btn.style.color       = c;
            btn.style.background  = `${c}10`;

            document.getElementById('groupeFilter').style.display =
                ['etudiant','parent'].includes(selectedType) ? 'block' : 'none';
            document.getElementById('selGroupe').value = '';

            renderContactsList(selectedType, null);
            document.getElementById('contactsSection').style.display = 'block';
            document.getElementById('msgPreSection').style.display   = 'block';
            document.getElementById('btnStartConv').style.display    = 'block';
        });

        // Groupe filter
        document.getElementById('selGroupe').addEventListener('change', e => {
            if (selectedType) renderContactsList(selectedType, e.target.value || null);
        });

        // Contact click
        document.getElementById('contactsList').addEventListener('click', e => {
            const item = e.target.closest('.contact-item');
            if (!item) return;
            document.querySelectorAll('.contact-item').forEach(x => {
                x.style.background = '';
                x.querySelector('.contact-check')?.remove();
            });
            item.style.background = '#f0f4ff';
            const check = document.createElement('span');
            check.className = 'contact-check';
            check.textContent = '✓';
            check.style.cssText = 'color:#6366f1;font-weight:800;margin-left:auto;flex-shrink:0;';
            item.appendChild(check);
            selectedContact = { id: item.dataset.id, name: item.dataset.name };
        });

        // Start conversation
        document.getElementById('btnStartConv').addEventListener('click', async () => {
            if (!selectedContact) { showNotif('Sélectionnez un contact.', 'warning'); return; }

            const firstMsg = document.getElementById('firstMsg').value.trim();
            modal.remove();

            let convEl = document.querySelector(`.conversation-item[data-user-id="${selectedContact.id}"]`);
            if (!convEl) {
                convEl = document.createElement('div');
                convEl.className      = 'conversation-item';
                convEl.dataset.id     = `conv-${selectedContact.id}`;
                convEl.dataset.userId = selectedContact.id;
                convEl.innerHTML      = `
                    <div class="conversation-avatar">${initials(selectedContact.name)}</div>
                    <div class="conversation-info">
                        <div class="conversation-name">
                            ${esc(selectedContact.name)}
                            <span class="conversation-time">Maintenant</span>
                        </div>
                        <div class="conversation-preview">Nouvelle conversation</div>
                    </div>`;
                els.convList?.prepend(convEl);
            }

            await selectConversation(convEl);

            if (firstMsg) {
                if (els.msgInput) els.msgInput.value = firstMsg;
                await sendMessage();
            }
        });
    }

    // ── Render contacts in modal ───────────────────────────────────────────────
    function renderContactsList(type, groupeId) {
        const container = document.getElementById('contactsList');
        let contacts = [];

        if (type === 'etudiant') {
            contacts = state.etudiants
                .filter(e => !groupeId || String(e.groupe) === String(groupeId))
                .map(e => ({
                    id:     e.user?.id || e.id,
                    name:   e.user?.nom_complet || `${e.user?.first_name||''} ${e.user?.last_name||''}`.trim() || `Étudiant #${e.id}`,
                    sub:    e.groupe_nom ? `Groupe: ${e.groupe_nom}` : 'Sans groupe',
                    niveau: e.niveau_actuel || '',
                    color:  '#6366f1',
                }));
        } else if (type === 'parent') {
            const etudiantsFiltered = groupeId
                ? state.etudiants.filter(e => String(e.groupe) === String(groupeId))
                : state.etudiants;
            const parentIds = new Set(etudiantsFiltered.map(e => e.parent_id).filter(Boolean));
            contacts = state.parents
                .filter(p => !groupeId || parentIds.has(p.id))
                .map(p => ({
                    id:    p.user?.id || p.id,
                    name:  p.user?.nom_complet || `${p.user?.first_name||''} ${p.user?.last_name||''}`.trim() || `Parent #${p.id}`,
                    sub:   p.relation_enfant || 'Tuteur',
                    color: '#10b981',
                }));
        } else if (type === 'enseignant') {
            contacts = state.enseignants.map(e => ({
                id:    e.user?.id || e.id,
                name:  e.nom_complet || `${e.user?.first_name||''} ${e.user?.last_name||''}`.trim() || `Enseignant #${e.id}`,
                sub:   e.langue_enseignee || '—',
                color: '#f59e0b',
            }));
        }

        if (!contacts.length) {
            container.innerHTML = `
                <div style="padding:1.5rem;text-align:center;color:#94a3b8;font-size:.875rem;">
                    <i class="fas fa-user-slash" style="font-size:1.5rem;display:block;margin-bottom:.5rem;"></i>
                    Aucun contact trouvé
                    ${groupeId ? '<br><small>Essayez sans filtre de groupe</small>' : ''}
                </div>`;
            return;
        }

        container.innerHTML = contacts.map(c => `
            <div class="contact-item"
                 data-id="${c.id}" data-name="${esc(c.name)}"
                 style="display:flex;align-items:center;gap:.75rem;padding:.875rem 1rem;
                        cursor:pointer;border-bottom:1px solid #f1f5f9;transition:background .15s;"
                 onmouseover="this.style.background='#f8fafc'"
                 onmouseout="if(!this.style.background.includes('f0f4ff'))this.style.background=''">
                <div style="width:40px;height:40px;border-radius:50%;flex-shrink:0;
                            background:linear-gradient(135deg,${c.color},${c.color}aa);
                            display:flex;align-items:center;justify-content:center;
                            color:white;font-weight:700;font-size:.85rem;">
                    ${initials(c.name)}
                </div>
                <div style="min-width:0;flex:1;">
                    <div style="font-weight:600;color:#1e293b;font-size:.9rem;
                                overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        ${esc(c.name)}
                    </div>
                    <div style="font-size:.78rem;color:#64748b;">
                        ${esc(c.sub || '')}
                        ${c.niveau ? `<span style="margin-left:.5rem;background:#dbeafe;color:#1e40af;
                            padding:1px 6px;border-radius:8px;font-size:.7rem;font-weight:700;">
                            ${c.niveau}</span>` : ''}
                    </div>
                </div>
            </div>`).join('');
    }

    // ── Setup events ──────────────────────────────────────────────────────────
    function setupEventListeners() {
        els.convList?.addEventListener('click', e => {
            const item = e.target.closest('.conversation-item');
            if (item) selectConversation(item);
        });

        els.sendBtn?.addEventListener('click', sendMessage);
        els.msgInput?.addEventListener('keypress', e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });

        els.searchInput?.addEventListener('input', debounce(e => {
            const q = e.target.value.toLowerCase();
            document.querySelectorAll('.conversation-item').forEach(item => {
                item.style.display = item.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
            });
        }, 300));

        els.quickResp?.forEach(btn => {
            btn.addEventListener('click', () => {
                if (els.msgInput) els.msgInput.value = btn.textContent;
                els.msgInput?.focus();
            });
        });

        els.newMsgBtn?.addEventListener('click', showNewMessageModal);
        els.inputBtns?.forEach(btn =>
            btn.addEventListener('click', () => showNotif('Fonctionnalité à venir', 'info')));
    }

    // ── Utilities ─────────────────────────────────────────────────────────────
    function initials(name) {
        if (!name) return '??';
        return name.split(' ').filter(Boolean).map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    function esc(text) {
        if (!text) return '';
        const d = document.createElement('div'); d.textContent = text; return d.innerHTML;
    }
    function fmtTime(ts) {
        if (!ts) return '';
        const d = new Date(ts), now = new Date();
        if (d.toDateString() === now.toDateString())
            return d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        const diff = (now - d) / 86400000;
        if (diff < 7) return ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'][d.getDay()];
        return d.toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
    }
    function fmtDate(ts) {
        if (!ts) return '';
        const d = new Date(ts), now = new Date();
        if (d.toDateString() === now.toDateString()) return "Aujourd'hui";
        const yest = new Date(now); yest.setDate(yest.getDate() - 1);
        if (d.toDateString() === yest.toDateString()) return 'Hier';
        return d.toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long' });
    }
    function inp() {
        return `width:100%;padding:10px 14px;border:2px solid #e5e7eb;border-radius:10px;
                font-size:.9rem;outline:none;box-sizing:border-box;font-family:inherit;background:#f9fafb;`;
    }
    function lbl() {
        return `font-size:.875rem;font-weight:600;color:#374151;display:block;margin-bottom:6px;`;
    }
    function debounce(fn, ms) {
        let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    }
    function scrollBottom() {
        if (els.msgContainer) els.msgContainer.scrollTop = els.msgContainer.scrollHeight;
    }
    function handleAuthError() {
        ['access_token','access','user'].forEach(k => {
            localStorage.removeItem(k); sessionStorage.removeItem(k);
        });
        window.location.href = '/login/';
    }
    function showNotif(msg, type = 'info') {
        document.querySelector('.notif-msg')?.remove();
        const colors = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
        const el = document.createElement('div');
        el.className = 'notif-msg';
        el.style.cssText = `position:fixed;top:20px;right:20px;background:${colors[type]};
            color:white;padding:1rem 2rem;border-radius:12px;font-weight:600;z-index:10001;
            box-shadow:0 10px 30px rgba(0,0,0,.2);animation:slideIn .3s ease;`;
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3500);
    }

    // ── CSS ───────────────────────────────────────────────────────────────────
    const style = document.createElement('style');
    style.textContent = `
        @keyframes slideIn { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes fadeIn  { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .conversation-item { transition:all .2s; }
        .conversation-item:hover { background:#f8fafc; }
        .message { animation:fadeIn .3s ease; }
        .send-btn:hover { transform:scale(1.08); }
        .contact-item:active { background:#f0f4ff !important; }
    `;
    document.head.appendChild(style);

    // ── Boot ──────────────────────────────────────────────────────────────────
    async function init() {
        if (!state.authToken) {
            showNotif('❌ Veuillez vous connecter', 'error');
            setTimeout(() => { window.location.href = '/login/'; }, 2000);
            return;
        }
        setupEventListeners();
        startWsPing();                      // keepalive ping every 25s
        await loadConversationsFromAPI();   // REST for sidebar only
        // WS connects when a conversation is selected (selectConversation → connectWS)
    }

    init();

    // Close WS cleanly when page unloads
    window.addEventListener('beforeunload', () => { state.ws?.close(); });
});