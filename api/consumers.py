# api/consumers.py
# WebSocket consumers:
#   NotificationConsumer — ws/notifications/
#   ChatConsumer         — ws/chat/<other_user_id>/

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone


# ══════════════════════════════════════════════════════════════
# SHARED AUTH HELPER (utilisé par les deux consumers)
# ══════════════════════════════════════════════════════════════

async def authenticate_from_scope(scope):
    """
    Authentifie l'utilisateur depuis le JWT passé en query string.
    ws://host/ws/.../?token=<access_token>
    """
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

    @database_sync_to_async
    def _get_user(token_str):
        try:
            jwt_auth  = JWTAuthentication()
            validated = jwt_auth.get_validated_token(token_str)
            return jwt_auth.get_user(validated)
        except (InvalidToken, TokenError):
            return None

    query_string = scope.get('query_string', b'').decode()
    token = None
    for part in query_string.split('&'):
        if part.startswith('token='):
            token = part[6:]
            break

    if not token:
        return scope.get('user')   # fallback session auth

    return await _get_user(token)


# ══════════════════════════════════════════════════════════════
# NOTIFICATION CONSUMER (inchangé)
# ══════════════════════════════════════════════════════════════

class NotificationConsumer(AsyncWebsocketConsumer):
    """
    WebSocket endpoint: ws://host/ws/notifications/?token=<jwt>
    Chaque utilisateur rejoint son groupe personnel : notifications_<user_id>
    """

    async def connect(self):
        user = await authenticate_from_scope(self.scope)

        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.user = user
        self.room = f'notifications_{user.id}'

        await self.channel_layer.group_add(self.room, self.channel_name)
        await self.accept()

        # Envoyer le nombre de non lus immédiatement
        count = await self.get_unread_count(user)
        await self.send(text_data=json.dumps({
            'type':  'unread_count',
            'count': count,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, 'room'):
            await self.channel_layer.group_discard(self.room, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        action = data.get('action')

        if action == 'mark_read':
            notif_id = data.get('id')
            if notif_id:
                await self.mark_notification_read(notif_id)
                count = await self.get_unread_count(self.user)
                await self.send(text_data=json.dumps({
                    'type':  'unread_count',
                    'count': count,
                }))

        elif action == 'mark_all_read':
            await self.mark_all_read(self.user)
            await self.send(text_data=json.dumps({
                'type':  'unread_count',
                'count': 0,
            }))

        elif action == 'ping':
            await self.send(text_data=json.dumps({'type': 'pong'}))

    # ── Channel layer event handlers ──────────────────────────

    async def notification_message(self, event):
        await self.send(text_data=json.dumps({
            'type':       'notification',
            'id':         event['id'],
            'titre':      event['titre'],
            'contenu':    event['contenu'],
            'notif_type': event.get('notif_type', 'Info'),
            'urgent':     event.get('urgent', False),
            'lien':       event.get('lien', ''),
            'date':       event.get('date', ''),
        }))

    async def unread_update(self, event):
        await self.send(text_data=json.dumps({
            'type':  'unread_count',
            'count': event['count'],
        }))

    # ── DB helpers ────────────────────────────────────────────

    @database_sync_to_async
    def get_unread_count(self, user):
        from .models import Notification
        return Notification.objects.filter(
            utilisateur=user,
            statut_notification='Non_lu'
        ).count()

    @database_sync_to_async
    def mark_notification_read(self, notif_id):
        from .models import Notification
        Notification.objects.filter(
            id=notif_id,
            utilisateur=self.user
        ).update(
            statut_notification='Lu',
            date_lecture=timezone.now()
        )

    @database_sync_to_async
    def mark_all_read(self, user):
        from .models import Notification
        Notification.objects.filter(
            utilisateur=user,
            statut_notification='Non_lu'
        ).update(
            statut_notification='Lu',
            date_lecture=timezone.now()
        )


# ══════════════════════════════════════════════════════════════
# CHAT CONSUMER  — NOUVEAU
# ws://host/ws/chat/<other_user_id>/?token=<jwt>
#
# Room name = chat_<min_id>_<max_id>
# → Les deux participants partagent le même groupe Channel Layer
# → Un message envoyé est broadcasté aux deux en temps réel
# ══════════════════════════════════════════════════════════════

class ChatConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        user = await authenticate_from_scope(self.scope)

        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.user      = user
        self.other_id  = int(self.scope['url_route']['kwargs']['other_user_id'])

        # Room partagée entre les 2 participants (toujours le même nom peu importe qui ouvre)
        lo, hi        = sorted([user.id, self.other_id])
        self.room     = f'chat_{lo}_{hi}'

        await self.channel_layer.group_add(self.room, self.channel_name)
        await self.accept()

        # Envoyer l'historique des 50 derniers messages au client
        history = await self.get_history(user.id, self.other_id)
        await self.send(text_data=json.dumps({
            'type':     'history',
            'messages': history,
        }))

        # Marquer les messages reçus non lus comme lus
        await self.mark_messages_read(receiver_id=user.id, sender_id=self.other_id)

        # Informer l'autre participant que ses messages ont été lus
        await self.channel_layer.group_send(self.room, {
            'type':        'chat_read',
            'reader_id':   user.id,
        })

    async def disconnect(self, close_code):
        if hasattr(self, 'room'):
            await self.channel_layer.group_discard(self.room, self.channel_name)

    async def receive(self, text_data):
        """
        Le client envoie :
        { "action": "send", "contenu": "Bonjour !" }
        { "action": "ping" }
        """
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            return

        action = data.get('action')

        if action == 'send':
            contenu = (data.get('contenu') or '').strip()
            if not contenu:
                return

            # Sauvegarder en DB
            msg = await self.save_message(
                sender_id   = self.user.id,
                receiver_id = self.other_id,
                contenu     = contenu,
            )
            if not msg:
                return

            # Broadcaster aux deux participants
            await self.channel_layer.group_send(self.room, {
                'type':           'chat_message',
                'id':             msg['id'],
                'contenu':        msg['contenu'],
                'expediteur':     msg['expediteur'],
                'expediteur_nom': msg['expediteur_nom'],
                'destinataire':   msg['destinataire'],
                'date_envoi':     msg['date_envoi'],
                'lu':             False,
            })

            # Envoyer aussi une notification push à l'autre utilisateur
            await self.channel_layer.group_send(
                f'notifications_{self.other_id}',
                {
                    'type':       'notification_message',
                    'id':         -1,  # pas une vraie notification DB
                    'titre':      f'Message de {self.user.get_full_name() or self.user.email}',
                    'contenu':    contenu[:80] + ('…' if len(contenu) > 80 else ''),
                    'notif_type': 'Message',
                    'urgent':     False,
                    'lien':       '/messagerie/',
                    'date':       msg['date_envoi'],
                }
            )

        elif action == 'ping':
            await self.send(text_data=json.dumps({'type': 'pong'}))

    # ── Channel layer event handlers ──────────────────────────

    async def chat_message(self, event):
        """Reçoit un message du Channel Layer, le forward au WebSocket client."""
        await self.send(text_data=json.dumps({
            'type':           'message',
            'id':             event['id'],
            'contenu':        event['contenu'],
            'expediteur':     event['expediteur'],
            'expediteur_nom': event['expediteur_nom'],
            'destinataire':   event['destinataire'],
            'date_envoi':     event['date_envoi'],
            'lu':             event.get('lu', False),
        }))

    async def chat_read(self, event):
        """L'autre participant a lu les messages → mettre à jour les ✓✓."""
        await self.send(text_data=json.dumps({
            'type':      'read',
            'reader_id': event['reader_id'],
        }))

    # ── DB helpers ────────────────────────────────────────────

    @database_sync_to_async
    def get_history(self, user_id, other_id):
        from .models import Message
        msgs = Message.objects.filter(
            expediteur_id=user_id, destinataire_id=other_id
        ) | Message.objects.filter(
            expediteur_id=other_id, destinataire_id=user_id
        )
        msgs = msgs.select_related('expediteur').order_by('-date_envoi')[:50]

        result = []
        for m in reversed(list(msgs)):
            result.append({
                'id':             m.id,
                'contenu':        m.contenu,
                'expediteur':     m.expediteur_id,
                'expediteur_nom': m.expediteur.get_full_name() or m.expediteur.email,
                'destinataire':   m.destinataire_id,
                'date_envoi':     m.date_envoi.isoformat(),
                'lu':             m.lu,
            })
        return result

    @database_sync_to_async
    def save_message(self, sender_id, receiver_id, contenu):
        from .models import Message, Utilisateur
        try:
            sender   = Utilisateur.objects.get(pk=sender_id)
            receiver = Utilisateur.objects.get(pk=receiver_id)
            m = Message.objects.create(
                expediteur   = sender,
                destinataire = receiver,
                contenu      = contenu,
                sujet        = 'Message',
                lu           = False,
            )
            return {
                'id':             m.id,
                'contenu':        m.contenu,
                'expediteur':     sender_id,
                'expediteur_nom': sender.get_full_name() or sender.email,
                'destinataire':   receiver_id,
                'date_envoi':     m.date_envoi.isoformat(),
            }
        except Exception as e:
            print(f'[ChatConsumer] save_message error: {e}')
            return None

    @database_sync_to_async
    def mark_messages_read(self, receiver_id, sender_id):
        from .models import Message
        Message.objects.filter(
            expediteur_id   = sender_id,
            destinataire_id = receiver_id,
            lu              = False,
        ).update(lu=True)