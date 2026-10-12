"""API FastAPI + WebSocket + service du frontend compilé."""

import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal, Optional

import io

import segno
from fastapi import Body, FastAPI, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import logic
from .db import create_schema, drop_schema, get_session
from .config import settings
from .seed import ensure_rooms, seed, seed_if_empty, seed_is_stale
from .ws import ConnectionManager

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

manager = ConnectionManager()
# Toutes les écritures sont sérialisées : SQLite + 10 chambres, pas besoin de plus.
write_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_schema()
    if settings.demo:
        with get_session() as s:
            stale = seed_is_stale(s)
        if stale:
            # Données d'une démo d'un autre jour : on repart d'un historique frais.
            drop_schema()
            create_schema()
        with get_session() as s:
            seed_if_empty(s)
    else:
        # Production : jamais de données fictives ni d'effacement automatique.
        with get_session() as s:
            ensure_rooms(s, settings.rooms, settings.suites)
    yield


app = FastAPI(title="Green Housekeeping · SunyGreen", lifespan=lifespan)


@app.exception_handler(logic.BusinessError)
async def business_error(_req: Request, exc: logic.BusinessError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


class ToggleIn(BaseModel):
    to: Optional[Literal["on", "off"]] = None


class StateIn(BaseModel):
    state: Literal["on", "off"]


class StayIn(BaseModel):
    nights: int = Field(ge=1, le=30)


def _snapshot(reason: str) -> dict:
    with get_session() as s:
        return {"type": "snapshot", "reason": reason, "rooms": logic.all_rooms(s)}


async def _mutate(fn, *args) -> dict:
    """Écrit, puis diffuse l'état complet de la chambre à tous les clients (règle 4)."""
    async with write_lock:
        with get_session() as s:
            room = fn(s, *args)
        manager.broadcast({"type": "state", "room": room})
    return room


# ------------------------------------------------------------------- API

@app.get("/api/health")
async def health():
    return {"ok": True, "clients": len(manager.clients)}


@app.get("/api/config")
async def get_config():
    return settings.public()


@app.get("/api/qr.svg")
async def qr_svg(data: str = Query(min_length=1, max_length=400)):
    """QR code d'appairage d'un écran (adresse d'un bouton de chambre)."""
    buf = io.BytesIO()
    segno.make(data, micro=False, error="m").save(buf, kind="svg", scale=8, border=2, xmldecl=False)
    return Response(buf.getvalue(), media_type="image/svg+xml", headers={"Cache-Control": "max-age=86400"})


@app.get("/api/rooms")
async def list_rooms():
    with get_session() as s:
        return logic.all_rooms(s)


@app.get("/api/rooms/{number}")
async def get_room(number: int):
    with get_session() as s:
        return logic.room_detail(s, number)


@app.post("/api/rooms/{number}/toggle")
async def toggle(number: int, body: Optional[ToggleIn] = Body(None)):
    return await _mutate(logic.guest_toggle, number, body.to if body else None)


@app.put("/api/rooms/{number}/state")
async def force_state(number: int, body: StateIn):
    return await _mutate(logic.staff_force, number, body.state)


@app.put("/api/rooms/{number}/stay")
async def put_stay(number: int, body: StayIn):
    return await _mutate(logic.set_stay, number, body.nights)


@app.delete("/api/rooms/{number}/stay")
async def delete_stay(number: int):
    return await _mutate(logic.end_stay, number)


@app.post("/api/demo/reset")
async def demo_reset():
    if not settings.demo:
        raise logic.BusinessError(403, "Réinitialisation indisponible en production.")
    async with write_lock:
        drop_schema()
        create_schema()
        with get_session() as s:
            seed(s)
        snap = _snapshot("reset")
        manager.broadcast(snap)
    return snap["rooms"]


@app.websocket("/ws")
async def websocket(ws: WebSocket):
    await ws.accept()
    # Snapshot et inscription atomiques vis-à-vis des écritures : aucun
    # changement ne peut se glisser entre les deux.
    async with write_lock:
        client = manager.register(ws)
        manager.send(client, _snapshot("connect"))
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            if msg.get("type") == "ping":
                manager.send(client, {"type": "pong", "t": msg.get("t")})
            elif msg.get("type") == "resync":
                manager.send(client, _snapshot("resync"))
    except WebSocketDisconnect:
        pass
    finally:
        manager.unregister(client)


# -------------------------------------------------------------- frontend

if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/", include_in_schema=False)
    async def root():
        return RedirectResponse("/dashboard")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        if path.startswith("api/"):
            return JSONResponse(status_code=404, content={"detail": "Route inconnue."})
        file = (FRONTEND_DIST / path).resolve()
        if path and file.is_file() and FRONTEND_DIST in file.parents:
            return FileResponse(file)
        return FileResponse(FRONTEND_DIST / "index.html", headers={"Cache-Control": "no-cache"})
else:

    @app.get("/", include_in_schema=False)
    async def no_frontend():
        return JSONResponse({"detail": "Frontend non compilé : lancez `python run.py`."})
