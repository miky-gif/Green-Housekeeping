import os
from pathlib import Path

from sqlalchemy import event as sa_event
from sqlmodel import Session, SQLModel, create_engine, text

from . import models  # noqa: F401  (enregistre les tables)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DB_URL = os.environ.get("GH_DB_URL") or f"sqlite:///{DATA_DIR / 'green_housekeeping.db'}"

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


def create_schema() -> None:
    SQLModel.metadata.create_all(engine)
    with engine.begin() as conn:
        for ddl in _TRIGGERS:
            conn.execute(text(ddl))
        # Migration : colonne ajoutée après la première version du schéma.
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stay)"))}
        if "closed_at" not in cols:
            conn.execute(text("ALTER TABLE stay ADD COLUMN closed_at DATETIME"))


def drop_schema() -> None:
    """Réinitialisation de démo : on supprime les tables (pas les lignes)."""
    SQLModel.metadata.drop_all(engine)


def get_session() -> Session:
    return Session(engine, expire_on_commit=False)
