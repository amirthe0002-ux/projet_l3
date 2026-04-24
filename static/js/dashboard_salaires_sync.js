/**
 * dashboard_salaires_sync.js
 * Add this to your dashboard page to read salary stats written by Gestion_Salaires.js
 * 
 * HOW IT WORKS:
 * Gestion_Salaires.js writes stats to localStorage['salaires_stats'] every time
 * bulletins are created or updated. This script reads them and updates the dashboard.
 *
 * USAGE: Add <script src="{% static 'js/dashboard_salaires_sync.js' %}"></script>
 * to your dashboard_comptable.html or dashboard_dirigeant.html
 */

function loadSalairesStats() {
    try {
        const raw = localStorage.getItem('salaires_stats');
        if (!raw) return;

        const stats = JSON.parse(raw);

        // Update any element with these data attributes or classes:
        // data-stat="salaires_total"   → total net salary paid
        // data-stat="salaires_brut"    → total gross
        // data-stat="bulletins_payes"  → count paid
        // data-stat="bulletins_attente"→ count pending
        // data-stat="nb_enseignants"   → teacher count

        const map = {
            'salaires_total':    fmtDA(stats.totalSalaires),
            'salaires_brut':     fmtDA(stats.totalBrut),
            'bulletins_payes':   stats.nbPayes,
            'bulletins_attente': stats.nbAttente,
            'nb_enseignants':    stats.nbEnseignants,
        };

        for (const [key, val] of Object.entries(map)) {
            document.querySelectorAll(`[data-stat="${key}"]`).forEach(el => {
                el.textContent = val;
            });
        }

        // Also update last-updated label if present
        const updEl = document.querySelector('[data-stat="salaires_updated"]');
        if (updEl && stats.lastUpdated) {
            updEl.textContent = 'Mis à jour: ' +
                new Date(stats.lastUpdated).toLocaleString('fr-FR');
        }

    } catch (e) {
        console.warn('Salary stats sync error:', e);
    }
}

function fmtDA(v) {
    if (v == null || isNaN(v)) return '—';
    return new Intl.NumberFormat('fr-DZ').format(parseFloat(v)) + ' DA';
}

// Run on page load and listen for storage changes (real-time sync)
document.addEventListener('DOMContentLoaded', loadSalairesStats);
window.addEventListener('storage', e => {
    if (e.key === 'salaires_stats') loadSalairesStats();
});