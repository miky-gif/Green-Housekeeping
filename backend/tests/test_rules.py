"""Vérifie les règles métier et le temps réel de bout en bout."""

import os
import sqlite3
import tempfile
from pathlib import Path

import pytest

_tmp = Path(tempfile.mkdtemp()) / "test.db"
os.environ["GH_DB_URL"] = f"sqlite:///{_tmp}"

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture()
def client():
    with TestClient(app) as c:
        c.post("/api/demo/reset")
        yield c


def room(c, n):
    return c.get(f"/api/rooms/{n}").json()


def test_seed_shape(client):
    rooms = client.get("/api/rooms").json()
    assert len(rooms) == 10
    assert len({r["number"] // 100 for r in rooms}) == 2
    occupied = [r for r in rooms if r["stay"]]
    assert len(occupied) == 9
    assert sum(r["stay"]["nights"] >= 2 for r in occupied) == 6
    assert sum(r["stay"]["nights"] == 1 for r in occupied) == 3
    assert sum(r["eligible"] and r["state"] == "off" and r["updated_by"] == "guest" for r in rooms) == 2
    assert all(r["state"] == "off" for r in rooms if not r["eligible"])
    assert all(room(client, r["number"])["events"] for r in occupied)


def test_ineligible_toggle_refused_409(client):
    before = room(client, 314)
    res = client.post("/api/rooms/314/toggle")
    assert res.status_code == 409
    assert "2 nuits" in res.json()["detail"]
    after = room(client, 314)
    assert after["room"]["state"] == "off"
    assert len(after["events"]) == len(before["events"])


def test_free_room_toggle_refused(client):
    assert client.post("/api/rooms/424/toggle").status_code == 409


def test_toggle_writes_one_event_and_is_idempotent(client):
    n0 = len(room(client, 315)["events"])
    r = client.post("/api/rooms/315/toggle", json={"to": "off"}).json()
    assert r["state"] == "off" and r["updated_by"] == "guest"
    assert len(room(client, 315)["events"]) == n0 + 1
    # Rejeu du même intent : aucun nouvel événement.
    client.post("/api/rooms/315/toggle", json={"to": "off"})
    assert len(room(client, 315)["events"]) == n0 + 1


def test_voucher_once_per_stay(client):
    # 315 : allumé par le système à l'arrivée, aucun voucher.
    assert room(client, 315)["room"]["voucher"] is None
    client.post("/api/rooms/315/toggle")  # off
    r = client.post("/api/rooms/315/toggle").json()  # on par le client → voucher
    assert r["voucher"] and r["voucher"]["amount_eur"] == 5
    for _ in range(3):
        client.post("/api/rooms/315/toggle")
    assert len(room(client, 315)["vouchers"]) == 1


def test_staff_force_not_voucher_and_bypasses_eligibility(client):
    r = client.put("/api/rooms/314/state", json={"state": "on"}).json()
    assert r["state"] == "on" and r["updated_by"] == "staff" and r["eligible"] is False
    assert room(client, 314)["vouchers"] == []
    # Le client reste bloqué même après le forçage.
    assert client.post("/api/rooms/314/toggle").status_code == 409


def test_stay_creation_initialises_on(client):
    r = client.put("/api/rooms/424/stay", json={"nights": 3}).json()
    assert r["state"] == "on" and r["eligible"] and r["updated_by"] == "system"
    r = client.put("/api/rooms/314/stay", json={"nights": 2}).json()
    assert r["state"] == "on" and r["eligible"]
    r = client.put("/api/rooms/314/stay", json={"nights": 1}).json()
    assert r["state"] == "off" and not r["eligible"]


def test_events_are_immutable(client):
    con = sqlite3.connect(_tmp)
    with pytest.raises(sqlite3.DatabaseError):
        con.execute("UPDATE event SET to_state='on'")
    with pytest.raises(sqlite3.DatabaseError):
        con.execute("DELETE FROM event")
    con.close()


def test_websocket_snapshot_then_broadcast(client):
    with client.websocket_connect("/ws") as ws:
        snap = ws.receive_json()
        assert snap["type"] == "snapshot" and len(snap["rooms"]) == 10
        client.put("/api/rooms/313/state", json={"state": "on"})
        msg = ws.receive_json()
        assert msg["type"] == "state" and msg["room"]["number"] == 313 and msg["room"]["state"] == "on"
        ws.send_json({"type": "ping", "t": 1})
        assert ws.receive_json()["type"] == "pong"


def test_checkout_frees_room_and_new_arrival_rearms_voucher(client):
    r = client.delete("/api/rooms/312/stay").json()
    assert r["stay"] is None and r["state"] == "off" and not r["eligible"]
    assert room(client, 312)["events"][0]["actor"].startswith("départ")
    assert client.post("/api/rooms/312/toggle").status_code == 409
    assert client.delete("/api/rooms/312/stay").status_code == 409
    # Nouveau client : nouveau séjour, allumé par le système, nouveau voucher possible.
    r = client.put("/api/rooms/312/stay", json={"nights": 3}).json()
    assert r["state"] == "on" and r["voucher"] is None
    client.post("/api/rooms/312/toggle")
    r = client.post("/api/rooms/312/toggle").json()
    assert r["voucher"] is not None
    assert len(room(client, 312)["vouchers"]) == 2


def test_config_and_qr(client):
    cfg = client.get("/api/config").json()
    assert cfg["mode"] in ("demo", "production") and cfg["hotel_name"]
    res = client.get("/api/qr.svg", params={"data": "http://example.test/chambre/313"})
    assert res.status_code == 200 and res.text.lstrip().startswith("<svg")


def test_production_mode_disables_reset(client):
    from app.config import settings
    settings.mode = "production"
    try:
        assert client.post("/api/demo/reset").status_code == 403
        assert client.get("/api/config").json()["mode"] == "production"
    finally:
        settings.mode = "demo"


def test_parse_rooms():
    from app.config import parse_rooms
    assert parse_rooms("312-314, 420,421") == [312, 313, 314, 420, 421]
