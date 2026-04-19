"""
serializers.py — Gestion Établissement de Langues
FIXED: EtudiantSerializer inclut les champs parent plats
       EtudiantCreateSerializer crée automatiquement le parent si âge < 15
"""

from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import (
    Utilisateur, Parent, Enseignant, Groupe, Etudiant,
    Planning, Seance, Evaluation, Note, Absence, Paiement,
    BulletinSalaire, Ressource, Message, PieceJointe,
    Notification, PreferenceNotification, ParametreSysteme, Audit
)


# ============================================================
# UTILISATEUR
# ============================================================

class UtilisateurSerializer(serializers.ModelSerializer):
    nom_complet = serializers.SerializerMethodField()

    class Meta:
        model = Utilisateur
        fields = [
            'id', 'email', 'first_name', 'last_name', 'nom_complet',
            'telephone', 'adresse', 'wilaya', 'role', 'statut',
            'permission_2fa', 'compte_verrouille',
            'date_inscription', 'derniere_connexion',
        ]
        read_only_fields = ['id', 'date_inscription']

    def get_nom_complet(self, obj):
        return obj.get_full_name()


class UtilisateurCreateSerializer(serializers.ModelSerializer):
    password  = serializers.CharField(write_only=True, min_length=6)
    password2 = serializers.CharField(write_only=True)

    class Meta:
        model = Utilisateur
        fields = [
            'email', 'username', 'first_name', 'last_name',
            'password', 'password2', 'telephone', 'adresse', 'wilaya', 'role',
        ]

    def validate(self, attrs):
        if attrs['password'] != attrs['password2']:
            raise serializers.ValidationError({'password': 'Les mots de passe ne correspondent pas.'})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password2')
        password = validated_data.pop('password')
        user = Utilisateur(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UtilisateurUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Utilisateur
        fields = ['first_name', 'last_name', 'telephone', 'adresse', 'wilaya', 'statut', 'role']


class ChangePasswordSerializer(serializers.Serializer):
    ancien_password    = serializers.CharField(write_only=True)
    nouveau_password   = serializers.CharField(write_only=True, min_length=6)
    nouveau_password2  = serializers.CharField(write_only=True)

    def validate(self, attrs):
        if attrs['nouveau_password'] != attrs['nouveau_password2']:
            raise serializers.ValidationError({'nouveau_password': 'Les mots de passe ne correspondent pas.'})
        return attrs


# ============================================================
# PARENT
# ============================================================

class ParentSerializer(serializers.ModelSerializer):
    user          = UtilisateurSerializer(read_only=True)
    enfants_count = serializers.SerializerMethodField()

    class Meta:
        model = Parent
        fields = [
            'id', 'user', 'relation_enfant', 'consentement_rgpd',
            'date_consentement', 'date_creation', 'enfants_count',
        ]
        read_only_fields = ['id', 'date_creation']

    def get_enfants_count(self, obj):
        return obj.enfants.count()


class ParentCreateSerializer(serializers.Serializer):
    email             = serializers.EmailField()
    first_name        = serializers.CharField(max_length=50)
    last_name         = serializers.CharField(max_length=50)
    password          = serializers.CharField(write_only=True, min_length=6)
    telephone         = serializers.CharField(max_length=20)
    adresse           = serializers.CharField(max_length=255, required=False, allow_blank=True)
    relation_enfant   = serializers.ChoiceField(choices=['Pere', 'Mere', 'Tuteur', 'Autre'], required=False)
    consentement_rgpd = serializers.BooleanField(default=False)

    def create(self, validated_data):
        user = Utilisateur.objects.create_user(
            email      = validated_data['email'],
            username   = validated_data['email'],
            first_name = validated_data['first_name'],
            last_name  = validated_data['last_name'],
            password   = validated_data['password'],
            telephone  = validated_data.get('telephone', ''),
            adresse    = validated_data.get('adresse', ''),
            role       = 'Parent',
        )
        parent = Parent.objects.create(
            user              = user,
            relation_enfant   = validated_data.get('relation_enfant', 'Tuteur'),
            consentement_rgpd = validated_data.get('consentement_rgpd', False),
        )
        return parent


# ============================================================
# ENSEIGNANT
# ============================================================

class EnseignantSerializer(serializers.ModelSerializer):
    user           = UtilisateurSerializer(read_only=True)
    nom_complet    = serializers.SerializerMethodField()
    nombre_groupes = serializers.SerializerMethodField()

    class Meta:
        model = Enseignant
        fields = [
            'id', 'user', 'nom_complet', 'langue_enseignee', 'niveaux',
            'qualification', 'experience_annees', 'tarif_horaire',
            'type_contrat', 'date_debut_contrat', 'date_fin_contrat',
            'heures_travaillees_mois', 'salaire_mois', 'statut_emploi',
            'disponibilite', 'date_creation', 'nombre_groupes',
        ]
        read_only_fields = ['id', 'date_creation']

    def get_nom_complet(self, obj):
        return obj.user.get_full_name()

    def get_nombre_groupes(self, obj):
        return obj.groupes.filter(statut_groupe='Actif').count()


class EnseignantCreateSerializer(serializers.Serializer):
    email              = serializers.EmailField()
    first_name         = serializers.CharField(max_length=50)
    last_name          = serializers.CharField(max_length=50)
    password           = serializers.CharField(write_only=True, min_length=6)
    telephone          = serializers.CharField(max_length=20)
    langue_enseignee   = serializers.CharField(max_length=50)
    niveaux            = serializers.CharField(max_length=50)
    qualification      = serializers.CharField(max_length=100, required=False, allow_blank=True)
    experience_annees  = serializers.IntegerField(default=0)
    tarif_horaire      = serializers.DecimalField(max_digits=10, decimal_places=2)
    type_contrat       = serializers.ChoiceField(choices=['CDI', 'CDD', 'Vacataire'])
    date_debut_contrat = serializers.DateField()
    date_fin_contrat   = serializers.DateField(required=False, allow_null=True)
    disponibilite      = serializers.JSONField(required=False, default=dict)

    def create(self, validated_data):
        user = Utilisateur.objects.create_user(
            email      = validated_data['email'],
            username   = validated_data['email'],
            first_name = validated_data['first_name'],
            last_name  = validated_data['last_name'],
            password   = validated_data['password'],
            telephone  = validated_data.get('telephone', ''),
            role       = 'Enseignant',
        )
        enseignant = Enseignant.objects.create(
            user               = user,
            langue_enseignee   = validated_data['langue_enseignee'],
            niveaux            = validated_data['niveaux'],
            qualification      = validated_data.get('qualification', ''),
            experience_annees  = validated_data.get('experience_annees', 0),
            tarif_horaire      = validated_data['tarif_horaire'],
            type_contrat       = validated_data['type_contrat'],
            date_debut_contrat = validated_data['date_debut_contrat'],
            date_fin_contrat   = validated_data.get('date_fin_contrat'),
            disponibilite      = validated_data.get('disponibilite', {}),
        )
        return enseignant


# ============================================================
# GROUPE
# ============================================================

class GroupeSerializer(serializers.ModelSerializer):
    enseignant_nom   = serializers.SerializerMethodField()
    places_restantes = serializers.SerializerMethodField()

    class Meta:
        model = Groupe
        fields = [
            'id', 'nom_groupe', 'langue', 'niveau', 'enseignant',
            'enseignant_nom', 'salle', 'capacite_max', 'nombre_etudiants',
            'places_restantes', 'tarif_mensuel', 'date_debut', 'date_fin',
            'duree_semaines', 'statut_groupe', 'date_creation',
        ]
        read_only_fields = ['id', 'nombre_etudiants', 'date_creation']

    def get_enseignant_nom(self, obj):
        return obj.enseignant.user.get_full_name() if obj.enseignant else None

    def get_places_restantes(self, obj):
        return obj.capacite_max - obj.nombre_etudiants


# ============================================================
# ÉTUDIANT — FIXED: champs parent plats inclus
# ============================================================

class EtudiantSerializer(serializers.ModelSerializer):
    user       = UtilisateurSerializer(read_only=True)
    groupe_nom = serializers.SerializerMethodField()

    # ── Champs parent plats ── lisibles directement en JS ───────
    parent_id       = serializers.SerializerMethodField()
    parent_nom      = serializers.SerializerMethodField()
    parent_email    = serializers.SerializerMethodField()
    parent_tel      = serializers.SerializerMethodField()
    parent_relation = serializers.SerializerMethodField()

    class Meta:
        model = Etudiant
        fields = [
            'id', 'user', 'date_naissance', 'genre',
            # parent FK (ID brut) + champs plats lisibles
            'parent', 'parent_id', 'parent_nom',
            'parent_email', 'parent_tel', 'parent_relation',
            # groupe
            'groupe', 'groupe_nom',
            # académique
            'niveau_actuel', 'moyenne_generale', 'taux_assiduité',
            'statut_etudiant', 'date_inscription',
        ]
        read_only_fields = ['id', 'moyenne_generale', 'taux_assiduité', 'date_inscription']

    def get_groupe_nom(self, obj):
        return obj.groupe.nom_groupe if obj.groupe else None

    # ── Getters parent ──────────────────────────────────────────

    def get_parent_id(self, obj):
        return obj.parent.id if obj.parent else None

    def get_parent_nom(self, obj):
        if obj.parent and obj.parent.user:
            return obj.parent.user.get_full_name()
        return None

    def get_parent_email(self, obj):
        if obj.parent and obj.parent.user:
            return obj.parent.user.email
        return None

    def get_parent_tel(self, obj):
        if obj.parent and obj.parent.user:
            return obj.parent.user.telephone
        return None

    def get_parent_relation(self, obj):
        if obj.parent:
            return obj.parent.relation_enfant
        return None


# ============================================================
# ÉTUDIANT CREATE — FIXED: création auto parent si âge < 15
# ============================================================

class EtudiantCreateSerializer(serializers.Serializer):
    """
    Crée un étudiant + son compte utilisateur.
    Si âge < 15 → crée automatiquement un compte Parent lié.
    Les champs parent_* sont obligatoires dans ce cas.
    """

    # ── Données étudiant ──────────────────────────────────────
    email          = serializers.EmailField()
    first_name     = serializers.CharField(max_length=50)
    last_name      = serializers.CharField(max_length=50)
    password       = serializers.CharField(write_only=True, min_length=6)
    telephone      = serializers.CharField(max_length=20, required=False, allow_blank=True)
    date_naissance = serializers.DateField()
    genre          = serializers.ChoiceField(choices=['M', 'F', 'Autre'], required=False)
    id_groupe      = serializers.IntegerField(required=False, allow_null=True)
    niveau_initial = serializers.ChoiceField(choices=['A1', 'A2', 'B1', 'B2', 'C1'], default='A1')

    # ── Données parent (obligatoires si âge < 15) ─────────────
    parent_first_name = serializers.CharField(max_length=50,  required=False, allow_blank=True)
    parent_last_name  = serializers.CharField(max_length=50,  required=False, allow_blank=True)
    parent_email      = serializers.EmailField(required=False, allow_null=True)
    parent_telephone  = serializers.CharField(max_length=20,  required=False, allow_blank=True)
    parent_relation   = serializers.ChoiceField(
        choices=['Pere', 'Mere', 'Tuteur', 'Autre'], required=False
    )

    # ── Helpers ───────────────────────────────────────────────

    def _calculate_age(self, date_naissance):
        from datetime import date
        today = date.today()
        return today.year - date_naissance.year - (
            (today.month, today.day) < (date_naissance.month, date_naissance.day)
        )

    def validate(self, attrs):
        age = self._calculate_age(attrs['date_naissance'])
        attrs['_age'] = age

        if age < 15:
            missing = []
            if not attrs.get('parent_first_name'): missing.append('parent_first_name')
            if not attrs.get('parent_last_name'):  missing.append('parent_last_name')
            if not attrs.get('parent_email'):      missing.append('parent_email')
            if not attrs.get('parent_telephone'):  missing.append('parent_telephone')
            if missing:
                raise serializers.ValidationError({
                    f: "Obligatoire pour un étudiant mineur (< 15 ans)."
                    for f in missing
                })
            # Vérifier que l'email parent n'existe pas déjà
            if Utilisateur.objects.filter(email=attrs['parent_email']).exists():
                raise serializers.ValidationError(
                    {'parent_email': "Un compte avec cet email parent existe déjà."}
                )
        return attrs

    def validate_id_groupe(self, value):
        if value:
            try:
                g = Groupe.objects.get(pk=value)
                if g.nombre_etudiants >= g.capacite_max:
                    raise serializers.ValidationError("Ce groupe est complet.")
            except Groupe.DoesNotExist:
                raise serializers.ValidationError("Groupe introuvable.")
        return value

    def create(self, validated_data):
        import secrets

        age = validated_data.pop('_age')

        # Extraire les champs parent
        parent_first_name = validated_data.pop('parent_first_name', '')
        parent_last_name  = validated_data.pop('parent_last_name', '')
        parent_email      = validated_data.pop('parent_email', None)
        parent_telephone  = validated_data.pop('parent_telephone', '')
        parent_relation   = validated_data.pop('parent_relation', 'Tuteur')

        # ── Créer l'utilisateur étudiant ─────────────────────
        etudiant_user = Utilisateur.objects.create_user(
            email      = validated_data['email'],
            username   = validated_data['email'],
            first_name = validated_data['first_name'],
            last_name  = validated_data['last_name'],
            password   = validated_data['password'],
            telephone  = validated_data.get('telephone', ''),
            role       = 'Etudiant',
        )

        parent_obj = None

        if age < 15:
            # ── Créer automatiquement le parent ──────────────
            pwd = secrets.token_urlsafe(10)

            parent_user = Utilisateur.objects.create_user(
                email      = parent_email,
                username   = parent_email,
                first_name = parent_first_name,
                last_name  = parent_last_name,
                password   = pwd,
                telephone  = parent_telephone,
                role       = 'Parent',
            )
            parent_obj = Parent.objects.create(
                user            = parent_user,
                relation_enfant = parent_relation,
                consentement_rgpd = False,
            )
            # Stocker le mot de passe généré pour la réponse API
            parent_obj._generated_password = pwd

        # ── Créer l'étudiant ─────────────────────────────────
        etudiant = Etudiant.objects.create(
            user           = etudiant_user,
            date_naissance = validated_data['date_naissance'],
            genre          = validated_data.get('genre', ''),
            parent         = parent_obj,
            groupe_id      = validated_data.get('id_groupe'),
            niveau_actuel  = validated_data.get('niveau_initial', 'A1'),
        )

        # Incrémenter le compteur du groupe
        if etudiant.groupe:
            Groupe.objects.filter(pk=etudiant.groupe.pk).update(
                nombre_etudiants=etudiant.groupe.nombre_etudiants + 1
            )

        # Attacher le parent créé pour que la vue puisse le lire
        etudiant._parent_created = parent_obj
        return etudiant


# ============================================================
# INSCRIPTION
# ============================================================

class InscriptionSerializer(serializers.ModelSerializer):
    etudiant_nom = serializers.SerializerMethodField()
    groupe_nom   = serializers.SerializerMethodField()

    class Meta:
        from .models import Inscription
        model = Inscription
        fields = [
            'id', 'etudiant', 'etudiant_nom', 'groupe', 'groupe_nom',
            'date_inscription', 'statut_inscription',
        ]
        read_only_fields = ['id', 'date_inscription']

    def get_etudiant_nom(self, obj):
        return obj.etudiant.user.get_full_name()

    def get_groupe_nom(self, obj):
        return obj.groupe.nom_groupe


# ============================================================
# PLANNING
# ============================================================

class PlanningSerializer(serializers.ModelSerializer):
    groupe_nom     = serializers.SerializerMethodField()
    enseignant_nom = serializers.SerializerMethodField()

    class Meta:
        model = Planning
        fields = [
            'id', 'groupe', 'groupe_nom', 'jour', 'heure_debut', 'heure_fin',
            'salle', 'enseignant', 'enseignant_nom', 'statut_planning',
            'recurence', 'date_fin_recurence', 'notes_planning', 'date_creation',
        ]
        read_only_fields = ['id', 'date_creation']

    def get_groupe_nom(self, obj):
        return obj.groupe.nom_groupe

    def get_enseignant_nom(self, obj):
        return obj.enseignant.user.get_full_name() if obj.enseignant else None

    def validate(self, attrs):
        h_debut = attrs.get('heure_debut')
        h_fin   = attrs.get('heure_fin')
        jour    = attrs.get('jour')
        salle   = attrs.get('salle')
        enseignant = attrs.get('enseignant')

        if h_debut and h_fin and h_debut >= h_fin:
            raise serializers.ValidationError("L'heure de fin doit être après l'heure de début.")

        # Conflit de salle
        qs_salle = Planning.objects.filter(
            jour=jour, salle=salle,
            heure_debut__lt=h_fin, heure_fin__gt=h_debut,
            statut_planning__in=['Planifie', 'Confirme']
        )
        if self.instance:
            qs_salle = qs_salle.exclude(pk=self.instance.pk)
        if qs_salle.exists():
            raise serializers.ValidationError(f"La salle {salle} est déjà occupée à ce créneau.")

        # Conflit enseignant
        if enseignant:
            qs_ens = Planning.objects.filter(
                jour=jour, enseignant=enseignant,
                heure_debut__lt=h_fin, heure_fin__gt=h_debut,
                statut_planning__in=['Planifie', 'Confirme']
            )
            if self.instance:
                qs_ens = qs_ens.exclude(pk=self.instance.pk)
            if qs_ens.exists():
                raise serializers.ValidationError("L'enseignant a déjà un cours à ce créneau.")

        return attrs


# ============================================================
# SÉANCE
# ============================================================

class SeanceSerializer(serializers.ModelSerializer):
    groupe_nom = serializers.SerializerMethodField()

    class Meta:
        model = Seance
        fields = [
            'id', 'groupe', 'groupe_nom', 'planning', 'jour',
            'heure_debut', 'heure_fin', 'salle', 'type_seance',
            'description', 'date_seance', 'statut_seance', 'date_creation',
        ]
        read_only_fields = ['id', 'date_creation']

    def get_groupe_nom(self, obj):
        return obj.groupe.nom_groupe


# ============================================================
# ÉVALUATION
# ============================================================

class EvaluationSerializer(serializers.ModelSerializer):
    groupe_nom   = serializers.SerializerMethodField()
    nombre_notes = serializers.SerializerMethodField()

    class Meta:
        model = Evaluation
        fields = [
            'id', 'groupe', 'groupe_nom', 'titre', 'type',
            'date_evaluation', 'duree_minutes', 'description',
            'ponderation', 'note_max', 'statut_eval',
            'date_creation', 'nombre_notes',
        ]
        read_only_fields = ['id', 'date_creation']

    def get_groupe_nom(self, obj):
        return obj.groupe.nom_groupe

    def get_nombre_notes(self, obj):
        return obj.notes.count()


# ============================================================
# NOTE
# ============================================================

class NoteSerializer(serializers.ModelSerializer):
    etudiant_nom     = serializers.SerializerMethodField()
    evaluation_titre = serializers.SerializerMethodField()
    evaluation_type  = serializers.SerializerMethodField()

    class Meta:
        model = Note
        fields = [
            'id', 'etudiant', 'etudiant_nom', 'evaluation', 'evaluation_titre',
            'evaluation_type', 'note_obtenue', 'note_max', 'pourcentage',
            'niveau_attribue', 'remarque_prof', 'statut_passage', 'date_saisie',
        ]
        read_only_fields = ['id', 'pourcentage', 'niveau_attribue', 'date_saisie']

    def get_etudiant_nom(self, obj):
        return obj.etudiant.user.get_full_name()

    def get_evaluation_titre(self, obj):
        return obj.evaluation.titre

    def get_evaluation_type(self, obj):
        return obj.evaluation.type


class NoteCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ['etudiant', 'evaluation', 'note_obtenue', 'note_max', 'remarque_prof']

    def validate(self, attrs):
        note     = attrs.get('note_obtenue', 0)
        note_max = attrs.get('note_max', 20)
        if note > note_max:
            raise serializers.ValidationError(
                f"La note ({note}) ne peut pas dépasser la note max ({note_max})."
            )
        return attrs


# ============================================================
# ABSENCE
# ============================================================

class AbsenceSerializer(serializers.ModelSerializer):
    etudiant_nom = serializers.SerializerMethodField()
    seance_date  = serializers.SerializerMethodField()

    class Meta:
        model = Absence
        fields = [
            'id', 'etudiant', 'etudiant_nom', 'seance', 'seance_date',
            'statut_absence', 'justification', 'date_absence',
            'raison', 'date_saisie',
        ]
        read_only_fields = ['id', 'date_saisie']

    def get_etudiant_nom(self, obj):
        return obj.etudiant.user.get_full_name()

    def get_seance_date(self, obj):
        return str(obj.seance.date_seance) if obj.seance else None


# ============================================================
# PAIEMENT
# ============================================================

class PaiementSerializer(serializers.ModelSerializer):
    etudiant_nom = serializers.SerializerMethodField()

    class Meta:
        model = Paiement
        fields = [
            'id', 'etudiant', 'etudiant_nom', 'montant_du', 'montant_paye',
            'solde', 'mode_paiement', 'date_paiement', 'reference_paiement',
            'statut_paiement', 'periode', 'date_echeance',
            'relances_envoyees', 'derniere_relance', 'date_creation',
        ]
        read_only_fields = ['id', 'solde', 'date_creation']

    def get_etudiant_nom(self, obj):
        return obj.etudiant.user.get_full_name()


# ============================================================
# BULLETIN SALAIRE
# ============================================================

class BulletinSalaireSerializer(serializers.ModelSerializer):
    enseignant_nom = serializers.SerializerMethodField()

    class Meta:
        model = BulletinSalaire
        fields = [
            'id', 'enseignant', 'enseignant_nom', 'periode',
            'heures_travaillees', 'tarif_horaire', 'salaire_brut',
            'assurance', 'cotisations', 'autres_retenues',
            'total_retenues', 'salaire_net', 'mode_paiement',
            'date_paiement', 'statut_paiement', 'date_creation',
        ]
        read_only_fields = ['id', 'salaire_brut', 'total_retenues', 'salaire_net', 'date_creation']

    def get_enseignant_nom(self, obj):
        return obj.enseignant.user.get_full_name()


# ============================================================
# RESSOURCE
# ============================================================

class RessourceSerializer(serializers.ModelSerializer):
    enseignant_nom = serializers.SerializerMethodField()
    groupe_nom     = serializers.SerializerMethodField()

    class Meta:
        model = Ressource
        fields = [
            'id', 'enseignant', 'enseignant_nom', 'groupe', 'groupe_nom',
            'titre', 'description', 'type_ressource', 'chemin_fichier',
            'url_lien', 'taille_fichier', 'niveau', 'visible_etudiants',
            'date_disponibilite', 'nombre_telechargements',
            'date_creation', 'date_modification',
        ]
        read_only_fields = ['id', 'nombre_telechargements', 'date_creation']

    def get_enseignant_nom(self, obj):
        return obj.enseignant.user.get_full_name() if obj.enseignant else None

    def get_groupe_nom(self, obj):
        return obj.groupe.nom_groupe if obj.groupe else None


class RessourceCreateSerializer(serializers.ModelSerializer):
    fichier = serializers.FileField(write_only=True, required=False)

    class Meta:
        model = Ressource
        fields = [
            'titre', 'description', 'type_ressource', 'fichier',
            'niveau', 'groupe', 'visible_etudiants', 'url_lien',
        ]

    def create(self, validated_data):
        fichier  = validated_data.pop('fichier', None)
        request  = self.context.get('request')
        try:
            enseignant = request.user.enseignant_profile
        except Exception:
            raise serializers.ValidationError("L'utilisateur n'est pas un enseignant.")

        ressource = Ressource.objects.create(
            enseignant    = enseignant,
            chemin_fichier = fichier,
            taille_fichier = round(fichier.size / (1024 * 1024), 2) if fichier else None,
            **validated_data
        )
        return ressource


# ============================================================
# MESSAGE
# ============================================================

class MessageSerializer(serializers.ModelSerializer):
    expediteur_nom   = serializers.CharField(source='expediteur.get_full_name', read_only=True)
    destinataire_nom = serializers.CharField(source='destinataire.get_full_name', read_only=True)

    class Meta:
        model = Message
        fields = [
            'id', 'expediteur', 'expediteur_nom',
            'destinataire', 'destinataire_nom',
            'sujet', 'contenu', 'date_envoi', 'lu',
        ]
        read_only_fields = ['id', 'date_envoi', 'expediteur']


class MessageCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['destinataire', 'sujet', 'contenu']


class PieceJointeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PieceJointe
        fields = ['id', 'nom_fichier', 'chemin_fichier', 'taille_fichier', 'type_fichier', 'date_upload']
        read_only_fields = ['id', 'date_upload']


# ============================================================
# NOTIFICATION
# ============================================================

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            'id', 'utilisateur', 'type_notification', 'titre', 'contenu',
            'canal', 'statut_notification', 'lien_action', 'urgent',
            'date_creation', 'date_lecture', 'date_programmee',
        ]
        read_only_fields = ['id', 'utilisateur', 'date_creation']


class PreferenceNotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = PreferenceNotification
        fields = [
            'id', 'utilisateur', 'type_notification', 'canal_email',
            'canal_sms', 'canal_app', 'heure_min_envoi', 'heure_max_envoi',
            'jours_actives', 'actif', 'date_modification',
        ]
        read_only_fields = ['id', 'utilisateur', 'date_modification']


# ============================================================
# PARAMÈTRE SYSTÈME
# ============================================================

class ParametreSystemeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ParametreSysteme
        fields = [
            'id', 'nom_parametre', 'valeur', 'type',
            'description', 'modifiable', 'date_modification',
        ]
        read_only_fields = ['id', 'nom_parametre', 'type', 'description', 'date_modification']


# ============================================================
# AUDIT
# ============================================================

class AuditSerializer(serializers.ModelSerializer):
    utilisateur_nom = serializers.SerializerMethodField()

    class Meta:
        model = Audit
        fields = [
            'id', 'utilisateur', 'utilisateur_nom', 'action', 'entite',
            'id_entite', 'ancienne_valeur', 'nouvelle_valeur',
            'date_action', 'adresse_ip', 'resultat', 'message_erreur',
        ]
        read_only_fields = fields

    def get_utilisateur_nom(self, obj):
        return obj.utilisateur.get_full_name() if obj.utilisateur else 'Système'