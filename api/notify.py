# api/notify.py
# Helper — call this anywhere in views.py to push a real-time notification

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone
from .models import Notification


def send_notification(user, titre, contenu, notif_type='Info', urgent=False, lien=''):
    """
    Creates a Notification in DB AND pushes it live via WebSocket.

    Usage in views.py:
        from .notify import send_notification
        send_notification(
            user=etudiant.user,
            titre='Nouvelle note disponible',
            contenu='Votre note de grammaire a été publiée : 15/20',
            notif_type='Note',
            urgent=False,
        )
    """
    # 1. Save to database
    notif = Notification.objects.create(
        utilisateur=user,
        type_notification=notif_type,
        titre=titre,
        contenu=contenu,
        canal='App',
        urgent=urgent,
        lien_action=lien,
        statut_notification='Non_lu',
    )

    # 2. Push via WebSocket
    channel_layer = get_channel_layer()
    room = f'notifications_{user.id}'

    unread_count = Notification.objects.filter(
        utilisateur=user,
        statut_notification='Non_lu'
    ).count()

    try:
        async_to_sync(channel_layer.group_send)(room, {
            'type':      'notification_message',
            'id':        notif.id,
            'titre':     titre,
            'contenu':   contenu,
            'notif_type': notif_type,
            'urgent':    urgent,
            'lien':      lien,
            'date':      timezone.now().isoformat(),
        })
        async_to_sync(channel_layer.group_send)(room, {
            'type':  'unread_update',
            'count': unread_count,
        })
    except Exception as e:
        # WebSocket push failed (Redis down?) — DB record still exists, no crash
        pass

    return notif


def send_notification_to_role(role, titre, contenu, **kwargs):
    """Broadcast to ALL users of a given role"""
    from .models import Utilisateur
    users = Utilisateur.objects.filter(role=role, statut='Actif')
    for user in users:
        send_notification(user, titre, contenu, **kwargs)


def send_notification_to_groupe(groupe, titre, contenu, **kwargs):
    """Notify all active students in a group"""
    from .models import Etudiant
    etudiants = Etudiant.objects.filter(groupe=groupe, statut_etudiant='Actif').select_related('user')
    for etudiant in etudiants:
        send_notification(etudiant.user, titre, contenu, **kwargs)