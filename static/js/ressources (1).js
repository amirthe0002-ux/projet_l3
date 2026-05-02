/**
 * Ressources Pédagogiques - JavaScript
 * Handles all interactive functionality for the teacher resources page
 */

class ResourcesManager {
    constructor() {
        this.resources = [];
        this.currentFilter = 'all';
        this.searchQuery = '';
        this.csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';
        
        this.init();
    }

    init() {
        this.cacheElements();
        this.bindEvents();
        this.loadResources();
        this.animateStats();
    }

    cacheElements() {
        this.uploadBtn = document.querySelector('.upload-btn');
        this.searchInput = document.querySelector('.search-box input');
        this.filterTabs = document.querySelectorAll('.tab-btn');
        this.uploadArea = document.querySelector('.upload-area');
        this.resourcesGrid = document.querySelector('.resources-grid');
        this.statNumbers = document.querySelectorAll('.stat-item h4');
    }

    bindEvents() {
        this.uploadBtn?.addEventListener('click', () => this.openUploadModal());
        this.searchInput?.addEventListener('input', (e) => this.handleSearch(e.target.value));
        
        this.filterTabs.forEach(tab => {
            tab.addEventListener('click', (e) => this.handleFilter(e.target));
        });
        
        this.bindDragAndDrop();
        this.resourcesGrid?.addEventListener('click', (e) => this.handleResourceAction(e));
    }

    bindDragAndDrop() {
        if (!this.uploadArea) return;
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, () => {
                this.uploadArea.classList.add('drag-active');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            this.uploadArea.addEventListener(eventName, () => {
                this.uploadArea.classList.remove('drag-active');
            });
        });

        this.uploadArea.addEventListener('drop', (e) => this.handleFileDrop(e));
        this.uploadArea.addEventListener('click', () => this.openFilePicker());
    }

    // ==================== UPLOAD HANDLING ====================
    
    openUploadModal() {
        this.uploadArea?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        this.uploadArea?.classList.add('highlight-pulse');
        setTimeout(() => this.uploadArea?.classList.remove('highlight-pulse'), 2000);
    }

    openFilePicker() {
        const input = document.createElement('input');
        input.type = 'file';
        input.multiple = true;
        input.accept = '.pdf,.mp4,.mp3,.doc,.docx,.ppt,.pptx';
        
        input.onchange = (e) => {
            if (e.target.files.length > 0) this.uploadFiles(e.target.files);
        };
        
        input.click();
    }

    handleFileDrop(e) {
        const files = e.dataTransfer.files;
        if (files.length > 0) this.uploadFiles(files);
    }

    async uploadFiles(files) {
        const validTypes = ['application/pdf', 'video/mp4', 'audio/mpeg', 
                           'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                           'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'];
        
        const formData = new FormData();
        let validFiles = 0;
        
        Array.from(files).forEach(file => {
            if (validTypes.includes(file.type) || file.name.match(/\.(pdf|mp4|mp3|doc|docx|ppt|pptx)$/i)) {
                formData.append('files', file);
                validFiles++;
            }
        });

        if (validFiles === 0) {
            this.showNotification('Veuillez sélectionner des fichiers valides (PDF, MP4, MP3, DOC, PPT)', 'error');
            return;
        }

        this.showUploadProgress();

        try {
            const response = await fetch('/api/resources/upload/', {
                method: 'POST',
                headers: { 'X-CSRFToken': this.csrfToken },
                body: formData
            });

            if (response.ok) {
                this.showNotification(`${validFiles} fichier(s) téléversé(s) avec succès!`, 'success');
                this.loadResources();
                this.updateStats();
            } else {
                throw new Error('Upload failed');
            }
        } catch (error) {
            this.showNotification('Erreur lors du téléversement. Veuillez réessayer.', 'error');
        } finally {
            this.hideUploadProgress();
        }
    }

    // ==================== SEARCH & FILTER ====================

    handleSearch(query) {
        this.searchQuery = query.toLowerCase().trim();
        this.filterResources();
    }

    handleFilter(tabElement) {
        this.filterTabs.forEach(tab => tab.classList.remove('active'));
        tabElement.classList.add('active');
        
        const filterText = tabElement.textContent.trim();
        const filterMap = {
            'Tous': 'all',
            'Documents': 'document',
            'Vidéos': 'video',
            'Audio': 'audio',
            'Exercices': 'exercise'
        };
        
        this.currentFilter = filterMap[filterText] || 'all';
        this.filterResources();
    }

    filterResources() {
        const cards = document.querySelectorAll('.resource-card');
        
        cards.forEach(card => {
            const title = card.querySelector('.resource-title')?.textContent.toLowerCase() || '';
            const desc = card.querySelector('.resource-desc')?.textContent.toLowerCase() || '';
            const tags = Array.from(card.querySelectorAll('.tag')).map(tag => tag.textContent.toLowerCase());
            const typeBadge = card.querySelector('.file-type-badge')?.textContent.toLowerCase() || '';
            
            const matchesSearch = !this.searchQuery || 
                title.includes(this.searchQuery) || 
                desc.includes(this.searchQuery) ||
                tags.some(tag => tag.includes(this.searchQuery));
            
            let matchesFilter = true;
            if (this.currentFilter !== 'all') {
                matchesFilter = typeBadge.includes(this.currentFilter) || 
                               tags.some(tag => tag.includes(this.currentFilter));
            }
            
            if (matchesSearch && matchesFilter) {
                card.style.display = '';
                card.classList.add('fade-in');
            } else {
                card.style.display = 'none';
            }
        });

        this.toggleEmptyState(cards);
    }

    toggleEmptyState(cards) {
        const visibleCards = Array.from(cards).filter(card => card.style.display !== 'none');
        let emptyState = document.querySelector('.empty-state');
        
        if (visibleCards.length === 0) {
            if (!emptyState) {
                emptyState = document.createElement('div');
                emptyState.className = 'empty-state';
                emptyState.innerHTML = `
                    <div class="empty-icon">🔍</div>
                    <h3>Aucune ressource trouvée</h3>
                    <p>Essayez de modifier vos critères de recherche</p>
                `;
                this.resourcesGrid?.appendChild(emptyState);
            }
            emptyState.style.display = 'block';
        } else if (emptyState) {
            emptyState.style.display = 'none';
        }
    }

    // ==================== RESOURCE ACTIONS ====================

    handleResourceAction(e) {
        const button = e.target.closest('.btn-icon');
        if (!button) return;
        
        const card = button.closest('.resource-card');
        const resourceId = card?.dataset.resourceId;
        
        if (button.textContent.includes('⬇️')) {
            this.downloadResource(resourceId, card);
        } else if (button.textContent.includes('✏️')) {
            this.editResource(resourceId, card);
        } else if (button.textContent.includes('🗑️')) {
            this.deleteResource(resourceId, card);
        }
    }

    async downloadResource(resourceId, card) {
        const countElement = card.querySelector('.download-count');
        const currentCount = parseInt(countElement?.textContent.match(/\d+/)?.[0] || '0');
        
        try {
            const response = await fetch(`/api/resources/${resourceId}/download/`, {
                method: 'POST',
                headers: {
                    'X-CSRFToken': this.csrfToken,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                if (countElement) countElement.textContent = `⬇️ ${currentCount + 1} téléchargements`;
                
                const data = await response.json();
                if (data.download_url) window.open(data.download_url, '_blank');
                
                this.showNotification('Téléchargement démarré!', 'success');
            }
        } catch (error) {
            this.showNotification('Téléchargement en cours...', 'info');
        }
    }

    editResource(resourceId, card) {
        const title = card.querySelector('.resource-title')?.textContent || '';
        const desc = card.querySelector('.resource-desc')?.textContent || '';
        
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>Modifier la Ressource</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Titre</label>
                        <input type="text" id="edit-title" value="${title}" class="form-input">
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="edit-desc" class="form-textarea">${desc}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Tags (séparés par des virgules)</label>
                        <input type="text" id="edit-tags" class="form-input" placeholder="Anglais, A2, Grammaire...">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Annuler</button>
                    <button class="btn-primary" id="save-edit">Enregistrer</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        modal.querySelector('.modal-close')?.addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        
        modal.querySelector('#save-edit')?.addEventListener('click', async () => {
            const newTitle = modal.querySelector('#edit-title')?.value;
            const newDesc = modal.querySelector('#edit-desc')?.value;
            const newTags = modal.querySelector('#edit-tags')?.value;
            
            try {
                const response = await fetch(`/api/resources/${resourceId}/`, {
                    method: 'PATCH',
                    headers: {
                        'X-CSRFToken': this.csrfToken,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        title: newTitle,
                        description: newDesc,
                        tags: newTags.split(',').map(t => t.trim()).filter(t => t)
                    })
                });
                
                if (response.ok) {
                    this.showNotification('Ressource mise à jour avec succès!', 'success');
                    this.loadResources();
                    modal.remove();
                } else {
                    throw new Error('Update failed');
                }
            } catch (error) {
                this.showNotification('Erreur lors de la mise à jour', 'error');
            }
        });
    }

    async deleteResource(resourceId, card) {
        if (!confirm('Êtes-vous sûr de vouloir supprimer cette ressource ? Cette action est irréversible.')) {
            return;
        }
        
        try {
            const response = await fetch(`/api/resources/${resourceId}/`, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': this.csrfToken }
            });
            
            if (response.ok) {
                card.style.transform = 'scale(0.9)';
                card.style.opacity = '0';
                
                setTimeout(() => {
                    card.remove();
                    this.updateStats();
                }, 300);
                
                this.showNotification('Ressource supprimée avec succès', 'success');
            } else {
                throw new Error('Delete failed');
            }
        } catch (error) {
            this.showNotification('Erreur lors de la suppression', 'error');
        }
    }

    // ==================== DATA LOADING ====================

    async loadResources() {
        try {
            const response = await fetch('/api/resources/');
            if (response.ok) {
                this.resources = await response.json();
                // Keep existing HTML if API fails, otherwise you could render dynamically here
            }
        } catch (error) {
            console.error('Failed to load resources:', error);
        }
    }

    // ==================== UI HELPERS ====================

    animateStats() {
        this.statNumbers.forEach(stat => {
            const target = parseInt(stat.textContent);
            if (isNaN(target)) return;
            
            let current = 0;
            const increment = target / 30;
            const duration = 1000;
            const stepTime = duration / 30;
            
            const timer = setInterval(() => {
                current += increment;
                if (current >= target) {
                    stat.textContent = target;
                    clearInterval(timer);
                } else {
                    stat.textContent = Math.floor(current);
                }
            }, stepTime);
        });
    }

    updateStats() {
        fetch('/api/resources/stats/')
            .then(res => res.json())
            .then(data => { 
                const stats = {
                    'Documents PDF': data.pdf_count || 0,
                    'Vidéos': data.video_count || 0,
                    'Fichiers Audio': data.audio_count || 0,
                    'Téléchargements': data.total_downloads || 0
                };
                
                document.querySelectorAll('.stat-item').forEach(item => {
                    const label = item.querySelector('p')?.textContent;
                    const value = item.querySelector('h4');
                    if (label && stats[label] !== undefined) value.textContent = stats[label];
                });
            })
            .catch(err => console.error('Failed to update stats:', err));
    }

    showNotification(message, type = 'info') {
        document.querySelectorAll('.notification').forEach(n => n.remove());
        
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <span class="notification-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <span class="notification-message">${message}</span>
        `;
        
        document.body.appendChild(notification);
        
        requestAnimationFrame(() => notification.classList.add('show'));
        
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    showUploadProgress() {
        const progress = document.createElement('div');
        progress.className = 'upload-progress';
        progress.innerHTML = `
            <div class="progress-bar"><div class="progress-fill"></div></div>
            <span>Téléversement en cours...</span>
        `;
        document.body.appendChild(progress);
        
        setTimeout(() => {
            const fill = progress.querySelector('.progress-fill');
            if (fill) fill.style.width = '90%';
        }, 100);
    }

    hideUploadProgress() {
        const progress = document.querySelector('.upload-progress');
        if (progress) {
            const fill = progress.querySelector('.progress-fill');
            if (fill) fill.style.width = '100%';
            
            setTimeout(() => {
                progress.classList.add('fade-out');
                setTimeout(() => progress.remove(), 300);
            }, 500);
        }
    }
}

// ==================== KEYBOARD SHORTCUTS ====================

class KeyboardShortcuts {
    constructor() {
        this.bindEvents();
    }

    bindEvents() {
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                document.querySelector('.search-box input')?.focus();
            }
            
            if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
                e.preventDefault();
                document.querySelector('.upload-btn')?.click();
            }
            
            if (e.key === 'Escape') {
                document.querySelector('.modal-overlay')?.remove();
            }
        });
    }
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', () => {
    window.resourcesManager = new ResourcesManager();
    window.keyboardShortcuts = new KeyboardShortcuts();
    console.log('📚 Ressources Pédagogiques - JS Initialized');
});