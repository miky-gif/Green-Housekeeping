"""API FastAPI + WebSocket + service du frontend compilé."""

import asyncio
import csv
import io
import json
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path
from typing import Literal, Optional

import segno
from fastapi import Body, Depends, FastAPI, Query, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlmodel import select

from . import auth, logic, program, stats
from .config import settings
from .db import create_schema, drop_room_data, drop_schema, get_session
from .models import User, utcnow
from .seed import bootstrap_production, seed, seed_if_empty, seed_is_stale, seed_outdated
from .ws import ConnectionManager

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"

manager = ConnectionManager()
# Toutes les écritures sont sérialisées : SQLite + quelques dizaines de chambres, pas besoin de plus.
write_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    create_schema()
    if settings.demo:
        with get_session() as s:
            stale = seed_is_stale(s) or seed_outdated(s)
        if stale:
            # Données d'une démo d'un autre jour : on repart d'un historique frais.
            drop_schema()
            create_schema()
        with get_session() as s:
            seed_if_empty(s)
    else:
        # Production : jamais de données fictives ni d'effacement automatique.
        with get_session() as s:
            bootstrap_production(s, settings.rooms, settings.suites)
    yield


app = FastAPI(title="GreenKeeping · Green Housekeeping", lifespan=lifespan)


@app.exception_handler(logic.BusinessError)
async def business_error(_req: Request, exc: logic.BusinessError):
    return JSONResponse(status_code=exc.status, content={"detail": exc.message})


Staff = Depends(auth.current_user)
Admin = Depends(auth.admin_user)


class ToggleIn(BaseModel):
    to: Optional[Literal["on", "off"]] = None


class StateIn(BaseModel):
    state: Literal["on", "off"]


class StayIn(BaseModel):
    nights: int = Field(ge=1, le=30)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=1, max_length=200)
    remember: bool = False


class PasswordIn(BaseModel):
    current: str = Field(min_length=1, max_length=200)
    new: str = Field(min_length=8, max_length=200)


class UserIn(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    name: str = Field(min_length=1, max_length=120)
    title: str = Field("Gouvernante d'étage", max_length=120)
    role: Literal["admin", "member"] = "member"


class UserPatch(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=120)
    title: Optional[str] = Field(None, max_length=120)
    role: Optional[Literal["admin", "member"]] = None
    reset_password: bool = False


class RoomIn(BaseModel):
    number: int = Field(ge=1, le=99_999)
    room_type: str = Field("Chambre", max_length=60)


class VoucherIn(BaseModel):
    status: Literal["emis", "remis", "annule"]


def _snapshot(reason: str) -> dict:
    with get_session() as s:
        return {"type": "snapshot", "reason": reason, "rooms": logic.all_rooms(s)}


async def _mutate(fn, *args, **kwargs) -> dict:
    """Écrit, puis diffuse l'état complet de la chambre à tous les clients (règle 4)."""
    async with write_lock:
        with get_session() as s:
            room = fn(s, *args, **kwargs)
        manager.broadcast({"type": "state", "room": room})
    return room


def _broadcast_rooms(numbers: list[int]) -> None:
    with get_session() as s:
        for n in numbers:
            manager.broadcast({"type": "state", "room": logic.room_payload(s, logic.get_room(s, n))})


# --------------------------------------------------------------- public

@app.get("/api/health")
async def health():
    return {"ok": True, "clients": len(manager.clients)}


@app.get("/api/config")
async def get_config():
    """Configuration publique : aussi lue par les écrans en chambre."""
    with get_session() as s:
        prog = program.load(s)
        setup_required = s.exec(select(User.id)).first() is None
    return {**settings.public(), "drink_message": prog.drink_message, "min_nights": prog.min_nights,
            "setup_required": setup_required}


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


@app.post("/api/rooms/{number}/toggle")
async def toggle(number: int, body: Optional[ToggleIn] = Body(None)):
    """Bouton en chambre : public (l'écran du client n'a pas de compte)."""
    return await _mutate(logic.guest_toggle, number, body.to if body else None)


# ----------------------------------------------------------------- auth

@app.post("/api/auth/login")
async def login(body: LoginIn, request: Request, response: Response):
    ip = request.client.host if request.client else "?"
    auth.check_rate(ip)
    with get_session() as s:
        user = auth.login(s, body.email, body.password)
        if user is None:
            auth.record_failure(ip)
            raise logic.BusinessError(401, "E-mail ou mot de passe incorrect. Vérifiez vos identifiants ou contactez la réception.")
        auth.clear_failures(ip)
        token, ttl = auth.open_session(s, user, body.remember)
    auth.set_cookie(response, request, token, ttl, body.remember)
    return auth.user_payload(user)


@app.post("/api/auth/logout")
async def logout(request: Request, response: Response):
    with get_session() as s:
        auth.close_session(s, request.cookies.get(auth.COOKIE))
    response.delete_cookie(auth.COOKIE, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
async def me(user: User = Staff):
    return auth.user_payload(user)


@app.post("/api/auth/password")
async def change_password(body: PasswordIn, user: User = Staff):
    with get_session() as s:
        db_user = s.get(User, user.id)
        if not auth.verify_password(body.current, db_user.password_hash):
            raise logic.BusinessError(400, "Mot de passe actuel incorrect.")
        db_user.password_hash = auth.hash_password(body.new)
        s.add(db_user)
        s.commit()
    return {"ok": True}


# ------------------------------------------------------------- chambres

@app.get("/api/rooms/{number}")
async def get_room(number: int, _user: User = Staff):
    with get_session() as s:
        return logic.room_detail(s, number)


@app.put("/api/rooms/{number}/state")
async def force_state(number: int, body: StateIn, user: User = Staff):
    return await _mutate(logic.staff_force, number, body.state, user_name=user.name)


@app.put("/api/rooms/{number}/stay")
async def put_stay(number: int, body: StayIn, user: User = Staff):
    return await _mutate(logic.set_stay, number, body.nights, user_name=user.name)


@app.delete("/api/rooms/{number}/stay")
async def delete_stay(number: int, user: User = Staff):
    return await _mutate(logic.end_stay, number, user_name=user.name)


@app.post("/api/rooms")
async def add_room(body: RoomIn, _admin: User = Admin):
    async with write_lock:
        with get_session() as s:
            room = logic.add_room(s, body.number, body.room_type)
        manager.broadcast(_snapshot("rooms"))
    return room


@app.delete("/api/rooms/{number}")
async def remove_room(number: int, _admin: User = Admin):
    async with write_lock:
        with get_session() as s:
            logic.remove_room(s, number)
        manager.broadcast(_snapshot("rooms"))
    return {"ok": True}


@app.put("/api/vouchers/{voucher_id}")
async def put_voucher(voucher_id: int, body: VoucherIn, _user: User = Staff):
    async with write_lock:
        with get_session() as s:
            number = logic.set_voucher_status(s, voucher_id, body.status)
        _broadcast_rooms([number])
    return {"ok": True}


# ------------------------------------------------- historique et rapports

@app.get("/api/events")
async def events(days: int = Query(7, ge=1, le=366), source: Optional[Literal["guest", "staff", "system"]] = None,
                 room: Optional[int] = None, _user: User = Staff):
    with get_session() as s:
        return logic.list_events(s, since=utcnow() - timedelta(days=days), source=source, room=room, limit=1000)


@app.get("/api/stats")
async def get_stats(days: int = Query(7, ge=2, le=90), _user: User = Staff):
    with get_session() as s:
        return stats.summary(s, days)


def _csv(rows: list[list], filename: str) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf, delimiter=";")  # point-virgule : ouvre directement dans Excel en français
    writer.writerows(rows)
    return Response("﻿" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


SOURCE_LABEL = {"guest": "Client", "staff": "Gouvernante", "system": "Système"}


@app.get("/api/export/events.csv")
async def export_events(days: int = Query(30, ge=1, le=366), _user: User = Staff):
    with get_session() as s:
        evs = logic.list_events(s, since=utcnow() - timedelta(days=days), limit=100_000)
    rows = [["horodatage_utc", "chambre", "etat_precedent", "etat_resultant", "eligible", "source", "nature", "membre"]]
    for e in evs:
        rows.append([e["created_at"], e["room"], e["from_state"], e["to_state"], "oui" if e["eligible"] else "non",
                     SOURCE_LABEL[e["source"]], e["actor"], e["user_name"] or ""])
    return _csv(rows, f"journal-green-housekeeping-{days}j.csv")


@app.get("/api/export/rooms.csv")
async def export_rooms(_user: User = Staff):
    with get_session() as s:
        rooms = logic.all_rooms(s)
    rows = [["chambre", "etage", "type", "etat", "eligible", "nuits", "arrivee", "depart", "dernier_changement_utc", "par", "boisson"]]
    for r in rooms:
        stay = r["stay"] or {}
        rows.append([r["number"], r["floor"], r["room_type"], "sans nettoyage" if r["state"] == "on" else "nettoyage",
                     "oui" if r["eligible"] else "non", stay.get("nights", ""), stay.get("check_in", ""),
                     stay.get("check_out", ""), r["updated_at"], SOURCE_LABEL[r["updated_by"]],
                     (r["voucher"] or {}).get("status", "")])
    return _csv(rows, "chambres-green-housekeeping.csv")


@app.get("/api/export/daily.csv")
async def export_daily(days: int = Query(7, ge=2, le=90), _user: User = Staff):
    with get_session() as s:
        data = stats.summary(s, days)
    rows = [["date", "nettoyages_evites"]] + [[d["date"], d["avoided"]] for d in data["series"]]
    rows += [[], ["total", data["total_avoided"]], ["moyenne_par_jour", data["avg_per_day"]],
             ["taux_adoption_pct", data["adoption"] if data["adoption"] is not None else ""]]
    return _csv(rows, f"rapport-green-housekeeping-{days}j.csv")


# ------------------------------------------------------------ paramètres

@app.get("/api/settings")
async def get_settings(_user: User = Staff):
    with get_session() as s:
        return program.load(s).model_dump()


@app.put("/api/settings")
async def put_settings(body: program.ProgramSettingsPatch, user: User = Admin):
    async with write_lock:
        with get_session() as s:
            before = program.load(s)
            after = program.save(s, body)
            changed = []
            if after.min_nights != before.min_nights:
                changed = logic.apply_min_nights(s, after.min_nights, user_name=user.name)
        _broadcast_rooms(changed)
    return after.model_dump()


# ---------------------------------------------------------------- équipe

@app.get("/api/users")
async def list_users(_user: User = Staff):
    with get_session() as s:
        return [auth.user_payload(u) for u in s.exec(select(User).order_by(User.name)).all()]


@app.post("/api/users")
async def create_user(body: UserIn, _admin: User = Admin):
    password = auth.generate_password()
    with get_session() as s:
        user = auth.create_user(s, email=body.email, name=body.name, title=body.title, role=body.role, password=password)
    # Le mot de passe provisoire n'est renvoyé qu'une seule fois.
    return {**auth.user_payload(user), "temporary_password": password}


@app.patch("/api/users/{user_id}")
async def patch_user(user_id: int, body: UserPatch, admin: User = Admin):
    with get_session() as s:
        user = s.get(User, user_id)
        if user is None:
            raise logic.BusinessError(404, "Membre introuvable.")
        if body.role and user.id == admin.id and body.role != "admin":
            raise logic.BusinessError(400, "Vous ne pouvez pas retirer vos propres droits d'administration.")
        for field in ("name", "title", "role"):
            value = getattr(body, field)
            if value is not None:
                setattr(user, field, value)
        password = None
        if body.reset_password:
            password = auth.generate_password()
            user.password_hash = auth.hash_password(password)
        s.add(user)
        s.commit()
        s.refresh(user)
        out = auth.user_payload(user)
    return {**out, "temporary_password": password} if password else out


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int, admin: User = Admin):
    if user_id == admin.id:
        raise logic.BusinessError(400, "Vous ne pouvez pas supprimer votre propre compte.")
    with get_session() as s:
        user = s.get(User, user_id)
        if user is None:
            raise logic.BusinessError(404, "Membre introuvable.")
        from .models import AuthSession

        for row in s.exec(select(AuthSession).where(AuthSession.user_id == user_id)).all():
            s.delete(row)
        s.delete(user)
        s.commit()
    return {"ok": True}


# ------------------------------------------------------------------ démo

@app.post("/api/demo/reset")
async def demo_reset(_user: User = Staff):
    if not settings.demo:
        raise logic.BusinessError(403, "Réinitialisation indisponible en production.")
    async with write_lock:
        drop_room_data()
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
