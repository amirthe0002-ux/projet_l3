# api/routing.py
from django.urls import re_path
from channels.generic.websocket import WebsocketConsumer
from . import consumers


class SilentRejectConsumer(WebsocketConsumer):
    def connect(self):
        self.close()


websocket_urlpatterns = [
    re_path(r'^ws/notifications/$', consumers.NotificationConsumer.as_asgi()),
    re_path(r'.*', SilentRejectConsumer.as_asgi()),  # catch-all — must be last
]