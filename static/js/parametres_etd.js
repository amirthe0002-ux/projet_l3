/**
 * Paramètres Étudiant - JWT Authentication
 * File: static/js/parametres_etd.js
 */

// ============================================================
// CONFIG
// ============================================================
const API_URL = '/api';

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
            headers: authHeaders(),
            ...options
        });
        if (res.status === 401) return { error: 'JWT_INVALID', message: 'Token invalide.' };
        if (res.status === 403) return { error: 'FORBIDDEN', message: 'Accès refusé.' };
        if (!res.ok) return { error: 'API_ERROR', message: `Erreur ${res.status}` };
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
    const user = getUser();
    if (!token || !user) { window.location.href = '/login/'; return null; }
    if (!['Etudiant', 'Dirigeant'].includes(user.role)) { window.location.href = '/login/'; return null; }
    return user;
}

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
    document.querySelector('.toast-param')?.remove();
    const colors = { success: '#059669', error: '#dc2626', warning: '#d97706', info: '#0284c7' };
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const t = document.createElement('div');
    t.className = 'toast-param';
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
// TOGGLE PASSWORD VISIBILITY
// ============================================================
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    const icon = button.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// ============================================================
// PASSWORD STRENGTH
// ============================================================
document.getElementById('newPassword')?.addEventListener('input', function(e) {
    const password = e.target.value;
    const strengthBar = document.getElementById('passwordStrength');
    
    if (password.length === 0) {
        strengthBar.classList.remove('show');
        return;
    }
    
    strengthBar.classList.add('show');
    let strength = 0;
    
    if (password.length >= 8) strength++;
    if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength++;
    if (password.match(/[0-9]/)) strength++;
    if (password.match(/[^a-zA-Z0-9]/)) strength++;
    
    const colors = ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'];
    const widths = ['25%', '50%', '75%', '100%'];
    
    strengthBar.innerHTML = `<div class="password-strength-bar" style="width: ${widths[strength-1]}; background: ${colors[strength-1]};"></div>`;
});

// ============================================================
// LOAD USER DATA
// ============================================================
async function loadUserData() {
    const user = getUser();
    if (!user) return;

    // Fill profile form
    document.getElementById('firstName').value = user.first_name || '';
    document.getElementById('lastName').value = user.last_name || '';
    document.getElementById('email').value = user.email || '';
    document.getElementById('phone').value = user.telephone || '';
    document.getElementById('address').value = user.adresse || '';

    // Load detailed data from API
    const data = await apiFetch('/auth/me/');
    if (!data.error) {
        document.getElementById('phone').value = data.telephone || '';
        document.getElementById('address').value = data.adresse || '';
    }
}

// ============================================================
// SAVE PROFILE
// ============================================================
document.getElementById('profileForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const formData = {
        first_name: document.getElementById('firstName').value,
        last_name: document.getElementById('lastName').value,
        telephone: document.getElementById('phone').value,
        adresse: document.getElementById('address').value
    };

    const result = await apiFetch('/auth/me/', {
        method: 'PUT',
        body: JSON.stringify(formData)
    });

    if (result.error) {
        showToast('Erreur: ' + result.message, 'error');
    } else {
        showToast('Profil mis à jour avec succès', 'success');
        // Update local storage
        const user = getUser();
        user.first_name = formData.first_name;
        user.last_name = formData.last_name;
        localStorage.setItem('user', JSON.stringify(user));
    }
});

// ============================================================
// CHANGE PASSWORD
// ============================================================
document.getElementById('passwordForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    if (newPassword !== confirmPassword) {
        showToast('Les nouveaux mots de passe ne correspondent pas', 'error');
        return;
    }

    if (newPassword.length < 8) {
        showToast('Le mot de passe doit contenir au moins 8 caractères', 'error');
        return;
    }

    const result = await apiFetch('/auth/change-password/', {
        method: 'POST',
        body: JSON.stringify({
            ancien_password: currentPassword,
            nouveau_password: newPassword,
            nouveau_password2: confirmPassword
        })
    });

    if (result.error) {
        showToast('Erreur: ' + (result.message || 'Mot de passe incorrect'), 'error');
    } else {
        showToast('Mot de passe changé avec succès', 'success');
        document.getElementById('passwordForm').reset();
        document.getElementById('passwordStrength').classList.remove('show');
    }
});

// ============================================================
// SAVE NOTIFICATION SETTINGS
// ============================================================
async function saveNotificationSettings() {
    const settings = {
        email: document.getElementById('emailNotif').checked,
        sms: document.getElementById('smsNotif').checked,
        app: document.getElementById('appNotif').checked,
        reminders: document.getElementById('reminderNotif').checked,
        grades: document.getElementById('gradeNotif').checked
    };

    // Save to localStorage for now (until you have a preferences API endpoint)
    localStorage.setItem('notification_prefs', JSON.stringify(settings));
    showToast('Préférences de notification enregistrées', 'success');
}

// ============================================================
// SAVE LANGUAGE SETTINGS
// ============================================================
function saveLanguageSettings() {
    const language = document.getElementById('language').value;
    const timezone = document.getElementById('timezone').value;
    
    localStorage.setItem('language', language);
    localStorage.setItem('timezone', timezone);
    
    showToast('Paramètres régionaux enregistrés', 'success');
    
    // Reload page if language changed
    if (language !== 'fr') {
        setTimeout(() => location.reload(), 1000);
    }
}

// ============================================================
// EXPORT DATA
// ============================================================
async function exportData() {
    showToast('Préparation de l\'export...', 'info');
    
    // Simulate export (replace with actual API call)
    setTimeout(() => {
        const data = {
            user: getUser(),
            exportDate: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mes-donnees-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Données exportées avec succès', 'success');
    }, 1500);
}

// ============================================================
// DEACTIVATE ACCOUNT
// ============================================================
function deactivateAccount() {
    if (confirm('Êtes-vous sûr de vouloir désactiver votre compte ? Vous pourrez le réactiver ultérieurement.')) {
        showToast('Fonctionnalité à implémenter côté serveur', 'warning');
    }
}

// ============================================================
// LOAD SAVED PREFERENCES
// ============================================================
function loadSavedPreferences() {
    // Load notification preferences
    const notifPrefs = JSON.parse(localStorage.getItem('notification_prefs') || '{}');
    if (notifPrefs.email !== undefined) document.getElementById('emailNotif').checked = notifPrefs.email;
    if (notifPrefs.sms !== undefined) document.getElementById('smsNotif').checked = notifPrefs.sms;
    if (notifPrefs.app !== undefined) document.getElementById('appNotif').checked = notifPrefs.app;
    if (notifPrefs.reminders !== undefined) document.getElementById('reminderNotif').checked = notifPrefs.reminders;
    if (notifPrefs.grades !== undefined) document.getElementById('gradeNotif').checked = notifPrefs.grades;
    
    // Load language preferences
    const savedLang = localStorage.getItem('language') || 'fr';
    const savedTz = localStorage.getItem('timezone') || 'Africa/Algiers';
    document.getElementById('language').value = savedLang;
    document.getElementById('timezone').value = savedTz;
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = checkSession();
    if (!user) return;
    
    await loadUserData();
    loadSavedPreferences();
});