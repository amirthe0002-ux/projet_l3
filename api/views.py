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
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.contrib.auth import authenticate, login, logout
from django.contrib import messages
from functools import wraps
from rest_framework.parsers import MultiPartParser, FormParser
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q

from .notify import send_notification, send_notification_to_groupe, send_notification_to_role

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


# ============================================================
# DECORATOR — PROTECTION PAR RÔLE
# ============================================================

def role_required(*roles):
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
    logout(request)
    return redirect('login')


def redirect_by_role(role):
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
    return render(request, 'acces_refuse.html', status=403)


# ============================================================
# HELPER — AUDIT
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
# TEMPLATE VIEWS — SECRÉTARIAT
# ============================================================

def dashboard_secretariat(request):
    return render(request, 'dashboard_secretariat.html', {
        'user': request.user, 'role': request.user.role, 'page': 'dashboard',
    })

def etudiants_view(request):
    return render(request, 'Gestion_Etudiants.html', {'user': request.user, 'page': 'etudiants'})

@role_required('Secretariat', 'Dirigeant')
def etudiant_detail_view(request, pk):
    return render(request, 'secretariat/etudiant_detail.html', {
        'user': request.user, 'page': 'etudiants', 'etudiant_id': pk,
    })

def enseignants_view(request):
    return render(request, 'Gestion_Enseignants.html', {'user': request.user, 'page': 'enseignants'})

@role_required('Secretariat', 'Dirigeant')
def enseignant_detail_view(request, pk):
    return render(request, 'secretariat/enseignant_detail.html', {
        'user': request.user, 'page': 'enseignants', 'enseignant_id': pk,
    })

def groupes_view(request):
    return render(request, 'Gestion_Groupes.html', {'user': request.user, 'page': 'groupes'})

@role_required('Secretariat', 'Dirigeant')
def groupe_detail_view(request, pk):
    return render(request, 'secretariat/groupe_detail.html', {
        'user': request.user, 'page': 'groupes', 'groupe_id': pk,
    })

def planning_view(request):
    return render(request, 'GESTION_PLANING.html', {'user': request.user, 'page': 'planning'})

@role_required('Secretariat', 'Dirigeant')
def parents_view(request):
    return render(request, 'secretariat/parents.html', {'user': request.user, 'page': 'parents'})

@role_required('Secretariat', 'Dirigeant')
def inscriptions_view(request):
    return render(request, 'secretariat/inscriptions.html', {'user': request.user, 'page': 'inscriptions'})


# ============================================================
# TEMPLATE VIEWS — COMPTABLE
# ============================================================

@role_required('Comptable', 'Secretariat', 'Dirigeant')
def dashboard_comptable(request):
    return render(request, 'dashboard_comptable.html', {'user': request.user, 'page': 'dashboard'})

def paiements_view(request):
    return render(request, 'Gestion_Paiements.html', {'user': request.user, 'page': 'paiements'})

def salaires_view(request):
    return render(request, 'Gestion_Salaires.html', {'user': request.user, 'page': 'paiements'})

def paiement_detail_view(request, pk):
    return render(request, 'comptable/paiement_detail.html', {
        'user': request.user, 'page': 'paiements', 'paiement_id': pk,
    })

def bulletins_view(request):
    return render(request, 'Factures.html', {'user': request.user, 'page': 'bulletins'})

def bulletin_detail_view(request, pk):
    return render(request, 'Factures.html', {
        'user': request.user, 'page': 'bulletins', 'bulletin_id': pk,
    })

@role_required('Comptable', 'Secretariat', 'Dirigeant')
def situation_financiere_view(request):
    return render(request, 'comptable/situation_financiere.html', {
        'user': request.user, 'page': 'finances',
    })

def salaires_view(request):
    return render(request, 'Gestion_Salaires.html', {'user': request.user, 'page': 'paiements'})


# ============================================================
# TEMPLATE VIEWS — DIRIGEANT
# ============================================================

@role_required('Dirigeant')
def dashboard_dirigeant(request):
    return render(request, 'dashboard_dirigeant.html', {'user': request.user, 'page': 'dashboard'})

@role_required('Dirigeant')
def parametres_view(request):
    return render(request, 'dirigeant/parametres.html', {'user': request.user, 'page': 'parametres'})

@role_required('Dirigeant')
def audit_view(request):
    return render(request, 'dirigeant/audit.html', {'user': request.user, 'page': 'audit'})

@role_required('Dirigeant')
def utilisateurs_view(request):
    return render(request, 'dirigeant/utilisateurs.html', {'user': request.user, 'page': 'utilisateurs'})

@role_required('Dirigeant')
def rapports_view(request):
    return render(request, 'dirigeant/rapports.html', {'user': request.user, 'page': 'rapports'})


# ============================================================
# TEMPLATE VIEWS — ENSEIGNANT
# ============================================================


def dashboard_enseignant(request):
    return render(request, 'dashboard_enseignant.html', {'user': request.user, 'page': 'dashboard'})

def mes_groupes_view(request):
    return render(request, 'mes_groupes.html', {'user': request.user, 'page': 'groupes'})

def notes_view(request):
    return render(request, 'gestion_des_notes.html', {'user': request.user, 'page': 'notes'})

def absences_view(request):
    return render(request, 'absences.html', {'user': request.user, 'page': 'absences'})

def ressources_view(request):
    return render(request, 'ressources.html', {'user': request.user, 'page': 'ressources'})

def messagerie_enseignant_view(request):
    return render(request, 'messagerie_ens.html', {'user': request.user, 'page': 'messagerie'})

@role_required('Enseignant', 'Dirigeant')
def evaluations_view(request):
    return render(request, 'enseignant/evaluations.html', {'user': request.user, 'page': 'evaluations'})


# ============================================================
# TEMPLATE VIEWS — ÉTUDIANT
# ============================================================


def dashboard_etudiant(request):
    return render(request, 'dashboard_etudiant.html', {'user': request.user, 'page': 'dashboard'})


def mes_notes_view(request):
    return render(request, 'mes_notes.html', {'user': request.user, 'page': 'notes'})


def mon_planning_view(request):
    return render(request, 'mon_planing.html', {'user': request.user, 'page': 'planning'})

def mon_niveau_view(request):
    return render(request, 'mon_niveau.html', {'user': request.user, 'page': 'niveau'})


def mes_ressources_view(request):
    return render(request, 'mes_ressources.html', {'user': request.user, 'page': 'ressources'})

def messagerie_etudiant_view(request):
    return render(request, 'msg_etd.html', {'user': request.user, 'page': 'messagerie'})


# ============================================================
# TEMPLATE VIEWS — PARENT
# ============================================================

def dashboard_parent(request):
    return render(request, 'dashboard_parent.html', {'user': request.user, 'page': 'dashboard'})

def suivi_enfant_view(request):
    return render(request, 'parent/suivi_enfant.html', {'user': request.user, 'page': 'suivi'})

def messagerie_parent_view(request):
    return render(request, 'parent/messagerie.html', {'user': request.user, 'page': 'messagerie'})

def notifications_parent_view(request):
    return render(request, 'parent/notifications.html', {'user': request.user, 'page': 'notifications'})


def mes_ressources_vieww(request):
    return render(request, 'parent/ressources.html', {'user': request.user, 'page': 'ressources'})


# ============================================================
# TEMPLATE VIEWS — COMMUN
# ============================================================


def profil_view(request):
    return render(request, 'profile_etd.html', {'user': request.user, 'page': 'profil'})

@login_required(login_url='login')
def notifications_view(request):
    return render(request, 'commun/notifications.html', {'user': request.user, 'page': 'notifications'})

@login_required(login_url='login')
def messagerie_view(request):
    return render(request, 'commun/messagerie.html', {'user': request.user, 'page': 'messagerie'})


# ============================================================
# DJANGO TEMPLATE VIEWS (Non-API legacy)
# ============================================================

def login_page(request):
    return render(request, 'login.html')


def dashboard_scr(request):
    return render(request, 'dashboard_secretariat.html')


def dashboard_ens(request):
    return render(request, 'dashboard_enseignant.html', {
        'user': request.user,
        'role': request.user.role if hasattr(request.user, 'role') else 'Unknown',
    })

@login_required(login_url='login_page')
def download_ressource(request, pk):
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

    ressource = get_object_or_404(Ressource, pk=pk)

    if request.user.role == 'Etudiant':
        if not ressource.visible_etudiants:
            raise Http404("Non disponible")
        try:
            if ressource.groupe and request.user.etudiant_profile.groupe != ressource.groupe:
                raise Http404("Non autorisé")
        except:
            raise Http404("Erreur permissions")

    if not ressource.chemin_fichier:
        raise Http404("Fichier non trouvé")

    ressource.nombre_telechargements = (ressource.nombre_telechargements or 0) + 1
    ressource.save(update_fields=['nombre_telechargements'])
    log_audit(request, 'DOWNLOAD', 'Ressource', pk)

    return FileResponse(
        ressource.chemin_fichier.open('rb'),
        as_attachment=True,
        filename=ressource.chemin_fichier.name.split('/')[-1]
    )

@login_required(login_url='login_page')
def messagerie(request):
    try:
        enseignant = Enseignant.objects.get(user=request.user)
    except Enseignant.DoesNotExist:
        enseignant = None

    msgs = Message.objects.filter(
        Q(expediteur=request.user) | Q(destinataire=request.user)
    ).select_related('expediteur', 'destinataire').order_by('-date_envoi')[:50]

    return render(request, 'messagerie_ens.html', {
        'messages': msgs, 'user': request.user, 'enseignant': enseignant,
    })

@login_required(login_url='login_page')
def ressources(request):
    try:
        enseignant = Enseignant.objects.get(user=request.user)
        ress = Ressource.objects.filter(enseignant=enseignant).select_related('groupe')
    except Enseignant.DoesNotExist:
        ress = Ressource.objects.filter(visible_etudiants=True).select_related('groupe')

    refresh = RefreshToken.for_user(request.user)
    return render(request, 'ressources.html', {
        'ressources': ress, 'user': request.user,
        'total_ressources': ress.count(),
        'jwt_token': str(refresh.access_token),
    })

@login_required(login_url='login_page')
def groupes(request):
    try:
        enseignant = Enseignant.objects.get(user=request.user)
        grps = Groupe.objects.filter(
            enseignant=enseignant, statut_groupe='Actif'
        ).select_related('enseignant__user').prefetch_related(
            'etudiant_set__user', 'etudiant_set__parent'
        )
    except Enseignant.DoesNotExist:
        grps = Groupe.objects.none()

    groupes_data = []
    for groupe in grps:
        etudiants = Etudiant.objects.filter(groupe=groupe)
        notes     = Note.objects.filter(evaluation__groupe=groupe)
        moyenne   = notes.aggregate(Avg('note_obtenue'))['note_obtenue__avg'] or 0
        groupes_data.append({
            'groupe': groupe,
            'nb_etudiants': etudiants.count(),
            'moyenne_groupe': round(moyenne, 2),
            'taux_assiduité': 92,
            'progression': 75,
        })

    return render(request, 'groupe.html', {
        'groupes': groupes_data, 'user': request.user, 'total_groupes': len(groupes_data),
    })

@login_required(login_url='login_page')
def clock(request):
    return render(request, 'clock.html', {'user': request.user})


# ============================================================
# API — AUTH
# ============================================================

class LoginView(APIView):
    permission_classes = [AllowAny]
    def get(self, request):
        return render(request, 'login.html')
    def post(self, request):
        email    = request.data.get('email', '').strip()
        password = request.data.get('password', '')

        if not email or not password:
            return Response({'error': 'Email et mot de passe requis.'}, status=400)

        try:
            user = Utilisateur.objects.get(email=email)
        except Utilisateur.DoesNotExist:
            return Response({'error': 'Identifiants incorrects.'}, status=401)

        if user.compte_verrouille:
            if user.date_verrouillage:
                duree   = ParametreSysteme.objects.filter(nom_parametre='DUREE_VERROUILLAGE_MIN').first()
                minutes = int(duree.valeur) if duree else 30
                delta   = timezone.now() - user.date_verrouillage
                if delta.total_seconds() < minutes * 60:
                    restant = minutes - int(delta.total_seconds() // 60)
                    return Response({'error': f'Compte verrouillé. Réessayez dans {restant} minutes.'}, status=403)
                else:
                    user.compte_verrouille    = False
                    user.tentatives_echouees  = 0
                    user.date_verrouillage    = None
                    user.save()

        if user.statut != 'Actif':
            return Response({'error': 'Compte inactif ou suspendu.'}, status=403)

        if not user.check_password(password):
            max_t_obj = ParametreSysteme.objects.filter(nom_parametre='MAX_TENTATIVES_LOGIN').first()
            max_t     = int(max_t_obj.valeur) if max_t_obj else 5
            user.tentatives_echouees += 1
            if user.tentatives_echouees >= max_t:
                user.compte_verrouille = True
                user.date_verrouillage = timezone.now()
                user.save()
                log_audit(request, 'LOGIN', 'Utilisateur', user.pk,
                          resultat='Erreur', message_erreur='Compte verrouillé')
                return Response({'error': f'Compte verrouillé après {max_t} tentatives.'}, status=403)
            user.save()
            log_audit(request, 'LOGIN', 'Utilisateur', user.pk,
                      resultat='Erreur', message_erreur='Mot de passe incorrect')
            return Response({'error': f'Mot de passe incorrect. Tentative {user.tentatives_echouees}/{max_t}.'}, status=401)

        user.tentatives_echouees = 0
        user.derniere_connexion  = timezone.now()
        user.save()

        refresh = RefreshToken.for_user(user)
        log_audit(request, 'LOGIN', 'Utilisateur', user.pk)

        return Response({
            'access':  str(refresh.access_token),
            'refresh': str(refresh),
            'user':    UtilisateurSerializer(user).data,
        }, status=200)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            token = RefreshToken(request.data.get('refresh'))
            token.blacklist()
            log_audit(request, 'LOGOUT', 'Utilisateur', request.user.pk)
            return Response({'message': 'Déconnexion réussie.'})
        except Exception:
            return Response({'error': 'Token invalide.'}, status=400)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UtilisateurSerializer(request.user).data)

    def put(self, request):
        serializer = UtilisateurUpdateSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'Utilisateur', request.user.pk)
            return Response(serializer.data)
        return Response(serializer.errors, status=400)


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        user = request.user
        if not user.check_password(serializer.validated_data['ancien_password']):
            return Response({'error': 'Ancien mot de passe incorrect.'}, status=400)
        user.set_password(serializer.validated_data['nouveau_password'])
        user.save()
        log_audit(request, 'UPDATE', 'Utilisateur', user.pk,
                  nouvelle_valeur={'action': 'changement_mot_de_passe'})
        return Response({'message': 'Mot de passe modifié avec succès.'})


# ============================================================
# API — ÉTUDIANTS
# ============================================================

class EtudiantListCreateView(APIView):

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSecretariatOrDirigeant()]
        return [IsAuthenticated()]

    def get(self, request):
        qs = Etudiant.objects.select_related('user', 'groupe', 'parent__user').all()

        groupe_id = request.query_params.get('groupe')
        niveau    = request.query_params.get('niveau')
        statut    = request.query_params.get('statut')
        search    = request.query_params.get('search')

        if groupe_id: qs = qs.filter(groupe_id=groupe_id)
        if niveau:    qs = qs.filter(niveau_actuel=niveau)
        if statut:    qs = qs.filter(statut_etudiant=statut)
        if search:
            qs = qs.filter(
                Q(user__first_name__icontains=search) |
                Q(user__last_name__icontains=search)  |
                Q(user__email__icontains=search)
            )

        if request.user.role == 'Enseignant':
            try:
                qs = qs.filter(groupe__enseignant=request.user.enseignant_profile)
            except Exception:
                return Response([])

        if request.user.role == 'Parent':
            try:
                qs = qs.filter(parent=request.user.parent_profile)
            except Exception:
                return Response([])

        return Response(EtudiantSerializer(qs, many=True).data)

    def post(self, request):
        serializer = EtudiantCreateSerializer(data=request.data)
        if serializer.is_valid():
            etudiant = serializer.save()
            log_audit(request, 'CREATE', 'Etudiant', etudiant.pk,
                      nouvelle_valeur={'email': etudiant.user.email})

            response_data = EtudiantSerializer(etudiant).data

            parent_created = getattr(etudiant, '_parent_created', None)
            if parent_created:
                generated_pwd = getattr(parent_created, '_generated_password', None)
                response_data['parent_auto_cree'] = {
                    'id':       parent_created.id,
                    'nom':      parent_created.user.get_full_name(),
                    'email':    parent_created.user.email,
                    'telephone':parent_created.user.telephone,
                    'relation': parent_created.relation_enfant,
                    'message':  'Compte parent créé automatiquement (étudiant mineur).',
                    'mot_de_passe_genere': generated_pwd if generated_pwd else None,
                }

            # ── Notifications ──────────────────────────────────────────────
            try:
                send_notification_to_role(
                    role='Secretariat',
                    titre='Nouvel étudiant inscrit',
                    contenu=f"{etudiant.user.get_full_name()} vient de s'inscrire.",
                    notif_type='Info',
                    lien='/secretariat/etudiants/',
                )
                send_notification(
                    user=etudiant.user,
                    titre='Bienvenue chez EduLang !',
                    contenu='Votre inscription a été confirmée. Bonne formation !',
                    notif_type='Info',
                    lien='/dashboard/etudiant/',
                )
            except Exception:
                pass
            # ── Fin notifications ──────────────────────────────────────────

            return Response(response_data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class EtudiantDetailView(APIView):
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
                if etudiant.parent != request.user.parent_profile:
                    return None
            except Exception:
                return None
        return etudiant

    def get(self, request, pk):
        etudiant = self.get_object(pk, request)
        if not etudiant:
            return Response({'error': 'Étudiant introuvable.'}, status=404)
        return Response(EtudiantSerializer(etudiant).data)

    def put(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=403)
        etudiant = self.get_object(pk, request)
        if not etudiant:
            return Response({'error': 'Étudiant introuvable.'}, status=404)
        serializer = EtudiantSerializer(etudiant, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'Etudiant', pk)
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=403)
        etudiant = self.get_object(pk, request)
        if not etudiant:
            return Response({'error': 'Étudiant introuvable.'}, status=404)
        etudiant.statut_etudiant = 'Inactif'
        etudiant.save()
        etudiant.user.statut = 'Inactif'
        etudiant.user.save()
        log_audit(request, 'DELETE', 'Etudiant', pk)
        return Response({'message': 'Étudiant archivé.'})


class EtudiantMeView(APIView):
    """GET /api/etudiants/me/"""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'Etudiant':
            return Response({'error': 'Réservé aux étudiants.'}, status=403)
        try:
            etudiant = Etudiant.objects.select_related(
                'user', 'groupe', 'parent__user'
            ).get(user=request.user)
            return Response(EtudiantSerializer(etudiant).data)
        except Etudiant.DoesNotExist:
            return Response({'error': 'Profil étudiant introuvable.'}, status=404)


# ============================================================
# API — ENSEIGNANTS
# ============================================================

class EnseignantListCreateView(APIView):

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSecretariatOrDirigeant()]
        return [IsAuthenticated()]

    def get(self, request):
        qs     = Enseignant.objects.select_related('user').all()
        langue = request.query_params.get('langue')
        statut = request.query_params.get('statut')
        search = request.query_params.get('search')
        if langue: qs = qs.filter(langue_enseignee=langue)
        if statut: qs = qs.filter(statut_emploi=statut)
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

            # ── Notification ───────────────────────────────────────────────
            try:
                send_notification(
                    user=enseignant.user,
                    titre='Bienvenue dans l\'équipe !',
                    contenu='Votre compte enseignant a été créé. Bonne formation !',
                    notif_type='Info',
                    lien='/enseignant/',
                )
            except Exception:
                pass
            # ── Fin notification ───────────────────────────────────────────

            return Response(EnseignantSerializer(enseignant).data, status=201)
        return Response(serializer.errors, status=400)


class EnseignantDetailView(APIView):
    permission_classes = [IsStaff]

    def get_object(self, pk):
        try:
            return Enseignant.objects.select_related('user').get(pk=pk)
        except Enseignant.DoesNotExist:
            return None

    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Enseignant introuvable.'}, status=404)
        return Response(EnseignantSerializer(obj).data)

    def put(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=403)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Enseignant introuvable.'}, status=404)
        serializer = EnseignantSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'Enseignant', pk)
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def patch(self, request, pk):
        return self.put(request, pk)

    def delete(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=403)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Enseignant introuvable.'}, status=404)
        obj.statut_emploi  = 'Inactif'
        obj.save()
        obj.user.statut = 'Inactif'
        obj.user.save()
        log_audit(request, 'DELETE', 'Enseignant', pk)
        return Response({'message': 'Enseignant archivé.'})


# ============================================================
# API — PARENTS
# ============================================================

class ParentListCreateView(APIView):

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
                Q(user__last_name__icontains=search)  |
                Q(user__email__icontains=search)
            )
        return Response(ParentSerializer(qs, many=True).data)

    def post(self, request):
        serializer = ParentCreateSerializer(data=request.data)
        if serializer.is_valid():
            parent = serializer.save()
            log_audit(request, 'CREATE', 'Parent', parent.pk)
            return Response(ParentSerializer(parent).data, status=201)
        return Response(serializer.errors, status=400)


class ParentDetailView(APIView):
    permission_classes = [IsStaff]

    def get_object(self, pk):
        try:
            return Parent.objects.select_related('user').get(pk=pk)
        except Parent.DoesNotExist:
            return None

    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Parent introuvable.'}, status=404)
        return Response(ParentSerializer(obj).data)

    def put(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Parent introuvable.'}, status=404)
        serializer = ParentSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'Parent', pk)
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=403)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Parent introuvable.'}, status=404)
        obj.user.statut = 'Inactif'
        obj.user.save()
        log_audit(request, 'DELETE', 'Parent', pk)
        return Response({'message': 'Parent archivé.'})


# ============================================================
# API — GROUPES
# ============================================================

class GroupeListCreateView(APIView):

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSecretariatOrDirigeant()]
        return [IsAuthenticated()]

    def get(self, request):
        qs     = Groupe.objects.select_related('enseignant__user').all()
        langue = request.query_params.get('langue')
        niveau = request.query_params.get('niveau')
        statut = request.query_params.get('statut')
        if langue: qs = qs.filter(langue=langue)
        if niveau: qs = qs.filter(niveau=niveau)
        if statut: qs = qs.filter(statut_groupe=statut)

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
            return Response(GroupeSerializer(groupe).data, status=201)
        return Response(serializer.errors, status=400)


class GroupeDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return Groupe.objects.select_related('enseignant__user').get(pk=pk)
        except Groupe.DoesNotExist:
            return None

    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Groupe introuvable.'}, status=404)
        return Response(GroupeSerializer(obj).data)

    def put(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=403)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Groupe introuvable.'}, status=404)
        serializer = GroupeSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'Groupe', pk)
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        if request.user.role not in ['Secretariat', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=403)
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Groupe introuvable.'}, status=404)
        obj.statut_groupe = 'Annule'
        obj.save()
        log_audit(request, 'DELETE', 'Groupe', pk)
        return Response({'message': 'Groupe annulé.'})


# ============================================================
# API — INSCRIPTIONS
# ============================================================

class InscriptionListCreateView(APIView):
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

            # ── Notification ───────────────────────────────────────────────
            try:
                etudiant = inscription.etudiant
                groupe   = inscription.groupe
                send_notification(
                    user=etudiant.user,
                    titre='Inscription confirmée',
                    contenu=f'Vous êtes inscrit au groupe {groupe.nom_groupe}.',
                    notif_type='Info',
                    lien='/dashboard/etudiant/',
                )
                if etudiant.parent:
                    send_notification(
                        user=etudiant.parent.user,
                        titre=f'Inscription de {etudiant.user.get_full_name()}',
                        contenu=f'Votre enfant est inscrit au groupe {groupe.nom_groupe}.',
                        notif_type='Info',
                        lien='/parent/suivi/',
                    )
            except Exception:
                pass
            # ── Fin notification ───────────────────────────────────────────

            return Response(InscriptionSerializer(inscription).data, status=201)
        return Response(serializer.errors, status=400)


class InscriptionDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Inscription.objects.select_related('etudiant__user', 'groupe').all()
    serializer_class = InscriptionSerializer
    permission_classes = [IsSecretariatOrDirigeant]


# ============================================================
# API — PLANNING
# ============================================================

class PlanningListCreateView(APIView):

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSecretariatOrDirigeant()]
        return [IsAuthenticated()]

    def get(self, request):
        qs         = Planning.objects.select_related('groupe', 'enseignant__user').all()
        groupe_id  = request.query_params.get('groupe')
        jour       = request.query_params.get('jour')
        enseignant = request.query_params.get('enseignant')

        if groupe_id:  qs = qs.filter(groupe_id=groupe_id)
        if jour:       qs = qs.filter(jour=jour)
        if enseignant: qs = qs.filter(enseignant_id=enseignant)

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
            return Response(PlanningSerializer(planning).data, status=201)
        return Response(serializer.errors, status=400)


class PlanningDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Planning.objects.select_related('groupe', 'enseignant__user').all()
    serializer_class = PlanningSerializer
    permission_classes = [IsAuthenticated]


# ============================================================
# API — SÉANCES
# ============================================================

class SeanceListCreateView(APIView):

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsSecretariatOrDirigeant()]
        return [IsAuthenticated()]

    def get(self, request):
        qs        = Seance.objects.select_related('groupe').all()
        groupe_id = request.query_params.get('groupe')
        date      = request.query_params.get('date')
        if groupe_id: qs = qs.filter(groupe_id=groupe_id)
        if date:      qs = qs.filter(date_seance=date)
        return Response(SeanceSerializer(qs, many=True).data)

    def post(self, request):
        serializer = SeanceSerializer(data=request.data)
        if serializer.is_valid():
            seance = serializer.save()
            log_audit(request, 'CREATE', 'Seance', seance.pk)
            return Response(SeanceSerializer(seance).data, status=201)
        return Response(serializer.errors, status=400)


class SeanceDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Seance.objects.select_related('groupe').all()
    serializer_class = SeanceSerializer
    permission_classes = [IsAuthenticated]


# ============================================================
# API — ÉVALUATIONS
# ============================================================

class EvaluationListCreateView(APIView):

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsEnseignantOrDirigeant()]
        return [IsAuthenticated()]

    def get(self, request):
        qs        = Evaluation.objects.select_related('groupe').all()
        groupe_id = request.query_params.get('groupe')
        type_eval = request.query_params.get('type')
        if groupe_id: qs = qs.filter(groupe_id=groupe_id)
        if type_eval: qs = qs.filter(type=type_eval)

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
                parent  = request.user.parent_profile
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

            # ── Notification to all students in group ──────────────────────
            try:
                send_notification_to_groupe(
                    groupe=evaluation.groupe,
                    titre=f'Nouvelle évaluation : {evaluation.titre}',
                    contenu=f'Une évaluation "{evaluation.titre}" est prévue le {evaluation.date_evaluation}.',
                    notif_type='Note',
                    lien='/etudiant/notes/',
                )
            except Exception:
                pass
            # ── Fin notification ───────────────────────────────────────────

            return Response(EvaluationSerializer(evaluation).data, status=201)
        return Response(serializer.errors, status=400)


class EvaluationDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Evaluation.objects.select_related('groupe').all()
    serializer_class = EvaluationSerializer
    permission_classes = [IsEnseignantOrDirigeant]


# ============================================================
# API — NOTES
# ============================================================

class NoteListCreateView(APIView):

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsEnseignantOrDirigeant()]
        return [IsAuthenticated()]

    def get(self, request):
        qs            = Note.objects.select_related('etudiant__user', 'evaluation').all()
        etudiant_id   = request.query_params.get('etudiant')
        evaluation_id = request.query_params.get('evaluation')
        if etudiant_id:   qs = qs.filter(etudiant_id=etudiant_id)
        if evaluation_id: qs = qs.filter(evaluation_id=evaluation_id)

        if request.user.role == 'Etudiant':
            try:
                qs = qs.filter(etudiant=request.user.etudiant_profile)
            except Exception:
                return Response([])
        elif request.user.role == 'Parent':
            try:
                qs = qs.filter(etudiant__in=request.user.parent_profile.enfants.all())
            except Exception:
                return Response([])
        elif request.user.role == 'Enseignant':
            try:
                qs = qs.filter(evaluation__groupe__enseignant=request.user.enseignant_profile)
            except Exception:
                return Response([])

        return Response(NoteSerializer(qs, many=True).data)

    def post(self, request):
        serializer = NoteCreateSerializer(data=request.data)
        if serializer.is_valid():
            note = serializer.save()
            log_audit(request, 'CREATE', 'Note', note.pk)

            # ── Notifications ──────────────────────────────────────────────
            try:
                etudiant   = note.etudiant
                eval_titre = note.evaluation.titre if note.evaluation else 'évaluation'
                send_notification(
                    user=etudiant.user,
                    titre='Nouvelle note disponible',
                    contenu=f'{eval_titre} : {note.note_obtenue}/{note.note_max}',
                    notif_type='Note',
                    lien='/etudiant/notes/',
                )
                if etudiant.parent:
                    send_notification(
                        user=etudiant.parent.user,
                        titre=f'Note de {etudiant.user.get_full_name()}',
                        contenu=f'{eval_titre} : {note.note_obtenue}/{note.note_max}',
                        notif_type='Note',
                        lien='/parent/suivi/',
                    )
            except Exception:
                pass
            # ── Fin notifications ──────────────────────────────────────────

            return Response(NoteSerializer(note).data, status=201)
        return Response(serializer.errors, status=400)


class NoteDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Note.objects.select_related('etudiant__user', 'evaluation').all()
    serializer_class = NoteSerializer
    permission_classes = [IsEnseignantOrDirigeant]


# ============================================================
# API — ABSENCES
# ============================================================

class AbsenceListCreateView(APIView):

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsEnseignantOrDirigeant()]
        return [IsAuthenticated()]

    def get(self, request):
        qs        = Absence.objects.select_related('etudiant__user', 'seance').all()
        etudiant_id = request.query_params.get('etudiant')
        seance_id   = request.query_params.get('seance')
        statut      = request.query_params.get('statut')
        if etudiant_id: qs = qs.filter(etudiant_id=etudiant_id)
        if seance_id:   qs = qs.filter(seance_id=seance_id)
        if statut:      qs = qs.filter(statut_absence=statut)

        if request.user.role == 'Etudiant':
            try:
                qs = qs.filter(etudiant=request.user.etudiant_profile)
            except Exception:
                return Response([])
        if request.user.role == 'Parent':
            try:
                qs = qs.filter(etudiant__in=request.user.parent_profile.enfants.all())
            except Exception:
                return Response([])
        if request.user.role == 'Enseignant':
            try:
                qs = qs.filter(seance__groupe__enseignant=request.user.enseignant_profile)
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
            seuil  = int(limite.valeur) if limite else 3

            # ── Notifications ──────────────────────────────────────────────
            try:
                etudiant = absence.etudiant
                # Always notify student of the absence
                send_notification(
                    user=etudiant.user,
                    titre='Absence enregistrée',
                    contenu=f'Une absence a été enregistrée pour la séance du {absence.date_absence}.',
                    notif_type='Absence',
                    lien='/etudiant/planning/',
                )
                # Alert if over threshold
                if nb_absences > seuil:
                    send_notification(
                        user=etudiant.user,
                        titre='⚠️ Alerte absences',
                        contenu=f'Vous avez {nb_absences} absences (seuil autorisé : {seuil}).',
                        notif_type='Absence',
                        urgent=True,
                        lien='/etudiant/planning/',
                    )
                    if etudiant.parent:
                        send_notification(
                            user=etudiant.parent.user,
                            titre=f'Alerte absences — {etudiant.user.get_full_name()}',
                            contenu=f'{nb_absences} absences enregistrées (seuil : {seuil}).',
                            notif_type='Absence',
                            urgent=True,
                            lien='/parent/suivi/',
                        )
            except Exception:
                pass
            # ── Fin notifications ──────────────────────────────────────────

            return Response(AbsenceSerializer(absence).data, status=201)
        return Response(serializer.errors, status=400)


class AbsenceDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Absence.objects.select_related('etudiant__user', 'seance').all()
    serializer_class = AbsenceSerializer
    permission_classes = [IsEnseignantOrDirigeant]


# ============================================================
# API — PAIEMENTS
# ============================================================

class PaiementListCreateView(APIView):
    permission_classes = [IsComptable]

    def get(self, request):
        qs        = Paiement.objects.select_related('etudiant__user').all()
        etudiant_id = request.query_params.get('etudiant')
        statut      = request.query_params.get('statut')
        periode     = request.query_params.get('periode')
        if etudiant_id: qs = qs.filter(etudiant_id=etudiant_id)
        if statut:      qs = qs.filter(statut_paiement=statut)
        if periode:     qs = qs.filter(periode=periode)
        return Response(PaiementSerializer(qs, many=True).data)

    def post(self, request):
        serializer = PaiementSerializer(data=request.data)
        if serializer.is_valid():
            paiement = serializer.save()
            log_audit(request, 'CREATE', 'Paiement', paiement.pk,
                      nouvelle_valeur={'montant': str(paiement.montant_paye)})

            # ── Notifications ──────────────────────────────────────────────
            try:
                etudiant = paiement.etudiant
                if paiement.statut_paiement == 'Paye':
                    send_notification(
                        user=etudiant.user,
                        titre='Paiement confirmé ✓',
                        contenu=f'Mensualité {paiement.periode or ""} : {paiement.montant_paye} DA reçus.',
                        notif_type='Paiement',
                        lien='/profil/',
                    )
                elif paiement.statut_paiement == 'Impaye':
                    send_notification(
                        user=etudiant.user,
                        titre='Paiement en attente',
                        contenu=f'Mensualité {paiement.periode or ""} non réglée ({paiement.montant_du} DA).',
                        notif_type='Paiement',
                        urgent=True,
                        lien='/profil/',
                    )
            except Exception:
                pass
            # ── Fin notifications ──────────────────────────────────────────

            return Response(PaiementSerializer(paiement).data, status=201)
        return Response(serializer.errors, status=400)


class PaiementDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = Paiement.objects.select_related('etudiant__user').all()
    serializer_class = PaiementSerializer
    permission_classes = [IsComptable]


# ============================================================
# API — BULLETINS SALAIRE
# ============================================================

class BulletinListCreateView(APIView):
    permission_classes = [IsComptable]

    def get(self, request):
        qs            = BulletinSalaire.objects.select_related('enseignant__user').all()
        enseignant_id = request.query_params.get('enseignant')
        periode       = request.query_params.get('periode')
        if enseignant_id: qs = qs.filter(enseignant_id=enseignant_id)
        if periode:       qs = qs.filter(periode=periode)
        return Response(BulletinSalaireSerializer(qs, many=True).data)

    def post(self, request):
        serializer = BulletinSalaireSerializer(data=request.data)
        if serializer.is_valid():
            bulletin = serializer.save()
            log_audit(request, 'CREATE', 'BulletinSalaire', bulletin.pk)

            # ── Notification ───────────────────────────────────────────────
            try:
                send_notification(
                    user=bulletin.enseignant.user,
                    titre='Bulletin de salaire disponible',
                    contenu=f'Votre bulletin de {bulletin.periode} a été généré : {bulletin.salaire_net} DA net.',
                    notif_type='Paiement',
                    lien='/enseignant/',
                )
            except Exception:
                pass
            # ── Fin notification ───────────────────────────────────────────

            return Response(BulletinSalaireSerializer(bulletin).data, status=201)
        return Response(serializer.errors, status=400)


class BulletinDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = BulletinSalaire.objects.select_related('enseignant__user').all()
    serializer_class = BulletinSalaireSerializer
    permission_classes = [IsComptable]


# ============================================================
# API — RESSOURCES
# ============================================================

@method_decorator(csrf_exempt, name='dispatch')
class RessourceListCreateView(APIView):
    parser_classes = [MultiPartParser, FormParser]
 
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsEnseignantOrDirigeant()]
        return [IsAuthenticated()]
 
    def get(self, request):
        qs = Ressource.objects.select_related('enseignant__user', 'groupe').all()
 
        role = request.user.role
 
        if role == 'Etudiant':
            # FIX: filter by groupe AND niveau (if set on the resource)
            try:
                etudiant = request.user.etudiant_profile
                qs = qs.filter(visible_etudiants=True)
                if etudiant.groupe:
                    qs = qs.filter(
                        Q(groupe=etudiant.groupe) | Q(groupe__isnull=True)
                    )
                    # If a resource has a niveau set, only show it to students at that niveau
                    qs = qs.filter(
                        Q(niveau__isnull=True) |
                        Q(niveau='')           |
                        Q(niveau=etudiant.niveau_actuel)
                    )
            except Exception:
                qs = qs.filter(visible_etudiants=True)
 
        elif role == 'Parent':
            # FIX: parents previously got nothing — now they see visible resources
            # from their children's groups, filtered by each child's niveau
            try:
                parent  = request.user.parent_profile
                enfants = parent.enfants.select_related('groupe').all()
 
                if not enfants.exists():
                    return Response([])
 
                # Build a Q that matches (groupe=X AND (niveau=None OR niveau=child_niveau))
                # for each child
                q = Q(pk__in=[])   # start with empty match
                for enfant in enfants:
                    if not enfant.groupe:
                        continue
                    q |= Q(
                        groupe=enfant.groupe,
                        visible_etudiants=True
                    ) & (
                        Q(niveau__isnull=True) |
                        Q(niveau='')           |
                        Q(niveau=enfant.niveau_actuel)
                    )
 
                qs = qs.filter(q)
 
            except Exception:
                return Response([])
 
        elif role == 'Enseignant':
            # Teachers see only their own resources
            try:
                qs = qs.filter(enseignant=request.user.enseignant_profile)
            except Exception:
                return Response([])
 
        # Optional query-param filters (work for all roles after the role filter above)
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
    permission_classes = [IsAuthenticated]

    def get_object(self, pk, request):
        try:
            ressource = Ressource.objects.select_related('enseignant__user', 'groupe').get(pk=pk)
        except Ressource.DoesNotExist:
            return None
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
            return Response({'error': 'Ressource introuvable.'}, status=404)
        return Response(RessourceSerializer(obj).data)

    def patch(self, request, pk):
        if request.user.role not in ['Enseignant', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=403)
        obj = self.get_object(pk, request)
        if not obj:
            return Response({'error': 'Ressource introuvable.'}, status=404)
        if request.user.role == 'Enseignant' and obj.enseignant != request.user.enseignant_profile:
            return Response({'error': 'Permission refusée.'}, status=403)
        serializer = RessourceSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'Ressource', pk)
            return Response(serializer.data)
        return Response(serializer.errors, status=400)

    def delete(self, request, pk):
        if request.user.role not in ['Enseignant', 'Dirigeant']:
            return Response({'error': 'Permission refusée.'}, status=403)
        obj = self.get_object(pk, request)
        if not obj:
            return Response({'error': 'Ressource introuvable.'}, status=404)
        if request.user.role == 'Enseignant' and obj.enseignant != request.user.enseignant_profile:
            return Response({'error': 'Permission refusée.'}, status=403)
        obj.delete()
        log_audit(request, 'DELETE', 'Ressource', pk)
        return Response({'message': 'Ressource supprimée.'})


# ============================================================
# API — MESSAGERIE
# ============================================================

class MessageListCreateView(APIView):
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

            # ── Notification (replaces old Notification.objects.create) ────
            try:
                send_notification(
                    user=message.destinataire,
                    titre=f'Nouveau message de {request.user.get_full_name()}',
                    contenu=message.sujet or message.contenu[:80],
                    notif_type='Message',
                    lien='/messagerie/',
                )
            except Exception:
                pass
            # ── Fin notification ───────────────────────────────────────────

            return Response(MessageSerializer(message).data, status=201)
        return Response(serializer.errors, status=400)


class MessageDetailView(APIView):
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
            return Response({'error': 'Message introuvable.'}, status=404)
        if msg.destinataire == request.user and not msg.lu:
            msg.lu           = True
            msg.date_lecture = timezone.now()
            msg.statut_message = 'Lu'
            msg.save()
        return Response(MessageSerializer(msg).data)

    def delete(self, request, pk):
        msg = self.get_object(pk, request.user)
        if not msg:
            return Response({'error': 'Message introuvable.'}, status=404)
        msg.statut_message = 'Archive'
        msg.save()
        return Response({'message': 'Message archivé.'})


# ============================================================
# API — NOTIFICATIONS
# ============================================================

class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs     = Notification.objects.filter(utilisateur=request.user).order_by('-date_creation')
        statut = request.query_params.get('statut')
        if statut:
            qs = qs.filter(statut_notification=statut)
        return Response(NotificationSerializer(qs, many=True).data)


class MarquerNotificationLueView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            notif = Notification.objects.get(pk=pk, utilisateur=request.user)
            notif.statut_notification = 'Lu'
            notif.date_lecture        = timezone.now()
            notif.save()
            return Response({'message': 'Notification marquée comme lue.'})
        except Notification.DoesNotExist:
            return Response({'error': 'Notification introuvable.'}, status=404)


# ============================================================
# API — PARAMÈTRES
# ============================================================

class ParametreListView(generics.ListAPIView):
    queryset         = ParametreSysteme.objects.filter(modifiable=True).all()
    serializer_class = ParametreSystemeSerializer
    permission_classes = [IsDirigeant]


class ParametreDetailView(APIView):
    permission_classes = [IsDirigeant]

    def get_object(self, pk):
        try:
            return ParametreSysteme.objects.get(pk=pk)
        except ParametreSysteme.DoesNotExist:
            return None

    def get(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Paramètre introuvable.'}, status=404)
        return Response(ParametreSystemeSerializer(obj).data)

    def put(self, request, pk):
        obj = self.get_object(pk)
        if not obj:
            return Response({'error': 'Paramètre introuvable.'}, status=404)
        if not obj.modifiable:
            return Response({'error': 'Ce paramètre n\'est pas modifiable.'}, status=400)
        ancienne = obj.valeur
        serializer = ParametreSystemeSerializer(obj, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            log_audit(request, 'UPDATE', 'ParametreSysteme', pk,
                      ancienne_valeur={'valeur': ancienne},
                      nouvelle_valeur={'valeur': obj.valeur})
            return Response(serializer.data)
        return Response(serializer.errors, status=400)


# ============================================================
# API — AUDIT
# ============================================================

class AuditListView(generics.ListAPIView):
    queryset         = Audit.objects.select_related('utilisateur').order_by('-date_action').all()
    serializer_class = AuditSerializer
    permission_classes = [IsDirigeant]

    def get_queryset(self):
        qs      = super().get_queryset()
        action  = self.request.query_params.get('action')
        entite  = self.request.query_params.get('entite')
        user_id = self.request.query_params.get('utilisateur')
        if action:  qs = qs.filter(action=action)
        if entite:  qs = qs.filter(entite=entite)
        if user_id: qs = qs.filter(utilisateur_id=user_id)
        return qs


# ============================================================
# API — UTILISATEUR DETAIL
# ============================================================

class UtilisateurDetailView(APIView):
    permission_classes = [IsStaff]

    def get_object(self, pk):
        try:
            return Utilisateur.objects.get(pk=pk)
        except Utilisateur.DoesNotExist:
            return None

    def put(self, request, pk):
        user = self.get_object(pk)
        if not user:
            return Response({'error': 'Introuvable.'}, status=404)
        s = UtilisateurUpdateSerializer(user, data=request.data, partial=True)
        if s.is_valid():
            s.save()
            log_audit(request, 'UPDATE', 'Utilisateur', pk)
            return Response(s.data)
        return Response(s.errors, status=400)

    def patch(self, request, pk):
        return self.put(request, pk)


# ============================================================
# API — DASHBOARD KPIs
# ============================================================

class DashboardView(APIView):
    permission_classes = [IsDirigeant]

    def get(self, request):
        nb_etudiants  = Etudiant.objects.filter(statut_etudiant='Actif').count()
        nb_enseignants= Enseignant.objects.filter(statut_emploi='Actif').count()
        nb_groupes    = Groupe.objects.filter(statut_groupe='Actif').count()
        nb_parents    = Etudiant.objects.filter(parent__isnull=False).values('parent').distinct().count()

        paiements     = Paiement.objects.all()
        revenus       = paiements.aggregate(total=Sum('montant_paye'))['total'] or 0
        impayes       = paiements.filter(statut_paiement='Impaye').aggregate(total=Sum('montant_du'))['total'] or 0
        salaires      = BulletinSalaire.objects.aggregate(total=Sum('salaire_net'))['total'] or 0
        total_du      = paiements.aggregate(total=Sum('montant_du'))['total'] or 1
        taux_paiement = round(float(revenus) / float(total_du) * 100, 2)

        moyenne_globale = Note.objects.aggregate(moy=Avg('note_obtenue'))['moy']
        moyenne_globale = round(float(moyenne_globale), 2) if moyenne_globale else 0
        nb_absences     = Absence.objects.filter(statut_absence='Absent').count()
        niveaux         = Etudiant.objects.values('niveau_actuel').annotate(total=Count('id')).order_by('niveau_actuel')

        return Response({
            'etudiants':  nb_etudiants,
            'enseignants':nb_enseignants,
            'groupes':    nb_groupes,
            'parents':    nb_parents,
            'finances': {
                'revenus_collectes': float(revenus),
                'impayés':           float(impayes),
                'salaires_verses':   float(salaires),
                'solde':             float(revenus) - float(salaires),
                'taux_paiement':     taux_paiement,
            },
            'pedagogie': {
                'moyenne_globale': moyenne_globale,
                'nb_absences':     nb_absences,
            },
            'repartition_niveaux': list(niveaux),
        })