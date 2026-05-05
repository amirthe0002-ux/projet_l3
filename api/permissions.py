from rest_framework.permissions import BasePermission


# ============================================================
# PERMISSIONS PAR RÔLE
# ============================================================

class IsSecretariat(BasePermission):
    """Secrétariat uniquement"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'Secretariat'
        )


class IsComptable(BasePermission):
    """Comptable OU Secrétariat"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role in ['Comptable', 'Secretariat','Dirigeant']
        )


class IsDirigeant(BasePermission):
    """Dirigeant uniquement"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'Dirigeant'
        )


class IsEnseignant(BasePermission):
    """Enseignant uniquement"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'Enseignant'
        )


class IsEtudiant(BasePermission):
    """Étudiant uniquement"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'Etudiant'
        )


class IsParent(BasePermission):
    """Parent uniquement"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role == 'Parent'
        )


# ============================================================
# PERMISSIONS COMBINÉES
# ============================================================

class IsSecretariatOrDirigeant(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role in ['Secretariat', 'Dirigeant']
        )


class IsComptableOrDirigeant(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role in ['Comptable', 'Secretariat', 'Dirigeant']
        )


class IsEnseignantOrDirigeant(BasePermission):
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role in ['Enseignant', 'Dirigeant']
        )


class IsStaff(BasePermission):
    """Tout rôle staff (pas étudiant ni parent)"""
    def has_permission(self, request, view):
        return bool(
            request.user and
            request.user.is_authenticated and
            request.user.role in ['Secretariat', 'Comptable', 'Dirigeant', 'Enseignant']
        )


class IsEtudiantOrParent(BasePermission):
    """Étudiant ou Parent - CORRECTED ✅"""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in ['Etudiant', 'Parent']  # ✅ FIXED!


class IsAuthenticated(BasePermission):
    """Tout utilisateur connecté"""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


# ============================================================
# PERMISSIONS POUR GESTION DES NOTES (GradeManager)
# ============================================================

class CanViewGrades(BasePermission):
    """
    Permission pour voir les notes:
    - Enseignant: notes de ses groupes
    - Étudiant: ses propres notes
    - Parent: notes de ses enfants
    - Staff: toutes les notes
    """
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in [
            'Enseignant', 'Etudiant', 'Parent',
            'Secretariat', 'Dirigeant', 'Comptable'
        ]


class CanEditGrades(BasePermission):
    """Permission pour modifier les notes (Enseignant et Staff)"""
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False
        return request.user.role in ['Enseignant', 'Secretariat', 'Dirigeant']