"""Configuration par variables d'environnement (réglages de déploiement).

GH_MODE            "production" (défaut) ou "demo" (jeu de données de présentation)
GH_HOTEL_NAME      nom affiché de l'hôtel
GH_TIMEZONE        fuseau de l'hôtel (défaut Europe/Brussels) : dates de séjour, journées des rapports
GH_CLEANING_HOUR   heure locale à laquelle le planning de ménage est arrêté (défaut 11)
GH_ROOMS           chambres créées au premier démarrage en production, ex. "704,707,1203-1211"
GH_SUITES          chambres qui sont des suites, ex. "2104"
GH_ADMIN_EMAIL / GH_ADMIN_PASSWORD / GH_ADMIN_NAME
                   premier compte administrateur, créé en production si l'équipe est vide
GH_DEMO_PASSWORD   mot de passe du compte de présentation (mode démo uniquement)

Les règles du programme (séjour minimum, boisson offerte…) se règlent dans
l'application, écran Paramètres.
"""

import os
from dataclasses import dataclass, field
from datetime import date, datetime
from zoneinfo import ZoneInfo


def parse_rooms(spec: str) -> list[int]:
    rooms: list[int] = []
    for part in spec.replace(" ", "").split(","):
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-", 1)
            rooms.extend(range(int(a), int(b) + 1))
        else:
            rooms.append(int(part))
    return sorted(set(rooms))


DEMO_EMAIL = "elodie.martens@thehotel.demo"


@dataclass
class Settings:
    mode: str = "production"
    hotel_name: str = "The Hotel Brussels"
    timezone: str = "Europe/Brussels"
    cleaning_hour: int = 11
    rooms: list[int] = field(default_factory=list)
    suites: set[int] = field(default_factory=set)
    admin_email: str = ""
    admin_password: str = ""
    admin_name: str = "Administrateur"
    demo_password: str = "greenkeeping"

    @property
    def demo(self) -> bool:
        return self.mode == "demo"

    @property
    def tz(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    def public(self) -> dict:
        return {"mode": "demo" if self.demo else "production", "hotel_name": self.hotel_name, "timezone": self.timezone}


def load() -> Settings:
    env = os.environ.get
    return Settings(
        mode=(env("GH_MODE") or "production").strip().lower(),
        hotel_name=env("GH_HOTEL_NAME") or "The Hotel Brussels",
        timezone=env("GH_TIMEZONE") or "Europe/Brussels",
        cleaning_hour=int(env("GH_CLEANING_HOUR") or 11),
        rooms=parse_rooms(env("GH_ROOMS") or "704,707,712,1203,1208,1211,1802,1806,1809,2104"),
        suites=set(parse_rooms(env("GH_SUITES") or "2104")),
        admin_email=(env("GH_ADMIN_EMAIL") or "").strip().lower(),
        admin_password=env("GH_ADMIN_PASSWORD") or "",
        admin_name=env("GH_ADMIN_NAME") or "Administrateur",
        demo_password=env("GH_DEMO_PASSWORD") or "greenkeeping",
    )


settings = load()


def hotel_now() -> datetime:
    return datetime.now(settings.tz)


def hotel_today() -> date:
    return hotel_now().date()
