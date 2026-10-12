"""Gestionnaire de connexions WebSocket en mémoire.

Chaque client a sa propre file d'envoi : une diffusion ne bloque jamais sur
un client lent, et l'ordre des messages est garanti par connexion.
"""

import asyncio
import json
import logging

from fastapi import WebSocket

log = logging.getLogger("green.ws")

QUEUE_MAX = 500


class Client:
    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.queue: asyncio.Queue[str] = asyncio.Queue(maxsize=QUEUE_MAX)
        self.task: asyncio.Task | None = None

    async def pump(self) -> None:
        try:
            while True:
                msg = await self.queue.get()
                await self.ws.send_text(msg)
        except Exception:  # connexion fermée : le récepteur nettoiera
            pass


class ConnectionManager:
    def __init__(self) -> None:
        self.clients: set[Client] = set()

    def register(self, ws: WebSocket) -> Client:
        client = Client(ws)
        client.task = asyncio.create_task(client.pump())
        self.clients.add(client)
        return client

    def unregister(self, client: Client) -> None:
        self.clients.discard(client)
        if client.task:
            client.task.cancel()

    def send(self, client: Client, payload: dict) -> None:
        self._put(client, json.dumps(payload, ensure_ascii=False))

    def broadcast(self, payload: dict) -> None:
        msg = json.dumps(payload, ensure_ascii=False)
        for client in list(self.clients):
            self._put(client, msg)

    def _put(self, client: Client, msg: str) -> None:
        try:
            client.queue.put_nowait(msg)
        except asyncio.QueueFull:
            # Client bloqué : on coupe, il se reconnectera et recevra un snapshot.
            log.warning("file WebSocket pleine, client déconnecté")
            self.unregister(client)
            asyncio.create_task(_safe_close(client.ws))


async def _safe_close(ws: WebSocket) -> None:
    try:
        await ws.close(code=1013)
    except Exception:
        pass
