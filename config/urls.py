from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from api.views import login_page
from api.views import login_page,  dashboard_ens, groupes 
from django.conf.urls.static import static



from api.views import (
    # Auth
    login_view,
    logout_view,
    acces_refuse_view,

    # Secrétariat
    dashboard_scr,
    
    etudiants_view,
    etudiant_detail_view,
    enseignants_view,
    enseignant_detail_view,
    groupes_view,
    groupe_detail_view,
    planning_view,
    parents_view,
    inscriptions_view,
    salaires_view,

    # Comptable (+ Secrétariat hérite)
    dashboard_comptable,
    paiements_view,
    paiement_detail_view,
    bulletins_view,
    bulletin_detail_view,
    situation_financiere_view,
    parametres_view,
    # Dirigeant
    dashboard_dirigeant,
    parametres_view,
    audit_view,
    utilisateurs_view,
    rapports_view,

    # Enseignant
    dashboard_enseignant,
    mes_groupes_view,
    notes_view,
    absences_view,
    ressources_view,
    messagerie_enseignant_view,
    evaluations_view,

    # Étudiant
    dashboard_etudiant,
    mes_notes_view,
    mon_planning_view,
    mon_niveau_view,
    mes_ressources_view,
    messagerie_etudiant_view,

    # Parent
    dashboard_parent,
    suivi_enfant_view,
    messagerie_parent_view,
    notifications_parent_view,
    mes_ressources_vieww,

    # Commun
    profil_view,
    notifications_view,
    messagerie_view,
)
#S

admin.site.site_header = 'admin panel'
urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include('api.urls')),
    path('login/', login_page, name='login_page'),
  
   
    



    # ============================================================
    # SECRÉTARIAT
    # ============================================================0
    path('dashboard/secretariat/',                     dashboard_scr,   name='dashboard_secretariat'),
    path('secretariat/etudiants/',           etudiants_view,          name='etudiants'),
    path('secretariat/etudiants/<int:pk>/',  etudiant_detail_view,    name='etudiant_detail'),
    path('secretariat/enseignants/',         enseignants_view,        name='enseignants'),
    path('secretariat/enseignants/<int:pk>/', enseignant_detail_view, name='enseignant_detail'),
    path('secretariat/groupes/',             groupes_view,            name='groupes'),
    path('secretariat/groupes/<int:pk>/',    groupe_detail_view,      name='groupe_detail'),
    path('secretariat/planning/',            planning_view,           name='planning'),
    path('secretariat/parents/',             parents_view,            name='parents'),
    path('secretariat/inscriptions/',        inscriptions_view,       name='inscriptions'),
     path('secretariat/salaires/',                salaires_view,            name='salaires'),


    path('comptable/',                          dashboard_comptable,       name='dashboard_comptable'),
    path('comptable/paiements/',                paiements_view,            name='paiements'),
    path('comptable/paiements/<int:pk>/',       paiement_detail_view,      name='paiement_detail'),
    path('comptable/bulletins/',                bulletins_view,            name='bulletins'),
    path('comptable/bulletins/<int:pk>/',       bulletin_detail_view,      name='bulletin_detail'),
    path('comptable/situation-financiere/',     situation_financiere_view, name='situation_financiere'),


    path('dirigeant/',                   dashboard_dirigeant, name='dashboard_dirigeant'),
    path('dirigeant/parametres/',        parametres_view,     name='parametres'),
    path('dirigeant/audit/',             audit_view,          name='audit'),
    path('dirigeant/utilisateurs/',      utilisateurs_view,   name='utilisateurs'),
    path('dirigeant/rapports/',          rapports_view,       name='rapports'),


    path('dashboard/enseignant/',                  dashboard_ens,       name='dashboard_enseignant'),
    path('enseignant/groupes/',mes_groupes_view,           name='mes_groupes'),
    path('enseignant/notes/',            notes_view,                 name='notes'),
    path('dashboard/enseignant/absences/',         absences_view,              name='absences'),
    path('dashboard/enseignant/ressources/',       ressources_view,            name='ressources'),
    path('enseignant/messagerie/',       messagerie_enseignant_view, name='messagerie_enseignant'),
    path('enseignant/evaluations/',      evaluations_view,           name='evaluations'),


    path('dashboard/etudiant/',                    dashboard_etudiant,  name='dashboard_etudiant'),
    path('etudiant/notes/',              mes_notes_view,      name='mes_notes'),
    path('etudiant/planning/',           mon_planning_view,   name='mon_planning'),
    path('etudiant/niveau/',             mon_niveau_view,     name='mon_niveau'),
    path('etudiant/ressources/',         mes_ressources_view, name='mes_ressources'),
    path('etudiant/messagerie/',     messagerie_etudiant_view, name='messagerie_etudiant'),
    


    path('dashboard/parent/',                      dashboard_parent,         name='dashboard_parent'),
    path('parent/suivi/',                suivi_enfant_view,        name='suivi_enfant'),
    path('parent/messagerie/',           messagerie_parent_view,   name='messagerie_parent'),
    path('parent/notifications/',        notifications_parent_view, name='notifications_parent'),
    path('parent/ressources/',         mes_ressources_vieww, name='mes_ressourcess'),

    path('profil/',        profil_view,       name='profil'),
    path('notifications/', notifications_view, name='notifications'),
    path('messagerie/',    messagerie_view,    name='messagerie'),

] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)



if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)