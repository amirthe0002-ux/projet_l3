// ressources_parent.js
// FIXES vs original:
// 1. Token lookup checks 'access' first (matches login response key)
// 2. apiFetch uses relative API_URL — no hardcoded host that breaks in prod
// 3. loadAll: enfants filtered to those WITH a groupe before fetching resources
// 4. Resource cards rendered correctly with parent-safe data
// 5. Download uses fetch + blob (no JWT in URL query string)
// 6. All modals use insertAdjacentHTML + live id lookup (no stale refs)

const API_BASE = '/api';

const state = {
    ressources:   [],
    filtered:     [],
    enfants:      [],
    searchTerm:   '',
    filterType:   'all',
    filterGroupe: 'all',
    viewMode:     'grid',
    downloads:    [],
};

// ── TOKEN ─────────────────────────────────────────────────────────────────────
function getToken() {
    return (
        localStorage.getItem('access') ||
        sessionStorage.getItem('access') ||
        localStorage.getItem('access_token') ||
        sessionStorage.getItem('access_token') ||
        null
    );
}
function getUser() {
    try {
        const raw = localStorage.getItem('user') || sessionStorage.getItem('user');
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}
function authHeaders() {
    const token = getToken();
    return token
        ? { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
        : { 'Content-Type': 'application/json' };
}

// ── SESSION CHECK ─────────────────────────────────────────────────────────────
function checkSession() {
    const token = getToken();
    const user  = getUser();
    if (!token || !user) { window.location.href = '/login/'; return null; }
    if (user.role !== 'Parent') { window.location.href = '/login/'; return null; }
    return user;
}

// ── API FETCH ─────────────────────────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
    try {
        const res = await fetch(`${API_BASE}${endpoint}`, {
            ...options,
            headers: { ...authHeaders(), ...options.headers },
        });
        if (res.status === 401) { window.location.href = '/login/'; return { error: 'AUTH' }; }
        if (res.status === 403) return { error: 'FORBIDDEN', message: 'Accès refusé.' };
        if (res.status === 204) return { success: true };
        const data = await res.json();
        if (!res.ok) return { error: 'API_ERROR', message: data.detail || data.error || JSON.stringify(data) };
        return data;
    } catch (e) {
        console.error('apiFetch error:', e);
        return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible.' };
    }
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    document.querySelector('.toast-parent-res')?.remove();
    const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
    const t = document.createElement('div');
    t.className = 'toast-parent-res';
    t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:9999;
        padding:14px 22px;border-radius:12px;background:${colors[type]};color:white;
        font-weight:500;font-size:.9rem;box-shadow:0 8px 24px rgba(0,0,0,.2);
        display:flex;align-items:center;gap:8px;max-width:420px;
        transform:translateX(120%);opacity:0;transition:all .3s ease;`;
    t.textContent = message;
    document.body.appendChild(t);
    requestAnimationFrame(() => { t.style.transform = 'translateX(0)'; t.style.opacity = '1'; });
    setTimeout(() => {
        t.style.transform = 'translateX(120%)'; t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 4000);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-DZ', { day:'numeric', month:'short', year:'numeric' });
}
function fmtSize(mb) {
    if (!mb && mb !== 0) return '—';
    const v = parseFloat(mb);
    return v < 1 ? `${Math.round(v * 1024)} KB` : `${v.toFixed(1)} MB`;
}
function typeIcon(type) {
    return ({
        PDF:      { icon:'📄', class:'preview-pdf',   badge:'PDF'      },
        PPT:      { icon:'📊', class:'preview-ppt',   badge:'PPT'      },
        Video:    { icon:'🎥', class:'preview-video', badge:'Vidéo'    },
        Audio:    { icon:'🎵', class:'preview-audio', badge:'Audio'    },
        Exercice: { icon:'📝', class:'preview-excel', badge:'Exercice' },
        Lien:     { icon:'🔗', class:'preview-image', badge:'Lien'     },
    })[type] || { icon:'📁', class:'preview-pdf', badge: type || 'Fichier' };
}
function actionLabel(type) {
    if (type === 'Video') return '▶️ Regarder';
    if (type === 'Audio') return '▶️ Écouter';
    if (type === 'Lien')  return '🔗 Ouvrir';
    return '📥 Télécharger';
}
function esc(s) {
    if (!s) return '';
    const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

// ── LOAD ALL ──────────────────────────────────────────────────────────────────
async function loadAll() {
    showSkeleton();

    // Step 1 — get this parent's children
    const etudData = await apiFetch('/etudiants/');
    if (etudData?.error) {
        showError('Impossible de charger les données. ' + (etudData.message || ''));
        return;
    }
    const enfants = Array.isArray(etudData) ? etudData : (etudData.results || []);
    state.enfants = enfants;

    // Step 2 — keep only children that have a groupe
    const enfantsWithGroupe = enfants.filter(e => e.groupe);
    if (!enfantsWithGroupe.length) {
        showEmpty('Vos enfants ne sont pas encore assignés à un groupe.');
        updateStorageCard([]);
        return;
    }

    // Step 3 — fetch resources for every child's groupe in parallel
    // The backend (fixed RessourceListCreateView) already filters by
    // visible_etudiants + niveau for parent role.
    // We pass groupe param as an extra filter so we get only relevant ones.
    const promises = enfantsWithGroupe.map(e =>
        apiFetch(`/ressources/?groupe=${e.groupe}`)
    );
    const results = await Promise.all(promises);

    // Step 4 — merge + deduplicate by id
    const seen = new Set();
    const all  = [];
    results.forEach((data, i) => {
        if (data?.error) return;
        const list = Array.isArray(data) ? data : (data.results || []);
        const enfant = enfantsWithGroupe[i];
        list.forEach(r => {
            if (seen.has(r.id)) return;
            seen.add(r.id);
            r._groupe_nom = r.groupe_nom || `Groupe #${enfant.groupe}`;
            r._enfant_nom = `${enfant.user?.first_name || ''} ${enfant.user?.last_name || ''}`.trim() || '—';
            all.push(r);
        });
    });

    all.sort((a, b) => new Date(b.date_creation) - new Date(a.date_creation));
    state.ressources = all;
    state.filtered   = [...all];

    fillGroupeFilter(enfantsWithGroupe);
    fillTypeFilter(all);
    updateStats(all);
    updateStorageCard(all);
    renderResources(all);
    renderDownloadHistory();
}

// ── FILTERS ───────────────────────────────────────────────────────────────────
function fillGroupeFilter(enfants) {
    const sel = document.querySelectorAll('.filter-dropdown')[0];
    if (!sel) return;
    sel.innerHTML = '<option value="all">Tous les groupes</option>';
    enfants.forEach(e => {
        const nom = e.groupe_nom || `Groupe #${e.groupe}`;
        const kid = `${e.user?.first_name || ''} ${e.user?.last_name || ''}`.trim();
        const opt = document.createElement('option');
        opt.value       = e.groupe;
        opt.textContent = `${nom} (${kid})`;
        sel.appendChild(opt);
    });
}

function fillTypeFilter(ressources) {
    const sel = document.querySelectorAll('.filter-dropdown')[1];
    if (!sel) return;
    const types = [...new Set(ressources.map(r => r.type_ressource).filter(Boolean))];
    sel.innerHTML = '<option value="all">Tous les types</option>';
    types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        sel.appendChild(opt);
    });
}

function applyFilters() {
    let r = [...state.ressources];
    if (state.searchTerm) {
        const t = state.searchTerm.toLowerCase();
        r = r.filter(x =>
            (x.titre || '').toLowerCase().includes(t) ||
            (x.description || '').toLowerCase().includes(t) ||
            (x._groupe_nom || '').toLowerCase().includes(t)
        );
    }
    if (state.filterType !== 'all')
        r = r.filter(x => x.type_ressource === state.filterType);
    if (state.filterGroupe !== 'all')
        r = r.filter(x => String(x.groupe) === String(state.filterGroupe));

    state.filtered = r;
    renderResources(r);
}

// ── STATS ─────────────────────────────────────────────────────────────────────
function updateStats(ressources) {
    const counts = [
        ressources.length,
        ressources.filter(r => r.type_ressource === 'PDF').length,
        ressources.filter(r => r.type_ressource === 'Video').length,
        ressources.filter(r => r.type_ressource === 'Audio').length,
        ressources.filter(r => r.type_ressource === 'PPT').length,
        ressources.filter(r => r.type_ressource === 'Exercice').length,
    ];
    document.querySelectorAll('.category-btn').forEach((btn, i) => {
        let badge = btn.querySelector('.cat-count');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'cat-count';
            badge.style.cssText = 'background:rgba(255,255,255,.3);padding:1px 6px;border-radius:10px;font-size:.7rem;margin-left:4px;font-weight:700;';
            btn.appendChild(badge);
        }
        badge.textContent = counts[i] || 0;
    });
}

function updateStorageCard(ressources) {
    const totalMB = ressources.reduce((s, r) => s + (parseFloat(r.taille_fichier) || 0), 0);
    const pct     = Math.min(100, Math.round((totalMB / 1024) * 100));
    const valEl   = document.querySelector('.storage-value');
    const fillEl  = document.querySelector('.storage-fill');
    if (valEl)  valEl.textContent = `${fmtSize(totalMB)} / 1 GB`;
    if (fillEl) fillEl.style.width = `${pct}%`;
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderResources(ressources) {
    const grid = document.querySelector('.resources-grid');
    if (!grid) return;

    if (!ressources.length) {
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#94a3b8;">
                <div style="font-size:3rem;margin-bottom:1rem;">📁</div>
                <p style="font-size:1.1rem;font-weight:600;">Aucune ressource trouvée</p>
                <p style="font-size:.875rem;margin-top:.5rem;">
                    ${state.searchTerm
                        ? `Aucun résultat pour "${esc(state.searchTerm)}"`
                        : 'Les enseignants n\'ont pas encore partagé de ressources.'}
                </p>
            </div>`;
        return;
    }

    if (state.viewMode === 'list') {
        renderList(ressources, grid);
    } else {
        renderGrid(ressources, grid);
    }
}

function renderGrid(ressources, grid) {
    grid.style.display = '';
    grid.innerHTML = ressources.map(r => {
        const t = typeIcon(r.type_ressource);
        return `
        <div class="resource-card" data-id="${r.id}">
            <div class="resource-preview ${t.class}">${t.icon}
                <span class="resource-type-badge">${t.badge}</span>
            </div>
            <div class="resource-info">
                <h3 class="resource-title">${esc(r.titre || '—')}</h3>
                <div class="resource-meta">
                    <span class="meta-item">📅 ${fmtDate(r.date_creation)}</span>
                    ${r.taille_fichier ? `<span class="meta-item">💾 ${fmtSize(r.taille_fichier)}</span>` : ''}
                    <span class="meta-item">👁️ ${r.nombre_telechargements || 0} téléch.</span>
                </div>
                <div class="resource-tags">
                    ${r.niveau ? `<span class="tag">${r.niveau}</span>` : ''}
                    ${r._groupe_nom ? `<span class="tag">${esc(r._groupe_nom)}</span>` : ''}
                    ${r._enfant_nom ? `<span class="tag" style="background:#fef3c7;color:#92400e;">📌 ${esc(r._enfant_nom)}</span>` : ''}
                </div>
                ${r.description ? `<p style="font-size:.8rem;color:#64748b;margin:.5rem 0 0;line-height:1.4;">
                    ${esc(r.description.slice(0, 100))}${r.description.length > 100 ? '…' : ''}
                </p>` : ''}
                <div class="resource-actions" style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap;">
                    <button class="action-btn primary dl-btn" data-id="${r.id}"
                            data-titre="${esc(r.titre || 'ressource')}"
                            data-type="${r.type_ressource}"
                            data-lien="${r.url_lien || ''}">
                        ${actionLabel(r.type_ressource)}
                    </button>
                    <button class="action-btn detail-btn" data-id="${r.id}">
                        👁️ Détails
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');

    // Delegated events on grid
    grid.onclick = handleGridClick;
}

function renderList(ressources, grid) {
    grid.style.display = 'block';
    grid.innerHTML = ressources.map(r => {
        const t = typeIcon(r.type_ressource);
        return `
        <div style="display:flex;align-items:center;gap:1rem;padding:1rem;
                    background:white;border-radius:12px;margin-bottom:.5rem;
                    box-shadow:0 1px 4px rgba(0,0,0,.06);" data-id="${r.id}">
            <div style="width:48px;height:48px;border-radius:10px;background:#f0f4ff;
                        display:flex;align-items:center;justify-content:center;font-size:1.5rem;flex-shrink:0;">
                ${t.icon}
            </div>
            <div style="flex:1;min-width:0;">
                <div style="font-weight:600;color:#1e293b;font-size:.95rem;
                            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    ${esc(r.titre || '—')}
                </div>
                <div style="font-size:.75rem;color:#64748b;margin-top:2px;">
                    ${esc(r._groupe_nom)} • ${fmtDate(r.date_creation)}
                    ${r.taille_fichier ? ` • ${fmtSize(r.taille_fichier)}` : ''}
                </div>
            </div>
            <div style="display:flex;gap:.5rem;flex-shrink:0;">
                <button class="action-btn primary dl-btn" style="padding:.5rem 1rem;font-size:.8rem;"
                        data-id="${r.id}" data-titre="${esc(r.titre || 'ressource')}"
                        data-type="${r.type_ressource}" data-lien="${r.url_lien || ''}">
                    ${actionLabel(r.type_ressource)}
                </button>
                <button class="action-btn detail-btn" style="padding:.5rem 1rem;font-size:.8rem;"
                        data-id="${r.id}">👁️</button>
            </div>
        </div>`;
    }).join('');

    grid.onclick = handleGridClick;
}

function handleGridClick(e) {
    const dlBtn     = e.target.closest('.dl-btn');
    const detailBtn = e.target.closest('.detail-btn');

    if (dlBtn) {
        const id    = parseInt(dlBtn.dataset.id);
        const titre = dlBtn.dataset.titre;
        const type  = dlBtn.dataset.type;
        const lien  = dlBtn.dataset.lien;
        downloadRessource(id, titre, type, lien);
    }
    if (detailBtn) {
        openModalDetail(parseInt(detailBtn.dataset.id));
    }
}

// ── DOWNLOAD ──────────────────────────────────────────────────────────────────
async function downloadRessource(id, titre, type, urlLien) {
    if (type === 'Lien' && urlLien) { window.open(urlLien, '_blank'); return; }

    showToast(`⬇️ Téléchargement de "${titre}"…`, 'info');

    try {
        const res = await fetch(`${API_BASE}/ressources/${id}/download/`, {
            headers: authHeaders()
        });

        if (!res.ok) {
            if (res.status === 401) { window.location.href = '/login/'; return; }
            showToast(`❌ Erreur ${res.status}`, 'error');
            return;
        }

        const blob = await res.blob();
        const url  = URL.createObjectURL(blob);
        const cd   = res.headers.get('content-disposition') || '';
        const m    = cd.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        const name = m ? m[1].replace(/['"]/g, '') : titre;
        const a    = Object.assign(document.createElement('a'), { href: url, download: name });
        document.body.appendChild(a); a.click();
        URL.revokeObjectURL(url); a.remove();

        showToast(`✅ "${titre}" téléchargé !`, 'success');

        // Local history
        state.downloads.unshift({
            titre, type,
            date: new Date().toLocaleString('fr-DZ', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }),
            size: state.ressources.find(r => r.id === id)?.taille_fichier,
        });
        renderDownloadHistory();

        // Update count locally
        const r = state.ressources.find(x => x.id === id);
        if (r) r.nombre_telechargements = (r.nombre_telechargements || 0) + 1;

    } catch (e) {
        console.error('download error:', e);
        showToast('❌ Erreur réseau lors du téléchargement.', 'error');
    }
}

// ── DETAIL MODAL ──────────────────────────────────────────────────────────────
function openModalDetail(id) {
    const r = state.ressources.find(x => x.id === id);
    if (!r) return;
    const t = typeIcon(r.type_ressource);

    document.getElementById('modal-detail-res')?.remove();

    document.body.insertAdjacentHTML('beforeend', `
    <div id="modal-detail-res" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:2000;
         display:flex;align-items:center;justify-content:center;">
        <div style="background:white;border-radius:20px;width:90%;max-width:500px;
                    max-height:90vh;overflow-y:auto;">
            <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:1.75rem 2rem;
                        border-radius:20px 20px 0 0;color:white;
                        display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="display:flex;align-items:center;gap:1rem;">
                    <div style="width:52px;height:52px;border-radius:12px;background:rgba(255,255,255,.2);
                                display:flex;align-items:center;justify-content:center;font-size:1.6rem;">
                        ${t.icon}
                    </div>
                    <div>
                        <h3 style="margin:0;font-size:1.1rem;font-weight:700;">${esc(r.titre || '—')}</h3>
                        <p style="margin:4px 0 0;opacity:.85;font-size:.8rem;">${t.badge} • ${esc(r._groupe_nom)}</p>
                    </div>
                </div>
                <button id="modal-detail-close"
                        style="background:rgba(255,255,255,.2);border:none;color:white;
                               width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:1.2rem;">×</button>
            </div>

            <div style="padding:1.5rem;">
                ${r.description ? `
                    <div style="background:#f8fafc;border-radius:10px;padding:1rem;margin-bottom:1.25rem;">
                        <p style="margin:0;color:#374151;font-size:.9rem;line-height:1.6;">${esc(r.description)}</p>
                    </div>` : ''}

                <div style="display:flex;flex-direction:column;gap:.65rem;margin-bottom:1.5rem;">
                    ${[
                        ['📅', 'Date ajout',      fmtDate(r.date_creation)],
                        ['🎓', 'Niveau',           r.niveau || '—'],
                        ['👥', 'Groupe',            esc(r._groupe_nom || '—')],
                        ['👤', 'Pour',              esc(r._enfant_nom || '—')],
                        ['💾', 'Taille',            r.taille_fichier ? fmtSize(r.taille_fichier) : '—'],
                        ['👁️', 'Téléchargements',   r.nombre_telechargements || 0],
                        ['👨‍🏫', 'Enseignant',        esc(r.enseignant_nom || '—')],
                    ].map(([ic, lb, v]) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;
                                    padding:.6rem 1rem;background:#f8fafc;border-radius:8px;">
                            <span style="color:#64748b;font-size:.875rem;">${ic} ${lb}</span>
                            <strong style="color:#1e293b;font-size:.875rem;text-align:right;">${v}</strong>
                        </div>`).join('')}
                </div>

                <button id="modal-detail-dl"
                        style="width:100%;padding:.875rem;border:none;border-radius:10px;
                               background:linear-gradient(135deg,#6366f1,#8b5cf6);
                               color:white;font-weight:700;font-size:1rem;cursor:pointer;">
                    ${actionLabel(r.type_ressource)}
                </button>
            </div>
        </div>
    </div>`);

    const modal = document.getElementById('modal-detail-res');
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
    document.getElementById('modal-detail-close').addEventListener('click', () => modal.remove());
    document.getElementById('modal-detail-dl').addEventListener('click', () => {
        modal.remove();
        downloadRessource(r.id, r.titre || 'ressource', r.type_ressource, r.url_lien || '');
    });
}

// ── DOWNLOAD HISTORY ──────────────────────────────────────────────────────────
function renderDownloadHistory() {
    const list = document.querySelector('.download-list');
    if (!list) return;

    if (!state.downloads.length) {
        list.innerHTML = `
            <div style="text-align:center;padding:1.5rem;color:#94a3b8;font-size:.875rem;">
                <span style="font-size:1.5rem;display:block;margin-bottom:.5rem;">📂</span>
                Aucun téléchargement dans cette session.
            </div>`;
        return;
    }

    list.innerHTML = state.downloads.slice(0, 5).map(d => {
        const ti = typeIcon(d.type);
        return `
        <div class="download-item">
            <div class="download-icon">${ti.icon}</div>
            <div class="download-info">
                <div class="download-title">${esc(d.titre)}</div>
                <div class="download-meta">Téléchargé ${d.date}${d.size ? ` • ${fmtSize(d.size)}` : ''}</div>
            </div>
            <div class="download-status"><span>✓</span><span>Terminé</span></div>
        </div>`;
    }).join('');
}

// ── SKELETON / EMPTY / ERROR ──────────────────────────────────────────────────
function showSkeleton() {
    const grid = document.querySelector('.resources-grid');
    if (!grid) return;
    grid.innerHTML = Array(6).fill(0).map(() => `
        <div class="resource-card" style="pointer-events:none;">
            <div class="resource-preview" style="background:#e2e8f0;"></div>
            <div class="resource-info">
                <div style="height:1rem;background:#e2e8f0;border-radius:4px;margin-bottom:.5rem;"></div>
                <div style="height:.75rem;background:#e2e8f0;border-radius:4px;width:60%;"></div>
            </div>
        </div>`).join('');
}

function showEmpty(msg) {
    const grid = document.querySelector('.resources-grid');
    if (grid) grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#94a3b8;">
            <div style="font-size:3rem;margin-bottom:1rem;">📁</div>
            <p style="font-weight:600;">${msg}</p>
        </div>`;
}

function showError(msg) {
    const grid = document.querySelector('.resources-grid');
    if (grid) grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:3rem;color:#dc2626;">
            <div style="font-size:3rem;margin-bottom:1rem;">❌</div>
            <p style="font-weight:600;">${msg}</p>
            <button onclick="loadAll()" style="margin-top:1rem;padding:8px 16px;
                background:#6366f1;color:white;border:none;border-radius:8px;cursor:pointer;">
                Réessayer
            </button>
        </div>`;
}

// ── SETUP EVENTS ──────────────────────────────────────────────────────────────
function setupEvents() {
    // Search
    const searchInput = document.querySelector('.search-input input');
    if (searchInput) {
        let tmr;
        searchInput.addEventListener('input', e => {
            clearTimeout(tmr);
            tmr = setTimeout(() => { state.searchTerm = e.target.value.trim(); applyFilters(); }, 300);
        });
    }

    // Dropdowns
    const selects = document.querySelectorAll('.filter-dropdown');
    if (selects[0]) selects[0].addEventListener('change', e => { state.filterGroupe = e.target.value; applyFilters(); });
    if (selects[1]) selects[1].addEventListener('change', e => { state.filterType   = e.target.value; applyFilters(); });

    // Category buttons
    const typeMap = { 0:'all', 1:'PDF', 2:'Video', 3:'Audio', 4:'PPT', 5:'Exercice' };
    document.querySelectorAll('.category-btn').forEach((btn, i) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.filterType = typeMap[i] || 'all';
            applyFilters();
        });
    });

    // View toggle (Grille / Liste)
    document.querySelectorAll('.view-btn').forEach((btn, i) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.viewMode = i === 0 ? 'grid' : 'list';
            renderResources(state.filtered);
        });
    });
}

// ── INJECT STYLES ─────────────────────────────────────────────────────────────
function injectStyles() {
    if (document.getElementById('res-parent-styles')) return;
    document.head.insertAdjacentHTML('beforeend', `<style id="res-parent-styles">
        @keyframes fadeIn { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
        .resource-card { animation:fadeIn .4s ease; transition:transform .2s,box-shadow .2s; }
        .resource-card:hover { transform:translateY(-3px); box-shadow:0 8px 20px rgba(0,0,0,.1); }
        .action-btn { cursor:pointer; border:none; border-radius:8px; padding:.6rem 1.2rem;
                      font-weight:600; font-size:.85rem; transition:all .15s; }
        .action-btn:hover { opacity:.88; transform:translateY(-1px); }
        .action-btn.primary { background:linear-gradient(135deg,#6366f1,#8b5cf6); color:white; }
        .action-btn:not(.primary) { background:#f1f5f9; color:#374151; }
        .category-btn.active { background:var(--primary,#6366f1)!important; color:white!important; }
    </style>`);
}

// ── INIT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;
    injectStyles();
    setupEvents();
    await loadAll();
});