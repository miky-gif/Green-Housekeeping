import os
from pathlib import Path

from sqlalchemy import event as sa_event
from sqlmodel import Session, SQLModel, create_engine, text

from . import models  # noqa: F401  (enregistre les tables)
from .config import settings

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
# Une base par mode : les données de présentation ne peuvent jamais se mêler à la production.
DB_FILE = DATA_DIR / ("greenkeeping-demo.db" if settings.demo else "greenkeeping.db")
DB_URL = os.environ.get("GH_DB_URL") or f"sqlite:///{DB_FILE}"

if DB_URL.startswith("sqlite:///") and ":memory:" not in DB_URL:
    Path(DB_URL.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(DB_URL, connect_args={"check_same_thread": False})


@sa_event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, _record):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA synchronous=NORMAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


# Le journal d'audit refuse toute modification ou suppression ligne à ligne.
_TRIGGERS = [
    """CREATE TRIGGER IF NOT EXISTS event_no_update BEFORE UPDATE ON event
       BEGIN SELECT RAISE(ABORT, 'journal d''audit immuable'); END""",
    """CREATE TRIGGER IF NOT EXISTS event_no_delete BEFORE DELETE ON event
       BEGIN SELECT RAISE(ABORT, 'journal d''audit immuable'); END""",
]

# Migrations légères : colonnes ajoutées après la première version du schéma.
_COLUMNS = [
    ("stay", "closed_at", "DATETIME"),
    ("room", "room_type", "VARCHAR NOT NULL DEFAULT 'Chambre'"),
    ("event", "user_name", "VARCHAR"),
    ("voucher", "delivered_at", "DATETIME"),
]

# Données de séjour : ce que la réinitialisation de démo remet à zéro
# (l'équipe, les sessions et les réglages sont conservés).
ROOM_DATA = [models.Event, models.Voucher, models.ButtonState, models.Stay, models.Room]


def create_schema() -> None:
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        for ddl in _TRIGGERS:
            conn.execute(text(ddl))
        for table, column, ddl in _COLUMNS:
            cols = {row[1] for row in conn.execute(text(f"PRAGMA table_info({table})"))}
            if column not in cols:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))


def drop_schema() -> None:
    """Toutes les tables (démo d'un autre jour)."""
    SQLModel.metadata.drop_all(engine)


def drop_room_data() -> None:
    """Réinitialisation de démo : chambres, séjours, journal et vouchers seulement."""
    SQLModel.metadata.drop_all(engine, tables=[m.__table__ for m in ROOM_DATA])


def get_session() -> Session:
    return Session(engine, expire_on_commit=False)
