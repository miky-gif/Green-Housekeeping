"""Jeu de données de démonstration (mode démo uniquement).

10 chambres pilotes sur les étages 7, 12, 18 et 21, conformes à la maquette :
- 7 séjours de 2 nuits ou plus : 5 sans nettoyage, 2 en nettoyage normal ;
- 3 séjours d'une nuit (707, 1211, 1809), non éligibles.
Avant chaque séjour en cours, un historique de séjours passés sur 32 jours
(arrivées, renoncements, départs) alimente le graphique et les rapports.
Les heures reprennent celles de la maquette (scène arrêtée à 15:14). Si la démo
démarre avant 15:14, les heures du jour sont resserrées entre 07:00 et
l'heure courante : l'activité du jour reste vivante et toujours en journée.
"""

import random
from datetime import datetime, time, timedelta, timezone

from sqlmodel import Session, func, select

from .auth import hash_password
from .config import DEMO_EMAIL, hotel_today, settings
from .logic import nights_label
from .models import ButtonState, Event, Room, Stay, User, Voucher, utcnow

STAFF = "Élodie Martens"

# (numéro, type, nuits, arrivée (jour, heure), changements [(jour, heure, source, état)])
# jour : 0 = jour de la scène, -1 = la veille…
SEED = [
    (704, "Superior Room", 2, (-1, "15:40"), [(-1, "22:10", "guest", "off"), (0, "09:12", "guest", "on")]),
    (707, "Superior Room", 1, (-1, "16:20"), []),
    (712, "Deluxe Room", 3, (0, "14:30"), []),
    (1203, "Deluxe Room", 4, (-2, "15:10"), [(-1, "08:20", "guest", "off"), (-1, "19:40", "guest", "on"), (0, "08:45", "guest", "off")]),
    (1208, "Panoramic Room", 2, (-1, "17:05"), [(-1, "21:30", "guest", "off"), (0, "07:30", "guest", "on")]),
    (1211, "Superior Room", 1, (-1, "18:10"), []),
    (1802, "Panoramic Room", 3, (-1, "15:00"), [(-1, "21:00", "guest", "off"), (-1, "22:15", "guest", "on"), (0, "08:05", "guest", "off"), (0, "15:02", "staff", "on")]),
    (1806, "Deluxe Room", 2, (-1, "16:45"), [(0, "10:05", "staff", "off")]),
    (1809, "Superior Room", 1, (-1, "19:20"), []),
    (2104, "The Suite", 5, (-3, "15:30"), [(-2, "08:10", "guest", "off"), (-1, "22:40", "guest", "on")]),
]
SCENE_END = time(15, 14)


def _scene_clock():
    """Renvoie une fonction (jour, \"HH:MM\") -> datetime UTC, toujours dans le passé."""
    now = datetime.now(settings.tz)
    if now.time() >= SCENE_END:
        day, squeeze = now.date(), None
    elif now.time() >= time(8, 0):
        # Avant 15:14 : on resserre la journée de la scène entre 07:00 et maintenant.
        day = now.date()
        start = datetime.combine(day, time(7, 0), settings.tz)
        squeeze = (start, ((now - timedelta(minutes=5)) - start) / (datetime.combine(day, SCENE_END, settings.tz) - start))
    else:
        day, squeeze = now.date() - timedelta(days=1), None

    def at(offset: int, hhmm: str) -> datetime:
        h, m = map(int, hhmm.split(":"))
        local = datetime.combine(day + timedelta(days=offset), time(h, m), settings.tz)
        if squeeze and offset == 0 and local >= squeeze[0]:
            local = squeeze[0] + (local - squeeze[0]) * squeeze[1]
        return local.astimezone(timezone.utc)

    return at

HISTORY_DAYS = 32
ACTORS = {"guest": "client", "staff": "gouvernante"}


def _local(day, hour: int, minute: int = 0) -> datetime:
    return datetime.combine(day, time(hour, 0), settings.tz).astimezone(timezone.utc) + timedelta(minutes=minute)


def seed_users(session: Session) -> None:
    if session.exec(select(User).where(User.email == DEMO_EMAIL)).first() is None:
        session.add(User(email=DEMO_EMAIL, name=STAFF, title="Gouvernante générale", role="admin",
                         password_hash=hash_password(settings.demo_password)))
        session.commit()


class _Room:
    """Écrit l'historique d'une chambre dans l'ordre chronologique (le `rev` en dépend)."""

    def __init__(self, session: Session, room: Room):
        self.s, self.room = session, room
        self.state, self.eligible = "off", False
        self.updated_at, self.updated_by = utcnow() - timedelta(days=HISTORY_DAYS + 1), "system"

    def change(self, at, to_state, eligible, source, actor, user=None):
        self.s.add(Event(room_id=self.room.id, from_state=self.state, to_state=to_state, source=source,
                         actor=actor, user_name=user, eligible=eligible, created_at=at))
        self.state, self.eligible, self.updated_at, self.updated_by = to_state, eligible, at, source

    def stay(self, check_in, nights) -> Stay:
        stay = Stay(room_id=self.room.id, nights=nights, check_in=check_in,
                    check_out=check_in + timedelta(days=nights))
        self.s.add(stay)
        self.s.flush()
        return stay

    def voucher(self, stay, at, status):
        self.s.add(Voucher(room_id=self.room.id, stay_id=stay.id, issued_at=at, status=status,
                           delivered_at=at + timedelta(hours=2) if status == "remis" else None))


def _past_stays(rng: random.Random, boundary):
    """Séjours passés qui se terminent au plus tard à `boundary` (date locale)."""
    stays, end = [], boundary
    earliest = hotel_today() - timedelta(days=HISTORY_DAYS)
    while end > earliest:
        nights = rng.choice([1, 2, 2, 3, 3, 4])
        stays.append((end - timedelta(days=nights), nights))
        end = end - timedelta(days=nights + rng.choice([0, 0, 1]))
    return list(reversed(stays))


def seed(session: Session) -> None:
    seed_users(session)
    at_scene = _scene_clock()
    for number, room_type, nights, (arr_day, arr_time), changes in SEED:
        room = Room(number=number, floor=number // 100, room_type=room_type, is_suite="Suite" in room_type)
        session.add(room)
        session.flush()
        w = _Room(session, room)
        rng = random.Random(number)
        arrival = at_scene(arr_day, arr_time)
        arrival_day = arrival.astimezone(settings.tz).date()

        # Historique : séjours passés, renoncements, départs.
        for check_in, n in _past_stays(rng, arrival_day):
            stay = w.stay(check_in, n)
            eligible = n >= 2
            w.change(_local(check_in, 15, rng.randint(0, 150)), "on" if eligible else "off", eligible,
                     "system", f"arrivée · séjour de {nights_label(n)}")
            issued = False
            for d in range(1, n):
                day = check_in + timedelta(days=d)
                if eligible and w.state == "on" and rng.random() < 0.22:
                    w.change(_local(day, 7, 30 + rng.randint(0, 150)), "off", True, "guest", "client")
                    if rng.random() < 0.65:
                        at = _local(day, 19, rng.randint(0, 200))
                        w.change(at, "on", True, "guest", "client")
                        if not issued:
                            w.voucher(stay, at, "remis")
                            issued = True
            departure = min(_local(stay.check_out, 10, rng.randint(0, 75)), arrival - timedelta(minutes=30))
            stay.closed_at = departure
            session.add(stay)
            w.change(departure, "off", False, "system", "départ · chambre libérée")

        # Séjour en cours.
        stay = w.stay(arrival_day, nights)
        eligible = nights >= 2
        w.change(arrival, "on" if eligible else "off", eligible, "system", f"arrivée · séjour de {nights_label(nights)}")
        issued = False
        for day_offset, hhmm, source, target in changes:
            at = at_scene(day_offset, hhmm)
            w.change(at, target, eligible, source, ACTORS[source], STAFF if source == "staff" else None)
            if source == "guest" and target == "on" and not issued:
                w.voucher(stay, at, "emis")
                issued = True
        session.add(ButtonState(room_id=room.id, state=w.state, eligible=w.eligible,
                                updated_at=w.updated_at, updated_by=w.updated_by))
    session.commit()


def seed_if_empty(session: Session) -> None:
    if session.exec(select(Room)).first() is None:
        seed(session)
    else:
        seed_users(session)


# Types des chambres pilotes connues (complétés ou corrigés dans Paramètres › Chambres pilotes).
PILOT_TYPES = {number: room_type for number, room_type, *_ in SEED}


def bootstrap_production(session: Session, numbers: list[int], suites: set[int]) -> None:
    """Production : chambres configurées (libres, sans séjour) et premier administrateur."""
    existing = set(session.exec(select(Room.number)).all())
    for number in numbers:
        if number in existing:
            continue
        room_type = PILOT_TYPES.get(number) or ("The Suite" if number in suites else "Chambre")
        room = Room(number=number, floor=number // 100, is_suite=number in suites or "Suite" in room_type,
                    room_type=room_type)
        session.add(room)
        session.flush()
        session.add(ButtonState(room_id=room.id, state="off", eligible=False, updated_by="system"))
    if settings.admin_email and settings.admin_password and session.exec(select(User)).first() is None:
        session.add(User(email=settings.admin_email, name=settings.admin_name, title="Gouvernante générale",
                         role="admin", password_hash=hash_password(settings.admin_password)))
    session.commit()


def seed_outdated(session: Session) -> bool:
    """Démo d'une version précédente (autres chambres) : à régénérer."""
    numbers = set(session.exec(select(Room.number)).all())
    return bool(numbers) and numbers != {n for n, *_ in SEED}


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
