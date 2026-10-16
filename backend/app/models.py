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
    room_type: str = "Chambre"  # Superior Room, Deluxe Room, Panoramic Room, The Suite…


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
    actor: str  # nature du changement : client, gouvernante, arrivée · …, départ · …
    created_at: datetime = Field(default_factory=utcnow, index=True)
    # Extensions : éligibilité après l'événement, et membre de l'équipe à l'origine.
    eligible: bool = True
    user_name: Optional[str] = None


class Voucher(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    room_id: int = Field(foreign_key="room.id", index=True)
    # unique : garantie en base qu'un séjour n'a jamais deux vouchers (règle 5).
    stay_id: int = Field(foreign_key="stay.id", unique=True)
    amount_eur: int = 5
    issued_at: datetime = Field(default_factory=utcnow)
    status: str = "emis"  # "emis" (à retirer) | "remis" | "annule"
    delivered_at: Optional[datetime] = None


class User(SQLModel, table=True):
    """Membre de l'équipe (gouvernante, réception…)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    name: str
    title: str = "Gouvernante"
    role: str = "member"  # "admin" (gère l'équipe et les paramètres) | "member"
    password_hash: str
    created_at: datetime = Field(default_factory=utcnow)


class AuthSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    token_hash: str = Field(index=True, unique=True)  # le jeton lui-même n'est jamais stocké
    user_id: int = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime


class Setting(SQLModel, table=True):
    """Réglages du programme (clé → valeur JSON), modifiables dans Paramètres."""

    key: str = Field(primary_key=True)
    value: str
