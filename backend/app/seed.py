"""Jeu de données initial de la démo.

10 chambres sur deux étages :
- 6 séjours de 2 nuits ou plus (dont 313 et 421 éteints par le client),
- 3 séjours d'1 nuit (314, 422, 423 — non éligibles),
- 1 chambre libre (424).
Tous les événements tombent dans les dernières 24 h, relativement à l'heure
de lancement, pour que l'historique soit vivant en réunion.
"""

from datetime import date, datetime, timedelta, timezone

from sqlmodel import Session, func, select

from .logic import is_eligible, nights_label
from .models import ButtonState, Event, Room, Stay, Voucher, utcnow

# (numéro, étage, suite, nuits | None, arrivée il y a (h), changements)
# changement = (il y a (h), source, état cible)
SEED = [
    (312, 3, False, 4, 20.0, [(3.3, "guest", "off"), (1.7, "guest", "on")]),
    (313, 3, False, 2, 19.0, [(2.5, "guest", "off")]),
    (314, 3, False, 1, 18.8, []),
    (315, 3, False, 3, 17.9, []),
    (316, 3, True, 4, 22.5, [(14.0, "guest", "off"), (12.4, "guest", "on"), (3.0, "guest", "off"), (1.2, "staff", "on")]),
    (420, 4, False, 2, 19.6, []),
    (421, 4, False, 3, 21.0, [(10.2, "guest", "off")]),
    (422, 4, False, 1, 16.9, []),
    (423, 4, False, 1, 15.6, []),
    (424, 4, True, None, 0, []),
]

ACTORS = {"guest": "client", "staff": "gouvernante"}


def seed(session: Session) -> None:
    now = utcnow()
    yesterday = date.today() - timedelta(days=1)
    for number, floor, suite, nights, arrived_h, changes in SEED:
        room = Room(number=number, floor=floor, is_suite=suite)
        session.add(room)
        session.flush()

        if nights is None:  # chambre libre
            session.add(ButtonState(room_id=room.id, state="off", eligible=False,
                                    updated_at=now - timedelta(hours=24), updated_by="system"))
            continue

        stay = Stay(room_id=room.id, nights=nights, check_in=yesterday,
                    check_out=yesterday + timedelta(days=nights))
        session.add(stay)
        session.flush()
        eligible = is_eligible(stay)
        state = "on" if eligible else "off"
        at = now - timedelta(hours=arrived_h)
        session.add(Event(room_id=room.id, from_state="off", to_state=state, source="system",
                          actor=f"arrivée · séjour de {nights_label(nights)}",
                          eligible=eligible, created_at=at))
        updated_at, updated_by = at, "system"
        voucher_issued = False
        for hours_ago, source, target in changes:
            at = now - timedelta(hours=hours_ago)
            session.add(Event(room_id=room.id, from_state=state, to_state=target, source=source,
                              actor=ACTORS[source], eligible=eligible, created_at=at))
            if source == "guest" and target == "on" and not voucher_issued:
                # Voucher de la veille déjà remis au bar, celui du jour encore à retirer.
                status = "remis" if hours_ago > 6 else "emis"
                session.add(Voucher(room_id=room.id, stay_id=stay.id, issued_at=at, status=status))
                voucher_issued = True
            state, updated_at, updated_by = target, at, source
        session.add(ButtonState(room_id=room.id, state=state, eligible=eligible,
                                updated_at=updated_at, updated_by=updated_by))
    session.commit()


def seed_if_empty(session: Session) -> None:
    if session.exec(select(Room)).first() is None:
        seed(session)


def ensure_rooms(session: Session, numbers: list[int], suites: set[int]) -> None:
    """Production : crée les chambres configurées qui n'existent pas encore (sans séjour)."""
    existing = set(session.exec(select(Room.number)).all())
    now = utcnow()
    for number in numbers:
        if number in existing:
            continue
        room = Room(number=number, floor=number // 100, is_suite=number in suites)
        session.add(room)
        session.flush()
        session.add(ButtonState(room_id=room.id, state="off", eligible=False, updated_at=now, updated_by="system"))
    session.commit()


def seed_is_stale(session: Session, max_age_hours: float = 18) -> bool:
    """Vrai si le dernier événement date de plus de `max_age_hours` (démo d'un autre jour)."""
    last = session.exec(select(func.max(Event.created_at))).one()
    if last is None:
        return False
    if isinstance(last, str):
        last = datetime.fromisoformat(last)
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return utcnow() - last > timedelta(hours=max_age_hours)
