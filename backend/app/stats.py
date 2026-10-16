"""Indicateurs du Tableau de bord et des Rapports, calculés depuis le journal.

Un « nettoyage évité » = une chambre dont le séjour est éligible et dont le
bouton est allumé à l'heure où le planning de ménage est arrêté
(GH_CLEANING_HOUR, 11 h par défaut, heure de l'hôtel). Pour les jours passés,
l'état est reconstitué depuis le journal d'audit ; pour aujourd'hui, c'est
l'état en direct.
"""

from bisect import bisect_right
from collections import defaultdict
from datetime import datetime, time, timedelta, timezone

from sqlmodel import Session, col, select

from . import program
from .config import hotel_today, settings
from .logic import current_stay
from .models import ButtonState, Event, Room, Stay, Voucher


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def avoided_by_day(session: Session, days: int) -> list[dict]:
    today = hotel_today()
    rooms = session.exec(select(Room)).all()
    timeline: dict[int, list[tuple[datetime, bool]]] = defaultdict(list)
    for e in session.exec(select(Event).order_by(col(Event.created_at), col(Event.id))).all():
        timeline[e.room_id].append((_utc(e.created_at), e.to_state == "on" and e.eligible))
    times = {rid: [t for t, _ in evs] for rid, evs in timeline.items()}

    live = sum(
        1 for bs in session.exec(select(ButtonState)).all() if bs.state == "on" and bs.eligible
    )
    series = []
    for offset in range(days - 1, -1, -1):
        day = today - timedelta(days=offset)
        if offset == 0:
            count = live
        else:
            cutoff = datetime.combine(day, time(settings.cleaning_hour), settings.tz).astimezone(timezone.utc)
            count = 0
            for room in rooms:
                i = bisect_right(times.get(room.id, []), cutoff)
                if i and timeline[room.id][i - 1][1]:
                    count += 1
        series.append({"date": day.isoformat(), "avoided": count, "today": offset == 0})
    return series


def summary(session: Session, days: int = 7) -> dict:
    prog = program.load(session)
    series = avoided_by_day(session, max(days, 2))
    window = series[-days:]
    total = sum(d["avoided"] for d in window)

    counts = {"on": 0, "off": 0, "inel": 0, "free": 0}
    floors: dict[int, dict] = {}
    drinks = 0
    for room in session.exec(select(Room).order_by(Room.number)).all():
        bs = session.exec(select(ButtonState).where(ButtonState.room_id == room.id)).one()
        stay: Stay | None = current_stay(session, room.id)
        f = floors.setdefault(room.floor, {"floor": room.floor, "rooms": 0, "eligible": 0, "on": 0})
        f["rooms"] += 1
        if bs.state == "on":
            counts["on"] += 1
        elif stay is None:
            counts["free"] += 1
        elif bs.eligible:
            counts["off"] += 1
        else:
            counts["inel"] += 1
        if stay is not None and bs.eligible:
            f["eligible"] += 1
            if bs.state == "on":
                f["on"] += 1
            v = session.exec(select(Voucher).where(Voucher.stay_id == stay.id)).first()
            if v and v.status == "emis":
                drinks += 1

    eligible = sum(f["eligible"] for f in floors.values())
    on_eligible = sum(f["on"] for f in floors.values())
    ratios = {"water_l": prog.ratio_water_l, "energy_kwh": prog.ratio_energy_kwh, "products_ml": prog.ratio_products_ml}
    impact = None
    if any(v is not None for v in ratios.values()):
        impact = {k: (round(total * v, 1) if v is not None else None) for k, v in ratios.items()}

    first = session.exec(select(Event.created_at).order_by(col(Event.created_at)).limit(1)).first()
    history_days = (hotel_today() - _utc(first).astimezone(settings.tz).date()).days + 1 if first else 0

    return {
        "days": days,
        "history_days": history_days,
        "series": window,
        "total_avoided": total,
        "avg_per_day": round(total / days, 1) if days else 0,
        "counts": counts,
        "eligible": eligible,
        "on_eligible": on_eligible,
        "adoption": round(on_eligible * 100 / eligible) if eligible else None,
        "delta_vs_yesterday": series[-1]["avoided"] - series[-2]["avoided"],
        "drinks_to_collect": drinks,
        "floors": sorted(floors.values(), key=lambda f: f["floor"]),
        "impact": impact,
    }
