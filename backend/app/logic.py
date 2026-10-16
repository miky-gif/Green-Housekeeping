"""Règles métier. Tout se décide ici, jamais côté client."""

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from .config import hotel_today
from .models import ButtonState, Event, Room, Stay, Voucher, utcnow

VOUCHER_EUR = 5


class BusinessError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def _program(session: Session):
    from . import program  # import tardif : program dépend des modèles uniquement

    return program.load(session)


def is_eligible(stay: Optional[Stay], min_nights: int = 2) -> bool:
    """Règle 1 : éligible si le séjour atteint le séjour minimum (2 nuits par défaut)."""
    return stay is not None and stay.nights >= min_nights


def nights_label(n: int) -> str:
    return f"{n} nuit{'s' if n > 1 else ''}"


# ---------------------------------------------------------------- lecture

def _iso(dt: datetime) -> str:
    # SQLite rend des datetimes naïves : elles sont toujours en UTC.
    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt.isoformat(timespec="milliseconds") + "Z"


def get_room(session: Session, number: int) -> Room:
    room = session.exec(select(Room).where(Room.number == number)).first()
    if room is None:
        raise BusinessError(404, f"Chambre {number} introuvable.")
    return room


def current_stay(session: Session, room_id: int) -> Optional[Stay]:
    return session.exec(
        select(Stay)
        .where(Stay.room_id == room_id, col(Stay.closed_at).is_(None))
        .order_by(col(Stay.id).desc())
    ).first()


def button_state(session: Session, room_id: int) -> ButtonState:
    return session.exec(select(ButtonState).where(ButtonState.room_id == room_id)).one()


def voucher_payload(v: Voucher, room_number: int) -> dict:
    return {
        "id": v.id,
        "stay_id": v.stay_id,
        "code": f"VB-{room_number}-{v.id:04d}",
        "amount_eur": v.amount_eur,
        "issued_at": _iso(v.issued_at),
        "status": v.status,
        "delivered_at": _iso(v.delivered_at) if v.delivered_at else None,
    }


def event_payload(e: Event, room_number: Optional[int] = None) -> dict:
    data = {
        "id": e.id,
        "from_state": e.from_state,
        "to_state": e.to_state,
        "source": e.source,
        "actor": e.actor,
        "user_name": e.user_name,
        "eligible": e.eligible,
        "created_at": _iso(e.created_at),
    }
    if room_number is not None:
        data["room"] = room_number
    return data


def room_payload(session: Session, room: Room) -> dict:
    """État public d'une chambre (diffusé à tous, y compris aux écrans en chambre) :
    aucun nom de membre de l'équipe, aucun code de voucher."""
    bs = button_state(session, room.id)
    stay = current_stay(session, room.id)
    last = session.exec(
        select(Event).where(Event.room_id == room.id).order_by(col(Event.id).desc())
    ).first()
    voucher = None
    if stay is not None:
        v = session.exec(select(Voucher).where(Voucher.stay_id == stay.id)).first()
        if v:
            voucher = {"id": v.id, "status": v.status, "issued_at": _iso(v.issued_at)}
    return {
        "number": room.number,
        "floor": room.floor,
        "is_suite": room.is_suite,
        "room_type": room.room_type,
        "state": bs.state,
        "eligible": bs.eligible,
        "updated_at": _iso(bs.updated_at),
        "updated_by": bs.updated_by,
        "actor": last.actor if last else None,
        # Révision monotone : id du dernier événement. Permet au client
        # d'ignorer une réponse plus ancienne que ce qu'il a déjà reçu.
        "rev": last.id if last else 0,
        "stay": None
        if stay is None
        else {
            "id": stay.id,
            "nights": stay.nights,
            "check_in": stay.check_in.isoformat(),
            "check_out": stay.check_out.isoformat(),
        },
        "voucher": voucher,
    }


def all_rooms(session: Session) -> list[dict]:
    rooms = session.exec(select(Room).order_by(Room.number)).all()
    return [room_payload(session, r) for r in rooms]


def room_detail(session: Session, number: int) -> dict:
    room = get_room(session, number)
    events = session.exec(
        select(Event).where(Event.room_id == room.id).order_by(col(Event.id).desc()).limit(20)
    ).all()
    vouchers = session.exec(
        select(Voucher).where(Voucher.room_id == room.id).order_by(col(Voucher.id).desc())
    ).all()
    return {
        "room": room_payload(session, room),
        "events": [event_payload(e) for e in events],
        "vouchers": [voucher_payload(v, room.number) for v in vouchers],
    }


def list_events(
    session: Session, *, since: Optional[datetime] = None, source: Optional[str] = None,
    room: Optional[int] = None, limit: int = 500,
) -> list[dict]:
    q = select(Event, Room.number).join(Room, Room.id == Event.room_id)
    if since is not None:
        q = q.where(Event.created_at >= since)
    if source:
        q = q.where(Event.source == source)
    if room is not None:
        q = q.where(Room.number == room)
    rows = session.exec(q.order_by(col(Event.created_at).desc(), col(Event.id).desc()).limit(limit)).all()
    return [event_payload(e, number) for e, number in rows]


# --------------------------------------------------------------- écriture

def _write_change(
    session: Session,
    room: Room,
    bs: ButtonState,
    *,
    to_state: str,
    eligible: bool,
    source: str,
    actor: str,
    user_name: Optional[str] = None,
    at: Optional[datetime] = None,
) -> Event:
    """Règle 4 : un changement = une ligne d'Event (le commit est fait par l'appelant)."""
    at = at or utcnow()
    ev = Event(
        room_id=room.id,
        from_state=bs.state,
        to_state=to_state,
        source=source,
        actor=actor,
        user_name=user_name,
        eligible=eligible,
        created_at=at,
    )
    bs.state = to_state
    bs.eligible = eligible
    bs.updated_at = at
    bs.updated_by = source
    session.add(bs)
    session.add(ev)
    return ev


def _issue_voucher_once(session: Session, room: Room, stay: Stay, at: datetime) -> None:
    """Règle 5 : un seul voucher par séjour, garanti par la contrainte UNIQUE(stay_id)."""
    exists = session.exec(select(Voucher.id).where(Voucher.stay_id == stay.id)).first()
    if exists is not None:
        return
    try:
        with session.begin_nested():
            session.add(Voucher(room_id=room.id, stay_id=stay.id, amount_eur=VOUCHER_EUR, issued_at=at))
    except IntegrityError:
        pass  # déjà émis par une requête concurrente : jamais en double


def guest_toggle(session: Session, number: int, to: Optional[str] = None) -> dict:
    """Bascule côté client. `to` rend l'appel idempotent (rejeu sans effet)."""
    room = get_room(session, number)
    bs = button_state(session, room.id)
    stay = current_stay(session, room.id)
    if stay is None:
        raise BusinessError(409, f"Aucun séjour en cours pour la chambre {number} : le bouton est inactif.")
    if not bs.eligible:
        min_nights = _program(session).min_nights
        raise BusinessError(
            409,
            f"Séjour trop court : le bouton n'est pas actionnable. "
            f"L'option sans nettoyage est disponible à partir de {nights_label(min_nights)}.",
        )
    target = to or ("off" if bs.state == "on" else "on")
    if target == bs.state:
        return room_payload(session, room)
    at = utcnow()
    _write_change(session, room, bs, to_state=target, eligible=True, source="guest", actor="client", at=at)
    if target == "on":
        _issue_voucher_once(session, room, stay, at)
    session.commit()
    return room_payload(session, room)


def staff_force(session: Session, number: int, state: str, user_name: Optional[str] = None) -> dict:
    """Règle 3 : la gouvernante force n'importe quel état, éligible ou non."""
    if not _program(session).staff_force:
        raise BusinessError(403, "Le forçage à distance est désactivé dans les paramètres.")
    room = get_room(session, number)
    bs = button_state(session, room.id)
    if bs.state == state:
        return room_payload(session, room)
    _write_change(session, room, bs, to_state=state, eligible=bs.eligible, source="staff",
                  actor="gouvernante", user_name=user_name)
    session.commit()
    return room_payload(session, room)


def set_stay(session: Session, number: int, nights: int, user_name: Optional[str] = None,
             today: Optional[date] = None) -> dict:
    """Saisie réception (en attendant le PMS) : enregistre une arrivée ou modifie la durée."""
    prog = _program(session)
    room = get_room(session, number)
    bs = button_state(session, room.id)
    stay = current_stay(session, room.id)
    today = today or hotel_today()

    if stay is None:
        stay = Stay(room_id=room.id, nights=nights, check_in=today, check_out=today + timedelta(days=nights))
        session.add(stay)
        session.flush()
        eligible = is_eligible(stay, prog.min_nights)
        # Règle 2 : séjour éligible créé → bouton allumé par le système (réglable).
        _write_change(
            session, room, bs,
            to_state="on" if eligible and prog.default_on_arrival else "off", eligible=eligible,
            source="system", actor=f"arrivée · séjour de {nights_label(nights)}", user_name=user_name,
        )
    else:
        stay.nights = nights
        stay.check_out = stay.check_in + timedelta(days=nights)
        session.add(stay)
        eligible = is_eligible(stay, prog.min_nights)
        if eligible != bs.eligible:
            # Devient éligible → allumé (comme à l'arrivée) ; devient
            # inéligible → éteint et verrouillé (règle 1).
            _write_change(
                session, room, bs,
                to_state="on" if eligible and prog.default_on_arrival else "off", eligible=eligible,
                source="system", actor=f"réception · séjour modifié à {nights_label(nights)}", user_name=user_name,
            )
    session.commit()
    return room_payload(session, room)


def end_stay(session: Session, number: int, user_name: Optional[str] = None) -> dict:
    """Départ du client : la chambre est libérée et son bouton éteint et verrouillé."""
    room = get_room(session, number)
    bs = button_state(session, room.id)
    stay = current_stay(session, room.id)
    if stay is None:
        raise BusinessError(409, f"Aucun séjour en cours pour la chambre {number}.")
    at = utcnow()
    stay.closed_at = at
    session.add(stay)
    _write_change(session, room, bs, to_state="off", eligible=False,
                  source="system", actor="départ · chambre libérée", user_name=user_name, at=at)
    session.commit()
    return room_payload(session, room)


def apply_min_nights(session: Session, min_nights: int, user_name: Optional[str] = None) -> list[int]:
    """Après un changement du séjour minimum : réévalue l'éligibilité des séjours en cours."""
    changed = []
    for room in session.exec(select(Room).order_by(Room.number)).all():
        stay = current_stay(session, room.id)
        if stay is None:
            continue
        bs = button_state(session, room.id)
        eligible = is_eligible(stay, min_nights)
        if eligible == bs.eligible:
            continue
        _write_change(
            session, room, bs, to_state="on" if eligible else "off", eligible=eligible,
            source="system", actor=f"règles · séjour minimum {nights_label(min_nights)}", user_name=user_name,
        )
        changed.append(room.number)
    session.commit()
    return changed


def set_voucher_status(session: Session, voucher_id: int, status: str) -> int:
    """Le bar remet la boisson (ou annule). Renvoie le numéro de chambre concerné."""
    v = session.get(Voucher, voucher_id)
    if v is None:
        raise BusinessError(404, "Voucher introuvable.")
    v.status = status
    v.delivered_at = utcnow() if status == "remis" else None
    session.add(v)
    session.commit()
    room = session.get(Room, v.room_id)
    return room.number


def add_room(session: Session, number: int, room_type: str) -> dict:
    if session.exec(select(Room).where(Room.number == number)).first():
        raise BusinessError(409, f"La chambre {number} fait déjà partie du programme.")
    room = Room(number=number, floor=number // 100, room_type=room_type.strip() or "Chambre",
                is_suite="suite" in room_type.lower())
    session.add(room)
    session.flush()
    session.add(ButtonState(room_id=room.id, state="off", eligible=False, updated_by="system"))
    session.commit()
    return room_payload(session, room)


def remove_room(session: Session, number: int) -> None:
    """Retire une chambre du programme, uniquement si elle n'a encore aucun historique
    (le journal d'audit est immuable)."""
    room = get_room(session, number)
    if session.exec(select(Event.id).where(Event.room_id == room.id)).first() is not None:
        raise BusinessError(409, f"La chambre {number} a un historique : elle ne peut pas être retirée.")
    for bs in session.exec(select(ButtonState).where(ButtonState.room_id == room.id)).all():
        session.delete(bs)
    session.delete(room)
    session.commit()
