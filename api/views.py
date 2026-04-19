from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from rest_framework.parsers import MultiPartParser, FormParser
from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from django.utils import timezone
from django.contrib.auth import authenticate
from django.db.models import Count, Sum, Avg, Q
from rest_framework import generics, status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.tokens import RefreshToken
 
from .models import (
    Utilisateur, Parent, Enseignant, Groupe, Etudiant, Inscription,
    Planning, Seance, Evaluation, Note, Absence, Paiement,
    BulletinSalaire, Ressource, Message, PieceJointe,
    Notification, PreferenceNotification, ParametreSysteme, Audit
)
from .serializers import (
    UtilisateurSerializer, UtilisateurUpdateSerializer, ChangePasswordSerializer,
    ParentSerializer, ParentCreateSerializer,
    EnseignantSerializer, EnseignantCreateSerializer,
    GroupeSerializer,
    EtudiantSerializer, EtudiantCreateSerializer,
    InscriptionSerializer,
    PlanningSerializer,
    SeanceSerializer,
    EvaluationSerializer,
    NoteSerializer, NoteCreateSerializer,
    AbsenceSerializer,
    PaiementSerializer,
    BulletinSalaireSerializer,
    RessourceSerializer, RessourceCreateSerializer,
    MessageSerializer, MessageCreateSerializer,
    NotificationSerializer,
    ParametreSystemeSerializer,
    AuditSerializer,
)
from .permissions import (
    IsSecretariat, IsComptable, IsDirigeant, IsEnseignant,
    IsEtudiant, IsParent,
    IsSecretariatOrDirigeant, IsComptableOrDirigeant,
    IsEnseignantOrDirigeant, IsStaff, IsEtudiantOrParent,
)
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from functools import wraps


# ============================================================
# DECORATOR — PROTECTION PAR RÔLE
# ============================================================

def role_required(*roles):
    """
    Décorateur pour protéger une vue selon le rôle.
    Usage : @role_required('Secretariat', 'Dirigeant')
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            if not request.user.is_authenticated:
                return redirect('login')
            if request.user.role not in roles:
                return redirect('accès_refusé')
            if request.user.statut != 'Actif':
                logout(request)
                return redirect('login')
            return view_func(request, *args, **kwargs)
        return wrapper
    return decorator


# ============================================================
# AUTH — LOGIN / LOGOUT
# ============================================================

def login_view(request):
    """
    GET  → Affiche la page login
    POST → Traite le formulaire (utilisé si tu veux un fallback sans JS)
    """
    # Si déjà connecté → rediriger vers son dashboard
    if request.user.is_authenticated:
        return redirect_by_role(request.user.role)

    if request.method == 'POST':
        email    = request.POST.get('email', '').strip()
        password = request.POST.get('password', '')

        user = authenticate(request, username=email, password=password)
        if user:
            if user.statut != 'Actif':
                messages.error(request, 'Compte inactif ou suspendu.')
                return render(request, 'login.html')
            if user.compte_verrouille:
                messages.error(request, 'Compte verrouillé. Contactez l\'administrateur.')
                return render(request, 'login.html')
            login(request, user)
            return redirect_by_role(user.role)
        else:
            messages.error(request, 'Email ou mot de passe incorrect.')

    return render(request, 'login.html')


def logout_view(request):
    """Déconnexion et redirection vers login"""
    logout(request)
    return redirect('login')


def redirect_by_role(role):
    """Redirige vers le bon dashboard selon le rôle"""
    routes = {
        'Secretariat': 'dashboard_secretariat',
        'Comptable':   'dashboard_comptable',
        'Dirigeant':   'dashboard_dirigeant',
        'Enseignant':  'dashboard_enseignant',
        'Etudiant':    'dashboard_etudiant',
        'Parent':      'dashboard_parent',
    }
    return redirect(routes.get(role, 'login'))


def acces_refuse_view(request):
    """Page 403 - Accès refusé"""
    return render(request, 'acces_refuse.html', status=403)


# ============================================================
# SECRÉTARIAT
# ============================================================


def dashboard_secretariat(request):
    """Dashboard principal Secrétariat"""
    return render(request, 'dashboard_secretariat.html', {
        'user': request.user,
        'role': request.user.role,
        'page': 'dashboard',
    })



def etudiants_view(request):
    """Page gestion des étudiants"""
    return render(request, 'Gestion_Etudiants.html', {
        'user': request.user,
        'page': 'etudiants',
    })


@role_required('Secretariat', 'Dirigeant')
def etudiant_detail_view(request, pk):
    """Page détail d'un étudiant"""
    return render(request, 'secretariat/etudiant_detail.html', {
        'user':       request.user,
        'page':       'etudiants',
        'etudiant_id': pk,
    })



def enseignants_view(request):
    """Page gestion des enseignants"""
    return render(request, 'Gestion_Enseignants.html', {
        'user': request.user,
        'page': 'enseignants',
    })


@role_required('Secretariat', 'Dirigeant')
def enseignant_detail_view(request, pk):
    """Page détail d'un enseignant"""
    return render(request, 'secretariat/enseignant_detail.html', {
        'user':         request.user,
        'page':         'enseignants',
        'enseignant_id': pk,
    })



def groupes_view(request):
    """Page gestion des groupes"""
    return render(request, 'Gestion_Groupes.html', {
        'user': request.user,
        'page': 'groupes',
    })


@role_required('Secretariat', 'Dirigeant')
def groupe_detail_view(request, pk):
    """Page détail d'un groupe"""
    return render(request, 'secretariat/groupe_detail.html', {
        'user':     request.user,
        'page':     'groupes',
        'groupe_id': pk,
    })



def planning_view(request):
    """Page gestion du planning"""
    return render(request, 'GESTION_PLANING.html', {
        'user': request.user,
        'page': 'planning',
    })


@role_required('Secretariat', 'Dirigeant')
def parents_view(request):
    """Page gestion des parents"""
    return render(request, 'secretariat/parents.html', {
        'user': request.user,
        'page': 'parents',
    })


@role_required('Secretariat', 'Dirigeant')
def inscriptions_view(request):
    """Page gestion des inscriptions"""
    return render(request, 'secretariat/inscriptions.html', {
        'user': request.user,
        'page': 'inscriptions',
    })


# ============================================================
# COMPTABLE (Secrétariat hérite aussi de ces droits)
# ============================================================

@role_required('Comptable', 'Secretariat', 'Dirigeant')
def dashboard_comptable(request):
    """Dashboard principal Comptable"""
    return render(request, 'dashboard_comptable.html', {
        'user': request.user,
        'page': 'dashboard',
    })



def paiements_view(request):
    """Page gestion des paiements étudiants"""
    return render(request, 'Gestion_Paiements.html', {
        'user': request.user,
        'page': 'paiements',
    })
def salaires_view(request):
    """Page gestion des paiements étudiants"""
    return render(request, 'Gestion_Salaires.html', {
        'user': request.user,
        'page': 'paiements',
    })



def paiement_detail_view(request, pk):
    """Page détail d'un paiement"""
    return render(request, 'comptable/paiement_detail.html', {
        'user':       request.user,
        'page':       'paiements',
        'paiement_id': pk,
    })



def bulletins_view(request):
    """Page bulletins de salaire des enseignants"""
    return render(request, 'Factures.html', {
        'user': request.user,
        'page': 'bulletins',
    })



def bulletin_detail_view(request, pk):
    """Page détail d'un bulletin de salaire"""
    return render(request, 'Factures.html', {
        'user':      request.user,
        'page':      'bulletins',
        'bulletin_id': pk,
    })


@role_required('Comptable', 'Secretariat', 'Dirigeant')
def situation_financiere_view(request):
    """Page situation financière globale"""
    return render(request, 'comptable/situation_financiere.html', {
        'user': request.user,
        'page': 'finances',
    })


# ============================================================
# DIRIGEANT
# ============================================================

@role_required('Dirigeant')
def dashboard_dirigeant(request):
    """Dashboard principal Dirigeant avec KPIs complets"""
    return render(request, 'dashboard_dirigeant.html', {
        'user': request.user,
        'page': 'dashboard',
    })


@role_required('Dirigeant')
def parametres_view(request):
    """Page paramètres système"""
    return render(request, 'dirigeant/parametres.html', {
        'user': request.user,
        'page': 'parametres',
    })


@role_required('Dirigeant')
def audit_view(request):
    """Page journal d'audit"""
    return render(request, 'dirigeant/audit.html', {
        'user': request.user,
        'page': 'audit',
    })


@role_required('Dirigeant')
def utilisateurs_view(request):
    """Page gestion des utilisateurs (admin)"""
    return render(request, 'dirigeant/utilisateurs.html', {
        'user': request.user,
        'page': 'utilisateurs',
    })


@role_required('Dirigeant')
def rapports_view(request):
    """Page rapports et statistiques"""
    return render(request, 'dirigeant/rapports.html', {
        'user': request.user,
        'page': 'rapports',
    })


# ============================================================
# ENSEIGNANT
# ============================================================

@role_required('Enseignant', 'Dirigeant')
def dashboard_enseignant(request):
    """Dashboard principal Enseignant"""
    return render(request, 'dashboard_enseignant.html', {
        'user': request.user,
        'page': 'dashboard',
    })



def mes_groupes_view(request):
    """Page mes groupes (enseignant)"""
    return render(request, 'mes_groupes.html', {
        'user': request.user,
        'page': 'groupes',
    })



def notes_view(request):
    """Page saisie des notes"""
    return render(request, 'gestion_des_notes.html', {
        'user': request.user,
        'page': 'notes',
    })



def absences_view(request):
    """Page gestion des absences"""
    return render(request, 'absences.html', {
        'user': request.user,
        'page': 'absences',
    })



def ressources_view(request):
    """Page gestion des ressources pédagogiques"""
    return render(request, 'ressources.html', {
        'user': request.user,
        'page': 'ressources',
    })



def messagerie_enseignant_view(request):
    """Page messagerie enseignant ↔ parents"""
    return render(request, 'messagerie_ens.html', {
        'user': request.user,
        'page': 'messagerie',
    })


@role_required('Enseignant', 'Dirigeant')
def evaluations_view(request):
    """Page gestion des évaluations"""
    return render(request, 'enseignant/evaluations.html', {
        'user': request.user,
        'page': 'evaluations',
    })


# ============================================================
# ÉTUDIANT
# ============================================================

@role_required('Etudiant')
def dashboard_etudiant(request):
    """Dashboard principal Étudiant"""
    return render(request, 'dashboard_etudiant.html', {
        'user': request.user,
        'page': 'dashboard',
    })


@role_required('Etudiant')
def mes_notes_view(request):
    """Page mes notes (étudiant)"""
    return render(request, 'mes_notes.html', {
        'user': request.user,
        'page': 'notes',
    })


@role_required('Etudiant')
def mon_planning_view(request):
    """Page mon planning (étudiant)"""
    return render(request, 'mon_planing.html', {
        'user': request.user,
        'page': 'planning',
    })


def mon_niveau_view(request):
    """Page mon niveau et progression (étudiant)"""
    return render(request, 'mon_niveau.html', {
        'user': request.user,
        'page': 'niveau',
    })


@role_required('Etudiant')
def mes_ressources_view(request):
    """Page mes ressources pédagogiques (étudiant)"""
    return render(request, 'mes_ressources.html', {
        'user': request.user,
        'page': 'ressources',
    })

def messagerie_etudiant_view(request):
    """Page messagerie parent ↔ enseignant"""
    return render(request, 'msg_etd.html', {
        'user': request.user,
        'page': 'messagerie',
    })


# ============================================================
# PARENT
# ============================================================

@role_required('Parent')
def dashboard_parent(request):
    """Dashboard principal Parent"""
    return render(request, 'dashboard_parent.html', {
        'user': request.user,
        'page': 'dashboard',
    })


@role_required('Parent')
def suivi_enfant_view(request):
    """Page suivi de l'enfant (notes, absences, planning)"""
    return render(request, 'parent/suivi_enfant.html', {
        'user': request.user,
        'page': 'suivi',
    })


@role_required('Parent')
def messagerie_parent_view(request):
    """Page messagerie parent ↔ enseignant"""
    return render(request, 'parent/messagerie.html', {
        'user': request.user,
        'page': 'messagerie',
    })


@role_required('Parent')
def notifications_parent_view(request):
    """Page notifications parent"""
    return render(request, 'parent/notifications.html', {
        'user': request.user,
        'page': 'notifications',
    })


# ============================================================
# COMMUN — Profil utilisateur (tous les rôles)
# ============================================================

@login_required(login_url='login')
def profil_view(request):
    """Page profil personnel (tous les rôles)"""
    return render(request, 'profile_etd.html', {
        'user': request.user,
        'page': 'profil',
    })


@login_required(login_url='login')
def notifications_view(request):
    """Page notifications (tous les rôles)"""
    return render(request, 'commun/notifications.html', {
        'user': request.user,
        'page': 'notifications',
    })


@login_required(login_url='login')
def messagerie_view(request):
    """Page messagerie (tous les rôles)"""
    return render(request, 'commun/messagerie.html', {
        'user': request.user,
        'page': 'messagerie',
    })

# ============================================================
# HELPER — Enregistrer dans l'audit
# ============================================================

def log_audit(request, action, entite=None, id_entite=None,
              ancienne_valeur=None, nouvelle_valeur=None, resultat='Succes',
              message_erreur=None):
    try:
        Audit.objects.create(
            utilisateur=request.user,
            action=action,
            entite=entite,
            id_entite=id_entite,
            ancienne_valeur=ancienne_valeur,
            nouvelle_valeur=nouvelle_valeur,
            adresse_ip=request.META.get('REMOTE_ADDR'),
            navigateur=request.META.get('HTTP_USER_AGENT', '')[:100],
            resultat=resultat,
            message_erreur=message_erreur,
        )
    except Exception:
        pass
 
 
# ============================================================
# DJANGO TEMPLATE VIEWS (Non-API)
# ============================================================
 
def login_page(request):
    """Page de login"""
    return render(request, 'login.html')
 
 
@login_required(login_url='login_page')
def dashboard_scr(request):
    """Dashboard Secrétariat"""
    return render(request, 'dashboard_secretariat.html')
 
 
@login_required(login_url='login_page')
def dashboard_ens(request):
    """Dashboard Enseignant"""
    context = {
        'user': request.user,
        'role': request.user.role if hasattr(request.user, 'role') else 'Unknown',
    }
    return render(request, 'dashboard_enseignant.html', context)
 
 
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
 
 
@login_required(login_url='login_page')
def download_ressource(request, pk):
    """
    Download a resource file
    """
    # JWT token auth from query param
    token = request.GET.get('token')
    if token:
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            jwt_auth = JWTAuthentication()
            validated_token = jwt_auth.get_validated_token(token)
            user = jwt_auth.get_user(validated_token)
            request.user = user
        except Exception:
            pass
 
    # Get resource
    ressource = get_object_or_404(Ressource, pk=pk)
 
    # Permission check: only students have restrictions
    if request.user.role == 'Etudiant':
        if not ressource.visible_etudiants:
            raise Http404("Non disponible")
        # Check if student is in the same group as the resource
        try:
            if ressource.groupe and request.user.etudiant_profile.groupe != ressource.groupe:
                raise Http404("Non autorisé")
        except:
            raise Http404("Erreur permissions")
 
    # Teachers, Parents, Staff can download (with their own logic if needed)
    # For now, allow all other authenticated users
 
    if not ressource.chemin_fichier:
        raise Http404("Fichier non trouvé")
 
    # Increment counter
    ressource.nombre_telechargements = (ressource.nombre_telechargements or 0) + 1
    ressource.save(update_fields=['nombre_telechargements'])
 
    # Log
    log_audit(request, 'DOWNLOAD', 'Ressource', pk)
 
    # Return file
    return FileResponse(
        ressource.chemin_fichier.open('rb'),
        as_attachment=True,
        filename=ressource.chemin_fichier.name.split('/')[-1]
    )
 
@login_required(login_url='login_page')
def messagerie(request):
    """Page de messagerie"""
    try:
        enseignant = Enseignant.objects.get(user=request.user)
    except Enseignant.DoesNotExist:
        enseignant = None
 
    messages = Message.objects.filter(
        Q(expediteur=request.user) | Q(destinataire=request.user)
    ).select_related('expediteur', 'destinataire').order_by('-date_envoi')[:50]
 
    context = {
        'messages': messages,
        'user': request.user,
        'enseignant': enseignant,
    }
    return render(request, 'messagerie_ens.html', context)
 
 
@login_required(login_url='login_page')
def ressources(request):
    """Page de ressources pédagogiques"""
    try:
        enseignant = Enseignant.objects.get(user=request.user)
        ressources = Ressource.objects.filter(enseignant=enseignant).select_related('groupe')
    except Enseignant.DoesNotExist:
        ressources = Ressource.objects.filter(visible_etudiants=True).select_related('groupe')
    refresh = RefreshToken.for_user(request.user)
    access_token = str(refresh.access_token)
 
    context = {
        'ressources': ressources,
        'user': request.user,
        'total_ressources': ressources.count(),
        'jwt_token': access_token,
    }
    return render(request, 'ressources.html', context)
 
 
@login_required(login_url='login_page')
def groupes(request):
    """Page de gestion des groupes"""
    try:
        enseignant = Enseignant.objects.get(user=request.user)
        groupes = Groupe.objects.filter(
            enseignant=enseignant,
            statut_groupe='Actif'
        ).select_related('enseignant__user').prefetch_related(
            'etudiant_set__user', 'etudiant_set__parent'
        )
    except Enseignant.DoesNotExist:
        groupes = Groupe.objects.none()
 
    # Statistiques pour chaque groupe
    groupes_data = []
    for groupe in groupes:
        etudiants = Etudiant.objects.filter(groupe=groupe)
        notes = Note.objects.filter(evaluation__groupe=groupe)
        absences = Absence.objects.filter(seance__groupe=groupe, statut_absence='Absent')
 
        moyenne = notes.aggregate(Avg('note_obtenue'))['note_obtenue__avg'] or 0
 
        groupes_data.append({
            'groupe': groupe,
            'nb_etudiants': etudiants.count(),
            'moyenne_groupe': round(moyenne, 2),
            'taux_assiduité': 92,  # À calculer selon votre logique
            'progression': 75,  # À calculer selon votre logique
        })
 
    context = {
        'groupes': groupes_data,
        'user': request.user,
        'total_groupes': len(groupes_data),
    }
    return render(request, 'groupe.html', context)
 
 
@login_required(login_url='login_page')
def clock(request):
    """Page du horloge numérique avec timezones"""
    context = {
        'user': request.user,
    }
    return render(request, 'clock.html', context)
 
 
# ============================================================
# AUTH APIS
# ============================================================
 
class LoginView(APIView):
    """
    POST /api/auth/login/
    Body: { "email": "...", "password": "..." }
    """
    permission_classes = [AllowAny]
 
    def post(self, request):
        email = request.data.get('email', '').strip()
        password = request.data.get('password', '')
 
        if not email or not password:
            return Response(
                {'error': 'Email et mot de passe requis.'},
                status=status.HTTP_400_BAD_REQUEST
            )
 
        try:
            user = Utilisateur.objects.get(email=email)
        except Utilisateur.DoesNotExist:
            return Response(
                {'error': 'Identifiants incorrects.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
 
        # Vérifier verrouillage
        if user.compte_verrouille:
            if user.date_verrouillage:
                duree = ParametreSysteme.objects.filter(
                    nom_parametre='DUREE_VERROUILLAGE_MIN'
                ).first()
                minutes = int(duree.valeur) if duree else 30
                delta = timezone.now() - user.date_verrouillage
                if delta.total_seconds() < minutes * 60:
                    restant = minutes - int(delta.total_seconds() // 60)
                    return Response(
                        {'error': f'Compte verrouillé. Réessayez dans {restant} minutes.'},
                        status=status.HTTP_403_FORBIDDEN
                    )
                else:
                    user.compte_verrouille = False
                    user.tentatives_echouees = 0
                    user.date_verrouillage = None
                    user.save()
 
        # Vérifier statut
        if user.statut != 'Actif':
            return Response(
                {'error': 'Compte inactif ou suspendu. Contactez l\'administration.'},
                status=status.HTTP_403_FORBIDDEN
            )
 
        # Vérifier mot de passe
        if not user.check_password(password):
            max_tentatives = ParametreSysteme.objects.filter(
                nom_parametre='MAX_TENTATIVES_LOGIN'
            ).first()
            max_t = int(max_tentatives.valeur) if max_tentatives else 5
 
            user.tentatives_echouees += 1
            if user.tentatives_echouees >= max_t:
                user.compte_verrouille = True
                user.date_verrouillage = timezone.now()
                user.save()
                log_audit(request, 'LOGIN', 'Utilisateur', user.pk,
                          resultat='Erreur', message_erreur='Compte verrouillé')
                return Response(
                    {'error': f'Compte verrouillé après {max_t} tentatives échouées.'},
                    status=status.HTTP_403_FORBIDDEN
                )
            user.save()
            log_audit(request, 'LOGIN', 'Utilisateur', user.pk,
                      resultat='Erreur', message_erreur='Mot de passe incorrect')
            return Response(
                {'error': f'Mot de passe incorrect. Tentative {user.tentatives_echouees}/{max_t}.'},
                status=status.HTTP_401_UNAUTHORIZED
            )
 
        # Connexion réussie
        user.tentatives_echouees = 0
        user.derniere_connexion = timezone.now()
        user.save()
 
        refresh = RefreshToken.for_user(user)
        log_audit(request, 'LOGIN', 'Utilisateur', user.pk)
 
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UtilisateurSerializer(user).data,
        }, status=status.HTTP_200_OK)
 
 
class LogoutView(APIView):
    """POST /api/auth/logout/"""
    permission_classes = [IsAuthenticated]
 
    def post(self, request):
        try:
            token = RefreshToken(request.data.get('refresh'))
            token.blacklist()
            log_audit(request, 'LOGOUT', 'Utilisateur', request.user.pk)
            return Response({'message': 'Déconnexion réussie.'}, status=status.HTTP_200_OK)
        except Exception:
            return Response({'error': 'Token invalide.'}, status=status.HTTP_400_BAD_REQUEST)
 
 
class MeView(APIView):
    """GET/PUT /api/auth/me/"""
    permission_classes = [IsAuthenticated]
 
    def get(self, request):
        return Response(UtilisateurSerializer(request.user).data)
 
    def put(self, request):
        serializer = UtilisateurUpdateSerializer(
            request.user, data=request.data, partial=True
        )
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'Utilisateur', request.user.pk)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
class ChangePasswordView(APIView):
    """POST /api/auth/change-password/"""
    permission_classes = [IsAuthenticated]
 
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
        user = request.user
        if not user.check_password(serializer.validated_data['ancien_password']):
            return Response(
                {'error': 'Ancien mot de passe incorrect.'},
                status=status.HTTP_400_BAD_REQUEST
            )
 
        user.set_password(serializer.validated_data['nouveau_password'])
        user.save()
        log_audit(request, 'UPDATE', 'Utilisateur', user.pk,
                  nouvelle_valeur={'action': 'changement_mot_de_passe'})
        return Response({'message': 'Mot de passe modifié avec succès.'})
 
 
# ============================================================
# ÉTUDIANTS
# ============================================================
 
class EtudiantListCreateView(APIView):
    """GET/POST /api/etudiants/"""
 
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSecretariatOrDirigeant()]
        return [IsStaff()]
 
    def get(self, request):
        qs = Etudiant.objects.select_related('user', 'groupe', 'parent__user').all()
 
        groupe_id = request.query_params.get('groupe')
        niveau = request.query_params.get('niveau')
        statut = request.query_params.get('statut')
        search = request.query_params.get('search')
 
        if groupe_id:
            qs = qs.filter(groupe_id=groupe_id)
        if niveau:
            qs = qs.filter(niveau_actuel=niveau)
        if statut:
            qs = qs.filter(statut_etudiant=statut)
        if search:
            qs = qs.filter(
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__email__icontains=search)
            )
 
        if request.user.role == 'Enseignant':
            try:
                enseignant = request.user.enseignant_profile
                qs = qs.filter(groupe__enseignant=enseignant)
            except Exception:
                return Response([])
 
        serializer = EtudiantSerializer(qs, many=True)
        return Response(serializer.data)
 
    def post(self, request):
        serializer = EtudiantCreateSerializer(data=request.data)
        if serializer.is_valid():
            etudiant = serializer.save()
            log_audit(request, 'CREATE', 'Etudiant', etudiant.pk,
                      nouvelle_valeur={'email': etudiant.user.email})
 
            response_data = EtudiantSerializer(etudiant).data
 
            # If a parent was auto-created (mineur < 15 ans), include info in response
            parent_created = getattr(etudiant, '_parent_created', None)
            if parent_created:
                generated_pwd = getattr(parent_created, '_generated_password', None)
                response_data['parent_auto_cree'] = {
                    'id':         parent_created.id,
                    'nom':        parent_created.user.get_full_name(),
                    'email':      parent_created.user.email,
                    'telephone':  parent_created.user.telephone,
                    'relation':   parent_created.relation_enfant,
                    'message':    'Compte parent créé automatiquement (étudiant mineur).',
                    # Only included if password was auto-generated — show once, save it!
                    'mot_de_passe_genere': generated_pwd if generated_pwd else None,
                }
 
            return Response(response_data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
class EtudiantDetailView(APIView):
    """GET/PUT/DELETE /api/etudiants/<pk>/"""
    permission_classes = [IsAuthenticated]
 
    def get_object(self, pk, request):
        try:
            etudiant = Etudiant.objects.select_related('user', 'groupe', 'parent__user').get(pk=pk)
        except Etudiant.DoesNotExist:
            return None
 
        if request.user.role == 'Etudiant':
            if etudiant.user != request.user:
                return None
        if request.user.role == 'Parent':
            try:
                parent = request.user.parent_profile
                if etudiant.parent != parent:
                    return None
            except Exception:
                return None
        return etudiant
 
    def get(self, request, pk):
        etudiant = self.get_object(pk, request)
        if not etudiant:
            return Response({'error': 'Étudiant introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(EtudiantSerializer(etudiant).data)
 
    def put(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=status.HTTP_403_FORBIDDEN)
        etudiant = self.get_object(pk, request)
        if not etudiant:
            return Response({'error': 'Étudiant introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = EtudiantSerializer(etudiant, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'Etudiant', pk)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
    def delete(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=status.HTTP_403_FORBIDDEN)
        etudiant = self.get_object(pk, request)
        if not etudiant:
            return Response({'error': 'Étudiant introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        etudiant.statut_etudiant = 'Inactif'
        etudiant.save()
        etudiant.user.statut = 'Inactif'
        etudiant.user.save()
        log_audit(request, 'DELETE', 'Etudiant', pk)
        return Response({'message': 'Étudiant archivé.'}, status=status.HTTP_200_OK)
 
 
# ============================================================
# ENSEIGNANTS
# ============================================================
 
class EnseignantListCreateView(APIView):
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSecretariatOrDirigeant()]
        return [IsAuthenticated()]  # ✅ Étudiant peut voir les enseignants
 
    def get(self, request):
        qs = Enseignant.objects.select_related('user').all()
 
        langue = request.query_params.get('langue')
        statut = request.query_params.get('statut')
        search = request.query_params.get('search')
 
        if langue:
            qs = qs.filter(langue_enseignee=langue)
        if statut:
            qs = qs.filter(statut_emploi=statut)
        if search:
            qs = qs.filter(
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search)
            )
 
        return Response(EnseignantSerializer(qs, many=True).data)
 
    def post(self, request):
        serializer = EnseignantCreateSerializer(data=request.data)
        if serializer.is_valid():
            enseignant = serializer.save()
            log_audit(request, 'CREATE', 'Enseignant', enseignant.pk,
                      nouvelle_valeur={'email': enseignant.user.email})
            return Response(
                EnseignantSerializer(enseignant).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
class EnseignantDetailView(APIView):
    """GET/PUT/DELETE /api/enseignants/<pk>/"""
    permission_classes = [IsStaff]
 
    def get_object(self, pk):
        try:
            return Enseignant.objects.select_related('user').get(pk=pk)
        except Enseignant.DoesNotExist:
            return None
 
    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Enseignant introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(EnseignantSerializer(obj).data)
 
    def put(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Enseignant introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = EnseignantSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'Enseignant', pk)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
    def delete(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Enseignant introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        obj.statut_emploi = 'Inactif'
        obj.save()
        obj.user.statut = 'Inactif'
        obj.user.save()
        log_audit(request, 'DELETE', 'Enseignant', pk)
        return Response({'message': 'Enseignant archivé.'})
 
 
# ============================================================
# PARENTS
# ============================================================
 
class ParentListCreateView(APIView):
    """GET/POST /api/parents/"""
 
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSecretariatOrDirigeant()]
        return [IsStaff()]
 
    def get(self, request):
        qs = Parent.objects.select_related('user').all()
        search = request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search) |
                Q(user__email__icontains=search)
            )
        return Response(ParentSerializer(qs, many=True).data)
 
    def post(self, request):
        serializer = ParentCreateSerializer(data=request.data)
        if serializer.is_valid():
            parent = serializer.save()
            log_audit(request, 'CREATE', 'Parent', parent.pk)
            return Response(ParentSerializer(parent).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
class ParentDetailView(APIView):
    """GET/PUT/DELETE /api/parents/<pk>/"""
    permission_classes = [IsStaff]
 
    def get_object(self, pk):
        try:
            return Parent.objects.select_related('user').get(pk=pk)
        except Parent.DoesNotExist:
            return None
 
    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Parent introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ParentSerializer(obj).data)
 
    def put(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Parent introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ParentSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'Parent', pk)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
    def delete(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Parent introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        obj.user.statut = 'Inactif'
        obj.user.save()
        log_audit(request, 'DELETE', 'Parent', pk)
        return Response({'message': 'Parent archivé.'})
 
 
# ============================================================
# GROUPES
# ============================================================
 
class GroupeListCreateView(APIView):
    """GET/POST /api/groupes/"""
 
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSecretariatOrDirigeant()]
        return [IsAuthenticated()]
 
    def get(self, request):
        qs = Groupe.objects.select_related('enseignant__user').all()
 
        langue = request.query_params.get('langue')
        niveau = request.query_params.get('niveau')
        statut = request.query_params.get('statut')
 
        if langue:
            qs = qs.filter(langue=langue)
        if niveau:
            qs = qs.filter(niveau=niveau)
        if statut:
            qs = qs.filter(statut_groupe=statut)
 
        if request.user.role == 'Enseignant':
            try:
                qs = qs.filter(enseignant=request.user.enseignant_profile)
            except Exception:
                return Response([])
 
        if request.user.role == 'Etudiant':
            try:
                qs = qs.filter(pk=request.user.etudiant_profile.groupe.pk)
            except Exception:
                return Response([])
 
        return Response(GroupeSerializer(qs, many=True).data)
 
    def post(self, request):
        serializer = GroupeSerializer(data=request.data)
        if serializer.is_valid():
            groupe = serializer.save()
            log_audit(request, 'CREATE', 'Groupe', groupe.pk,
                      nouvelle_valeur={'nom': groupe.nom_groupe})
            return Response(GroupeSerializer(groupe).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
class GroupeDetailView(APIView):
    """GET/PUT/DELETE /api/groupes/<pk>/"""
    permission_classes = [IsAuthenticated]
 
    def get_object(self, pk):
        try:
            return Groupe.objects.select_related('enseignant__user').get(pk=pk)
        except Groupe.DoesNotExist:
            return None
 
    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Groupe introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(GroupeSerializer(obj).data)
 
    def put(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Groupe introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = GroupeSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'Groupe', pk)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
    def delete(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=status.HTTP_403_FORBIDDEN)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Groupe introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        obj.statut_groupe = 'Annule'
        obj.save()
        log_audit(request, 'DELETE', 'Groupe', pk)
        return Response({'message': 'Groupe annulé.'})
 
 
# ============================================================
# INSCRIPTIONS
# ============================================================
 
class InscriptionListCreateView(APIView):
    """GET/POST /api/inscriptions/"""
    permission_classes = [IsSecretariatOrDirigeant]
 
    def get(self, request):
        qs = Inscription.objects.select_related('etudiant__user', 'groupe').all()
        groupe_id = request.query_params.get('groupe')
        if groupe_id:
            qs = qs.filter(groupe_id=groupe_id)
        return Response(InscriptionSerializer(qs, many=True).data)
 
    def post(self, request):
        serializer = InscriptionSerializer(data=request.data)
        if serializer.is_valid():
            inscription = serializer.save()
            log_audit(request, 'CREATE', 'Inscription', inscription.pk)
            return Response(InscriptionSerializer(inscription).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
class InscriptionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/DELETE /api/inscriptions/<pk>/"""
    queryset = Inscription.objects.select_related('etudiant__user', 'groupe').all()
    serializer_class = InscriptionSerializer
    permission_classes = [IsSecretariatOrDirigeant]
 
 
# ============================================================
# PLANNING
# ============================================================
 
class PlanningListCreateView(APIView):
    """GET/POST /api/planning/"""
 
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSecretariatOrDirigeant()]
        return [IsAuthenticated()]
 
    def get(self, request):
        qs = Planning.objects.select_related('groupe', 'enseignant__user').all()
 
        groupe_id = request.query_params.get('groupe')
        jour = request.query_params.get('jour')
        enseignant = request.query_params.get('enseignant')
 
        if groupe_id:
            qs = qs.filter(groupe_id=groupe_id)
        if jour:
            qs = qs.filter(jour=jour)
        if enseignant:
            qs = qs.filter(enseignant_id=enseignant)
 
        if request.user.role == 'Enseignant':
            try:
                qs = qs.filter(enseignant=request.user.enseignant_profile)
            except Exception:
                return Response([])
 
        if request.user.role == 'Etudiant':
            try:
                qs = qs.filter(groupe=request.user.etudiant_profile.groupe)
            except Exception:
                return Response([])
 
        if request.user.role == 'Parent':
            try:
                parent = request.user.parent_profile
                groupes = Etudiant.objects.filter(parent=parent).values_list('groupe_id', flat=True)
                qs = qs.filter(groupe_id__in=groupes)
            except Exception:
                return Response([])
 
        return Response(PlanningSerializer(qs, many=True).data)
 
    def post(self, request):
        serializer = PlanningSerializer(data=request.data)
        if serializer.is_valid():
            planning = serializer.save()
            log_audit(request, 'CREATE', 'Planning', planning.pk)
            return Response(PlanningSerializer(planning).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
class PlanningDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/DELETE /api/planning/<pk>/"""
    queryset = Planning.objects.select_related('groupe', 'enseignant__user').all()
    serializer_class = PlanningSerializer
    permission_classes = [IsAuthenticated]
 
 
# ============================================================
# SÉANCES
# ============================================================
 
class SeanceListCreateView(APIView):
    """GET/POST /api/seances/"""
 
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSecretariatOrDirigeant()]
        return [IsAuthenticated()]
 
    def get(self, request):
        qs = Seance.objects.select_related('groupe').all()
        groupe_id = request.query_params.get('groupe')
        date = request.query_params.get('date')
        if groupe_id:
            qs = qs.filter(groupe_id=groupe_id)
        if date:
            qs = qs.filter(date_seance=date)
        return Response(SeanceSerializer(qs, many=True).data)
 
    def post(self, request):
        serializer = SeanceSerializer(data=request.data)
        if serializer.is_valid():
            seance = serializer.save()
            log_audit(request, 'CREATE', 'Seance', seance.pk)
            return Response(SeanceSerializer(seance).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
class SeanceDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/DELETE /api/seances/<pk>/"""
    queryset = Seance.objects.select_related('groupe').all()
    serializer_class = SeanceSerializer
    permission_classes = [IsAuthenticated]
 
 
# ============================================================
# ÉVALUATIONS
# ============================================================
 
class EvaluationListCreateView(APIView):
    """GET/POST /api/evaluations/"""
 
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsEnseignantOrDirigeant()]  # Only teachers can create
        return [IsAuthenticated()]  # Everyone can view
 
    def get(self, request):
        qs = Evaluation.objects.select_related('groupe').all()
        groupe_id = request.query_params.get('groupe')
        type_eval = request.query_params.get('type')
 
        if groupe_id:
            qs = qs.filter(groupe_id=groupe_id)
        if type_eval:
            qs = qs.filter(type=type_eval)
 
        # Filter by user role
        if request.user.role == 'Enseignant':
            try:
                qs = qs.filter(groupe__enseignant=request.user.enseignant_profile)
            except Exception:
                return Response([])
 
        elif request.user.role == 'Etudiant':
            try:
                qs = qs.filter(groupe=request.user.etudiant_profile.groupe)
            except Exception:
                return Response([])
 
        elif request.user.role == 'Parent':
            try:
                parent = request.user.parent_profile
                groupes = Etudiant.objects.filter(parent=parent).values_list('groupe_id', flat=True)
                qs = qs.filter(groupe_id__in=groupes)
            except Exception:
                return Response([])
 
        return Response(EvaluationSerializer(qs, many=True).data)
 
    def post(self, request):
        serializer = EvaluationSerializer(data=request.data)
        if serializer.is_valid():
            evaluation = serializer.save()
            log_audit(request, 'CREATE', 'Evaluation', evaluation.pk)
            return Response(EvaluationSerializer(evaluation).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
class EvaluationDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/DELETE /api/evaluations/<pk>/"""
    queryset = Evaluation.objects.select_related('groupe').all()
    serializer_class = EvaluationSerializer
    permission_classes = [IsEnseignantOrDirigeant]
 
 
# ============================================================
# NOTES
# ============================================================
 
class NoteListCreateView(APIView):
    """GET/POST /api/notes/"""
 
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsEnseignantOrDirigeant()]  # Only teachers can create grades
        return [IsAuthenticated()]  # Everyone can view their own grades
 
    def get(self, request):
        qs = Note.objects.select_related('etudiant__user', 'evaluation').all()
 
        etudiant_id = request.query_params.get('etudiant')
        evaluation_id = request.query_params.get('evaluation')
 
        if etudiant_id:
            qs = qs.filter(etudiant_id=etudiant_id)
        if evaluation_id:
            qs = qs.filter(evaluation_id=evaluation_id)
 
        # Role-based filtering
        if request.user.role == 'Etudiant':
            try:
                qs = qs.filter(etudiant=request.user.etudiant_profile)
            except Exception:
                return Response([])
 
        elif request.user.role == 'Parent':
            try:
                parent = request.user.parent_profile
                etudiants = parent.enfants.all()
                qs = qs.filter(etudiant__in=etudiants)
            except Exception:
                return Response([])
 
        elif request.user.role == 'Enseignant':
            try:
                qs = qs.filter(
                    evaluation__groupe__enseignant=request.user.enseignant_profile
                )
            except Exception:
                return Response([])
 
        return Response(NoteSerializer(qs, many=True).data)
 
    def post(self, request):
        serializer = NoteCreateSerializer(data=request.data)
        if serializer.is_valid():
            note = serializer.save()
            log_audit(request, 'CREATE', 'Note', note.pk)
            return Response(NoteSerializer(note).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
class NoteDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/DELETE /api/notes/<pk>/"""
    queryset = Note.objects.select_related('etudiant__user', 'evaluation').all()
    serializer_class = NoteSerializer
    permission_classes = [IsEnseignantOrDirigeant]
 
 
# ============================================================
# ABSENCES
# ============================================================
 
class AbsenceListCreateView(APIView):
    """GET/POST /api/absences/"""
 
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsEnseignantOrDirigeant()]
        return [IsAuthenticated()]
 
    def get(self, request):
        qs = Absence.objects.select_related('etudiant__user', 'seance').all()
 
        etudiant_id = request.query_params.get('etudiant')
        seance_id = request.query_params.get('seance')
        statut = request.query_params.get('statut')
 
        if etudiant_id:
            qs = qs.filter(etudiant_id=etudiant_id)
        if seance_id:
            qs = qs.filter(seance_id=seance_id)
        if statut:
            qs = qs.filter(statut_absence=statut)
 
        if request.user.role == 'Etudiant':
            try:
                qs = qs.filter(etudiant=request.user.etudiant_profile)
            except Exception:
                return Response([])
 
        if request.user.role == 'Parent':
            try:
                etudiants = request.user.parent_profile.enfants.all()
                qs = qs.filter(etudiant__in=etudiants)
            except Exception:
                return Response([])
 
        if request.user.role == 'Enseignant':
            try:
                qs = qs.filter(
                    seance__groupe__enseignant=request.user.enseignant_profile
                )
            except Exception:
                return Response([])
 
        return Response(AbsenceSerializer(qs, many=True).data)
 
    def post(self, request):
        serializer = AbsenceSerializer(data=request.data)
        if serializer.is_valid():
            absence = serializer.save()
            log_audit(request, 'CREATE', 'Absence', absence.pk)
            nb_absences = Absence.objects.filter(
                etudiant=absence.etudiant,
                statut_absence='Absent'
            ).count()
            limite = ParametreSysteme.objects.filter(nom_parametre='LIMITE_ABSENCES').first()
            seuil = int(limite.valeur) if limite else 3
            if nb_absences > seuil:
                Notification.objects.create(
                    utilisateur=absence.etudiant.user,
                    type_notification='Absence',
                    titre='Alerte absences',
                    contenu=f"Vous avez dépassé {seuil} absences.",
                    canal='App',
                    urgent=True,
                )
            return Response(AbsenceSerializer(absence).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
class AbsenceDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/DELETE /api/absences/<pk>/"""
    queryset = Absence.objects.select_related('etudiant__user', 'seance').all()
    serializer_class = AbsenceSerializer
    permission_classes = [IsEnseignantOrDirigeant]
 
 
# ============================================================
# PAIEMENTS
# ============================================================
 
class PaiementListCreateView(APIView):
    """GET/POST /api/paiements/"""
    permission_classes = [IsComptable]
 
    def get(self, request):
        qs = Paiement.objects.select_related('etudiant__user').all()
 
        etudiant_id = request.query_params.get('etudiant')
        statut = request.query_params.get('statut')
        periode = request.query_params.get('periode')
 
        if etudiant_id:
            qs = qs.filter(etudiant_id=etudiant_id)
        if statut:
            qs = qs.filter(statut_paiement=statut)
        if periode:
            qs = qs.filter(periode=periode)
 
        return Response(PaiementSerializer(qs, many=True).data)
 
    def post(self, request):
        serializer = PaiementSerializer(data=request.data)
        if serializer.is_valid():
            paiement = serializer.save()
            log_audit(request, 'CREATE', 'Paiement', paiement.pk,
                      nouvelle_valeur={'montant': str(paiement.montant_paye)})
            return Response(PaiementSerializer(paiement).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
class PaiementDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/DELETE /api/paiements/<pk>/"""
    queryset = Paiement.objects.select_related('etudiant__user').all()
    serializer_class = PaiementSerializer
    permission_classes = [IsComptable]
 
 
# ============================================================
# BULLETINS DE SALAIRE
# ============================================================
 
class BulletinListCreateView(APIView):
    """GET/POST /api/bulletins/"""
    permission_classes = [IsComptable]
 
    def get(self, request):
        qs = BulletinSalaire.objects.select_related('enseignant__user').all()
        enseignant_id = request.query_params.get('enseignant')
        periode = request.query_params.get('periode')
        if enseignant_id:
            qs = qs.filter(enseignant_id=enseignant_id)
        if periode:
            qs = qs.filter(periode=periode)
        return Response(BulletinSalaireSerializer(qs, many=True).data)
 
    def post(self, request):
        serializer = BulletinSalaireSerializer(data=request.data)
        if serializer.is_valid():
            bulletin = serializer.save()
            log_audit(request, 'CREATE', 'BulletinSalaire', bulletin.pk)
            return Response(BulletinSalaireSerializer(bulletin).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
class BulletinDetailView(generics.RetrieveUpdateDestroyAPIView):
    """GET/PUT/DELETE /api/bulletins/<pk>/"""
    queryset = BulletinSalaire.objects.select_related('enseignant__user').all()
    serializer_class = BulletinSalaireSerializer
    permission_classes = [IsComptable]
 
 
# ============================================================
# RESSOURCES
# ============================================================
@method_decorator(csrf_exempt, name='dispatch')
class RessourceListCreateView(APIView):
    # MultiPartParser required for file uploads
    parser_classes = [MultiPartParser, FormParser]
 
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsEnseignantOrDirigeant()]
        return [IsAuthenticated()]
 
    def get(self, request):
        qs = Ressource.objects.select_related('enseignant__user', 'groupe').all()
 
        if request.user.role == 'Etudiant':
            try:
                etudiant = request.user.etudiant_profile
                qs = qs.filter(visible_etudiants=True)
                if etudiant.groupe:
                    qs = qs.filter(
                        Q(groupe=etudiant.groupe) | Q(groupe__isnull=True)
                    )
            except Exception:
                qs = qs.filter(visible_etudiants=True)
 
        niveau   = request.query_params.get('niveau')
        type_res = request.query_params.get('type')
        groupe   = request.query_params.get('groupe')
 
        if niveau:   qs = qs.filter(niveau=niveau)
        if type_res: qs = qs.filter(type_ressource=type_res)
        if groupe:   qs = qs.filter(groupe_id=groupe)
 
        return Response(RessourceSerializer(qs, many=True).data)
 
    def post(self, request):
        """
        File upload via multipart/form-data.
        RessourceCreateSerializer auto-sets enseignant from request.user.
        """
        try:
            serializer = RessourceCreateSerializer(
                data=request.data,
                context={'request': request}
            )
            if serializer.is_valid():
                ressource = serializer.save()
                log_audit(request, 'CREATE', 'Ressource', ressource.pk,
                          nouvelle_valeur={'titre': ressource.titre})
                return Response(
                    RessourceSerializer(ressource).data,
                    status=status.HTTP_201_CREATED
                )
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': str(e), 'type': type(e).__name__},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
 
class RessourceDetailView(APIView):
    """GET/PUT/PATCH/DELETE /api/ressources/<pk>/"""
    permission_classes = [IsAuthenticated]
 
    def get_object(self, pk, request):
        try:
            ressource = Ressource.objects.select_related('enseignant__user', 'groupe').get(pk=pk)
        except Ressource.DoesNotExist:
            return None
 
        # Check permissions
        if request.user.role == 'Etudiant':
            if not ressource.visible_etudiants:
                return None
            if ressource.groupe != request.user.etudiant_profile.groupe:
                return None
        elif request.user.role == 'Enseignant':
            if ressource.enseignant != request.user.enseignant_profile:
                return None
 
        return ressource
 
    def get(self, request, pk):
        obj = self.get_object(pk, request)
        if not obj:
            return Response({'error': 'Ressource introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(RessourceSerializer(obj).data)
 
    def patch(self, request, pk):
        """Handle partial updates"""
        if request.user.role not in ['Enseignant', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=status.HTTP_403_FORBIDDEN)
 
        obj = self.get_object(pk, request)
        if not obj:
            return Response({'error': 'Ressource introuvable.'}, status=status.HTTP_404_NOT_FOUND)
 
        # Only owner or dirigeant can edit
        if request.user.role == 'Enseignant' and obj.enseignant != request.user.enseignant_profile:
            return Response({'error': 'Permission refusée.'}, status=status.HTTP_403_FORBIDDEN)
 
        serializer = RessourceSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'Ressource', pk)
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
    def delete(self, request, pk):
        if request.user.role not in ['Enseignant', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=status.HTTP_403_FORBIDDEN)
 
        obj = self.get_object(pk, request)
        if not obj:
            return Response({'error': 'Ressource introuvable.'}, status=status.HTTP_404_NOT_FOUND)
 
        # Only owner or dirigeant can delete
        if request.user.role == 'Enseignant' and obj.enseignant != request.user.enseignant_profile:
            return Response({'error': 'Permission refusée.'}, status=status.HTTP_403_FORBIDDEN)
 
        obj.delete()
        log_audit(request, 'DELETE', 'Ressource', pk)
        return Response({'message': 'Ressource supprimée.'}, status=status.HTTP_200_OK)
 
# ============================================================
# MESSAGERIE
# ============================================================
 
class MessageListCreateView(APIView):
    """GET/POST /api/messages/"""
    permission_classes = [IsAuthenticated]
 
    def get(self, request):
        qs = Message.objects.filter(
            Q(expediteur=request.user) | Q(destinataire=request.user)
        ).select_related('expediteur', 'destinataire').order_by('-date_envoi')
 
        return Response(MessageSerializer(qs, many=True).data)
 
    def post(self, request):
        serializer = MessageCreateSerializer(data=request.data)
        if serializer.is_valid():
            message = serializer.save(expediteur=request.user)
            log_audit(request, 'CREATE', 'Message', message.pk)
            Notification.objects.create(
                utilisateur=message.destinataire,
                type_notification='Message',
                titre='Nouveau message',
                contenu=f"Message de {request.user.get_full_name()}: {message.sujet or ''}",
                canal='App',
            )
            return Response(MessageSerializer(message).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
class MessageDetailView(APIView):
    """GET/DELETE /api/messages/<pk>/"""
    permission_classes = [IsAuthenticated]
 
    def get_object(self, pk, user):
        try:
            return Message.objects.get(
                Q(pk=pk) & (Q(expediteur=user) | Q(destinataire=user))
            )
        except Message.DoesNotExist:
            return None
 
    def get(self, request, pk):
        msg = self.get_object(pk, request.user)
        if not msg:
            return Response({'error': 'Message introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        if msg.destinataire == request.user and not msg.lu:
            msg.lu = True
            msg.date_lecture = timezone.now()
            msg.statut_message = 'Lu'
            msg.save()
        return Response(MessageSerializer(msg).data)
 
    def delete(self, request, pk):
        msg = self.get_object(pk, request.user)
        if not msg:
            return Response({'error': 'Message introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        msg.statut_message = 'Archive'
        msg.save()
        return Response({'message': 'Message archivé.'})
 
 
# ============================================================
# NOTIFICATIONS
# ============================================================
 
class NotificationListView(APIView):
    """GET /api/notifications/"""
    permission_classes = [IsAuthenticated]
 
    def get(self, request):
        qs = Notification.objects.filter(utilisateur=request.user).order_by('-date_creation')
        statut = request.query_params.get('statut')
        if statut:
            qs = qs.filter(statut_notification=statut)
        return Response(NotificationSerializer(qs, many=True).data)
 
 
class MarquerNotificationLueView(APIView):
    """POST /api/notifications/<pk>/mark-read/"""
    permission_classes = [IsAuthenticated]
 
    def post(self, request, pk):
        try:
            notif = Notification.objects.get(pk=pk, utilisateur=request.user)
            notif.statut_notification = 'Lu'
            notif.date_lecture = timezone.now()
            notif.save()
            return Response({'message': 'Notification marquée comme lue.'})
        except Notification.DoesNotExist:
            return Response({'error': 'Notification introuvable.'}, status=status.HTTP_404_NOT_FOUND)
 
 
# ============================================================
# PARAMÈTRES SYSTÈME
# ============================================================
 
class ParametreListView(generics.ListAPIView):
    """GET /api/parametres/"""
    queryset = ParametreSysteme.objects.filter(modifiable=True).all()
    serializer_class = ParametreSystemeSerializer
    permission_classes = [IsDirigeant]
 
 
class ParametreDetailView(APIView):
    """GET/PUT /api/parametres/<pk>/"""
    permission_classes = [IsDirigeant]
 
    def get_object(self, pk):
        try:
            return ParametreSysteme.objects.get(pk=pk)
        except ParametreSysteme.DoesNotExist:
            return None
 
    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Paramètre introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ParametreSystemeSerializer(obj).data)
 
    def put(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Paramètre introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        if not obj.modifiable:
            return Response({'error': 'Ce paramètre n\'est pas modifiable.'}, status=status.HTTP_400_BAD_REQUEST)
        ancienne = obj.valeur
        serializer = ParametreSystemeSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'ParametreSysteme', pk,
                      ancienne_valeur={'valeur': ancienne},
                      nouvelle_valeur={'valeur': obj.valeur})
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
 
 
# ============================================================
# AUDIT
# ============================================================
 
class AuditListView(generics.ListAPIView):
    """GET /api/audit/"""
    queryset = Audit.objects.select_related('utilisateur').order_by('-date_action').all()
    serializer_class = AuditSerializer
    permission_classes = [IsDirigeant]
 
    def get_queryset(self):
        qs = super().get_queryset()
        action = self.request.query_params.get('action')
        entite = self.request.query_params.get('entite')
        user_id = self.request.query_params.get('utilisateur')
        if action:
            qs = qs.filter(action=action)
        if entite:
            qs = qs.filter(entite=entite)
        if user_id:
            qs = qs.filter(utilisateur_id=user_id)
        return qs
 
 
# ============================================================
# DASHBOARD — KPIs Dirigeant
# ============================================================
 
class DashboardView(APIView):
    """GET /api/dashboard/"""
    permission_classes = [IsDirigeant]
 
    def get(self, request):
        nb_etudiants = Etudiant.objects.filter(statut_etudiant='Actif').count()
        nb_enseignants = Enseignant.objects.filter(statut_emploi='Actif').count()
        nb_groupes = Groupe.objects.filter(statut_groupe='Actif').count()
        nb_parents = Etudiant.objects.filter(parent__isnull=False).values('parent').distinct().count()
 
        paiements = Paiement.objects.all()
        revenus = paiements.aggregate(total=Sum('montant_paye'))['total'] or 0
        impayés = paiements.filter(statut_paiement='Impaye').aggregate(
            total=Sum('montant_du'))['total'] or 0
        salaires = BulletinSalaire.objects.aggregate(
            total=Sum('salaire_net'))['total'] or 0
 
        total_du = paiements.aggregate(total=Sum('montant_du'))['total'] or 1
        taux_paiement = round(float(revenus) / float(total_du) * 100, 2)
 
        moyenne_globale = Note.objects.aggregate(moy=Avg('note_obtenue'))['moy']
        moyenne_globale = round(float(moyenne_globale), 2) if moyenne_globale else 0
 
        nb_absences = Absence.objects.filter(statut_absence='Absent').count()
 
        niveaux = Etudiant.objects.values('niveau_actuel').annotate(
            total=Count('id')
        ).order_by('niveau_actuel')
 
        return Response({
            'etudiants': nb_etudiants,
            'enseignants': nb_enseignants,
            'groupes': nb_groupes,
            'parents': nb_parents,
            'finances': {
                'revenus_collectes': float(revenus),
                'impayés': float(impayés),
                'salaires_verses': float(salaires),
                'solde': float(revenus) - float(salaires),
                'taux_paiement': taux_paiement,
            },
            'pedagogie': {
                'moyenne_globale': moyenne_globale,
                'nb_absences': nb_absences,
            },
            'repartition_niveaux': list(niveaux),
        })