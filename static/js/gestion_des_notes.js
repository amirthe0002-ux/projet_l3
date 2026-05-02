/**
 * Grade Management System - JWT Authentication Version
 * Compatible avec Django REST Framework + SimpleJWT
 * File: static/js/gestion_des_notes.js
 *
 * FIXES:
 *  - renderEvaluations() → cards now have ✏️ Modifier + 🗑️ Supprimer buttons
 *  - openEvaluationDetail() → real edit modal (was just console.log)
 *  - editEvaluation()  → new method: PATCH /api/evaluations/<pk>/
 *  - deleteEvaluation() → new method: DELETE /api/evaluations/<pk>/
 */

class GradeManager {
    constructor() {
        this.apiBaseUrl = '/api';

        this.students    = [];
        this.evaluations = [];
        this.notes       = [];
        this.currentGroup = null;

        this.weights = {
            written:       0.30,
            oral:          0.40,
            comprehension: 0.20,
            participation: 0.10,
        };

        this.elements = {};
        this.init();
    }

    // ============================================================
    // INITIALIZATION
    // ============================================================

    init() {
        this.cacheElements();
        this.bindEvents();
        this.loadData();
        this.loadSystemParameters();
    }

    cacheElements() {
        this.elements = {
            studentCount:      document.getElementById('studentCount'),
            currentLevel:      document.getElementById('currentLevel'),
            currentGroupName:  document.getElementById('currentGroupName'),
            searchInput:       document.getElementById('searchInput'),
            filterEval:        document.getElementById('filterEval'),
            filterLevel:       document.getElementById('filterLevel'),
            btnNewEval:        document.getElementById('btnNewEval'),
            btnImport:         document.getElementById('btnImport'),
            btnExport:         document.getElementById('btnExport'),
            btnPrint:          document.getElementById('btnPrint'),
            evaluationsGrid:   document.getElementById('evaluationsGrid'),
            studentsTableBody: document.getElementById('studentsTableBody'),
        };
    }

    bindEvents() {
        let searchTimeout;
        this.elements.searchInput?.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => this.handleSearch(e.target.value), 300);
        });

        this.elements.filterEval?.addEventListener('change',  () => this.applyFilters());
        this.elements.filterLevel?.addEventListener('change', () => this.applyFilters());
        this.elements.btnNewEval?.addEventListener('click',   () => this.openNewEvaluationModal());
        this.elements.btnImport?.addEventListener('click',    () => this.handleImport());
        this.elements.btnExport?.addEventListener('click',    () => this.handleExport());
        this.elements.btnPrint?.addEventListener('click',     () => window.print());
    }

    // ============================================================
    // JWT HELPERS
    // ============================================================

    getToken() {
        return (
            localStorage.getItem('access')       ||
            sessionStorage.getItem('access')      ||
            localStorage.getItem('access_token')  ||
            sessionStorage.getItem('access_token') ||
            null
        );
    }

    authHeaders() {
        const token = this.getToken();
        const h = { 'Content-Type': 'application/json' };
        if (token) h['Authorization'] = `Bearer ${token}`;
        return h;
    }

    // ============================================================
    // API
    // ============================================================

    async apiRequest(endpoint, options = {}) {
        const url = `${this.apiBaseUrl}${endpoint}`;
        try {
            const res = await fetch(url, {
                ...options,
                headers: { ...this.authHeaders(), ...options.headers },
            });

            if (res.status === 401) return { error: 'JWT_INVALID',  message: 'Token invalide. Reconnectez-vous.' };
            if (res.status === 403) return { error: 'FORBIDDEN',    message: 'Accès non autorisé.' };
            if (res.status === 204) return { success: true };        // DELETE success

            if (!res.ok) {
                let msg = `Erreur ${res.status}`;
                try {
                    const err = await res.json();
                    msg = err.detail || err.error || JSON.stringify(err);
                } catch (_) {}
                return { error: 'API_ERROR', message: msg };
            }

            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) return await res.json();
            return await res.text();

        } catch (e) {
            return { error: 'NETWORK_ERROR', message: 'Serveur inaccessible. Vérifiez que Django tourne.' };
        }
    }

    // ============================================================
    // DATA LOADING
    // ============================================================

    async loadData() {
        this.showLoading();

        const [evaluationsResult, studentsResult] = await Promise.all([
            this.loadEvaluations(),
            this.loadStudents(),
        ]);

        if (evaluationsResult?.error) {
            this.showError('evaluations', evaluationsResult.message);
        } else {
            this.evaluations = evaluationsResult;
            this.renderEvaluations();
        }

        if (studentsResult?.error) {
            this.showError('students', studentsResult.message);
        } else {
            this.students = studentsResult;
            this.renderStudents();
            await this.loadAllGrades();
        }

        this.updateHeaderInfo();
    }

    async loadEvaluations() {
        const urlParams = new URLSearchParams(window.location.search);
        const groupeId  = urlParams.get('groupe') || window.DJANGO_CONTEXT?.groupId;

        let endpoint = '/evaluations/';
        if (groupeId) endpoint += `?groupe=${groupeId}`;

        const result = await this.apiRequest(endpoint);
        if (result?.error) return result;

        return result.map(ev => ({
            id:          ev.id,
            titre:       ev.titre,
            type:        this.mapApiTypeToFrontend(ev.type),
            typeLabel:   ev.type,
            date:        ev.date_evaluation,
            ponderation: ev.ponderation,
            noteMax:     ev.note_max,
            nombreNotes: ev.nombre_notes || 0,
            groupe:      ev.groupe,
        }));
    }

    async loadStudents() {
        const urlParams = new URLSearchParams(window.location.search);
        const groupeId  = urlParams.get('groupe') || window.DJANGO_CONTEXT?.groupId;

        let endpoint = '/etudiants/';
        if (groupeId) endpoint += `?groupe=${groupeId}`;

        const result = await this.apiRequest(endpoint);
        if (result?.error) return result;

        return result.map(s => ({
            id:            s.id,
            nom:           s.user?.nom_complet || `${s.user?.first_name || ''} ${s.user?.last_name || ''}`.trim(),
            email:         s.user?.email,
            niveau:        s.niveau_actuel,
            groupe:        s.groupe_nom || s.groupe,
            groupeId:      s.groupe,
            tauxAssiduite: s.taux_assiduité,
        }));
    }

    async loadAllGrades() {
        for (const student of this.students) {
            const notes = await this.loadStudentNotes(student.id);
            this.applyNotesToRow(student.id, notes);
        }
    }

    async loadStudentNotes(studentId) {
        const result = await this.apiRequest(`/notes/?etudiant=${studentId}`);
        if (result?.error) return [];
        return result.map(n => ({
            id:              n.id,
            evaluationId:    n.evaluation,
            evaluationTitre: n.evaluation_titre,
            note:            parseFloat(n.note_obtenue),
            max:             parseFloat(n.note_max),
            pourcentage:     n.pourcentage,
            niveau:          n.niveau_attribue,
        }));
    }

    async loadSystemParameters() {
        const result = await this.apiRequest('/parametres/');
        if (result?.error) return;

        result.forEach(param => {
            const value = parseFloat(param.valeur) / 100;
            switch (param.nom_parametre) {
                case 'PONDERATION_ECRIT':         this.weights.written       = value; break;
                case 'PONDERATION_ORAL':          this.weights.oral          = value; break;
                case 'PONDERATION_COMPREHENSION': this.weights.comprehension = value; break;
                case 'PONDERATION_PARTICIPATION': this.weights.participation = value; break;
            }
        });

        this.updateFormulaDisplay();
    }

    // ============================================================
    // RENDERING
    // ============================================================

    showLoading() {
        if (this.elements.evaluationsGrid) {
            this.elements.evaluationsGrid.innerHTML = `
                <div class="eval-card" style="grid-column:1/-1;text-align:center;padding:40px;">
                    <div style="font-size:2rem;margin-bottom:10px;">⏳</div>
                    <p>Chargement des évaluations...</p>
                </div>`;
        }
        if (this.elements.studentsTableBody) {
            this.elements.studentsTableBody.innerHTML = `
                <tr><td colspan="8" style="text-align:center;padding:40px;">
                    <div style="font-size:2rem;margin-bottom:10px;">⏳</div>
                    <p>Chargement des étudiants...</p>
                </td></tr>`;
        }
    }

    showError(section, message) {
        const isNet = message?.includes('inaccessible') || message?.includes('NETWORK');
        const icon  = isNet ? '🔌' : '⚠️';
        const hint  = isNet ? 'Vérifiez que Django tourne sur le port 8000.' : message;

        const content = `
            <div style="text-align:center;padding:40px;color:#dc2626;">
                <div style="font-size:2.5rem;margin-bottom:12px;">${icon}</div>
                <p style="font-weight:600;margin-bottom:8px;">${hint}</p>
                <button onclick="window.location.reload()"
                    style="margin-top:16px;padding:10px 20px;background:#667eea;
                           color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
                    Réessayer
                </button>
            </div>`;

        if (section === 'evaluations' && this.elements.evaluationsGrid)
            this.elements.evaluationsGrid.innerHTML = `<div class="eval-card" style="grid-column:1/-1;">${content}</div>`;
        if (section === 'students' && this.elements.studentsTableBody)
            this.elements.studentsTableBody.innerHTML = `<tr><td colspan="8">${content}</td></tr>`;
    }

    // ──────────────────────────────────────────────────────────────
    // FIX: renderEvaluations — adds Edit + Delete buttons on cards
    // ──────────────────────────────────────────────────────────────
    renderEvaluations() {
        if (!this.elements.evaluationsGrid) return;

        if (!this.evaluations.length) {
            this.elements.evaluationsGrid.innerHTML = `
                <div class="eval-card" style="grid-column:1/-1;text-align:center;padding:40px;">
                    <p>Aucune évaluation trouvée</p>
                    <button onclick="window.gradeManager.openNewEvaluationModal()"
                            style="margin-top:15px;padding:8px 16px;background:#667eea;
                                   color:white;border:none;border-radius:6px;cursor:pointer;">
                        + Créer une évaluation
                    </button>
                </div>`;
            return;
        }

        const typeColors = {
            written:       { bg:'#dbeafe', color:'#1e40af' },
            oral:          { bg:'#dcfce7', color:'#166534' },
            comprehension: { bg:'#f3e8ff', color:'#7c3aed' },
            participation: { bg:'#ffedd5', color:'#9a3412' },
        };

        this.elements.evaluationsGrid.innerHTML = this.evaluations.map(ev => {
            const c = typeColors[ev.type] || typeColors.written;
            return `
            <div class="eval-card" data-type="${ev.type}" data-id="${ev.id}"
                 style="background:white;border-radius:16px;padding:24px;
                        box-shadow:0 2px 4px rgba(0,0,0,.05);border:2px solid transparent;
                        transition:all .3s;display:flex;flex-direction:column;cursor:pointer;"
                 onmouseover="this.style.borderColor='#667eea';this.style.transform='translateY(-2px)'"
                 onmouseout="this.style.borderColor='transparent';this.style.transform='none'">

                <!-- Type badge + date -->
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                    <span style="padding:6px 12px;border-radius:50px;font-size:.75rem;font-weight:700;
                                 text-transform:uppercase;background:${c.bg};color:${c.color};">
                        ${ev.typeLabel}
                    </span>
                    <span style="color:#94a3b8;font-size:.875rem;">${this.formatDate(ev.date)}</span>
                </div>

                <!-- Title -->
                <h4 style="font-size:1.1rem;color:#1e293b;font-weight:700;margin-bottom:8px;">${ev.titre}</h4>
                <p style="color:#64748b;font-size:.875rem;margin-bottom:16px;">
                    Pondération: ${ev.ponderation}% • ${ev.nombreNotes} participants
                </p>

                <!-- Stats -->
                <div style="display:flex;gap:32px;padding:16px 0;
                            border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;margin-bottom:16px;">
                    <div style="text-align:center;">
                        <div style="font-size:1.5rem;font-weight:800;color:#1e293b;">${ev.noteMax}</div>
                        <div style="font-size:.75rem;color:#64748b;text-transform:uppercase;">Max</div>
                    </div>
                    <div style="text-align:center;">
                        <div style="font-size:1.5rem;font-weight:800;color:#1e293b;">${ev.nombreNotes}</div>
                        <div style="font-size:.75rem;color:#64748b;text-transform:uppercase;">Notes</div>
                    </div>
                </div>

                <!-- Action buttons — FIX: now functional -->
                <div style="display:flex;gap:8px;">
                    <button onclick="event.stopPropagation();window.gradeManager.openEvaluationDetail('${ev.id}')"
                            style="flex:1;padding:9px;border:none;border-radius:8px;background:#f1f5f9;
                                   color:#475569;cursor:pointer;font-weight:600;font-size:.8rem;transition:background .15s;"
                            onmouseover="this.style.background='#e2e8f0'"
                            onmouseout="this.style.background='#f1f5f9'">
                        ✏️ Modifier
                    </button>
                    <button onclick="event.stopPropagation();window.gradeManager.deleteEvaluation('${ev.id}')"
                            style="flex:1;padding:9px;border:none;border-radius:8px;background:#fef2f2;
                                   color:#dc2626;cursor:pointer;font-weight:600;font-size:.8rem;transition:background .15s;"
                            onmouseover="this.style.background='#fee2e2'"
                            onmouseout="this.style.background='#fef2f2'">
                        🗑️ Supprimer
                    </button>
                </div>
            </div>`;
        }).join('');

        // Click on card body (not buttons) → open detail
        this.elements.evaluationsGrid.querySelectorAll('.eval-card').forEach(card => {
            card.addEventListener('click', e => {
                if (e.target.closest('button')) return;
                this.openEvaluationDetail(card.dataset.id);
            });
        });
    }

    renderStudents() {
        if (!this.elements.studentsTableBody) return;

        if (!this.students.length) {
            this.elements.studentsTableBody.innerHTML = `
                <tr><td colspan="8" style="text-align:center;padding:40px;">
                    Aucun étudiant trouvé dans ce groupe
                </td></tr>`;
            return;
        }

        this.elements.studentsTableBody.innerHTML = this.students.map(s => {
            const initials = this.getInitials(s.nom);
            return `
            <tr data-student-id="${s.id}" data-level="${s.niveau}"
                style="transition:background .2s;"
                onmouseover="this.style.background='#f8fafc'"
                onmouseout="this.style.background='transparent'">
                <td style="padding:20px 16px;border-bottom:1px solid #e2e8f0;">
                    <div style="display:flex;align-items:center;gap:16px;">
                        <div style="width:45px;height:45px;border-radius:50%;
                                    background:linear-gradient(135deg,#667eea,#764ba2);
                                    display:flex;align-items:center;justify-content:center;
                                    color:white;font-weight:700;font-size:.875rem;">
                            ${initials}
                        </div>
                        <div>
                            <h4 style="font-size:.95rem;font-weight:600;color:#1e293b;margin-bottom:4px;">${s.nom}</h4>
                            <span style="font-size:.8rem;color:#64748b;">ID: ETU${String(s.id).padStart(3,'0')}</span>
                        </div>
                    </div>
                </td>
                <td style="padding:20px 16px;border-bottom:1px solid #e2e8f0;">
                    <input type="number" class="grade-input" data-student="${s.id}"
                           data-type="written" data-weight="${this.weights.written}"
                           min="0" max="20" step="0.5"
                           style="width:70px;padding:12px;border:2px solid #e2e8f0;
                                  border-radius:10px;text-align:center;font-size:1rem;font-weight:700;">
                </td>
                <td style="padding:20px 16px;border-bottom:1px solid #e2e8f0;">
                    <input type="number" class="grade-input" data-student="${s.id}"
                           data-type="oral" data-weight="${this.weights.oral}"
                           min="0" max="20" step="0.5"
                           style="width:70px;padding:12px;border:2px solid #e2e8f0;
                                  border-radius:10px;text-align:center;font-size:1rem;font-weight:700;">
                </td>
                <td style="padding:20px 16px;border-bottom:1px solid #e2e8f0;">
                    <input type="number" class="grade-input" data-student="${s.id}"
                           data-type="comprehension" data-weight="${this.weights.comprehension}"
                           min="0" max="20" step="0.5"
                           style="width:70px;padding:12px;border:2px solid #e2e8f0;
                                  border-radius:10px;text-align:center;font-size:1rem;font-weight:700;">
                </td>
                <td style="padding:20px 16px;border-bottom:1px solid #e2e8f0;">
                    <input type="number" class="grade-input" data-student="${s.id}"
                           data-type="participation" data-weight="${this.weights.participation}"
                           min="0" max="20" step="0.5"
                           style="width:70px;padding:12px;border:2px solid #e2e8f0;
                                  border-radius:10px;text-align:center;font-size:1rem;font-weight:700;">
                </td>
                <td class="average-cell"
                    style="padding:20px 16px;border-bottom:1px solid #e2e8f0;font-weight:800;font-size:1.25rem;color:#1e293b;">
                    -
                </td>
                <td style="padding:20px 16px;border-bottom:1px solid #e2e8f0;">
                    <span class="level-badge"
                          style="padding:8px 16px;border-radius:50px;font-size:.875rem;font-weight:700;">
                        ${s.niveau}
                    </span>
                </td>
                <td style="padding:20px 16px;border-bottom:1px solid #e2e8f0;">
                    <div style="display:flex;gap:8px;">
                        <button onclick="window.gradeManager.openCommentModal(${s.id})"
                                style="width:36px;height:36px;border:none;background:#f1f5f9;
                                       border-radius:8px;cursor:pointer;" title="Commentaire">💬</button>
                        <button onclick="window.gradeManager.viewStudentDetail(${s.id})"
                                style="width:36px;height:36px;border:none;background:#f1f5f9;
                                       border-radius:8px;cursor:pointer;" title="Détails">👁️</button>
                    </div>
                </td>
            </tr>`;
        }).join('');

        this.bindGradeInputs();
    }

    bindGradeInputs() {
        this.elements.studentsTableBody.querySelectorAll('.grade-input').forEach(input => {
            input.addEventListener('change', e => this.handleGradeChange(e));
            input.addEventListener('input',  e => this.validateInput(e.target));
        });
    }

    applyNotesToRow(studentId, notes) {
        const row = this.elements.studentsTableBody.querySelector(`[data-student-id="${studentId}"]`);
        if (!row) return;
        notes.forEach(note => {
            const type  = this.mapEvaluationTitleToType(note.evaluationTitre);
            const input = row.querySelector(`[data-type="${type}"]`);
            if (input) { input.value = note.note; input.dataset.noteId = note.id; }
        });
        this.calculateRowAverage(row);
    }

    // ============================================================
    // GRADE CALCULATION & SAVING
    // ============================================================

    validateInput(input) {
        let v = parseFloat(input.value);
        if (isNaN(v)) v = 0;
        if (v < 0)    v = 0;
        if (v > 20)   v = 20;
        input.value = v;
    }

    handleGradeChange(e) {
        const input = e.target;
        const row   = input.closest('tr');
        input.style.borderColor = '#f59e0b';
        input.style.background  = '#fffbeb';
        this.calculateRowAverage(row);
        clearTimeout(input.saveTimeout);
        input.saveTimeout = setTimeout(() => this.saveGrade(input, row), 1000);
    }

    calculateRowAverage(row) {
        const inputs = row.querySelectorAll('.grade-input');
        let total = 0, totalWeight = 0;
        inputs.forEach(input => {
            const value  = parseFloat(input.value) || 0;
            const weight = parseFloat(input.dataset.weight) || 0;
            total       += value * weight;
            totalWeight += weight;
        });

        const average = totalWeight > 0 ? total / totalWeight : 0;
        const rounded = Math.round(average * 10) / 10;

        const averageCell = row.querySelector('.average-cell');
        averageCell.textContent = rounded.toFixed(1);

        let color = '#dc2626';
        if (rounded >= 16)     color = '#059669';
        else if (rounded >= 14) color = '#0284c7';
        else if (rounded >= 10) color = '#d97706';
        averageCell.style.color = color;

        const newLevel  = this.determineLevel(rounded);
        const badge     = row.querySelector('.level-badge');
        badge.textContent = newLevel;

        const levelColors = {
            'A1':{ bg:'#fee2e2', color:'#991b1b' },
            'A2':{ bg:'#ffedd5', color:'#9a3412' },
            'B1':{ bg:'#fef3c7', color:'#92400e' },
            'B2':{ bg:'#d1fae5', color:'#166534' },
            'C1':{ bg:'#dbeafe', color:'#1e40af' },
        };
        const lc = levelColors[newLevel] || levelColors.A1;
        badge.style.background = lc.bg;
        badge.style.color      = lc.color;
        row.dataset.level      = newLevel;

        return rounded;
    }

    async saveGrade(input, row) {
        const studentId  = input.dataset.student;
        const type       = input.dataset.type;
        const value      = parseFloat(input.value);
        const noteId     = input.dataset.noteId;

        const evaluation = this.evaluations.find(e => e.type === type);
        if (!evaluation) {
            this.showToast('Aucune évaluation configurée pour ce type', 'error'); return;
        }

        const payload = {
            etudiant:     parseInt(studentId),
            evaluation:   evaluation.id,
            note_obtenue: value,
            note_max:     20,
        };

        let result;
        if (noteId) {
            result = await this.apiRequest(`/notes/${noteId}/`, { method:'PUT', body:JSON.stringify(payload) });
        } else {
            result = await this.apiRequest('/notes/', { method:'POST', body:JSON.stringify(payload) });
            if (!result?.error) input.dataset.noteId = result.id;
        }

        if (result?.error) {
            this.showToast('Erreur: ' + result.message, 'error');
            input.style.borderColor = '#ef4444'; input.style.background = '#fef2f2';
            return;
        }

        input.style.borderColor = '#22c55e'; input.style.background = '#f0fdf4';
        setTimeout(() => { input.style.borderColor = '#e2e8f0'; input.style.background = 'transparent'; }, 1000);
        this.showToast('Note sauvegardée ✓', 'success');
    }

    // ============================================================
    // FILTERS & SEARCH
    // ============================================================

    handleSearch(query) {
        const term = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        this.elements.studentsTableBody.querySelectorAll('tr').forEach(row => {
            const name = row.querySelector('h4')?.textContent.toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '') || '';
            row.style.display = name.includes(term) ? '' : 'none';
        });
    }

    applyFilters() {
        const evalType = this.elements.filterEval?.value  || 'all';
        const level    = this.elements.filterLevel?.value || 'all';

        this.elements.evaluationsGrid?.querySelectorAll('.eval-card').forEach(card => {
            card.style.display = (evalType === 'all' || card.dataset.type === evalType) ? '' : 'none';
        });
        this.elements.studentsTableBody?.querySelectorAll('tr').forEach(row => {
            row.style.display = (level === 'all' || row.dataset.level === level) ? '' : 'none';
        });
    }

    // ============================================================
    // MODALS — NEW EVALUATION
    // ============================================================

    openNewEvaluationModal() {
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;
                        align-items:center;justify-content:center;z-index:1000;"
                 onclick="if(event.target===this)this.remove()">
                <div style="background:white;border-radius:20px;padding:32px;width:90%;max-width:500px;
                            box-shadow:0 25px 50px -12px rgba(0,0,0,.25);">
                    <h3 style="font-size:1.5rem;font-weight:700;margin-bottom:24px;color:#1e293b;">
                        Nouvelle Évaluation
                    </h3>
                    <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:24px;">
                        <input type="text" id="newEvalTitle" placeholder="Titre de l'évaluation"
                               style="padding:12px 16px;border:2px solid #e2e8f0;border-radius:12px;font-size:1rem;">
                        <select id="newEvalType"
                                style="padding:12px 16px;border:2px solid #e2e8f0;border-radius:12px;font-size:1rem;">
                            <option value="">Type d'évaluation</option>
                            <option value="Ecrit">Devoir Écrit</option>
                            <option value="Oral">Expression Orale</option>
                            <option value="Comprehension">Compréhension</option>
                            <option value="Participation">Participation</option>
                        </select>
                        <input type="number" id="newEvalWeight" placeholder="Pondération (%)" min="0" max="100"
                               style="padding:12px 16px;border:2px solid #e2e8f0;border-radius:12px;font-size:1rem;">
                        <input type="date" id="newEvalDate"
                               style="padding:12px 16px;border:2px solid #e2e8f0;border-radius:12px;font-size:1rem;">
                    </div>
                    <div style="display:flex;gap:12px;justify-content:flex-end;">
                        <button onclick="this.closest('[style*=fixed]').remove()"
                                style="padding:12px 24px;border-radius:10px;border:none;
                                       background:#f1f5f9;color:#64748b;font-weight:600;cursor:pointer;">
                            Annuler
                        </button>
                        <button id="btnCreateEval"
                                style="padding:12px 24px;border-radius:10px;border:none;
                                       background:linear-gradient(135deg,#667eea,#764ba2);
                                       color:white;font-weight:600;cursor:pointer;">
                            Créer
                        </button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);

        modal.querySelector('#btnCreateEval').addEventListener('click', async () => {
            const data = {
                titre:           document.getElementById('newEvalTitle').value,
                type:            document.getElementById('newEvalType').value,
                ponderation:     parseFloat(document.getElementById('newEvalWeight').value),
                date_evaluation: document.getElementById('newEvalDate').value,
                groupe:          this.currentGroup || window.DJANGO_CONTEXT?.groupId || 1,
            };

            if (!data.titre || !data.type || !data.ponderation || !data.date_evaluation) {
                this.showToast('Veuillez remplir tous les champs', 'error'); return;
            }

            const result = await this.apiRequest('/evaluations/', {
                method: 'POST', body: JSON.stringify(data),
            });

            if (result?.error) { this.showToast('Erreur: ' + result.message, 'error'); return; }
            modal.remove();
            this.showToast('Évaluation créée ✓', 'success');
            await this.loadData();
        });
    }

    // ============================================================
    // FIX: openEvaluationDetail — real edit modal
    // ============================================================
    openEvaluationDetail(evalId) {
        const ev = this.evaluations.find(e => String(e.id) === String(evalId));
        if (!ev) return;

        document.getElementById('modal-eval-detail')?.remove();

        const typeOptions = ['Ecrit','Oral','Comprehension','Participation']
            .map(t => `<option value="${t}" ${ev.typeLabel === t ? 'selected' : ''}>${t}</option>`)
            .join('');

        const overlay = document.createElement('div');
        overlay.id = 'modal-eval-detail';
        overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,.55);
            display:flex;align-items:center;justify-content:center;z-index:2000;`;

        overlay.innerHTML = `
            <div style="background:white;border-radius:20px;padding:2rem;width:90%;max-width:480px;
                        box-shadow:0 25px 50px rgba(0,0,0,.25);max-height:90vh;overflow-y:auto;"
                 onclick="event.stopPropagation()">

                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;">
                    <h3 style="margin:0;font-size:1.2rem;font-weight:700;color:#1e293b;">
                        ✏️ Modifier l'évaluation
                    </h3>
                    <button onclick="document.getElementById('modal-eval-detail').remove()"
                            style="background:none;border:none;font-size:1.5rem;cursor:pointer;color:#94a3b8;">×</button>
                </div>

                <div style="display:flex;flex-direction:column;gap:1rem;">
                    <div>
                        <label style="display:block;font-size:.875rem;font-weight:600;color:#374151;margin-bottom:6px;">
                            Titre *
                        </label>
                        <input id="ed-titre" type="text" value="${ev.titre}"
                               style="width:100%;padding:.75rem;border:2px solid #e2e8f0;border-radius:10px;
                                      font-size:.95rem;box-sizing:border-box;">
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                        <div>
                            <label style="display:block;font-size:.875rem;font-weight:600;color:#374151;margin-bottom:6px;">
                                Type *
                            </label>
                            <select id="ed-type"
                                    style="width:100%;padding:.75rem;border:2px solid #e2e8f0;
                                           border-radius:10px;font-size:.95rem;box-sizing:border-box;">
                                ${typeOptions}
                            </select>
                        </div>
                        <div>
                            <label style="display:block;font-size:.875rem;font-weight:600;color:#374151;margin-bottom:6px;">
                                Note max *
                            </label>
                            <input id="ed-notemax" type="number" value="${ev.noteMax}" min="1" max="100"
                                   style="width:100%;padding:.75rem;border:2px solid #e2e8f0;border-radius:10px;
                                          font-size:.95rem;box-sizing:border-box;">
                        </div>
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                        <div>
                            <label style="display:block;font-size:.875rem;font-weight:600;color:#374151;margin-bottom:6px;">
                                Pondération (%) *
                            </label>
                            <input id="ed-pond" type="number" value="${ev.ponderation}" min="0" max="100"
                                   style="width:100%;padding:.75rem;border:2px solid #e2e8f0;border-radius:10px;
                                          font-size:.95rem;box-sizing:border-box;">
                        </div>
                        <div>
                            <label style="display:block;font-size:.875rem;font-weight:600;color:#374151;margin-bottom:6px;">
                                Date *
                            </label>
                            <input id="ed-date" type="date" value="${ev.date || ''}"
                                   style="width:100%;padding:.75rem;border:2px solid #e2e8f0;border-radius:10px;
                                          font-size:.95rem;box-sizing:border-box;">
                        </div>
                    </div>

                    <div id="ed-error"
                         style="display:none;padding:.75rem;background:#fef2f2;border:1px solid #fecaca;
                                border-radius:8px;color:#dc2626;font-size:.875rem;"></div>

                    <div style="display:flex;gap:.75rem;margin-top:.5rem;">
                        <button onclick="document.getElementById('modal-eval-detail').remove()"
                                style="flex:1;padding:.875rem;border:2px solid #e2e8f0;background:white;
                                       color:#475569;border-radius:10px;cursor:pointer;font-weight:600;">
                            Annuler
                        </button>
                        <button id="ed-save"
                                style="flex:1;padding:.875rem;border:none;
                                       background:linear-gradient(135deg,#667eea,#764ba2);
                                       color:white;border-radius:10px;cursor:pointer;font-weight:700;font-size:.95rem;">
                            💾 Enregistrer
                        </button>
                    </div>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.getElementById('ed-save').addEventListener('click', () => this.editEvaluation(evalId));
    }

    // ============================================================
    // NEW: editEvaluation — PATCH /api/evaluations/<pk>/
    // ============================================================
    async editEvaluation(evalId) {
        const errEl = document.getElementById('ed-error');
        const btn   = document.getElementById('ed-save');
        if (!errEl || !btn) return;
        errEl.style.display = 'none';

        const titre = document.getElementById('ed-titre').value.trim();
        const type  = document.getElementById('ed-type').value;
        const pond  = parseFloat(document.getElementById('ed-pond').value);
        const date  = document.getElementById('ed-date').value;
        const nmax  = parseFloat(document.getElementById('ed-notemax').value);

        if (!titre || !type || isNaN(pond) || !date || isNaN(nmax)) {
            errEl.textContent = '⚠️ Veuillez remplir tous les champs obligatoires.';
            errEl.style.display = 'block'; return;
        }

        btn.innerHTML = '⏳ Enregistrement...'; btn.disabled = true;

        const result = await this.apiRequest(`/evaluations/${evalId}/`, {
            method: 'PATCH',
            body:   JSON.stringify({
                titre,
                type,
                ponderation:     pond,
                date_evaluation: date,
                note_max:        nmax,
            }),
        });

        if (result?.error) {
            errEl.textContent = '❌ ' + result.message;
            errEl.style.display = 'block';
            btn.innerHTML = '💾 Enregistrer'; btn.disabled = false; return;
        }

        // Update local state so re-render shows updated data immediately
        const idx = this.evaluations.findIndex(e => String(e.id) === String(evalId));
        if (idx !== -1) {
            this.evaluations[idx] = {
                ...this.evaluations[idx],
                titre,
                ponderation: pond,
                date:        date,
                noteMax:     nmax,
                type:        this.mapApiTypeToFrontend(type),
                typeLabel:   type,
            };
        }

        document.getElementById('modal-eval-detail')?.remove();
        this.renderEvaluations();
        this.showToast('✅ Évaluation modifiée avec succès', 'success');
    }

    // ============================================================
    // NEW: deleteEvaluation — DELETE /api/evaluations/<pk>/
    // ============================================================
    async deleteEvaluation(evalId) {
        const ev = this.evaluations.find(e => String(e.id) === String(evalId));
        if (!ev) return;

        if (!confirm(
            `Supprimer l'évaluation "${ev.titre}" ?\n\n` +
            `⚠️ Toutes les notes associées (${ev.nombreNotes}) seront supprimées.`
        )) return;

        const result = await this.apiRequest(`/evaluations/${evalId}/`, { method: 'DELETE' });

        // 204 = success (returned as { success: true })
        if (result?.error) {
            this.showToast('❌ ' + result.message, 'error'); return;
        }

        this.evaluations = this.evaluations.filter(e => String(e.id) !== String(evalId));
        this.renderEvaluations();
        this.showToast(`🗑️ "${ev.titre}" supprimée`, 'success');
    }

    // ============================================================
    // OTHER MODALS
    // ============================================================

    openCommentModal(studentId) {
        const student = this.students.find(s => s.id == studentId);
        const modal = document.createElement('div');
        modal.innerHTML = `
            <div style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;
                        align-items:center;justify-content:center;z-index:1000;"
                 onclick="if(event.target===this)this.remove()">
                <div style="background:white;border-radius:20px;padding:32px;width:90%;max-width:500px;">
                    <h3 style="font-size:1.5rem;font-weight:700;margin-bottom:16px;color:#1e293b;">
                        Commentaire pour ${student?.nom || ''}
                    </h3>
                    <textarea id="commentText" rows="4" placeholder="Votre commentaire..."
                              style="width:100%;padding:12px;border:2px solid #e2e8f0;
                                     border-radius:12px;font-size:1rem;margin-bottom:24px;resize:vertical;
                                     box-sizing:border-box;"></textarea>
                    <div style="display:flex;gap:12px;justify-content:flex-end;">
                        <button onclick="this.closest('[style*=fixed]').remove()"
                                style="padding:12px 24px;border-radius:10px;border:none;
                                       background:#f1f5f9;color:#64748b;font-weight:600;cursor:pointer;">
                            Annuler
                        </button>
                        <button onclick="window.gradeManager.saveComment(${studentId})"
                                style="padding:12px 24px;border-radius:10px;border:none;
                                       background:linear-gradient(135deg,#667eea,#764ba2);
                                       color:white;font-weight:600;cursor:pointer;">
                            Enregistrer
                        </button>
                    </div>
                </div>
            </div>`;
        document.body.appendChild(modal);
    }

    saveComment(studentId) {
        const text = document.getElementById('commentText')?.value || '';
        console.log('Comment for student', studentId, ':', text);
        document.querySelector('[style*="position:fixed"]')?.remove();
        this.showToast('Commentaire enregistré ✓', 'success');
    }

    viewStudentDetail(studentId) {
        window.location.href = `/secretariat/etudiants/${studentId}/`;
    }

    // ============================================================
    // IMPORT / EXPORT
    // ============================================================

    handleExport() {
        const data = {
            date_export: new Date().toISOString(),
            etudiants: this.students.map(s => {
                const row    = this.elements.studentsTableBody.querySelector(`[data-student-id="${s.id}"]`);
                const inputs = row?.querySelectorAll('.grade-input') || [];
                return {
                    id:      s.id,
                    nom:     s.nom,
                    notes:   Array.from(inputs).map(i => ({ type:i.dataset.type, note:parseFloat(i.value)||null })),
                    moyenne: row?.querySelector('.average-cell')?.textContent || '-',
                };
            }),
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = Object.assign(document.createElement('a'), {
            href: url, download: `notes_export_${new Date().toISOString().split('T')[0]}.json`
        });
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Export réussi ✓', 'success');
    }

    handleImport() {
        const input   = document.createElement('input');
        input.type    = 'file';
        input.accept  = '.json,.csv';
        input.onchange = async e => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                this.showToast(`Import de ${data.etudiants?.length || 0} étudiants`, 'success');
            } catch (err) {
                this.showToast('Erreur d\'import: ' + err.message, 'error');
            }
        };
        input.click();
    }

    // ============================================================
    // UTILITY
    // ============================================================

    mapApiTypeToFrontend(apiType) {
        const map = {
            'Ecrit':'written', 'Oral':'oral',
            'Comprehension':'comprehension', 'Participation':'participation',
        };
        return map[apiType] || apiType.toLowerCase();
    }

    mapEvaluationTitleToType(title) {
        if (!title) return 'written';
        const lower = title.toLowerCase();
        if (lower.includes('ecrit')  || lower.includes('grammar'))    return 'written';
        if (lower.includes('oral')   || lower.includes('presentation'))return 'oral';
        if (lower.includes('compr')  || lower.includes('listen'))      return 'comprehension';
        if (lower.includes('partic'))                                  return 'participation';
        return 'written';
    }

    getInitials(name) {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }

    formatDate(dateStr) {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('fr-FR', {
            day:'numeric', month:'short', year:'numeric'
        });
    }

    determineLevel(average) {
        if (average >= 16) return 'C1';
        if (average >= 13) return 'B2';
        if (average >= 10) return 'B1';
        if (average >= 5)  return 'A2';
        return 'A1';
    }

    updateHeaderInfo() {
        if (this.elements.studentCount)
            this.elements.studentCount.textContent = this.students.length;
        if (this.students[0] && this.elements.currentLevel)
            this.elements.currentLevel.textContent = `Niveau ${this.students[0].niveau}`;
    }

    updateFormulaDisplay() {
        const formula = document.querySelector('.formula');
        if (formula) {
            formula.textContent =
                `Moyenne = (Écrit×${Math.round(this.weights.written*100)}% + ` +
                `Oral×${Math.round(this.weights.oral*100)}% + ` +
                `Compréhension×${Math.round(this.weights.comprehension*100)}% + ` +
                `Participation×${Math.round(this.weights.participation*100)}%)`;
        }
    }

    // ============================================================
    // TOAST
    // ============================================================

    showToast(message, type = 'info', duration = 3000) {
        document.querySelector('.toast-notification')?.remove();
        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        const colors = { success:'#059669', error:'#dc2626', warning:'#d97706', info:'#0284c7' };
        const icons  = { success:'✓', error:'✕', warning:'⚠', info:'ℹ' };
        toast.style.cssText = `
            position:fixed;bottom:24px;right:24px;padding:16px 24px;border-radius:12px;
            background:${colors[type]||colors.info};color:white;font-weight:500;
            box-shadow:0 10px 30px rgba(0,0,0,.3);z-index:10000;
            transform:translateX(100%);opacity:0;transition:all .3s ease;`;
        toast.innerHTML = `<span style="margin-right:8px;">${icons[type]}</span>${message}`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.transform = 'translateX(0)'; toast.style.opacity = '1'; });
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)'; toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
    window.gradeManager = new GradeManager();
});