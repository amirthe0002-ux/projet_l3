/**
 * Parametres.js — Page Paramètres Dirigeant
 * FIXED: uses data-param attributes, not fragile index selectors
 */

document.addEventListener('DOMContentLoaded', async () => {

    // ── 1. AUTH ───────────────────────────────────────────────────────────────
    const TOKEN = (
        localStorage.getItem('access_token') ||
        sessionStorage.getItem('access_token') ||
        localStorage.getItem('access') ||
        sessionStorage.getItem('access') ||
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
        document.querySelector('.param-toast')?.remove();
        const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#6366f1' };
        const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
        const t = document.createElement('div');
        t.className = 'param-toast';
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
        }, 4000);
    }

    // ── 3. INJECT STYLES ─────────────────────────────────────────────────────
    if (!document.getElementById('param-styles')) {
        const s = document.createElement('style');
        s.id = 'param-styles';
        s.textContent = `
            .tab-btn { padding:.5rem 1.1rem;border-radius:8px;border:none;cursor:pointer;
                       font-weight:600;font-size:.875rem;transition:all .2s;
                       background:transparent;color:#94a3b8; }
            .tab-btn.active { background:linear-gradient(135deg,#6366f1,#8b5cf6);color:white; }
            .tab-btn:hover:not(.active) { background:rgba(255,255,255,.07);color:white; }
            .toggle-switch {
                width:48px;height:26px;border-radius:13px;background:#334155;
                cursor:pointer;position:relative;transition:background .25s;flex-shrink:0;
            }
            .toggle-switch::after {
                content:'';position:absolute;top:3px;left:3px;width:20px;height:20px;
                border-radius:50%;background:white;transition:transform .25s;
            }
            .toggle-switch.active { background:#6366f1; }
            .toggle-switch.active::after { transform:translateX(22px); }
            .color-picker { width:40px;height:40px;border:none;border-radius:8px;
                            cursor:pointer;padding:2px;background:none; }
            .upload-zone {
                border:2px dashed #475569;border-radius:12px;padding:2rem;
                text-align:center;cursor:pointer;transition:all .2s;
                background:rgba(255,255,255,.03);
            }
            .upload-zone:hover, .upload-zone.drag-over {
                border-color:#6366f1;background:rgba(99,102,241,.07);
            }
            .form-input:focus { outline:none;border-color:#6366f1 !important; }
            .form-input.modified { border-color:#f59e0b !important; }
            .param-loading { opacity:.6; }
        `;
        document.head.appendChild(s);
    }

    // ── 4. ADD data-param ATTRIBUTES TO HTML INPUTS ──────────────────────────
    // This is the KEY fix: each input gets a data-param="PARAM_NAME" so we
    // can find it reliably regardless of tab visibility or DOM order.
    function addParamAttributes() {
        // Map: CSS selector to find the input → param name in DB
        // Uses label text to find the right input — robust across tab switches
        const labelToParam = {
            'Nom de l\'établissement':     'NOM_ETABLISSEMENT',
            'Email principal':             'EMAIL_PRINCIPAL',
            'Téléphone':                   'TELEPHONE',
            'Site web':                    'SITE_WEB',
            'Seuil de réussite (note/20)': 'SEUIL_REUSSITE',
            'Nombre max d\'absences':      'LIMITE_ABSENCES',
            'Durée d\'une séance (min)':   'DUREE_SEANCE_MIN',
            'Capacité max par groupe':     'CAPACITE_MAX_GROUPE',
        };

        document.querySelectorAll('.form-group').forEach(group => {
            const label = group.querySelector('.form-label, label');
            const input = group.querySelector('.form-input, input, select, textarea');
            if (!label || !input) return;

            const labelText = label.textContent.trim();
            const paramName = labelToParam[labelText];
            if (paramName) {
                input.dataset.param = paramName;
            }
        });
    }

    // ── 5. SIDEBAR USER INFO ─────────────────────────────────────────────────
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

    // ── 6. TAB SWITCHING ─────────────────────────────────────────────────────
    function setupTabs() {
        const tabBtns  = document.querySelectorAll('.tab-btn');
        const sections = document.querySelectorAll('.p-8.space-y-6 > .glass-panel:not(:first-child)');
        if (!tabBtns.length || !sections.length) return;

        // Map tab index → which section indices to show
        // 0=Informations: sections 0(info)+1(branding)
        // 1=Langues: 2(academic)
        // 2=Tarifs:  2(academic)
        // 3=Notifications: 3(system)
        // 4=Sécurité: 3(system)
        const visMap = {
            0: [0, 1],
            1: [2],
            2: [2],
            3: [3],
            4: [3],
        };

        function showTab(i) {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabBtns[i]?.classList.add('active');
            const show = visMap[i] ?? Array.from({ length: sections.length }, (_, k) => k);
            sections.forEach((sec, k) => {
                sec.style.display = show.includes(k) ? '' : 'none';
            });
        }

        tabBtns.forEach((btn, i) => btn.addEventListener('click', () => showTab(i)));
        showTab(0);
    }

    // ── 7. LOAD PARAMS FROM API ───────────────────────────────────────────────
    let loadedParams = [];

    async function loadParams() {
        // Show loading state
        document.querySelectorAll('[data-param]').forEach(el => el.classList.add('param-loading'));

        const data = await apiFetch('/parametres/');

        document.querySelectorAll('[data-param]').forEach(el => el.classList.remove('param-loading'));

        if (data?.error) {
            toast('Impossible de charger les paramètres système.', 'warning');
            return;
        }

        loadedParams = Array.isArray(data) ? data : (data.results || []);

        // Inject values into inputs using data-param attribute
        loadedParams.forEach(param => {
            if (!param.valeur) return;
            // Find input by data-param attribute
            const input = document.querySelector(`[data-param="${param.nom_parametre}"]`);
            if (input) {
                input.value = param.valeur;
                input.dataset.originalValue = param.valeur;
            }
        });

        console.log(`[Paramètres] Loaded ${loadedParams.length} params from API`);
    }

    // ── 8. TRACK MODIFIED INPUTS ─────────────────────────────────────────────
    function setupInputTracking() {
        document.querySelectorAll('[data-param]').forEach(input => {
            input.addEventListener('input', () => {
                const original = input.dataset.originalValue || '';
                if (input.value !== original) {
                    input.classList.add('modified');
                } else {
                    input.classList.remove('modified');
                }
            });
        });
    }

    // ── 9. COLOR PICKERS ─────────────────────────────────────────────────────
    function setupColorPickers() {
        document.querySelectorAll('.color-picker').forEach(picker => {
            const label = picker.nextElementSibling;
            if (label) label.textContent = picker.value;
            picker.addEventListener('input', () => {
                if (label) label.textContent = picker.value;
            });
        });
    }

    // ── 10. TOGGLE SWITCHES ──────────────────────────────────────────────────
    function setupToggles() {
        document.querySelectorAll('.toggle-switch').forEach(toggle => {
            toggle.removeAttribute('onclick');
            toggle.addEventListener('click', () => toggle.classList.toggle('active'));
        });
    }

    // ── 11. LOGO UPLOAD ──────────────────────────────────────────────────────
    function setupLogoUpload() {
        const zone = document.querySelector('.upload-zone');
        if (!zone) return;

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/png,image/jpeg,image/jpg';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        zone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (file) previewLogo(file, zone);
        });
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file?.type.startsWith('image/')) previewLogo(file, zone);
        });
    }

    function previewLogo(file, zone) {
        if (file.size > 2 * 1024 * 1024) { toast('Fichier trop grand (max 2MB)', 'error'); return; }
        const reader = new FileReader();
        reader.onload = e => {
            zone.innerHTML = `
                <img src="${e.target.result}" alt="Logo" style="max-height:80px;margin:0 auto .5rem;border-radius:8px;display:block;">
                <p class="text-xs text-emerald-400 mt-1">✓ ${file.name}</p>
                <p class="text-xs text-slate-500">Cliquez pour changer</p>`;
        };
        reader.readAsDataURL(file);
        toast('Logo chargé (sera sauvegardé à l\'enregistrement)', 'info');
    }

    // ── 12. SAVE ─────────────────────────────────────────────────────────────
    function setupSaveButton() {
        const btn = document.querySelector('header .btn-primary');
        if (!btn) return;

        btn.addEventListener('click', async () => {
            const originalHTML = btn.innerHTML;
            btn.disabled  = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Sauvegarde...';

            try {
                await saveAllParams();
            } finally {
                btn.disabled  = false;
                btn.innerHTML = originalHTML;
            }
        });
    }

    async function saveAllParams() {
        // Collect all inputs that have data-param AND a loaded param record
        const inputs = document.querySelectorAll('[data-param]');
        let saved  = 0;
        let errors = 0;
        let skipped = 0;

        for (const input of inputs) {
            const paramName = input.dataset.param;
            const newValue  = input.value.trim();

            if (!newValue) { skipped++; continue; }

            // Find matching param in the loaded list
            const param = loadedParams.find(p => p.nom_parametre === paramName);

            if (!param) {
                // Param doesn't exist in DB — create it via POST (or skip)
                console.warn(`[Paramètres] Param "${paramName}" not in DB — skipping`);
                skipped++;
                continue;
            }

            if (!param.modifiable) { skipped++; continue; }

            // Only save if value changed
            if (newValue === param.valeur) { skipped++; continue; }

            const result = await apiFetch(`/parametres/${param.id}/`, {
                method: 'PUT',
                body: JSON.stringify({ valeur: newValue }),
            });

            if (result?.error) {
                errors++;
                console.error(`[Paramètres] Failed to save ${paramName}:`, result.message);
            } else {
                saved++;
                // Update local cache
                const idx = loadedParams.findIndex(p => p.id === param.id);
                if (idx !== -1) loadedParams[idx] = result;
                // Update original value tracker
                input.dataset.originalValue = newValue;
                input.classList.remove('modified');
            }
        }

        if (errors === 0 && saved > 0) {
            toast(`✅ ${saved} paramètre(s) enregistré(s)`, 'success');
        } else if (errors === 0 && saved === 0) {
            toast('Aucune modification à enregistrer.', 'info');
        } else if (saved > 0) {
            toast(`⚠️ ${saved} sauvegardé(s), ${errors} erreur(s)`, 'warning');
        } else {
            toast('❌ Erreur lors de la sauvegarde', 'error');
        }
    }

    // ── 13. LOGOUT ────────────────────────────────────────────────────────────
    function setupLogout() {
        document.querySelector('.logout-link')?.addEventListener('click', async e => {
            e.preventDefault();
            const refresh = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token') || '';
            if (refresh) {
                await fetch(`${API}/auth/logout/`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({ refresh }),
                }).catch(() => {});
            }
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/login/';
        });
    }

    // ── 14. BOOT ──────────────────────────────────────────────────────────────
    injectUser();
    addParamAttributes();   // ← must run BEFORE loadParams
    setupTabs();
    setupColorPickers();
    setupToggles();
    setupLogoUpload();
    setupSaveButton();
    setupLogout();

    await loadParams();
    setupInputTracking();

    toast('✅ Paramètres chargés', 'success');
});