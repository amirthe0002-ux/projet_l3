from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator, MaxValueValidator
from django.utils.timezone import now
import json


# ============================================================
# 1. UTILISATEUR (Custom User Model)
# ============================================================

class Utilisateur(AbstractUser):
    """Modèle personnalisé d'utilisateur"""

    ROLE_CHOICES = [
        ('Secretariat', 'Secrétariat'),
        ('Comptable', 'Comptable'),
        ('Dirigeant', 'Dirigeant'),
        ('Enseignant', 'Enseignant'),
        ('Etudiant', 'Étudiant'),
        ('Parent', 'Parent'),
    ]

    STATUT_CHOICES = [
        ('Actif', 'Actif'),
        ('Inactif', 'Inactif'),
        ('Suspendu', 'Suspendu'),
    ]

    # Utiliser email comme USERNAME_FIELD
    email = models.EmailField(unique=True)
    telephone = models.CharField(max_length=20, blank=True, null=True)
    adresse = models.CharField(max_length=255, blank=True, null=True)
    wilaya = models.CharField(max_length=50, blank=True, null=True)

    role = models.CharField(
        max_length=20,
        choices=ROLE_CHOICES,
        default='Etudiant'
    )
    statut = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default='Actif'
    )

    permission_2fa = models.BooleanField(default=False)
    tentatives_echouees = models.IntegerField(default=0)
    compte_verrouille = models.BooleanField(default=False)
    date_verrouillage = models.DateTimeField(null=True, blank=True)

    date_inscription = models.DateTimeField(auto_now_add=True)
    derniere_connexion = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    class Meta:
        db_table = 'utilisateur'
        verbose_name = 'Utilisateur'
        verbose_name_plural = 'Utilisateurs'
        ordering = ['-date_inscription']
        indexes = [
            models.Index(fields=['email']),
            models.Index(fields=['role']),
            models.Index(fields=['statut']),
        ]

    def __str__(self):
        return f"{self.get_full_name()} ({self.email})"

    def get_full_name(self):
        """Retourner le nom complet"""
        return f"{self.first_name} {self.last_name}".strip()


# ============================================================
# 2. PARENT
# ============================================================

class Parent(models.Model):
    """Modèle Parent"""

    RELATION_CHOICES = [
        ('Pere', 'Père'),
        ('Mere', 'Mère'),
        ('Tuteur', 'Tuteur'),
        ('Autre', 'Autre'),
    ]

    user = models.OneToOneField(
        Utilisateur,
        on_delete=models.CASCADE,
        related_name='parent_profile',
        limit_choices_to={'role': 'Parent'}
    )

    relation_enfant = models.CharField(
        max_length=20,
        choices=RELATION_CHOICES,
        null=True,
        blank=True
    )

    consentement_rgpd = models.BooleanField(default=False)
    date_consentement = models.DateTimeField(null=True, blank=True)

    date_creation = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'parent'
        verbose_name = 'Parent'
        verbose_name_plural = 'Parents'
        ordering = ['-date_creation']

    def __str__(self):
        return f"Parent: {self.user.get_full_name()}"


# ============================================================
# 3. ENSEIGNANT
# ============================================================

class Enseignant(models.Model):
    """Modèle Enseignant"""

    NIVEAUX_CHOICES = [
        ('A1', 'A1'),
        ('A2', 'A2'),
        ('B1', 'B1'),
        ('B2', 'B2'),
        ('C1', 'C1'),
    ]

    CONTRAT_CHOICES = [
        ('CDI', 'CDI'),
        ('CDD', 'CDD'),
        ('Vacataire', 'Vacataire'),
    ]

    STATUT_EMPLOI_CHOICES = [
        ('Actif', 'Actif'),
        ('Inactif', 'Inactif'),
        ('Suspendu', 'Suspendu'),
    ]

    user = models.OneToOneField(
        Utilisateur,
        on_delete=models.CASCADE,
        related_name='enseignant_profile',
        limit_choices_to={'role': 'Enseignant'}
    )

    langue_enseignee = models.CharField(max_length=50)
    niveaux = models.CharField(
        max_length=50,
        help_text="Séparer par virgule: A1,A2,B1,B2,C1"
    )

    qualification = models.CharField(max_length=100, blank=True, null=True)
    experience_annees = models.IntegerField(default=0)

    tarif_horaire = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )

    type_contrat = models.CharField(
        max_length=20,
        choices=CONTRAT_CHOICES
    )

    date_debut_contrat = models.DateField()
    date_fin_contrat = models.DateField(null=True, blank=True)

    heures_travaillees_mois = models.FloatField(default=0)
    salaire_mois = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        default=0
    )

    statut_emploi = models.CharField(
        max_length=20,
        choices=STATUT_EMPLOI_CHOICES,
        default='Actif'
    )

    disponibilite = models.JSONField(
        default=dict,
        blank=True,
        help_text="Disponibilité par jour (JSON format)"
    )

    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'enseignant'
        verbose_name = 'Enseignant'
        verbose_name_plural = 'Enseignants'
        ordering = ['-date_creation']
        indexes = [
            models.Index(fields=['langue_enseignee']),
            models.Index(fields=['type_contrat']),
            models.Index(fields=['statut_emploi']),
        ]

    def __str__(self):
        return f"Prof: {self.user.get_full_name()} ({self.langue_enseignee})"


# ============================================================
# 4. GROUPE
# ============================================================

class Groupe(models.Model):
    """Modèle Groupe"""

    NIVEAU_CHOICES = [
        ('A1', 'A1'),
        ('A2', 'A2'),
        ('B1', 'B1'),
        ('B2', 'B2'),
        ('C1', 'C1'),
    ]

    STATUT_CHOICES = [
        ('Actif', 'Actif'),
        ('Cloture', 'Clôturé'),
        ('Annule', 'Annulé'),
    ]

    nom_groupe = models.CharField(max_length=100)
    langue = models.CharField(max_length=50)
    niveau = models.CharField(
        max_length=5,
        choices=NIVEAU_CHOICES
    )

    enseignant = models.ForeignKey(
        Enseignant,
        on_delete=models.PROTECT,
        related_name='groupes'
    )

    salle = models.CharField(max_length=50)
    capacite_max = models.IntegerField(
        validators=[MinValueValidator(1)]
    )
    nombre_etudiants = models.IntegerField(default=0)

    tarif_mensuel = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )

    date_debut = models.DateField()
    date_fin = models.DateField()
    duree_semaines = models.IntegerField()

    statut_groupe = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default='Actif'
    )

    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'groupe'
        verbose_name = 'Groupe'
        verbose_name_plural = 'Groupes'
        ordering = ['-date_creation']
        indexes = [
            models.Index(fields=['langue', 'niveau']),
            models.Index(fields=['enseignant']),
            models.Index(fields=['statut_groupe']),
        ]

    def __str__(self):
        return f"{self.nom_groupe} - {self.niveau} ({self.langue})"


# ============================================================
# 5. ETUDIANT
# ============================================================

class Etudiant(models.Model):
    """Modèle Étudiant"""

    NIVEAU_CHOICES = [
        ('A1', 'A1'),
        ('A2', 'A2'),
        ('B1', 'B1'),
        ('B2', 'B2'),
        ('C1', 'C1'),
    ]

    GENRE_CHOICES = [
        ('M', 'Masculin'),
        ('F', 'Féminin'),
        ('Autre', 'Autre'),
    ]

    STATUT_CHOICES = [
        ('Actif', 'Actif'),
        ('Suspendu', 'Suspendu'),
        ('Inactif', 'Inactif'),
    ]

    user = models.OneToOneField(
        Utilisateur,
        on_delete=models.CASCADE,
        related_name='etudiant_profile',
        limit_choices_to={'role': 'Etudiant'}
    )

    date_naissance = models.DateField()
    genre = models.CharField(
        max_length=10,
        choices=GENRE_CHOICES,
        blank=True,
        null=True
    )

    parent = models.ForeignKey(
        Parent,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='enfants'
    )

    groupe = models.ForeignKey(
        Groupe,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='etudiants'
    )

    niveau_actuel = models.CharField(
        max_length=5,
        choices=NIVEAU_CHOICES,
        default='A1'
    )

    moyenne_generale = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(0), MaxValueValidator(20)]
    )

    taux_assiduité = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=100,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )

    statut_etudiant = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default='Actif'
    )

    date_inscription = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'etudiant'
        verbose_name = 'Étudiant'
        verbose_name_plural = 'Étudiants'
        ordering = ['user__first_name', 'user__last_name']
        indexes = [
            models.Index(fields=['parent']),
            models.Index(fields=['groupe']),
            models.Index(fields=['niveau_actuel']),
        ]

    def __str__(self):
        return f"{self.user.get_full_name()} - {self.niveau_actuel}"

    def calculer_moyenne(self):
        """Calculer la moyenne générale"""
        notes = self.notes.all()
        if not notes:
            return 0

        total = sum(n.note_obtenue for n in notes)
        return total / len(notes)


# ============================================================
# 6. INSCRIPTION (Many-to-Many explicite)
# ============================================================

class Inscription(models.Model):
    """Modèle Inscription (Étudiant dans Groupe)"""

    STATUT_CHOICES = [
        ('Active', 'Active'),
        ('Suspendue', 'Suspendue'),
        ('Terminee', 'Terminée'),
    ]

    etudiant = models.ForeignKey(
        Etudiant,
        on_delete=models.CASCADE,
        related_name='inscriptions'
    )

    groupe = models.ForeignKey(
        Groupe,
        on_delete=models.CASCADE,
        related_name='inscriptions'
    )

    date_inscription = models.DateTimeField(auto_now_add=True)
    statut_inscription = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default='Active'
    )

    class Meta:
        db_table = 'inscription'
        verbose_name = 'Inscription'
        verbose_name_plural = 'Inscriptions'
        unique_together = ('etudiant', 'groupe')
        ordering = ['-date_inscription']

    def __str__(self):
        return f"{self.etudiant} - {self.groupe}"


# ============================================================
# 7. PLANNING
# ============================================================

class Planning(models.Model):
    """Modèle Planning"""

    JOUR_CHOICES = [
        ('Lundi', 'Lundi'),
        ('Mardi', 'Mardi'),
        ('Mercredi', 'Mercredi'),
        ('Jeudi', 'Jeudi'),
        ('Vendredi', 'Vendredi'),
        ('Samedi', 'Samedi'),
        ('Dimanche', 'Dimanche'),
    ]

    STATUT_CHOICES = [
        ('Planifie', 'Planifié'),
        ('Confirme', 'Confirmé'),
        ('Annule', 'Annulé'),
        ('Reporte', 'Reporté'),
    ]

    RECURENCE_CHOICES = [
        ('Aucune', 'Aucune'),
        ('Hebdomadaire', 'Hebdomadaire'),
        ('Bihebdomadaire', 'Bihebdomadaire'),
        ('Mensuelle', 'Mensuelle'),
    ]

    groupe = models.ForeignKey(
        Groupe,
        on_delete=models.CASCADE,
        related_name='plannings'
    )

    jour = models.CharField(
        max_length=20,
        choices=JOUR_CHOICES
    )
    heure_debut = models.TimeField()
    heure_fin = models.TimeField()
    salle = models.CharField(max_length=50)

    enseignant = models.ForeignKey(
        Enseignant,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='plannings'
    )

    description = models.TextField(blank=True, null=True)
    statut_planning = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default='Planifie'
    )

    recurence = models.CharField(
        max_length=20,
        choices=RECURENCE_CHOICES,
        default='Hebdomadaire'
    )

    date_fin_recurence = models.DateField(null=True, blank=True)
    notes_planning = models.TextField(blank=True, null=True)

    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'planning'
        verbose_name = 'Planning'
        verbose_name_plural = 'Plannings'
        unique_together = ('groupe', 'jour', 'heure_debut')
        ordering = ['jour', 'heure_debut']
        indexes = [
            models.Index(fields=['groupe', 'jour']),
            models.Index(fields=['statut_planning']),
        ]

    def __str__(self):
        return f"{self.groupe} - {self.jour} {self.heure_debut}"


# ============================================================
# 8. SEANCE
# ============================================================

class Seance(models.Model):
    """Modèle Séance"""

    JOUR_CHOICES = [
        ('Lundi', 'Lundi'),
        ('Mardi', 'Mardi'),
        ('Mercredi', 'Mercredi'),
        ('Jeudi', 'Jeudi'),
        ('Vendredi', 'Vendredi'),
        ('Samedi', 'Samedi'),
        ('Dimanche', 'Dimanche'),
    ]

    TYPE_CHOICES = [
        ('Normal', 'Normal'),
        ('Rattrapage', 'Rattrapage'),
        ('Examen', 'Examen'),
    ]

    STATUT_CHOICES = [
        ('Planifiee', 'Planifiée'),
        ('Faite', 'Faite'),
        ('Annulee', 'Annulée'),
        ('Reportee', 'Reportée'),
    ]

    groupe = models.ForeignKey(
        Groupe,
        on_delete=models.CASCADE,
        related_name='seances'
    )

    planning = models.ForeignKey(
        Planning,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    jour = models.CharField(
        max_length=20,
        choices=JOUR_CHOICES
    )
    heure_debut = models.TimeField()
    heure_fin = models.TimeField()
    salle = models.CharField(max_length=50)

    type_seance = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES,
        default='Normal'
    )
    description = models.TextField(blank=True, null=True)

    date_seance = models.DateField()
    statut_seance = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default='Planifiee'
    )

    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'seance'
        verbose_name = 'Séance'
        verbose_name_plural = 'Séances'
        ordering = ['-date_seance', 'heure_debut']
        indexes = [
            models.Index(fields=['groupe', 'date_seance']),
            models.Index(fields=['statut_seance']),
        ]

    def __str__(self):
        return f"{self.groupe} - {self.date_seance} {self.heure_debut}"


# ============================================================
# 9. EVALUATION
# ============================================================

class Evaluation(models.Model):
    """Modèle Évaluation"""

    TYPE_CHOICES = [
        ('Ecrit', 'Écrit'),
        ('Oral', 'Oral'),
        ('Comprehension', 'Compréhension'),
        ('Participation', 'Participation'),
        ('Projet', 'Projet'),
        ('Examen', 'Examen'),
    ]

    STATUT_CHOICES = [
        ('Planifiee', 'Planifiée'),
        ('En_cours', 'En cours'),
        ('Terminee', 'Terminée'),
        ('Annulee', 'Annulée'),
    ]

    groupe = models.ForeignKey(
        Groupe,
        on_delete=models.CASCADE,
        related_name='evaluations'
    )

    titre = models.CharField(max_length=100)
    type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES
    )

    date_evaluation = models.DateField()
    duree_minutes = models.IntegerField(null=True, blank=True)
    description = models.TextField(blank=True, null=True)

    ponderation = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0), MaxValueValidator(100)]
    )

    note_max = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=20
    )

    statut_eval = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default='Planifiee'
    )

    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'evaluation'
        verbose_name = 'Évaluation'
        verbose_name_plural = 'Évaluations'
        ordering = ['-date_evaluation']
        indexes = [
            models.Index(fields=['groupe', 'type']),
            models.Index(fields=['statut_eval']),
        ]

    def __str__(self):
        return f"{self.groupe} - {self.titre}"


# ============================================================
# 10. NOTE
# ============================================================

class Note(models.Model):
    """Modèle Note"""

    NIVEAU_CHOICES = [
        ('A1', 'A1'),
        ('A2', 'A2'),
        ('B1', 'B1'),
        ('B2', 'B2'),
        ('C1', 'C1'),
    ]

    STATUT_PASSAGE_CHOICES = [
        ('Admis', 'Admis'),
        ('Progression', 'Progression'),
        ('Echec', 'Échec'),
    ]

    etudiant = models.ForeignKey(
        Etudiant,
        on_delete=models.CASCADE,
        related_name='notes'
    )

    evaluation = models.ForeignKey(
        Evaluation,
        on_delete=models.CASCADE,
        related_name='notes'
    )

    note_obtenue = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )

    note_max = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=20
    )

    pourcentage = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        editable=False
    )

    niveau_attribue = models.CharField(
        max_length=5,
        choices=NIVEAU_CHOICES,
        default='A1'
    )

    remarque_prof = models.TextField(blank=True, null=True)

    date_saisie = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    statut_passage = models.CharField(
        max_length=20,
        choices=STATUT_PASSAGE_CHOICES,
        default='Progression'
    )

    class Meta:
        db_table = 'note'
        verbose_name = 'Note'
        verbose_name_plural = 'Notes'
        unique_together = ('etudiant', 'evaluation')
        ordering = ['-date_saisie']
        indexes = [
            models.Index(fields=['etudiant', 'evaluation']),
            models.Index(fields=['niveau_attribue']),
        ]

    def save(self, *args, **kwargs):
        """Calculer le pourcentage et le niveau"""
        self.pourcentage = (self.note_obtenue / self.note_max) * 100

        # Attribuer le niveau
        if self.pourcentage >= 80:
            self.niveau_attribue = 'C1'
        elif self.pourcentage >= 65:
            self.niveau_attribue = 'B2'
        elif self.pourcentage >= 50:
            self.niveau_attribue = 'B1'
        elif self.pourcentage >= 35:
            self.niveau_attribue = 'A2'
        else:
            self.niveau_attribue = 'A1'

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.etudiant} - {self.evaluation}: {self.note_obtenue}/{self.note_max}"


# ============================================================
# 11. ABSENCE
# ============================================================

class Absence(models.Model):
    """Modèle Absence"""

    STATUT_CHOICES = [
        ('Present', 'Présent'),
        ('Absent', 'Absent'),
        ('Justifie', 'Justifié'),
        ('Retard', 'Retard'),
    ]

    etudiant = models.ForeignKey(
        Etudiant,
        on_delete=models.CASCADE,
        related_name='absences'
    )

    seance = models.ForeignKey(
        Seance,
        on_delete=models.CASCADE,
        related_name='absences'
    )

    statut_absence = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default='Absent'
    )

    justification = models.CharField(
        max_length=255,
        blank=True,
        null=True
    )
    date_absence = models.DateField()
    raison = models.CharField(
        max_length=100,
        blank=True,
        null=True
    )

    date_saisie = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'absence'
        verbose_name = 'Absence'
        verbose_name_plural = 'Absences'
        unique_together = ('etudiant', 'seance')
        ordering = ['-date_absence']
        indexes = [
            models.Index(fields=['etudiant', 'date_absence']),
            models.Index(fields=['statut_absence']),
        ]

    def __str__(self):
        return f"{self.etudiant} - {self.date_absence}: {self.statut_absence}"


# ============================================================
# 12. PAIEMENT
# ============================================================

class Paiement(models.Model):
    """Modèle Paiement"""

    MODE_CHOICES = [
        ('Especes', 'Espèces'),
        ('Cheque', 'Chèque'),
        ('Virement', 'Virement'),
        ('Carte', 'Carte'),
    ]

    STATUT_CHOICES = [
        ('Paye', 'Payé'),
        ('Partiellement_paye', 'Partiellement payé'),
        ('Impaye', 'Impayé'),
    ]

    etudiant = models.ForeignKey(
        Etudiant,
        on_delete=models.CASCADE,
        related_name='paiements'
    )

    montant_du = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    montant_paye = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )
    solde = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        editable=False
    )

    mode_paiement = models.CharField(
        max_length=20,
        choices=MODE_CHOICES
    )
    date_paiement = models.DateField()
    reference_paiement = models.CharField(
        max_length=50,
        blank=True,
        null=True
    )

    statut_paiement = models.CharField(
        max_length=30,
        choices=STATUT_CHOICES
    )

    periode = models.CharField(
        max_length=20,
        blank=True,
        null=True,
        help_text="Ex: Février 2026"
    )
    date_echeance = models.DateField(null=True, blank=True)

    relances_envoyees = models.IntegerField(default=0)
    derniere_relance = models.DateTimeField(null=True, blank=True)

    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'paiement'
        verbose_name = 'Paiement'
        verbose_name_plural = 'Paiements'
        ordering = ['-date_paiement']
        indexes = [
            models.Index(fields=['etudiant', 'statut_paiement']),
            models.Index(fields=['date_paiement']),
        ]

    def save(self, *args, **kwargs):
        """Calculer le solde"""
        self.solde = self.montant_du - self.montant_paye
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.etudiant} - {self.montant_paye}DA ({self.statut_paiement})"


# ============================================================
# 13. BULLETIN DE SALAIRE
# ============================================================

class BulletinSalaire(models.Model):
    """Modèle Bulletin de Salaire"""

    STATUT_CHOICES = [
        ('En_attente', 'En attente'),
        ('Paye', 'Payé'),
        ('Rejete', 'Rejeté'),
    ]

    MODE_PAIEMENT_CHOICES = [
        ('Virement', 'Virement'),
        ('Especes', 'Espèces'),
        ('Cheque', 'Chèque'),
    ]

    enseignant = models.ForeignKey(
        Enseignant,
        on_delete=models.CASCADE,
        related_name='bulletins'
    )

    periode = models.CharField(max_length=20)
    heures_travaillees = models.FloatField(
        validators=[MinValueValidator(0)]
    )
    tarif_horaire = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)]
    )

    salaire_brut = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        editable=False
    )

    assurance = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )
    cotisations = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )
    autres_retenues = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True
    )

    total_retenues = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        editable=False
    )
    salaire_net = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        editable=False
    )

    mode_paiement = models.CharField(
        max_length=20,
        choices=MODE_PAIEMENT_CHOICES,
        null=True,
        blank=True
    )

    date_paiement = models.DateField(null=True, blank=True)
    statut_paiement = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default='En_attente'
    )

    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'bulletin_salaire'
        verbose_name = 'Bulletin de Salaire'
        verbose_name_plural = 'Bulletins de Salaire'
        ordering = ['-date_creation']
        indexes = [
            models.Index(fields=['enseignant', 'periode']),
            models.Index(fields=['statut_paiement']),
        ]

    def save(self, *args, **kwargs):
        """Calculer les montants — fixed: float * Decimal TypeError"""
        from decimal import Decimal
        heures = Decimal(str(self.heures_travaillees or 0))
        tarif  = Decimal(str(self.tarif_horaire or 0))
        self.salaire_brut = heures * tarif

        total_retenues = Decimal('0')
        if self.assurance:
            total_retenues += Decimal(str(self.assurance))
        if self.cotisations:
            total_retenues += Decimal(str(self.cotisations))
        if self.autres_retenues:
            total_retenues += Decimal(str(self.autres_retenues))

        self.total_retenues = total_retenues
        self.salaire_net = self.salaire_brut - self.total_retenues

        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.enseignant} - {self.periode}: {self.salaire_net}DA"


# ============================================================
# 14. RESSOURCE
# ============================================================

class Ressource(models.Model):
    """Modèle Ressource"""

    TYPE_CHOICES = [
        ('PDF', 'PDF'),
        ('PPT', 'PPT'),
        ('Video', 'Vidéo'),
        ('Audio', 'Audio'),
        ('Exercice', 'Exercice'),
        ('Lien', 'Lien'),
    ]

    NIVEAU_CHOICES = [
        ('A1', 'A1'),
        ('A2', 'A2'),
        ('B1', 'B1'),
        ('B2', 'B2'),
        ('C1', 'C1'),
    ]

    enseignant = models.ForeignKey(
        Enseignant,
        on_delete=models.CASCADE,
        related_name='ressources'
    )

    groupe = models.ForeignKey(
        Groupe,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ressources'
    )

    titre = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)

    type_ressource = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES
    )
    chemin_fichier = models.FileField(
        upload_to='ressources/',
        blank=True,
        null=True
    )
    url_lien = models.URLField(blank=True, null=True)
    taille_fichier = models.FloatField(null=True, blank=True)

    niveau = models.CharField(
        max_length=5,
        choices=NIVEAU_CHOICES,
        null=True,
        blank=True
    )

    visible_etudiants = models.BooleanField(default=True)
    date_disponibilite = models.DateField(auto_now_add=True)
    nombre_telechargements = models.IntegerField(default=0)

    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ressource'
        verbose_name = 'Ressource'
        verbose_name_plural = 'Ressources'
        ordering = ['-date_creation']
        indexes = [
            models.Index(fields=['type_ressource', 'visible_etudiants']),
            models.Index(fields=['enseignant']),
        ]

    def __str__(self):
        return f"{self.titre} ({self.type_ressource})"


# ============================================================
# 15. MESSAGE
# ============================================================

class Message(models.Model):
    """Modèle Message"""

    STATUT_CHOICES = [
        ('Envoye', 'Envoyé'),
        ('Lu', 'Lu'),
        ('Repondu', 'Répondu'),
        ('Archive', 'Archivé'),
    ]

    expediteur = models.ForeignKey(
        Utilisateur,
        on_delete=models.CASCADE,
        related_name='messages_envoyes'
    )

    destinataire = models.ForeignKey(
        Utilisateur,
        on_delete=models.CASCADE,
        related_name='messages_recus'
    )

    sujet = models.CharField(max_length=100, blank=True, null=True)
    contenu = models.TextField()

    date_envoi = models.DateTimeField(auto_now_add=True)
    date_lecture = models.DateTimeField(null=True, blank=True)
    lu = models.BooleanField(default=False)

    statut_message = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default='Envoye'
    )

    nombre_pieces_jointes = models.IntegerField(default=0)

    class Meta:
        db_table = 'message'
        verbose_name = 'Message'
        verbose_name_plural = 'Messages'
        ordering = ['-date_envoi']
        indexes = [
            models.Index(fields=['expediteur', 'destinataire']),
            models.Index(fields=['lu']),
        ]

    def __str__(self):
        return f"{self.expediteur} → {self.destinataire}: {self.sujet}"


# ============================================================
# 16. PIECE JOINTE
# ============================================================

class PieceJointe(models.Model):
    """Modèle Pièce Jointe"""

    message = models.ForeignKey(
        Message,
        on_delete=models.CASCADE,
        related_name='pieces_jointes'
    )

    nom_fichier = models.CharField(max_length=255)
    chemin_fichier = models.FileField(upload_to='messages/')
    taille_fichier = models.FloatField(null=True, blank=True)
    type_fichier = models.CharField(max_length=50, blank=True, null=True)

    date_upload = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'piece_jointe'
        verbose_name = 'Pièce Jointe'
        verbose_name_plural = 'Pièces Jointes'
        ordering = ['-date_upload']

    def __str__(self):
        return f"{self.nom_fichier}"


# ============================================================
# 17. NOTIFICATION
# ============================================================

class Notification(models.Model):
    """Modèle Notification"""

    TYPE_CHOICES = [
        ('Notes', 'Notes'),
        ('Absence', 'Absence'),
        ('Paiement', 'Paiement'),
        ('Planning', 'Planning'),
        ('Message', 'Message'),
        ('Passage_Niveau', 'Passage Niveau'),
        ('Alerte', 'Alerte'),
        ('Autre', 'Autre'),
    ]

    CANAL_CHOICES = [
        ('Email', 'Email'),
        ('SMS', 'SMS'),
        ('App', 'App'),
        ('Tous', 'Tous'),
    ]

    STATUT_CHOICES = [
        ('Non_lu', 'Non lu'),
        ('Lu', 'Lu'),
        ('Archive', 'Archivé'),
    ]

    utilisateur = models.ForeignKey(
        Utilisateur,
        on_delete=models.CASCADE,
        related_name='notifications'
    )

    type_notification = models.CharField(
        max_length=50,
        choices=TYPE_CHOICES
    )
    titre = models.CharField(max_length=100)
    contenu = models.TextField()

    canal = models.CharField(
        max_length=20,
        choices=CANAL_CHOICES
    )
    statut_notification = models.CharField(
        max_length=20,
        choices=STATUT_CHOICES,
        default='Non_lu'
    )

    lien_action = models.CharField(max_length=255, blank=True, null=True)
    urgent = models.BooleanField(default=False)

    date_creation = models.DateTimeField(auto_now_add=True)
    date_lecture = models.DateTimeField(null=True, blank=True)
    date_programmee = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'notification'
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        ordering = ['-date_creation']
        indexes = [
            models.Index(fields=['utilisateur', 'statut_notification']),
            models.Index(fields=['type_notification']),
        ]

    def __str__(self):
        return f"{self.utilisateur} - {self.titre}"


# ============================================================
# 18. PREFERENCE NOTIFICATION
# ============================================================

class PreferenceNotification(models.Model):
    """Modèle Préférence de Notification"""

    TYPE_CHOICES = [
        ('Notes', 'Notes'),
        ('Absence', 'Absence'),
        ('Paiement', 'Paiement'),
        ('Planning', 'Planning'),
        ('Message', 'Message'),
        ('Passage_Niveau', 'Passage Niveau'),
        ('Alerte', 'Alerte'),
    ]

    utilisateur = models.ForeignKey(
        Utilisateur,
        on_delete=models.CASCADE,
        related_name='preferences_notification'
    )

    type_notification = models.CharField(
        max_length=50,
        choices=TYPE_CHOICES
    )

    canal_email = models.BooleanField(default=True)
    canal_sms = models.BooleanField(default=True)
    canal_app = models.BooleanField(default=True)

    heure_min_envoi = models.TimeField(default='07:00:00')
    heure_max_envoi = models.TimeField(default='22:00:00')

    jours_actives = models.CharField(
        max_length=50,
        default='Lun,Mar,Mer,Jeu,Ven,Sam,Dim'
    )

    actif = models.BooleanField(default=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'preference_notification'
        verbose_name = 'Préférence de Notification'
        verbose_name_plural = 'Préférences de Notification'
        unique_together = ('utilisateur', 'type_notification')

    def __str__(self):
        return f"{self.utilisateur} - {self.type_notification}"


# ============================================================
# 19. AUDIT
# ============================================================

class Audit(models.Model):
    """Modèle Audit"""

    ACTION_CHOICES = [
        ('CREATE', 'Créer'),
        ('READ', 'Lire'),
        ('UPDATE', 'Modifier'),
        ('DELETE', 'Supprimer'),
        ('HARD_DELETE', 'Supprimer définitivement'),
        ('LOGIN', 'Connexion'),
        ('LOGOUT', 'Déconnexion'),
        ('DOWNLOAD', 'Télécharger'),
        ('EXPORT', 'Exporter'),
    ]

    RESULTAT_CHOICES = [
        ('Succes', 'Succès'),
        ('Erreur', 'Erreur'),
    ]

    utilisateur = models.ForeignKey(
        Utilisateur,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audits'
    )

    action = models.CharField(
        max_length=20,
        choices=ACTION_CHOICES
    )
    entite = models.CharField(max_length=50, blank=True, null=True)
    id_entite = models.IntegerField(null=True, blank=True)

    ancienne_valeur = models.JSONField(null=True, blank=True)
    nouvelle_valeur = models.JSONField(null=True, blank=True)

    date_action = models.DateTimeField(auto_now_add=True)
    adresse_ip = models.CharField(max_length=15, blank=True, null=True)
    navigateur = models.CharField(max_length=100, blank=True, null=True)

    resultat = models.CharField(
        max_length=20,
        choices=RESULTAT_CHOICES,
        default='Succes'
    )
    message_erreur = models.CharField(max_length=255, blank=True, null=True)
    raison = models.CharField(max_length=255, blank=True, null=True)

    class Meta:
        db_table = 'audit'
        verbose_name = 'Audit'
        verbose_name_plural = 'Audits'
        ordering = ['-date_action']
        indexes = [
            models.Index(fields=['utilisateur', 'date_action']),
            models.Index(fields=['entite', 'id_entite']),
            models.Index(fields=['action']),
        ]

    def __str__(self):
        return f"{self.utilisateur} - {self.action} ({self.date_action})"


# ============================================================
# 20. PARAMETRE SYSTEME
# ============================================================

class ParametreSysteme(models.Model):
    """Modèle Paramètre Système"""

    TYPE_CHOICES = [
        ('String', 'Texte'),
        ('Integer', 'Nombre entier'),
        ('Float', 'Nombre décimal'),
        ('Boolean', 'Booléen'),
        ('Enum', 'Énumération'),
    ]

    nom_parametre = models.CharField(
        max_length=100,
        unique=True
    )
    valeur = models.CharField(max_length=255, blank=True, null=True)
    type = models.CharField(
        max_length=20,
        choices=TYPE_CHOICES
    )
    description = models.TextField(blank=True, null=True)

    modifiable = models.BooleanField(default=True)

    date_creation = models.DateTimeField(auto_now_add=True)
    date_modification = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'parametre_systeme'
        verbose_name = 'Paramètre Système'
        verbose_name_plural = 'Paramètres Système'
        ordering = ['nom_parametre']
        indexes = [
            models.Index(fields=['nom_parametre']),
        ]

    def __str__(self):
        return f"{self.nom_parametre} = {self.valeur}"