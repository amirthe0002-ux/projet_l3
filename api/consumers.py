# api/consumers.py
# WebSocket consumer — each logged-in user gets their own room

import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone


class NotificationConsumer(AsyncWebsocketConsumer):
    """
    WebSocket endpoint: ws://host/ws/notifications/
    Each user joins a personal group: notifications_<user_id>
    """

    async def connect(self):
        # Authenticate via JWT in query string or session
        user = await self.get_user()

        if not user or not user.is_authenticated:
            await self.close(code=4001)
            return

        self.user    = user
        self.room    = f'notifications_{user.id}'

        # Join personal channel group
        await self.channel_layer.group_add(self.room, self.channel_name)
        await self.accept()

        # Send unread count immediately on connect
        count = await self.get_unread_count(user)
        await self.send(text_data=json.dumps({
            'type':         'unread_count',
            'count':        count,
        }))

    async def disconnect(self, close_code):
        if hasattr(self, 'room'):
            await self.channel_layer.group_discard(self.room, self.channel_name)

    async def receive(self, text_data):
        """Handle messages FROM the client (e.g. mark-as-read)"""
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

    # ── Channel layer event handlers (called by send_notification helper) ──

    async def notification_message(self, event):
        """Receives event from channel layer, forwards to WebSocket client"""
        await self.send(text_data=json.dumps({
            'type':    'notification',
            'id':      event['id'],
            'titre':   event['titre'],
            'contenu': event['contenu'],
            'notif_type': event.get('notif_type', 'Info'),
            'urgent':  event.get('urgent', False),
            'lien':    event.get('lien', ''),
            'date':    event.get('date', ''),
        }))

    async def unread_update(self, event):
        await self.send(text_data=json.dumps({
            'type':  'unread_count',
            'count': event['count'],
        }))

    # ── Database helpers ──

    @database_sync_to_async
    def get_user(self):
        """
        Authenticate from JWT token passed as query param:
        ws://host/ws/notifications/?token=<access_token>
        """
        from rest_framework_simplejwt.authentication import JWTAuthentication
        from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

        query_string = self.scope.get('query_string', b'').decode()
        token = None
        for part in query_string.split('&'):
            if part.startswith('token='):
                token = part[6:]
                break

        if not token:
            # Try session-based auth as fallback
            return self.scope.get('user')

        try:
            jwt_auth = JWTAuthentication()
            validated = jwt_auth.get_validated_token(token)
            return jwt_auth.get_user(validated)
        except (InvalidToken, TokenError):
            return None

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