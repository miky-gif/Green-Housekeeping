"""Modèle de données Green Housekeeping (SQLModel / SQLite)."""

from datetime import date, datetime, timezone
from typing import Optional

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Room(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    number: int = Field(index=True, unique=True)
    floor: int
    is_suite: bool = False


class Stay(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(foreign_key="room.id", index=True)
    nights: int
    check_in: date
    check_out: date
    # Renseigné au départ : le séjour n'est plus le séjour en cours.
    closed_at: Optional[datetime] = None


class ButtonState(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(foreign_key="room.id", unique=True)
    state: str = "off"  # "on" | "off"
    eligible: bool = False
    updated_at: datetime = Field(default_factory=utcnow)
    updated_by: str = "system"  # "guest" | "staff" | "system"


class Event(SQLModel, table=True):
    """Journal d'audit immuable : append-only, protégé par des triggers SQLite."""

    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(foreign_key="room.id", index=True)
    from_state: str
    to_state: str
    source: str  # "guest" | "staff" | "system"
    actor: str  # description lisible de l'initiateur
    created_at: datetime = Field(default_factory=utcnow, index=True)
    # Extension : éligibilité après l'événement (pour afficher « Non éligible »).
    eligible: bool = True


class Voucher(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(foreign_key="room.id", index=True)
    # unique : garantie en base qu'un séjour n'a jamais deux vouchers (règle 5).
    stay_id: int = Field(foreign_key="stay.id", unique=True)
    amount_eur: int = 5
    issued_at: datetime = Field(default_factory=utcnow)
    status: str = "emis"  # "emis" | "remis" | "annule"
