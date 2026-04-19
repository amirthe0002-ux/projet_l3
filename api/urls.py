from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse

from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from django.http import HttpResponse
from rest_framework_simplejwt.views import TokenRefreshView
from . import views
from django.urls import path
from .views import login_page


def home(request):
    return HttpResponse("API working")


urlpatterns = [

    # Home
    path('', home, name='home'),

    # ============================================================
    # AUTH
    # ============================================================
    path('auth/login/', views.LoginView.as_view(), name='login'),
    path('auth/logout/', views.LogoutView.as_view(), name='logout'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', views.MeView.as_view(), name='me'),
    path('auth/change-password/', views.ChangePasswordView.as_view(), name='change_password'),
    path('login/', login_page, name='login_page'),

    # ============================================================
    # SECRÉTARIAT — Étudiants
    # ============================================================
    path('etudiants/', views.EtudiantListCreateView.as_view(), name='etudiant_list'),
    path('etudiants/<int:pk>/', views.EtudiantDetailView.as_view(), name='etudiant_detail'),

    # ============================================================
    # SECRÉTARIAT — Enseignants
    # ============================================================
    path('enseignants/', views.EnseignantListCreateView.as_view(), name='enseignant_list'),
    path('enseignants/<int:pk>/', views.EnseignantDetailView.as_view(), name='enseignant_detail'),

    # ============================================================
    # SECRÉTARIAT — Parents
    # ============================================================
    path('parents/', views.ParentListCreateView.as_view(), name='parent_list'),
    path('parents/<int:pk>/', views.ParentDetailView.as_view(), name='parent_detail'),

    # ============================================================
    # SECRÉTARIAT — Groupes
    # ============================================================
    path('groupes/', views.GroupeListCreateView.as_view(), name='groupe_list'),
    path('groupes/<int:pk>/', views.GroupeDetailView.as_view(), name='groupe_detail'),

    # ============================================================
    # SECRÉTARIAT — Planning
    # ============================================================
    path('plannings/', views.PlanningListCreateView.as_view(), name='planning_list'),
    path('plannings/<int:pk>/', views.PlanningDetailView.as_view(), name='planning_detail'),

    # ============================================================
    # SECRÉTARIAT — Séances
    # ============================================================
    path('seances/', views.SeanceListCreateView.as_view(), name='seance_list'),
    path('seances/<int:pk>/', views.SeanceDetailView.as_view(), name='seance_detail'),

    # ============================================================
    # SECRÉTARIAT — Inscriptions
    # ============================================================
    path('inscriptions/', views.InscriptionListCreateView.as_view(), name='inscription_list'),
    path('inscriptions/<int:pk>/', views.InscriptionDetailView.as_view(), name='inscription_detail'),

    # ============================================================
    # ENSEIGNANT — Évaluations
    # ============================================================
    path('evaluations/', views.EvaluationListCreateView.as_view(), name='evaluation_list'),
    path('evaluations/<int:pk>/', views.EvaluationDetailView.as_view(), name='evaluation_detail'),

    # ============================================================
    # ENSEIGNANT — Notes
    # ============================================================
    path('notes/', views.NoteListCreateView.as_view(), name='note_list'),
    path('notes/<int:pk>/', views.NoteDetailView.as_view(), name='note_detail'),

    # ============================================================
    # ENSEIGNANT — Absences
    # ============================================================
    path('absences/', views.AbsenceListCreateView.as_view(), name='absence_list'),
    path('absences/<int:pk>/', views.AbsenceDetailView.as_view(), name='absence_detail'),

    # ============================================================
    # ENSEIGNANT — Ressources
    # ============================================================
    path('ressources/', views.RessourceListCreateView.as_view(), name='ressource_list'),
    path('ressources/<int:pk>/', views.RessourceDetailView.as_view(), name='ressource_detail'),
    path('ressources/<int:pk>/download/', views.download_ressource, name='ressources-download'),

    # ============================================================
    # COMPTABLE — Paiements
    # ============================================================
    path('paiements/', views.PaiementListCreateView.as_view(), name='paiement_list'),
    path('paiements/<int:pk>/', views.PaiementDetailView.as_view(), name='paiement_detail'),

    # ============================================================
    # COMPTABLE — Bulletins
    # ============================================================
    path('bulletins/', views.BulletinListCreateView.as_view(), name='bulletin_list'),
    path('bulletins/<int:pk>/', views.BulletinDetailView.as_view(), name='bulletin_detail'),

    # ============================================================
    # MESSAGERIE
    # ============================================================
    path('messages/', views.MessageListCreateView.as_view(), name='message_list'),
    path('messages/<int:pk>/', views.MessageDetailView.as_view(), name='message_detail'),

    # ============================================================
    # NOTIFICATIONS
    # ============================================================
    path('notifications/', views.NotificationListView.as_view(), name='notification_list'),
    path('notifications/<int:pk>/lire/', views.MarquerNotificationLueView.as_view(), name='notif_lire'),

    # ============================================================
    # PARAMÈTRES
    # ============================================================
    path('parametres/', views.ParametreListView.as_view(), name='parametre_list'),
    path('parametres/<int:pk>/', views.ParametreDetailView.as_view(), name='parametre_detail'),

    # ============================================================
    # AUDIT + DASHBOARD
    # ============================================================
    path('audit/', views.AuditListView.as_view(), name='audit_list'),
    path('dashboard/', views.DashboardView.as_view(), name='dashboard'),

    # ============================================================
    # UTILISATEUR DETAIL (admin field updates)
    # ============================================================
    #path('utilisateurs/<int:pk>/', views.UtilisateurDetailView.as_view(), name='user_detail'),
]

# ✅ Add static/media ONLY in debug
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)