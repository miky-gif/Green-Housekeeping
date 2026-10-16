"""Réglages du programme Green Housekeeping (écran Paramètres).

Stockés en base (table `setting`, valeurs JSON) ; tout réglage absent prend
sa valeur par défaut. Les règles métier les lisent ici.
"""

import json
from typing import Optional

from pydantic import BaseModel, Field
from sqlmodel import Session, select

from .models import Setting


class ProgramSettings(BaseModel):
    # Règles du programme
    min_nights: int = Field(2, ge=1, le=14)
    default_on_arrival: bool = True
    staff_force: bool = True
    # Boisson offerte
    drink_place: str = Field("The Iris · bar et restaurant, 24e étage", max_length=120)
    drink_pickup: str = Field("Sur présentation du numéro de chambre", max_length=120)
    drink_message: str = Field("Merci. Une boisson vous est offerte au Iris, au 24e étage.", max_length=240)
    notify_bar: bool = True
    # Ratios d'impact (par nettoyage) : aucune estimation tant qu'ils ne sont pas renseignés
    ratio_water_l: Optional[float] = Field(None, ge=0, le=10_000)
    ratio_energy_kwh: Optional[float] = Field(None, ge=0, le=10_000)
    ratio_products_ml: Optional[float] = Field(None, ge=0, le=100_000)
    # Notifications (dans l'application)
    notify_cleaning_request: bool = True
    notify_force_by_other: bool = True
    daily_email: bool = False
    # Hôtel
    hotel_address: str = Field("Boulevard de Waterloo 38, 1000 Bruxelles", max_length=160)
    total_rooms: int = Field(424, ge=1, le=10_000)
    certifications: list[str] = Field(default_factory=lambda: ["Green Key", "BREEAM"])


class ProgramSettingsPatch(BaseModel):
    """Mise à jour partielle : seuls les champs fournis sont modifiés."""

    min_nights: Optional[int] = Field(None, ge=1, le=14)
    default_on_arrival: Optional[bool] = None
    staff_force: Optional[bool] = None
    drink_place: Optional[str] = Field(None, max_length=120)
    drink_pickup: Optional[str] = Field(None, max_length=120)
    drink_message: Optional[str] = Field(None, max_length=240)
    notify_bar: Optional[bool] = None
    ratio_water_l: Optional[float] = Field(None, ge=0, le=10_000)
    ratio_energy_kwh: Optional[float] = Field(None, ge=0, le=10_000)
    ratio_products_ml: Optional[float] = Field(None, ge=0, le=100_000)
    notify_cleaning_request: Optional[bool] = None
    notify_force_by_other: Optional[bool] = None
    daily_email: Optional[bool] = None
    hotel_address: Optional[str] = Field(None, max_length=160)
    total_rooms: Optional[int] = Field(None, ge=1, le=10_000)
    certifications: Optional[list[str]] = None


def load(session: Session) -> ProgramSettings:
    rows = session.exec(select(Setting)).all()
    data = {}
    for row in rows:
        try:
            data[row.key] = json.loads(row.value)
        except ValueError:
            continue
    known = {k: v for k, v in data.items() if k in ProgramSettings.model_fields}
    try:
        return ProgramSettings(**known)
    except ValueError:
        return ProgramSettings()


def save(session: Session, patch: ProgramSettingsPatch) -> ProgramSettings:
    """Enregistre les champs fournis. Les ratios peuvent être remis à vide (null)."""
    fields = patch.model_dump(exclude_unset=True)
    for key, value in fields.items():
        if value is None and not key.startswith("ratio_"):
            continue
        row = session.get(Setting, key)
        encoded = json.dumps(value, ensure_ascii=False)
        if row is None:
            session.add(Setting(key=key, value=encoded))
        else:
            row.value = encoded
            session.add(row)
    session.commit()
    return load(session)
