/**
 * Ressources - Espace Enseignant
 * JWT Authentication + Django REST API
 * FIXED: asks for langue, niveau, groupe before upload
 */

document.addEventListener('DOMContentLoaded', function () {

    // ============================================================
    // STATE
    // ============================================================
    const state = {
        resources:     [],
        groupes:       [],       // loaded from /api/groupes/
        currentFilter: 'all',
        searchQuery:   '',
        authToken:     localStorage.getItem('access_token') || sessionStorage.getItem('access_token') || null,
        apiBaseUrl:    '/api',
    };

    // ============================================================
    // DOM
    // ============================================================
    const elements = {
        uploadArea:    document.querySelector('.upload-area'),
        uploadBtn:     document.querySelector('.upload-btn'),
        searchInput:   document.querySelector('.search-box input'),
        filterTabs:    document.querySelectorAll('.tab-btn'),
        resourcesGrid: document.querySelector('.resources-grid'),
        fileInput:     null,
    };

    // ============================================================
    // INIT
    // ============================================================
    if (!state.authToken) {
        showNotification('Veuillez vous connecter.', 'error');
        setTimeout(() => { window.location.href = '/login/'; }, 1500);
        return;
    }

    createFileInput();
    setupEventListeners();
    setupDragAndDrop();
    loadGroupes();          // load groupes first
    loadResources();

    // ============================================================
    // FILE INPUT
    // ============================================================
    function createFileInput() {
        elements.fileInput = document.createElement('input');
        elements.fileInput.type = 'file';
        elements.fileInput.multiple = true;
        elements.fileInput.accept = '.pdf,.mp4,.mp3,.doc,.docx,.ppt,.pptx';
        elements.fileInput.style.display = 'none';
        document.body.appendChild(elements.fileInput);
        elements.fileInput.addEventListener('change', (e) => handleFilesSelected(e.target.files));
    }

    // ============================================================
    // LOAD GROUPES (for the modal select)
    // GroupeSerializer fields: id, nom_groupe, langue, niveau
    // ============================================================
    async function loadGroupes() {
        try {
            const res = await fetch(`${state.apiBaseUrl}/groupes/`, {
                headers: { 'Authorization': `Bearer ${state.authToken}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            state.groupes = Array.isArray(data) ? data : [];
        } catch (e) {
            state.groupes = [];
        }
    }

    // ============================================================
    // LOAD RESOURCES
    // ============================================================
    async function loadResources() {
        showGridSkeleton();
        try {
            const res = await fetch(`${state.apiBaseUrl}/ressources/`, {
                headers: { 'Authorization': `Bearer ${state.authToken}` }
            });
            if (res.status === 401) { redirectLogin(); return; }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            state.resources = Array.isArray(data) ? data : (data.results || []);
            renderResources(state.resources);
            updateStats(state.resources);
        } catch (e) {
            showNotification('Erreur chargement ressources.', 'error');
            showNoResults();
        }
    }

    // ============================================================
    // RENDER RESOURCES
    // ============================================================
    function renderResources(list) {
        elements.resourcesGrid.innerHTML = '';
        if (!list.length) { showNoResults(); return; }
        list.forEach(r => {
            const card = buildCard(r);
            elements.resourcesGrid.appendChild(card);
            setupCardActions(card, r.id);
        });
    }

    function buildCard(resource) {
        const card = document.createElement('div');
        card.className = 'resource-card';
        card.dataset.type  = mapTypeClass(resource.type_ressource);
        card.dataset.title = (resource.titre || '').toLowerCase();
        card.dataset.id    = resource.id;

        const cfg   = typeConfig(resource.type_ressource);
        const date  = new Date(resource.date_creation || Date.now())
            .toLocaleDateString('fr-FR', { day:'numeric', month:'long', year:'numeric' });

        // RessourceSerializer flat fields:
        // titre, description, type_ressource, niveau, groupe_nom (get_groupe_nom),
        // enseignant_nom (get_enseignant_nom), nombre_telechargements, visible_etudiants
        const groupe = resource.groupe_nom || '—';
        const niveau = resource.niveau     || '—';

        card.innerHTML = `
            <div class="resource-preview ${cfg.cssClass}">
                <span class="file-icon">${cfg.icon}</span>
                <span class="file-type-badge">${resource.type_ressource || 'PDF'}</span>
            </div>
            <div class="resource-content">
                <div class="resource-meta">
                    <span>📅 ${date}</span>
                    <span>💾 ${formatSize(resource.taille_fichier)}</span>
                </div>
                <h3 class="resource-title">${esc(resource.titre || 'Sans titre')}</h3>
                <p class="resource-desc">${esc(resource.description || 'Aucune description')}</p>
                <div class="resource-tags">
                    ${niveau !== '—' ? `<span class="tag niveau-tag">${niveau}</span>` : ''}
                    ${groupe !== '—' ? `<span class="tag groupe-tag">📚 ${groupe}</span>` : ''}
                    <span class="tag type-tag">${resource.type_ressource || 'Document'}</span>
                    ${resource.visible_etudiants
                        ? '<span class="tag visible-tag">👁 Visible étudiants</span>'
                        : '<span class="tag hidden-tag">🔒 Masqué</span>'}
                </div>
                <div class="resource-footer">
                    <span class="download-count">⬇️ ${resource.nombre_telechargements || 0} téléchargements</span>
                    <div class="resource-actions">
                        <button class="btn-icon download-btn" data-id="${resource.id}" title="Télécharger">⬇️</button>
                        <button class="btn-icon edit-btn"     data-id="${resource.id}" title="Modifier">✏️</button>
                        <button class="btn-icon delete-btn"   data-id="${resource.id}" title="Supprimer">🗑️</button>
                    </div>
                </div>
            </div>
        `;
        return card;
    }

    // ============================================================
    // DRAG & DROP / FILE SELECT → show metadata modal first
    // ============================================================
    function setupDragAndDrop() {
        const area = elements.uploadArea;
        ['dragenter','dragover','dragleave','drop'].forEach(ev => {
            area.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); });
        });
        ['dragenter','dragover'].forEach(ev =>
            area.addEventListener(ev, () => area.classList.add('drag-active'))
        );
        ['dragleave','drop'].forEach(ev =>
            area.addEventListener(ev, () => area.classList.remove('drag-active'))
        );
        area.addEventListener('drop', e => handleFilesSelected(e.dataTransfer.files));
        area.addEventListener('click', e => {
            if (!e.target.closest('.file-type')) elements.fileInput.click();
        });
    }

    // Called when files are chosen (drag or click)
    function handleFilesSelected(fileList) {
        const files = Array.from(fileList);
        if (!files.length) return;
        // Show the metadata modal BEFORE uploading
        openUploadModal(files);
    }

    // ============================================================
    // UPLOAD METADATA MODAL
    // Collects: titre (auto), langue, niveau, groupe, visible_etudiants
    // ============================================================
    function openUploadModal(files) {
        // Build groupe options from loaded groupes
        const groupeOptions = state.groupes.map(g =>
            `<option value="${g.id}">${g.nom_groupe} — ${g.langue} ${g.niveau}</option>`
        ).join('');

        const modal = document.createElement('div');
        modal.id = 'upload-modal';
        modal.innerHTML = `
            <div class="modal-overlay" id="upload-overlay">
                <div class="modal-content" style="max-width:520px;">
                    <h2 style="margin-bottom:1.5rem;">📤 Informations de la ressource</h2>
                    <p style="color:#64748b;margin-bottom:1.5rem;font-size:.9rem;">
                        ${files.length} fichier(s) sélectionné(s) :
                        <strong>${files.map(f => f.name).join(', ')}</strong>
                    </p>

                    <div class="form-group">
                        <label>Langue <span style="color:#ef4444">*</span></label>
                        <select id="modal-langue" required>
                            <option value="">-- Sélectionner la langue --</option>
                            <option value="Anglais">Anglais</option>
                            <option value="Français">Français</option>
                            <option value="Arabe">Arabe</option>
                            <option value="Espagnol">Espagnol</option>
                            <option value="Allemand">Allemand</option>
                            <option value="Italien">Italien</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Niveau <span style="color:#ef4444">*</span></label>
                        <select id="modal-niveau" required>
                            <option value="">-- Sélectionner le niveau --</option>
                            <option value="A1">A1 — Débutant</option>
                            <option value="A2">A2 — Élémentaire</option>
                            <option value="B1">B1 — Intermédiaire</option>
                            <option value="B2">B2 — Intermédiaire supérieur</option>
                            <option value="C1">C1 — Avancé</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label>Groupe (optionnel)</label>
                        <select id="modal-groupe">
                            <option value="">-- Toutes les classes --</option>
                            ${groupeOptions}
                        </select>
                        <small style="color:#94a3b8;">
                            Si vous choisissez un groupe, seuls ses étudiants verront la ressource.
                            Sinon, tous les étudiants du niveau choisi la verront.
                        </small>
                    </div>

                    <div class="form-group">
                        <label>Description (optionnel)</label>
                        <textarea id="modal-desc" placeholder="Décrivez le contenu de cette ressource..."
                            style="min-height:80px;resize:vertical;"></textarea>
                    </div>

                    <div class="form-group" style="display:flex;align-items:center;gap:10px;">
                        <input type="checkbox" id="modal-visible" checked style="width:18px;height:18px;">
                        <label for="modal-visible" style="margin:0;cursor:pointer;">
                            Visible par les étudiants immédiatement
                        </label>
                    </div>

                    <div class="modal-actions">
                        <button class="btn-secondary" id="modal-cancel">Annuler</button>
                        <button class="btn-primary"   id="modal-confirm">Uploader</button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        injectModalStyles();

        document.getElementById('modal-cancel').addEventListener('click', () => {
            modal.remove();
            elements.fileInput.value = '';
        });

        document.getElementById('upload-overlay').addEventListener('click', e => {
            if (e.target.id === 'upload-overlay') { modal.remove(); elements.fileInput.value = ''; }
        });

        document.getElementById('modal-confirm').addEventListener('click', async () => {
            const langue  = document.getElementById('modal-langue').value;
            const niveau  = document.getElementById('modal-niveau').value;
            const groupe  = document.getElementById('modal-groupe').value || null;
            const desc    = document.getElementById('modal-desc').value.trim();
            const visible = document.getElementById('modal-visible').checked;

            if (!langue) { highlightRequired('modal-langue'); return; }
            if (!niveau) { highlightRequired('modal-niveau'); return; }

            modal.remove();
            await uploadFiles(files, { langue, niveau, groupe, desc, visible });
        });
    }

    function highlightRequired(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.borderColor = '#ef4444';
        el.focus();
        setTimeout(() => { el.style.borderColor = ''; }, 2000);
        showNotification('Veuillez remplir les champs obligatoires.', 'error');
    }

    // ============================================================
    // UPLOAD FILES  (uses metadata from modal)
    // RessourceCreateSerializer fields:
    //   titre, description, type_ressource, fichier,
    //   niveau, groupe (FK int), visible_etudiants
    // Note: langue is NOT a field on Ressource model —
    //   we append it to the description so it's visible on the card.
    // ============================================================
    async function uploadFiles(files, meta) {
        showUploadProgress(files);

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                await uploadSingleFile(file, i, meta);
            } catch (e) {
                showNotification(`Erreur: ${file.name} — ${e.message}`, 'error');
                updateFileProgress(i, 0, 'error');
            }
        }

        setTimeout(() => {
            resetUploadArea();
            loadResources();  // reload grid to show new cards
        }, 1200);
    }

    async function uploadSingleFile(file, index, meta) {
        const ext = file.name.split('.').pop().toLowerCase();
        const typeMap = {
            pdf: 'PDF', mp4: 'Video', mp3: 'Audio',
            doc: 'Exercice', docx: 'Exercice',
            ppt: 'PPT', pptx: 'PPT',
        };

        const formData = new FormData();
        formData.append('fichier',            file);
        formData.append('titre',              file.name.replace(/\.[^/.]+$/, ''));
        formData.append('type_ressource',     typeMap[ext] || 'PDF');
        formData.append('niveau',             meta.niveau);
        formData.append('visible_etudiants',  meta.visible ? 'true' : 'false');
        // Prepend langue to description so it appears on the card
        const descFull = `[${meta.langue} — ${meta.niveau}]${meta.desc ? ' ' + meta.desc : ''}`;
        formData.append('description', descFull);
        if (meta.groupe) formData.append('groupe', meta.groupe);

        updateFileProgress(index, 40);

        const res = await fetch(`${state.apiBaseUrl}/ressources/`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${state.authToken}` },
            body: formData,
        });

        if (res.status === 401) { redirectLogin(); return; }

        const contentType = res.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            const txt = await res.text();
            throw new Error(`Serveur: ${res.status} — ${txt.slice(0, 120)}`);
        }

        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || data.error || JSON.stringify(data));

        updateFileProgress(index, 100, 'done');
        showNotification(`✅ ${file.name} uploadé`, 'success');
        return data;
    }

    // ============================================================
    // PROGRESS UI
    // ============================================================
    function showUploadProgress(files) {
        elements.uploadArea.innerHTML = `
            <div class="upload-progress-container" style="padding:2rem;text-align:center;">
                <div class="upload-spinner"></div>
                <h3 style="margin:.75rem 0 .25rem;">Upload en cours...</h3>
                <p style="color:#64748b;font-size:.9rem;">${files.length} fichier(s)</p>
                <div class="progress-list" style="margin-top:1.25rem;max-width:380px;margin-left:auto;margin-right:auto;">
                    ${files.map((f, i) => `
                        <div class="progress-item" data-index="${i}" style="margin-bottom:.75rem;text-align:left;">
                            <div style="display:flex;justify-content:space-between;margin-bottom:.3rem;">
                                <span style="font-size:.85rem;color:#475569;">${esc(f.name)}</span>
                                <span class="prog-pct" style="font-size:.8rem;color:#94a3b8;">0%</span>
                            </div>
                            <div style="height:6px;background:#e2e8f0;border-radius:3px;overflow:hidden;">
                                <div class="progress-bar" style="width:0%;height:100%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:3px;transition:width .3s;"></div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    function updateFileProgress(index, pct, state = '') {
        const item = document.querySelector(`.progress-item[data-index="${index}"]`);
        if (!item) return;
        const bar  = item.querySelector('.progress-bar');
        const text = item.querySelector('.prog-pct');
        if (bar)  bar.style.width = pct + '%';
        if (text) text.textContent = pct + '%';
        if (state === 'error' && bar)  bar.style.background = '#ef4444';
        if (state === 'done'  && bar)  bar.style.background = '#10b981';
    }

    function resetUploadArea() {
        elements.uploadArea.innerHTML = `
            <div class="upload-icon">📤</div>
            <h3>Glissez-déposez vos fichiers ici</h3>
            <p>ou cliquez pour parcourir votre ordinateur</p>
            <div class="file-types">
                <span class="file-type">📄 PDF</span>
                <span class="file-type">🎥 MP4</span>
                <span class="file-type">🎵 MP3</span>
                <span class="file-type">📝 DOC</span>
                <span class="file-type">📊 PPT</span>
            </div>
        `;
        setupDragAndDrop();
    }

    // ============================================================
    // CARD ACTIONS
    // ============================================================
    function setupCardActions(card, resourceId) {
        card.querySelector('.download-btn')?.addEventListener('click', e => {
            e.stopPropagation();
            downloadResource(resourceId, e.currentTarget);
        });
        card.querySelector('.edit-btn')?.addEventListener('click', e => {
            e.stopPropagation();
            openEditModal(resourceId, card);
        });
        card.querySelector('.delete-btn')?.addEventListener('click', e => {
            e.stopPropagation();
            deleteResource(resourceId, card);
        });
    }

    // ============================================================
    // DOWNLOAD
    // ============================================================
    async function downloadResource(id, btn) {
        btn.style.transform = 'scale(1.2)';
        setTimeout(() => btn.style.transform = 'scale(1)', 200);

        try {
            const res = await fetch(`${state.apiBaseUrl}/ressources/${id}/download/`, {
                headers: { 'Authorization': `Bearer ${state.authToken}` }
            });
            if (res.status === 401) { redirectLogin(); return; }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const disposition = res.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            const filename = match ? match[1].replace(/['"]/g, '') : 'ressource';

            const blob = await res.blob();
            const url  = window.URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => { window.URL.revokeObjectURL(url); a.remove(); }, 100);

            // Update counter locally
            const counter = btn.closest('.resource-footer')?.querySelector('.download-count');
            if (counter) {
                const n = parseInt(counter.textContent.match(/\d+/)?.[0] || 0) + 1;
                counter.textContent = `⬇️ ${n} téléchargements`;
            }
            showNotification('Téléchargement démarré.', 'success');
        } catch (e) {
            showNotification('Erreur téléchargement: ' + e.message, 'error');
        }
    }

    // ============================================================
    // DELETE
    // ============================================================
    async function deleteResource(id, card) {
        if (!confirm('Supprimer cette ressource ?')) return;
        try {
            const res = await fetch(`${state.apiBaseUrl}/ressources/${id}/`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${state.authToken}` }
            });
            if (res.status === 401) { redirectLogin(); return; }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            card.style.transition = 'all .3s ease';
            card.style.transform  = 'scale(0.9)';
            card.style.opacity    = '0';
            setTimeout(() => {
                card.remove();
                state.resources = state.resources.filter(r => r.id !== id);
                updateStats(state.resources);
            }, 300);
            showNotification('Ressource supprimée.', 'warning');
        } catch (e) {
            showNotification('Erreur suppression.', 'error');
        }
    }

    // ============================================================
    // EDIT MODAL
    // ============================================================
    async function openEditModal(id, card) {
        const resource = state.resources.find(r => r.id === id);
        if (!resource) return;

        const groupeOptions = state.groupes.map(g =>
            `<option value="${g.id}" ${resource.groupe == g.id ? 'selected' : ''}>
                ${g.nom_groupe} — ${g.langue} ${g.niveau}
            </option>`
        ).join('');

        const modal = document.createElement('div');
        modal.innerHTML = `
            <div class="modal-overlay" id="edit-overlay">
                <div class="modal-content" style="max-width:500px;">
                    <h2 style="margin-bottom:1.5rem;">✏️ Modifier la ressource</h2>
                    <div class="form-group">
                        <label>Titre</label>
                        <input type="text" id="edit-titre" value="${esc(resource.titre || '')}">
                    </div>
                    <div class="form-group">
                        <label>Niveau</label>
                        <select id="edit-niveau">
                            <option value="">-- Sélectionner --</option>
                            ${['A1','A2','B1','B2','C1'].map(n =>
                                `<option value="${n}" ${resource.niveau === n ? 'selected' : ''}>${n}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Groupe</label>
                        <select id="edit-groupe">
                            <option value="">-- Toutes les classes --</option>
                            ${groupeOptions}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="edit-desc" style="min-height:80px;">${esc(resource.description || '')}</textarea>
                    </div>
                    <div class="form-group" style="display:flex;align-items:center;gap:10px;">
                        <input type="checkbox" id="edit-visible" ${resource.visible_etudiants ? 'checked' : ''}
                            style="width:18px;height:18px;">
                        <label for="edit-visible" style="margin:0;cursor:pointer;">Visible par les étudiants</label>
                    </div>
                    <div class="modal-actions">
                        <button class="btn-secondary" id="edit-cancel">Annuler</button>
                        <button class="btn-primary"   id="edit-save">Sauvegarder</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        injectModalStyles();

        document.getElementById('edit-cancel').addEventListener('click', () => modal.remove());
        document.getElementById('edit-overlay').addEventListener('click', e => {
            if (e.target.id === 'edit-overlay') modal.remove();
        });

        document.getElementById('edit-save').addEventListener('click', async () => {
            const body = {
                titre:             document.getElementById('edit-titre').value,
                niveau:            document.getElementById('edit-niveau').value || null,
                groupe:            document.getElementById('edit-groupe').value  || null,
                description:       document.getElementById('edit-desc').value,
                visible_etudiants: document.getElementById('edit-visible').checked,
            };

            try {
                const res = await fetch(`${state.apiBaseUrl}/ressources/${id}/`, {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${state.authToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(body),
                });
                if (res.status === 401) { redirectLogin(); return; }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const updated = await res.json();
                const idx = state.resources.findIndex(r => r.id === id);
                if (idx !== -1) state.resources[idx] = updated;

                // Rebuild the card in place
                const newCard = buildCard(updated);
                card.replaceWith(newCard);
                setupCardActions(newCard, id);

                modal.remove();
                showNotification('Modifications sauvegardées.', 'success');
            } catch (e) {
                showNotification('Erreur sauvegarde.', 'error');
            }
        });
    }

    // ============================================================
    // FILTERING
    // ============================================================
    function setupEventListeners() {
        elements.uploadBtn?.addEventListener('click', () => {
            elements.uploadArea.scrollIntoView({ behavior:'smooth', block:'center' });
        });

        elements.searchInput?.addEventListener('input', debounce(e => {
            state.searchQuery = e.target.value.toLowerCase();
            filterCards();
        }, 300));

        elements.filterTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                elements.filterTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                state.currentFilter = tab.dataset.filter || tab.textContent.trim().toLowerCase();
                filterCards();
            });
        });
    }

    function filterCards() {
        const cards = document.querySelectorAll('.resource-card');
        let count = 0;
        cards.forEach(card => {
            const type   = card.dataset.type  || '';
            const title  = card.dataset.title || '';
            const matchSearch = title.includes(state.searchQuery);
            const f = state.currentFilter;
            const matchFilter =
                f === 'all' || f === 'tous' ||
                type === f ||
                (f === 'documents' && ['pdf','doc'].includes(type)) ||
                (f === 'vidéos'    && type === 'video') ||
                (f === 'audio'     && type === 'audio') ||
                (f === 'exercices' && type === 'doc');

            const show = matchSearch && matchFilter;
            card.style.display = show ? '' : 'none';
            if (show) count++;
        });

        let noRes = elements.resourcesGrid.querySelector('.no-results');
        if (count === 0) {
            if (!noRes) {
                noRes = document.createElement('div');
                noRes.className = 'no-results';
                noRes.style.cssText = 'grid-column:1/-1;text-align:center;padding:3rem;color:#94a3b8;';
                noRes.innerHTML = '<p style="font-size:1.1rem;">🔍 Aucune ressource trouvée</p>';
                elements.resourcesGrid.appendChild(noRes);
            }
        } else {
            noRes?.remove();
        }
    }

    // ============================================================
    // STATS
    // ============================================================
    function updateStats(resources) {
        const counts = {
            pdf:       resources.filter(r => r.type_ressource === 'PDF').length,
            video:     resources.filter(r => r.type_ressource === 'Video').length,
            audio:     resources.filter(r => r.type_ressource === 'Audio').length,
            downloads: resources.reduce((s, r) => s + (r.nombre_telechargements || 0), 0),
        };
        const items = document.querySelectorAll('.stat-item h4');
        if (items[0]) items[0].textContent = counts.pdf;
        if (items[1]) items[1].textContent = counts.video;
        if (items[2]) items[2].textContent = counts.audio;
        if (items[3]) items[3].textContent = counts.downloads;
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function mapTypeClass(type) {
        return { PDF:'pdf', Video:'video', Audio:'audio', PPT:'ppt', Exercice:'doc', Lien:'doc' }[type] || 'pdf';
    }

    function typeConfig(type) {
        return ({
            PDF:      { icon:'📄', cssClass:'pdf' },
            Video:    { icon:'🎥', cssClass:'video' },
            Audio:    { icon:'🎵', cssClass:'audio' },
            PPT:      { icon:'📊', cssClass:'ppt' },
            Exercice: { icon:'📝', cssClass:'doc' },
            Lien:     { icon:'🔗', cssClass:'doc' },
        }[type]) || { icon:'📄', cssClass:'pdf' };
    }

    function formatSize(mb) {
        if (!mb) return '—';
        if (mb < 1) return `${Math.round(mb * 1024)} KB`;
        return `${mb.toFixed(1)} MB`;
    }

    function esc(text) {
        if (!text) return '';
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    function showGridSkeleton() {
        elements.resourcesGrid.innerHTML = Array(4).fill(0).map(() => `
            <div style="background:#f1f5f9;border-radius:12px;height:220px;
                animation:shimmer 1.5s infinite;background-size:200% 100%;
                background-image:linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);">
            </div>`).join('');
    }

    function showNoResults() {
        elements.resourcesGrid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:4rem;color:#94a3b8;">
                <div style="font-size:3rem;margin-bottom:1rem;">📚</div>
                <h3>Aucune ressource disponible</h3>
                <p>Commencez par uploader votre première ressource</p>
            </div>`;
    }

    function redirectLogin() {
        localStorage.removeItem('access_token');
        sessionStorage.removeItem('access_token');
        window.location.href = '/login/';
    }

    function debounce(fn, wait) {
        let t;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
    }

    function showNotification(message, type = 'info') {
        const colors = { success:'#10b981', warning:'#f59e0b', error:'#ef4444', info:'#3b82f6' };
        const n = document.createElement('div');
        n.style.cssText = `
            position:fixed;top:20px;right:20px;z-index:10000;
            background:${colors[type]};color:white;
            padding:.9rem 1.5rem;border-radius:10px;
            font-weight:600;font-size:.9rem;
            box-shadow:0 8px 24px rgba(0,0,0,.15);
            animation:slideInRight .3s ease;
        `;
        n.textContent = message;
        document.body.appendChild(n);
        setTimeout(() => { n.style.opacity = '0'; n.style.transition = 'opacity .3s'; setTimeout(() => n.remove(), 300); }, 3000);
    }

    // ============================================================
    // MODAL STYLES (injected once)
    // ============================================================
    function injectModalStyles() {
        if (document.getElementById('modal-styles')) return;
        const s = document.createElement('style');
        s.id = 'modal-styles';
        s.textContent = `
            @keyframes shimmer { to { background-position:-200% 0; } }
            @keyframes slideInRight { from { transform:translateX(80px);opacity:0; } to { transform:translateX(0);opacity:1; } }
            @keyframes spin { to { transform:rotate(360deg); } }
            .modal-overlay {
                position:fixed;inset:0;background:rgba(0,0,0,.5);
                display:flex;align-items:center;justify-content:center;
                z-index:9999;backdrop-filter:blur(4px);
            }
            .modal-content {
                background:white;padding:2rem;border-radius:20px;
                width:90%;box-shadow:0 25px 50px rgba(0,0,0,.25);
            }
            .form-group { margin-bottom:1rem; }
            .form-group label { display:block;margin-bottom:.4rem;color:#475569;font-weight:600;font-size:.875rem; }
            .form-group input,.form-group textarea,.form-group select {
                width:100%;padding:.7rem .9rem;border:2px solid #e2e8f0;
                border-radius:8px;font-family:inherit;font-size:.9rem;box-sizing:border-box;
                transition:border-color .2s;
            }
            .form-group input:focus,.form-group textarea:focus,.form-group select:focus {
                outline:none;border-color:#667eea;
            }
            .form-group small { display:block;margin-top:.35rem;font-size:.78rem; }
            .modal-actions { display:flex;gap:1rem;justify-content:flex-end;margin-top:1.5rem; }
            .btn-secondary {
                padding:.7rem 1.4rem;border:2px solid #e2e8f0;background:white;
                border-radius:8px;cursor:pointer;font-weight:600;color:#64748b;
            }
            .btn-secondary:hover { border-color:#667eea;color:#667eea; }
            .btn-primary {
                padding:.7rem 1.4rem;border:none;
                background:linear-gradient(135deg,#667eea,#764ba2);
                color:white;border-radius:8px;cursor:pointer;font-weight:600;
            }
            .btn-primary:hover { opacity:.9; }
            .upload-spinner {
                width:50px;height:50px;border:4px solid #e2e8f0;
                border-top-color:#667eea;border-radius:50%;
                animation:spin 1s linear infinite;margin:0 auto 1rem;
            }
            .tag { display:inline-block;padding:.2rem .6rem;border-radius:6px;font-size:.78rem;font-weight:600;margin-right:.3rem; }
            .niveau-tag  { background:#ede9fe;color:#5b21b6; }
            .groupe-tag  { background:#dbeafe;color:#1d4ed8; }
            .type-tag    { background:#f0fdf4;color:#15803d; }
            .visible-tag { background:#ecfdf5;color:#059669; }
            .hidden-tag  { background:#fef2f2;color:#dc2626; }
        `;
        document.head.appendChild(s);
    }

});