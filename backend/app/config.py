"""Configuration par variables d'environnement.

GH_MODE                 "demo" (défaut) ou "production"
GH_HOTEL_NAME           nom affiché de l'hôtel
GH_ROOMS                chambres gérées en production, ex. "312-316,420-424"
GH_SUITES               chambres qui sont des suites, ex. "316,424"
GH_MINUTES_PER_CLEANING durée estimée d'une recouche, pour l'indicateur d'impact
"""

import os
from dataclasses import dataclass, field


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


@dataclass
class Settings:
    mode: str = "demo"
    hotel_name: str = "Hôtel Pilote"
    rooms: list[int] = field(default_factory=list)
    suites: set[int] = field(default_factory=set)
    minutes_per_cleaning: int = 25

    @property
    def demo(self) -> bool:
        return self.mode != "production"

    def public(self) -> dict:
        return {
            "mode": "demo" if self.demo else "production",
            "hotel_name": self.hotel_name,
            "minutes_per_cleaning": self.minutes_per_cleaning,
            "voucher_eur": 5,
            "min_nights": 2,
        }


def load() -> Settings:
    env = os.environ.get
    return Settings(
        mode=(env("GH_MODE") or "demo").strip().lower(),
        hotel_name=env("GH_HOTEL_NAME") or "Hôtel Pilote",
        rooms=parse_rooms(env("GH_ROOMS") or "312-316,420-424"),
        suites=set(parse_rooms(env("GH_SUITES") or "316,424")),
        minutes_per_cleaning=int(env("GH_MINUTES_PER_CLEANING") or 25),
    )


settings = load()
