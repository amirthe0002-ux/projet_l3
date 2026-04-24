// ============================================================
// CONFIG — change uniquement cette URL si ton port change
// ============================================================
console.log("JS WORKING");
const API_URL = `${window.location.protocol}//${window.location.host}/api`;
const MAX_TENTATIVES = 5;

// ============================================================
// ÉLÉMENTS DOM
// ============================================================
const form          = document.getElementById('loginForm');
const emailInput    = document.getElementById('email');
const pwdInput      = document.getElementById('password');
const btnLogin      = document.getElementById('btnLogin');
const alertBox      = document.getElementById('alert');
const alertMsg      = document.getElementById('alert-message');
const alertIcon     = document.getElementById('alert-icon');
const tentBar       = document.getElementById('tentativesBar');
const tentLabel     = document.getElementById('tentativesLabel');
const tentFill      = document.getElementById('tentativesFill');
const countdownEl   = document.getElementById('countdown');
const countdownTime = document.getElementById('countdown-time');
const togglePwd     = document.getElementById('togglePwd');
const rememberMe    = document.getElementById('rememberMe');

let countdownInterval = null;

// ============================================================
// ALERTE
// ============================================================
function showAlert(message, type = 'error') {
    const icons = {
        error:   'fa-circle-exclamation',
        warning: 'fa-triangle-exclamation',
        success: 'fa-circle-check'
    };
    alertBox.className = `alert alert-${type} show`;
    alertMsg.textContent = message;
    alertIcon.className = `fas ${icons[type] || icons.error}`;
}

function hideAlert() {
    alertBox.className = 'alert';
}

// ============================================================
// BARRE DE TENTATIVES
// ============================================================
function updateTentatives(nb) {
    if (nb === 0) { tentBar.classList.remove('show'); return; }
    tentBar.classList.add('show');
    tentFill.style.width  = `${(nb / MAX_TENTATIVES) * 100}%`;
    tentLabel.textContent = `${nb}/${MAX_TENTATIVES} tentatives — Compte verrouillé à ${MAX_TENTATIVES}`;
}

// ============================================================
// COUNTDOWN VERROUILLAGE
// ============================================================
function startCountdown(minutes) {
    let seconds = minutes * 60;
    countdownEl.classList.add('show');
    btnLogin.disabled = true;

    function tick() {
        const m = String(Math.floor(seconds / 60)).padStart(2, '0');
        const s = String(seconds % 60).padStart(2, '0');
        countdownTime.textContent = `${m}:${s}`;

        if (seconds <= 0) {
            clearInterval(countdownInterval);
            countdownEl.classList.remove('show');
            btnLogin.disabled = false;
            tentBar.classList.remove('show');
            hideAlert();
            showAlert('Compte déverrouillé. Vous pouvez réessayer.', 'success');
        }
        seconds--;
    }

    tick();
    countdownInterval = setInterval(tick, 1000);
}

// ============================================================
// TOGGLE MOT DE PASSE
// ============================================================
togglePwd.addEventListener('click', () => {
    const isText = pwdInput.type === 'text';
    pwdInput.type = isText ? 'password' : 'text';
    togglePwd.className = `fas ${isText ? 'fa-eye' : 'fa-eye-slash'} toggle-password`;
});

// ============================================================
// BOUTON LOADING
// ============================================================
function setLoading(loading) {
    btnLogin.disabled = loading;
    btnLogin.classList.toggle('loading', loading);
}

// ============================================================
// STOCKER LES TOKENS
// ============================================================
function saveTokens(access, refresh, user) {
    const storage = rememberMe.checked ? localStorage : sessionStorage;
    storage.setItem('access_token',  access);
    storage.setItem('refresh_token', refresh);
    storage.setItem('user', JSON.stringify(user));
}

// ============================================================
// REDIRECTION SELON LE RÔLE
// ============================================================
function redirectByRole(role) {
    const routes = {
        'Secretariat': '/dashboard/secretariat/',
        'Comptable':   '/dashboard/comptable/',
        'Dirigeant':   '/dashboard/dirigeant/',
        'Enseignant':  '/dashboard/enseignant/',
        'Etudiant':    '/dashboard/etudiant/',
        'Parent':      '/dashboard/parent/',
    };

    window.location.href = routes[role] || '/dashboard/';
}

// ============================================================
// VÉRIFIER SI DÉJÀ CONNECTÉ
// ============================================================
function checkAlreadyLoggedIn() {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    const user  = localStorage.getItem('user')         || sessionStorage.getItem('user');
    if (token && user) {
        try { redirectByRole(JSON.parse(user).role); } catch(e) {}
    }
}

// ============================================================
// SOUMISSION — APPEL API LOGIN
// ============================================================
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideAlert();

    const email    = emailInput.value.trim();
    const password = pwdInput.value;

    if (!email || !password) {
        showAlert('Veuillez remplir tous les champs.', 'error');
        return;
    }

    setLoading(true);
    emailInput.classList.remove('error');
    pwdInput.classList.remove('error');

    try {
        const response = await fetch(`${API_URL}/auth/login/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await response.json();

        if (response.ok) {
            // ✅ Succès
            saveTokens(data.access, data.refresh, data.user);
            showAlert(`Bienvenue ${data.user.first_name} ! Redirection...`, 'success');
            setTimeout(() => redirectByRole(data.user.role), 1000);

        } else {
            const message = data.error || 'Erreur de connexion.';

            if (response.status === 403) {
                // Compte verrouillé
                const match = message.match(/(\d+) minutes/);
                const mins  = match ? parseInt(match[1]) : 30;
                showAlert(message, 'warning');
                startCountdown(mins);

            } else if (response.status === 401) {
                // Mauvais mot de passe
                pwdInput.classList.add('error');
                const match = message.match(/(\d+)\/(\d+)/);
                if (match) updateTentatives(parseInt(match[1]));
                showAlert(message, 'error');

            } else {
                showAlert(message, 'error');
            }
        }

    } catch (err) {
        showAlert(
            'Impossible de contacter le serveur. Vérifiez que Django est lancé sur le port 8000.',
            'error'
        );
        console.error('Erreur réseau:', err);

    } finally {
        setLoading(false);
    }
});

// ============================================================
// MOT DE PASSE OUBLIÉ
// ============================================================
document.getElementById('forgotLink').addEventListener('click', (e) => {
    e.preventDefault();
    showAlert('Contactez l\'administrateur pour réinitialiser votre mot de passe.', 'warning');
});

// ============================================================
// INIT
// ============================================================
checkAlreadyLoggedIn();
