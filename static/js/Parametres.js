/**
 * Parametres.js — Page Paramètres Dirigeant
 * FIXED:
 * - Params save correctly via PUT /api/parametres/<id>/
 * - Establishment name synced to localStorage → login page reads it
 * - Languages/levels/tarifs manage Groupe model data
 * - All toggles and sections work
 */

document.addEventListener('DOMContentLoaded', async () => {

    // ── 1. AUTH ───────────────────────────────────────────────────────────────
    const TOKEN = localStorage.getItem('access') || sessionStorage.getItem('access') ||
                  localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || null;
    const USER = (() => {
        try { return JSON.parse(localStorage.getItem('user') || sessionStorage.getItem('user')); }
        catch { return null; }
    })();

    if (!TOKEN || !USER) { window.location.href = '/login/'; return; }
    if (USER.role !== 'Dirigeant') { window.location.href = '/login/'; return; }

    const API = '/api';
    let loadedParams  = [];  // from /api/parametres/
    let loadedGroupes = [];  // from /api/groupes/

    // ── 2. HELPERS ────────────────────────────────────────────────────────────
    function authHeaders() {
        return { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };
    }

    async function apiFetch(endpoint, opts = {}) {
        try {
            const res = await fetch(`${API}${endpoint}`, {
                ...opts, headers: { ...authHeaders(), ...(opts.headers || {}) },
            });
            if (res.status === 401) { window.location.href = '/login/'; return { error: true }; }
            if (res.status === 204) return { success: true };
            const data = await res.json();
            if (!res.ok) return { error: true, message: data.detail || data.error || JSON.stringify(data) };
            return data;
        } catch (e) { return { error: true, message: 'Serveur inaccessible.' }; }
    }

    function toast(msg, type = 'info') {
        document.querySelector('.param-toast')?.remove();
        const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#6366f1' };
        const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
        const t = document.createElement('div');
        t.className = 'param-toast';
        t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
            padding:14px 22px;border-radius:12px;background:${colors[type]};color:white;
            font-weight:600;font-size:.9rem;box-shadow:0 8px 24px rgba(0,0,0,.4);
            display:flex;align-items:center;gap:10px;max-width:420px;
            transform:translateX(120%);opacity:0;transition:all .3s ease;`;
        t.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
        document.body.appendChild(t);
        requestAnimationFrame(() => { t.style.transform='translateX(0)'; t.style.opacity='1'; });
        setTimeout(() => {
            t.style.transform='translateX(120%)'; t.style.opacity='0';
            setTimeout(() => t.remove(), 300);
        }, 4000);
    }

    function injectStyles() {
        if (document.getElementById('param-styles')) return;
        const s = document.createElement('style');
        s.id = 'param-styles';
        s.textContent = `
            .tab-btn { padding:.5rem 1.1rem;border-radius:8px;border:none;cursor:pointer;
                       font-weight:600;font-size:.875rem;transition:all .2s;
                       background:transparent;color:#94a3b8; }
            .tab-btn.active { background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white; }
            .tab-btn:hover:not(.active) { background:rgba(255,255,255,.07);color:white; }
            .toggle-switch { width:48px;height:26px;border-radius:13px;background:#334155;
                cursor:pointer;position:relative;transition:background .25s;flex-shrink:0; }
            .toggle-switch::after { content:'';position:absolute;top:3px;left:3px;
                width:20px;height:20px;border-radius:50%;background:white;transition:transform .25s; }
            .toggle-switch.on { background:#6366f1; }
            .toggle-switch.on::after { transform:translateX(22px); }
            .param-input { background:rgba(255,255,255,.05);border:1px solid #334155;
                border-radius:8px;color:#e2e8f0;padding:.6rem 1rem;font-size:.875rem;
                outline:none;transition:border .2s;width:100%;box-sizing:border-box; }
            .param-input:focus { border-color:#6366f1; }
            .param-input.changed { border-color:#f59e0b; }
            .section-panel { background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);
                border-radius:14px;padding:1.5rem;margin-bottom:1.25rem; }
            .section-title { font-weight:700;color:#e2e8f0;font-size:1rem;margin-bottom:1rem;
                display:flex;align-items:center;gap:.5rem; }
            .param-row { display:flex;align-items:center;justify-content:space-between;
                padding:.75rem 0;border-bottom:1px solid rgba(255,255,255,.05); }
            .param-row:last-child { border-bottom:none; }
            .param-label { color:#94a3b8;font-size:.875rem; }
            .langue-badge { display:inline-flex;align-items:center;gap:.4rem;padding:.3rem .8rem;
                background:rgba(99,102,241,.15);color:#a5b4fc;border-radius:20px;font-size:.8rem;
                font-weight:600;margin:.2rem; }
            .langue-badge .remove-btn { cursor:pointer;color:#94a3b8;font-size:.9rem;
                transition:color .15s; }
            .langue-badge .remove-btn:hover { color:#ef4444; }
            .niveau-tag { display:inline-flex;align-items:center;gap:.4rem;padding:.3rem .8rem;
                background:rgba(16,185,129,.12);color:#34d399;border-radius:20px;font-size:.8rem;
                font-weight:600;margin:.2rem; }
            .add-btn { padding:.5rem 1rem;background:#6366f1;color:white;border:none;
                border-radius:8px;cursor:pointer;font-size:.82rem;font-weight:600;
                transition:opacity .2s; }
            .add-btn:hover { opacity:.85; }
            .tarif-row { display:grid;grid-template-columns:1fr auto auto;gap:.75rem;
                align-items:center;margin-bottom:.6rem; }
            .upload-zone { border:2px dashed #475569;border-radius:12px;padding:2rem;
                text-align:center;cursor:pointer;transition:all .2s;background:rgba(255,255,255,.03); }
            .upload-zone:hover { border-color:#6366f1;background:rgba(99,102,241,.07); }
        `;
        document.head.appendChild(s);
    }

    // ── 3. SIDEBAR USER INFO ──────────────────────────────────────────────────
    function injectUser() {
        const name = USER.nom_complet || `${USER.first_name||''} ${USER.last_name||''}`.trim() || 'Dirigeant';
        const nameEl  = document.querySelector('aside .text-sm.font-medium, aside p.font-medium');
        const emailEl = document.querySelector('aside .text-xs.text-slate-400');
        const imgEl   = document.querySelector('aside img');
        if (nameEl)  nameEl.textContent  = name;
        if (emailEl) emailEl.textContent = USER.email || '';
        if (imgEl)   imgEl.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=6366f1&color=fff`;
    }

    // ── 4. LOAD PARAMS FROM API ───────────────────────────────────────────────
    async function loadParams() {
        const data = await apiFetch('/parametres/');
        if (data?.error) { toast('Impossible de charger les paramètres.', 'warning'); return; }
        loadedParams = Array.isArray(data) ? data : (data.results || []);
    }

    function getParam(name) {
        return loadedParams.find(p => p.nom_parametre === name);
    }

    async function saveParam(name, value) {
        const param = getParam(name);
        if (!param) {
            // Try to create — most backends don't allow POST on parametres, so just warn
            console.warn(`Param "${name}" not in DB`);
            return false;
        }
        if (!param.modifiable) return false;
        if (String(value) === String(param.valeur)) return true; // unchanged

        const result = await apiFetch(`/parametres/${param.id}/`, {
            method: 'PUT',
            body: JSON.stringify({ valeur: String(value) }),
        });
        if (result?.error) { console.error('Save param failed:', result.message); return false; }
        // Update local cache
        const idx = loadedParams.findIndex(p => p.id === param.id);
        if (idx !== -1) loadedParams[idx] = result;
        return true;
    }

    // ── 5. LOAD GROUPES (for langue/niveau/tarif data) ────────────────────────
    async function loadGroupes() {
        const data = await apiFetch('/groupes/');
        if (data?.error) return;
        loadedGroupes = Array.isArray(data) ? data : (data.results || []);
    }

    // ── 6. BUILD THE SETTINGS UI ──────────────────────────────────────────────
    // Finds the main content area and replaces it with proper param sections
    function buildUI() {
        const main = document.querySelector('main .p-8, main > div:not(.header)');
        if (!main) { console.warn('Could not find main content area'); return; }

        // Get establishment name from params
        const nomEtab  = getParam('NOM_ETABLISSEMENT')?.valeur || localStorage.getItem('etab_nom') || 'LanguePro';
        const emailP   = getParam('EMAIL_PRINCIPAL')?.valeur   || '';
        const tel      = getParam('TELEPHONE')?.valeur          || '';
        const seuil    = getParam('SEUIL_REUSSITE')?.valeur     || '10';
        const absLimit = getParam('LIMITE_ABSENCES')?.valeur    || '3';
        const duree    = getParam('DUREE_SEANCE_MIN')?.valeur   || '90';
        const capMax   = getParam('CAPACITE_MAX_GROUPE')?.valeur|| '20';
        const maxLogin = getParam('MAX_TENTATIVES_LOGIN')?.valeur|| '5';
        const lockMin  = getParam('DUREE_VERROUILLAGE_MIN')?.valeur || '30';

        // Extract unique languages & levels from groupes
        const langues = [...new Set(loadedGroupes.map(g => g.langue).filter(Boolean))];
        const niveaux = [...new Set(loadedGroupes.map(g => g.niveau).filter(Boolean))].sort();
        const tarifs  = loadedGroupes.reduce((acc, g) => {
            if (g.niveau && g.tarif_mensuel && !acc.find(t => t.niveau === g.niveau)) {
                acc.push({ niveau: g.niveau, tarif: g.tarif_mensuel });
            }
            return acc;
        }, []).sort((a, b) => a.niveau.localeCompare(b.niveau));

        main.innerHTML = `
        <!-- Tab bar -->
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1.5rem;
                    padding:.75rem;background:rgba(255,255,255,.04);border-radius:12px;">
            <button class="tab-btn active" data-tab="0">🏫 Établissement</button>
            <button class="tab-btn" data-tab="1">📚 Langues & Niveaux</button>
            <button class="tab-btn" data-tab="2">💰 Tarifs</button>
            <button class="tab-btn" data-tab="3">🎓 Pédagogie</button>
            <button class="tab-btn" data-tab="4">🔒 Sécurité</button>
        </div>

        <!-- TAB 0: Établissement -->
        <div id="tab-0" class="tab-content">
            <div class="section-panel">
                <div class="section-title">🏫 Informations de l'établissement</div>
                <p style="color:#64748b;font-size:.82rem;margin-bottom:1rem;">
                    Ces informations apparaissent sur la page de connexion et les documents générés.
                </p>
                <div style="display:grid;gap:.85rem;">
                    <div>
                        <label style="display:block;color:#94a3b8;font-size:.82rem;margin-bottom:.4rem;">
                            Nom de l'établissement
                        </label>
                        <input id="p-nom" class="param-input" value="${escHtml(nomEtab)}"
                               placeholder="ex: Centre de Langues LanguePro">
                        <p style="color:#64748b;font-size:.75rem;margin-top:.3rem;">
                            Affiché sur la page de connexion et les rapports.
                        </p>
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:.85rem;">
                        <div>
                            <label style="display:block;color:#94a3b8;font-size:.82rem;margin-bottom:.4rem;">Email principal</label>
                            <input id="p-email" class="param-input" type="email" value="${escHtml(emailP)}" placeholder="contact@centre.com">
                        </div>
                        <div>
                            <label style="display:block;color:#94a3b8;font-size:.82rem;margin-bottom:.4rem;">Téléphone</label>
                            <input id="p-tel" class="param-input" value="${escHtml(tel)}" placeholder="0555 12 34 56">
                        </div>
                    </div>
                </div>
                <button id="btn-save-etab" class="add-btn" style="margin-top:1.25rem;width:100%;">
                    💾 Enregistrer les informations
                </button>
            </div>

            <div class="section-panel">
                <div class="section-title">🖼️ Logo & Apparence</div>
                <div class="upload-zone" id="logo-zone">
                    <div style="font-size:2.5rem;margin-bottom:.5rem;">🏫</div>
                    <p style="color:#94a3b8;font-size:.875rem;">Cliquez ou glissez votre logo ici</p>
                    <p style="color:#64748b;font-size:.75rem;margin-top:.25rem;">PNG, JPG — max 2MB</p>
                </div>
            </div>
        </div>

        <!-- TAB 1: Langues & Niveaux -->
        <div id="tab-1" class="tab-content" style="display:none;">
            <div class="section-panel">
                <div class="section-title">🌍 Langues enseignées</div>
                <p style="color:#64748b;font-size:.82rem;margin-bottom:1rem;">
                    Les langues extraites de vos groupes existants. Ajoutez une nouvelle langue pour créer de futurs groupes.
                </p>
                <div id="langues-container" style="margin-bottom:1rem;min-height:40px;">
                    ${langues.map(l => buildLangueBadge(l)).join('') || '<span style="color:#64748b;font-size:.85rem;">Aucune langue configurée</span>'}
                </div>
                <div style="display:flex;gap:.75rem;align-items:center;">
                    <input id="new-langue" class="param-input" placeholder="ex: Arabe, Chinois..." style="flex:1;">
                    <button id="btn-add-langue" class="add-btn">+ Ajouter</button>
                </div>
            </div>

            <div class="section-panel">
                <div class="section-title">📊 Niveaux CEFR</div>
                <p style="color:#64748b;font-size:.82rem;margin-bottom:1rem;">
                    Niveaux utilisés dans vos groupes. Les modifier ici affecte les futurs groupes créés par le secrétariat.
                </p>
                <div id="niveaux-container" style="margin-bottom:1rem;min-height:40px;">
                    ${niveaux.map(n => buildNiveauTag(n)).join('') || '<span style="color:#64748b;font-size:.85rem;">Aucun niveau</span>'}
                </div>
                <div style="display:flex;gap:.75rem;align-items:center;">
                    <select id="new-niveau" class="param-input" style="flex:1;">
                        <option value="">-- Choisir un niveau --</option>
                        ${['A1','A2','B1','B2','C1','C2'].map(n =>
                            `<option value="${n}" ${niveaux.includes(n)?'disabled':''}>
                                ${n} ${niveaux.includes(n)?'(déjà actif)':''}
                            </option>`
                        ).join('')}
                    </select>
                    <button id="btn-add-niveau" class="add-btn">+ Activer</button>
                </div>
                <p style="color:#64748b;font-size:.75rem;margin-top:.75rem;">
                    ℹ️ Les niveaux sont sauvegardés dans le paramètre système NIVEAUX_ACTIFS.
                </p>
                <button id="btn-save-niveaux" class="add-btn" style="margin-top:.75rem;width:100%;">
                    💾 Enregistrer les niveaux
                </button>
            </div>
        </div>

        <!-- TAB 2: Tarifs -->
        <div id="tab-2" class="tab-content" style="display:none;">
            <div class="section-panel">
                <div class="section-title">💰 Tarifs mensuels par niveau</div>
                <p style="color:#64748b;font-size:.82rem;margin-bottom:1.25rem;">
                    Modifier un tarif ici mettra à jour tous les groupes de ce niveau.
                </p>
                <div id="tarifs-container">
                    ${tarifs.length
                        ? tarifs.map(t => buildTarifRow(t.niveau, t.tarif)).join('')
                        : '<p style="color:#64748b;font-size:.85rem;">Aucun groupe existant — créez des groupes d\'abord.</p>'
                    }
                </div>
                <div style="display:flex;gap:.75rem;margin-top:1rem;align-items:flex-end;">
                    <div style="flex:1;">
                        <label style="display:block;color:#94a3b8;font-size:.78rem;margin-bottom:.3rem;">Niveau</label>
                        <select id="new-tarif-niveau" class="param-input">
                            ${['A1','A2','B1','B2','C1','C2'].map(n=>`<option value="${n}">${n}</option>`).join('')}
                        </select>
                    </div>
                    <div style="flex:1;">
                        <label style="display:block;color:#94a3b8;font-size:.78rem;margin-bottom:.3rem;">Tarif (DA)</label>
                        <input id="new-tarif-montant" type="number" class="param-input" placeholder="8000">
                    </div>
                    <button id="btn-add-tarif" class="add-btn">+ Ajouter</button>
                </div>
                <button id="btn-save-tarifs" class="add-btn" style="margin-top:1.25rem;width:100%;background:#059669;">
                    💾 Appliquer les tarifs aux groupes
                </button>
            </div>
        </div>

        <!-- TAB 3: Pédagogie -->
        <div id="tab-3" class="tab-content" style="display:none;">
            <div class="section-panel">
                <div class="section-title">🎓 Paramètres pédagogiques</div>
                <div style="display:grid;gap:.85rem;">
                    <div class="param-row">
                        <div>
                            <div class="param-label">Seuil de réussite (note /20)</div>
                            <div style="color:#64748b;font-size:.75rem;">Note minimale pour passer au niveau suivant</div>
                        </div>
                        <input id="p-seuil" type="number" min="0" max="20" class="param-input"
                               value="${seuil}" style="width:100px;text-align:center;">
                    </div>
                    <div class="param-row">
                        <div>
                            <div class="param-label">Limite d'absences autorisées</div>
                            <div style="color:#64748b;font-size:.75rem;">Déclenchement d'alerte automatique au-delà</div>
                        </div>
                        <input id="p-abs" type="number" min="0" class="param-input"
                               value="${absLimit}" style="width:100px;text-align:center;">
                    </div>
                    <div class="param-row">
                        <div>
                            <div class="param-label">Durée d'une séance (minutes)</div>
                            <div style="color:#64748b;font-size:.75rem;">Utilisée pour le calcul des heures enseignant</div>
                        </div>
                        <input id="p-duree" type="number" min="30" class="param-input"
                               value="${duree}" style="width:100px;text-align:center;">
                    </div>
                    <div class="param-row">
                        <div>
                            <div class="param-label">Capacité max par groupe</div>
                            <div style="color:#64748b;font-size:.75rem;">Nombre maximum d'étudiants par groupe</div>
                        </div>
                        <input id="p-cap" type="number" min="1" class="param-input"
                               value="${capMax}" style="width:100px;text-align:center;">
                    </div>
                </div>
                <button id="btn-save-peda" class="add-btn" style="margin-top:1.25rem;width:100%;">
                    💾 Enregistrer paramètres pédagogiques
                </button>
            </div>
        </div>

        <!-- TAB 4: Sécurité -->
        <div id="tab-4" class="tab-content" style="display:none;">
            <div class="section-panel">
                <div class="section-title">🔒 Paramètres de sécurité</div>
                <div style="display:grid;gap:.85rem;">
                    <div class="param-row">
                        <div>
                            <div class="param-label">Tentatives de connexion max</div>
                            <div style="color:#64748b;font-size:.75rem;">Avant verrouillage du compte</div>
                        </div>
                        <input id="p-maxlogin" type="number" min="1" max="20" class="param-input"
                               value="${maxLogin}" style="width:100px;text-align:center;">
                    </div>
                    <div class="param-row">
                        <div>
                            <div class="param-label">Durée de verrouillage (minutes)</div>
                            <div style="color:#64748b;font-size:.75rem;">Durée avant déblocage automatique</div>
                        </div>
                        <input id="p-lockmin" type="number" min="1" class="param-input"
                               value="${lockMin}" style="width:100px;text-align:center;">
                    </div>
                    <div class="param-row">
                        <div>
                            <div class="param-label">Session JWT (secondes)</div>
                            <div style="color:#64748b;font-size:.75rem;">Durée de validité du token d'accès</div>
                        </div>
                        <input id="p-jwtsec" type="number" min="300" class="param-input"
                               value="${getParam('JWT_ACCESS_TOKEN_LIFETIME_SEC')?.valeur || '3600'}"
                               style="width:120px;text-align:center;">
                    </div>
                </div>
                <button id="btn-save-secu" class="add-btn" style="margin-top:1.25rem;width:100%;background:#ef4444;">
                    💾 Enregistrer paramètres de sécurité
                </button>
            </div>
        </div>
        `;

        setupTabsUI();
        setupEtabSave();
        setupLanguesUI();
        setupNiveauxUI(niveaux);
        setupTarifsUI(tarifs);
        setupPedaSave();
        setupSecuSave();
        setupLogoUpload();
    }

    function escHtml(s) {
        if (!s) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function buildLangueBadge(langue) {
        return `<span class="langue-badge" data-langue="${escHtml(langue)}">
            ${escHtml(langue)}
            <span class="remove-btn" onclick="removeLangue('${escHtml(langue)}')" title="Retirer">×</span>
        </span>`;
    }

    function buildNiveauTag(niveau) {
        return `<span class="niveau-tag" data-niveau="${escHtml(niveau)}">
            ${escHtml(niveau)}
        </span>`;
    }

    function buildTarifRow(niveau, tarif) {
        return `<div class="tarif-row" data-tarif-niveau="${escHtml(niveau)}">
            <span style="color:#e2e8f0;font-weight:600;">${escHtml(niveau)}</span>
            <input type="number" class="param-input tarif-input" data-niveau="${escHtml(niveau)}"
                   value="${tarif}" style="width:130px;text-align:center;"
                   placeholder="Tarif DA">
            <span style="color:#94a3b8;font-size:.82rem;">DA/mois</span>
        </div>`;
    }

    // ── 7. TAB SWITCHING ──────────────────────────────────────────────────────
    function setupTabsUI() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.tab;
                document.querySelectorAll('.tab-content').forEach(tc => {
                    tc.style.display = tc.id === `tab-${tab}` ? 'block' : 'none';
                });
            });
        });
    }

    // ── 8. ÉTABLISSEMENT SAVE ─────────────────────────────────────────────────
    function setupEtabSave() {
        document.getElementById('btn-save-etab')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-save-etab');
            btn.innerHTML = '⏳ Enregistrement...'; btn.disabled = true;

            const nom   = document.getElementById('p-nom').value.trim();
            const email = document.getElementById('p-email').value.trim();
            const tel   = document.getElementById('p-tel').value.trim();

            let saved = 0, errors = 0;

            if (nom) {
                const ok = await saveParam('NOM_ETABLISSEMENT', nom);
                ok ? saved++ : errors++;

                // ── KEY: sync to localStorage so login page reads it ──
                localStorage.setItem('etab_nom', nom);
                // Broadcast to other tabs
                try { localStorage.setItem('etab_updated', Date.now().toString()); } catch (_) {}
            }
            if (email) { const ok = await saveParam('EMAIL_PRINCIPAL', email); ok ? saved++ : errors++; }
            if (tel)   { const ok = await saveParam('TELEPHONE', tel);          ok ? saved++ : errors++; }

            btn.innerHTML = '💾 Enregistrer les informations'; btn.disabled = false;

            if (errors === 0) toast(`✅ Établissement mis à jour ! (${saved} param.)`, 'success');
            else              toast(`⚠️ ${saved} sauvés, ${errors} erreur(s)`, 'warning');
        });
    }

    // ── 9. LANGUES UI ─────────────────────────────────────────────────────────
    // Langues are stored as param LANGUES_ACTIVES (comma-separated)
    // AND can be used to filter group creation in secretariat
    function setupLanguesUI() {
        document.getElementById('btn-add-langue')?.addEventListener('click', () => {
            const input = document.getElementById('new-langue');
            const val   = input.value.trim();
            if (!val) return;

            const container = document.getElementById('langues-container');
            // Check duplicate
            if (container.querySelector(`[data-langue="${CSS.escape(val)}"]`)) {
                toast('Cette langue existe déjà.', 'warning'); return;
            }

            container.insertAdjacentHTML('beforeend', buildLangueBadge(val));
            input.value = '';
            saveLangues();
        });

        // Allow Enter key
        document.getElementById('new-langue')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') document.getElementById('btn-add-langue')?.click();
        });
    }

    window.removeLangue = function(langue) {
        document.querySelector(`[data-langue="${CSS.escape(langue)}"]`)?.remove();
        saveLangues();
    };

    async function saveLangues() {
        const container = document.getElementById('langues-container');
        const langues   = [...container.querySelectorAll('[data-langue]')]
                            .map(el => el.dataset.langue)
                            .filter(Boolean);
        const value = langues.join(',');
        const ok = await saveParam('LANGUES_ACTIVES', value);

        // Sync to localStorage for secretariat JS to read
        localStorage.setItem('langues_actives', value);

        if (ok) toast(`✅ Langues mises à jour: ${value || 'aucune'}`, 'success');
        else    toast('⚠️ Langues sauvegardées localement (param. non trouvé en DB)', 'info');
    }

    // ── 10. NIVEAUX UI ────────────────────────────────────────────────────────
    function setupNiveauxUI(currentNiveaux) {
        document.getElementById('btn-add-niveau')?.addEventListener('click', () => {
            const select = document.getElementById('new-niveau');
            const val    = select.value;
            if (!val) return;

            const container = document.getElementById('niveaux-container');
            if (container.querySelector(`[data-niveau="${val}"]`)) {
                toast('Ce niveau est déjà actif.', 'warning'); return;
            }

            container.insertAdjacentHTML('beforeend', buildNiveauTag(val));
            // Mark option as disabled
            select.querySelector(`option[value="${val}"]`).disabled = true;
            select.value = '';
        });

        document.getElementById('btn-save-niveaux')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-save-niveaux');
            btn.innerHTML = '⏳...'; btn.disabled = true;

            const container = document.getElementById('niveaux-container');
            const niveaux   = [...container.querySelectorAll('[data-niveau]')]
                                .map(el => el.dataset.niveau).filter(Boolean);
            const value = niveaux.join(',');

            const ok = await saveParam('NIVEAUX_ACTIFS', value);
            localStorage.setItem('niveaux_actifs', value);

            btn.innerHTML = '💾 Enregistrer les niveaux'; btn.disabled = false;
            toast(ok ? `✅ Niveaux actifs: ${value}` : `⚠️ Niveaux sauvés localement: ${value}`, ok ? 'success' : 'info');
        });
    }

    // ── 11. TARIFS UI ─────────────────────────────────────────────────────────
    function setupTarifsUI(existingTarifs) {
        document.getElementById('btn-add-tarif')?.addEventListener('click', () => {
            const niveau  = document.getElementById('new-tarif-niveau').value;
            const montant = document.getElementById('new-tarif-montant').value;
            if (!niveau || !montant) return;

            const container = document.getElementById('tarifs-container');
            // Remove existing row for this niveau if any
            container.querySelector(`[data-tarif-niveau="${niveau}"]`)?.remove();
            container.insertAdjacentHTML('beforeend', buildTarifRow(niveau, montant));
            document.getElementById('new-tarif-montant').value = '';
        });

        document.getElementById('btn-save-tarifs')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-save-tarifs');
            btn.innerHTML = '⏳ Application...'; btn.disabled = true;

            const rows = document.querySelectorAll('.tarif-input');
            let updated = 0, errors = 0;

            for (const input of rows) {
                const niveau = input.dataset.niveau;
                const tarif  = parseFloat(input.value);
                if (!niveau || !tarif) continue;

                // Find all groupes of this niveau and update their tarif
                const groupesNiveau = loadedGroupes.filter(g => g.niveau === niveau);
                for (const g of groupesNiveau) {
                    const result = await apiFetch(`/groupes/${g.id}/`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            ...g,
                            enseignant: g.enseignant,
                            tarif_mensuel: tarif,
                        }),
                    });
                    if (result?.error) errors++;
                    else { updated++; g.tarif_mensuel = tarif; }
                }

                // Also save as param for future reference
                await saveParam(`TARIF_${niveau}`, String(tarif));
                localStorage.setItem(`tarif_${niveau}`, String(tarif));
            }

            btn.innerHTML = '💾 Appliquer les tarifs aux groupes'; btn.disabled = false;

            if (errors === 0) toast(`✅ ${updated} groupe(s) mis à jour avec les nouveaux tarifs`, 'success');
            else toast(`⚠️ ${updated} mis à jour, ${errors} erreur(s)`, 'warning');
        });
    }

    // ── 12. PÉDAGOGIE SAVE ────────────────────────────────────────────────────
    function setupPedaSave() {
        document.getElementById('btn-save-peda')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-save-peda');
            btn.innerHTML = '⏳...'; btn.disabled = true;

            const results = await Promise.all([
                saveParam('SEUIL_REUSSITE',        document.getElementById('p-seuil')?.value),
                saveParam('LIMITE_ABSENCES',        document.getElementById('p-abs')?.value),
                saveParam('DUREE_SEANCE_MIN',       document.getElementById('p-duree')?.value),
                saveParam('CAPACITE_MAX_GROUPE',    document.getElementById('p-cap')?.value),
            ]);
            const saved  = results.filter(Boolean).length;
            const errors = results.length - saved;

            btn.innerHTML = '💾 Enregistrer paramètres pédagogiques'; btn.disabled = false;
            toast(errors === 0 ? `✅ ${saved} paramètre(s) pédagogiques sauvés` : `⚠️ ${saved} sauvés, ${errors} erreur(s)`,
                  errors === 0 ? 'success' : 'warning');
        });
    }

    // ── 13. SÉCURITÉ SAVE ─────────────────────────────────────────────────────
    function setupSecuSave() {
        document.getElementById('btn-save-secu')?.addEventListener('click', async () => {
            const btn = document.getElementById('btn-save-secu');
            btn.innerHTML = '⏳...'; btn.disabled = true;

            const results = await Promise.all([
                saveParam('MAX_TENTATIVES_LOGIN',      document.getElementById('p-maxlogin')?.value),
                saveParam('DUREE_VERROUILLAGE_MIN',    document.getElementById('p-lockmin')?.value),
                saveParam('JWT_ACCESS_TOKEN_LIFETIME_SEC', document.getElementById('p-jwtsec')?.value),
            ]);
            const saved  = results.filter(Boolean).length;
            const errors = results.length - saved;

            btn.innerHTML = '💾 Enregistrer paramètres de sécurité'; btn.disabled = false;
            toast(errors === 0 ? `✅ ${saved} paramètre(s) de sécurité sauvés` : `⚠️ ${saved} sauvés, ${errors} erreur(s)`,
                  errors === 0 ? 'success' : 'warning');
        });
    }

    // ── 14. LOGO UPLOAD ───────────────────────────────────────────────────────
    function setupLogoUpload() {
        const zone = document.getElementById('logo-zone');
        if (!zone) return;

        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        zone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 2 * 1024 * 1024) { toast('Fichier trop grand (max 2MB)', 'error'); return; }
            const reader = new FileReader();
            reader.onload = ev => {
                localStorage.setItem('etab_logo', ev.target.result);
                zone.innerHTML = `
                    <img src="${ev.target.result}" alt="Logo" style="max-height:80px;margin:0 auto .5rem;
                               border-radius:8px;display:block;">
                    <p style="color:#34d399;font-size:.8rem;margin-top:.3rem;">✓ ${file.name}</p>
                    <p style="color:#64748b;font-size:.75rem;">Cliquez pour changer</p>`;
                toast('Logo sauvegardé localement', 'success');
            };
            reader.readAsDataURL(file);
        });

        // Load existing logo
        const savedLogo = localStorage.getItem('etab_logo');
        if (savedLogo) {
            zone.innerHTML = `
                <img src="${savedLogo}" alt="Logo" style="max-height:80px;margin:0 auto .5rem;border-radius:8px;display:block;">
                <p style="color:#64748b;font-size:.75rem;margin-top:.3rem;">Cliquez pour changer</p>`;
        }
    }

    // ── 15. LOGOUT ────────────────────────────────────────────────────────────
    function setupLogout() {
        document.querySelectorAll('.logout-link').forEach(link => {
            link.addEventListener('click', async e => {
                e.preventDefault();
                const refresh = localStorage.getItem('refresh') || sessionStorage.getItem('refresh');
                if (refresh) {
                    await fetch(`${API}/auth/logout/`, {
                        method: 'POST', headers: authHeaders(),
                        body: JSON.stringify({ refresh }),
                    }).catch(() => {});
                }
                localStorage.clear(); sessionStorage.clear();
                window.location.href = '/login/';
            });
        });
    }

    // ── BOOT ──────────────────────────────────────────────────────────────────
    injectStyles();
    injectUser();
    setupLogout();

    // Load data first
    await Promise.all([loadParams(), loadGroupes()]);

    // Build the entire UI with real data
    buildUI();

    toast('✅ Paramètres chargés', 'success');
});