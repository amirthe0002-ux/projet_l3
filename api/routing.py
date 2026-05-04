# api/routing.py
from django.urls import re_path
from channels.generic.websocket import WebsocketConsumer
from . import consumers


class SilentRejectConsumer(WebsocketConsumer):
    def connect(self):
        self.close()


websocket_urlpatterns = [
    # Notifications — inchangé
    re_path(r'^ws/notifications/$', consumers.NotificationConsumer.as_asgi()),

    # ✅ Chat temps réel
    # ws://host/ws/chat/42/?token=<jwt>  (42 = ID de l'autre utilisateur)
    re_path(r'^ws/chat/(?P<other_user_id>\d+)/$', consumers.ChatConsumer.as_asgi()),

    # Catch-all — doit rester en dernier
    re_path(r'.*', SilentRejectConsumer.as_asgi()),
]