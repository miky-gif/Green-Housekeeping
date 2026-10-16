"""Vérifie les règles métier, l'authentification et le temps réel de bout en bout."""

import os
import sqlite3
import tempfile
from pathlib import Path

import pytest

_tmp = Path(tempfile.mkdtemp()) / "test.db"
os.environ["GH_DB_URL"] = f"sqlite:///{_tmp}"
os.environ["GH_MODE"] = "demo"  # jeu de données de présentation pour les tests

from fastapi.testclient import TestClient  # noqa: E402

from app.config import DEMO_EMAIL, settings  # noqa: E402
from app.main import app  # noqa: E402


def login(c, email=DEMO_EMAIL, password=None):
    return c.post("/api/auth/login", json={"email": email, "password": password or settings.demo_password})


@pytest.fixture()
def anon():
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def client(anon):
    assert login(anon).status_code == 200
    anon.post("/api/demo/reset")
    anon.put("/api/settings", json={"min_nights": 2, "default_on_arrival": True, "staff_force": True,
                                    "ratio_water_l": None, "ratio_energy_kwh": None, "ratio_products_ml": None})
    yield anon


def room(c, n):
    return c.get(f"/api/rooms/{n}").json()


# ---------------------------------------------------------------- données

def test_seed_matches_mockup(client):
    rooms = client.get("/api/rooms").json()
    assert [r["number"] for r in rooms] == [704, 707, 712, 1203, 1208, 1211, 1802, 1806, 1809, 2104]
    assert sorted({r["floor"] for r in rooms}) == [7, 12, 18, 21]
    on = [r["number"] for r in rooms if r["state"] == "on"]
    off = [r["number"] for r in rooms if r["state"] == "off" and r["eligible"]]
    inel = [r["number"] for r in rooms if not r["eligible"]]
    assert on == [704, 712, 1208, 1802, 2104]
    assert off == [1203, 1806]
    assert inel == [707, 1211, 1809]
    assert all(room(client, r["number"])["events"] for r in rooms)
    # L'état public ne contient ni nom de l'équipe ni code de voucher.
    assert all("code" not in (r["voucher"] or {}) for r in rooms)


def test_stats_summary(client):
    s = client.get("/api/stats?days=7").json()
    assert len(s["series"]) == 7 and s["series"][-1]["today"]
    assert s["counts"] == {"on": 5, "off": 2, "inel": 3, "free": 0}
    assert s["eligible"] == 7 and s["adoption"] == 71
    assert s["series"][-1]["avoided"] == 5
    assert s["total_avoided"] == sum(d["avoided"] for d in s["series"])
    assert s["impact"] is None  # aucune estimation sans ratios
    client.put("/api/settings", json={"ratio_water_l": 50})
    assert client.get("/api/stats?days=7").json()["impact"]["water_l"] == s["total_avoided"] * 50


# ------------------------------------------------------------------ règles

def test_ineligible_toggle_refused_409(client):
    before = _count(client, 707)
    res = client.post("/api/rooms/707/toggle")
    assert res.status_code == 409
    assert "2 nuits" in res.json()["detail"]
    assert room(client, 707)["room"]["state"] == "off"
    assert _count(client, 707) == before


def _count(c, n):
    return len(c.get(f"/api/events?days=60&room={n}").json())


def test_toggle_writes_one_event_and_is_idempotent(client):
    n0 = _count(client, 712)
    r = client.post("/api/rooms/712/toggle", json={"to": "off"}).json()
    assert r["state"] == "off" and r["updated_by"] == "guest"
    assert _count(client, 712) == n0 + 1
    client.post("/api/rooms/712/toggle", json={"to": "off"})
    assert _count(client, 712) == n0 + 1


def test_voucher_once_per_stay(client):
    # 712 : allumé par le système à l'arrivée, aucun voucher.
    assert room(client, 712)["room"]["voucher"] is None
    client.post("/api/rooms/712/toggle")  # off
    r = client.post("/api/rooms/712/toggle").json()  # on par le client → voucher
    assert r["voucher"] and r["voucher"]["status"] == "emis"
    for _ in range(3):
        client.post("/api/rooms/712/toggle")
    stay_id = room(client, 712)["room"]["stay"]["id"]
    assert len([v for v in room(client, 712)["vouchers"] if v["stay_id"] == stay_id]) == 1


def test_staff_force_records_member_name(client):
    r = client.put("/api/rooms/707/state", json={"state": "on"}).json()
    assert r["state"] == "on" and r["updated_by"] == "staff" and r["eligible"] is False
    ev = room(client, 707)["events"][0]
    assert ev["source"] == "staff" and ev["user_name"] == "Élodie Martens"
    assert client.post("/api/rooms/707/toggle").status_code == 409


def test_force_can_be_disabled(client):
    client.put("/api/settings", json={"staff_force": False})
    assert client.put("/api/rooms/704/state", json={"state": "off"}).status_code == 403


def test_min_nights_setting_recomputes_eligibility(client):
    client.put("/api/settings", json={"min_nights": 3})
    rooms = {r["number"]: r for r in client.get("/api/rooms").json()}
    assert not rooms[704]["eligible"] and rooms[704]["state"] == "off"  # séjour de 2 nuits
    assert rooms[712]["eligible"]  # 3 nuits
    assert client.post("/api/rooms/704/toggle").status_code == 409


def test_stay_lifecycle_and_default_on(client):
    r = client.delete("/api/rooms/704/stay").json()
    assert r["stay"] is None and r["state"] == "off" and not r["eligible"]
    assert client.post("/api/rooms/704/toggle").status_code == 409
    r = client.put("/api/rooms/704/stay", json={"nights": 3}).json()
    assert r["state"] == "on" and r["eligible"] and r["updated_by"] == "system" and r["voucher"] is None
    client.put("/api/settings", json={"default_on_arrival": False})
    client.delete("/api/rooms/704/stay")
    assert client.put("/api/rooms/704/stay", json={"nights": 3}).json()["state"] == "off"


def test_voucher_delivery(client):
    vid = room(client, 1208)["room"]["voucher"]["id"]
    assert client.put(f"/api/vouchers/{vid}", json={"status": "remis"}).status_code == 200
    assert room(client, 1208)["room"]["voucher"]["status"] == "remis"


def test_events_are_immutable(client):
    con = sqlite3.connect(_tmp)
    with pytest.raises(sqlite3.DatabaseError):
        con.execute("UPDATE event SET to_state='on'")
    with pytest.raises(sqlite3.DatabaseError):
        con.execute("DELETE FROM event")
    con.close()


# ------------------------------------------------------------------- accès

def test_staff_endpoints_require_login(anon):
    anon.post("/api/auth/logout")
    assert anon.get("/api/rooms").status_code == 200  # état public (écrans en chambre)
    for method, url in [("get", "/api/rooms/704"), ("put", "/api/rooms/704/state"), ("get", "/api/stats"),
                        ("get", "/api/events"), ("get", "/api/settings"), ("post", "/api/demo/reset")]:
        kwargs = {"json": {"state": "off"}} if method == "put" else {}
        assert getattr(anon, method)(url, **kwargs).status_code == 401, url


def test_login_errors_and_session(anon):
    anon.post("/api/auth/logout")
    assert login(anon, password="mauvais").status_code == 401
    assert login(anon, email="inconnu@x.demo").status_code == 401
    res = login(anon)
    assert res.status_code == 200 and res.json()["name"] == "Élodie Martens"
    cookie = res.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie
    assert anon.get("/api/auth/me").json()["role"] == "admin"
    anon.post("/api/auth/logout")
    assert anon.get("/api/auth/me").status_code == 401


def test_team_invite_and_member_rights(client):
    res = client.post("/api/users", json={"email": "karim@thehotel.demo", "name": "Karim Benali",
                                          "title": "Gouvernant d'étage", "role": "member"}).json()
    temp = res["temporary_password"]
    with TestClient(app) as other:
        assert login(other, "karim@thehotel.demo", temp).status_code == 200
        assert other.put("/api/rooms/704/state", json={"state": "off"}).status_code == 200
        assert other.put("/api/settings", json={"min_nights": 3}).status_code == 403
        assert other.post("/api/users", json={"email": "x@y.demo", "name": "X"}).status_code == 403
    client.delete(f"/api/users/{res['id']}")


def test_exports(client):
    for url in ["/api/export/events.csv", "/api/export/rooms.csv", "/api/export/daily.csv"]:
        res = client.get(url)
        assert res.status_code == 200 and res.headers["content-type"].startswith("text/csv")
        assert ";" in res.text.splitlines()[0]


def test_add_and_remove_room(client):
    assert client.post("/api/rooms", json={"number": 2410, "room_type": "Panoramic Room"}).json()["floor"] == 24
    assert client.post("/api/rooms", json={"number": 2410}).status_code == 409
    assert client.delete("/api/rooms/2410").status_code == 200
    assert client.delete("/api/rooms/704").status_code == 409  # a un historique


def test_config_and_qr(anon):
    cfg = anon.get("/api/config").json()
    assert cfg["mode"] == "demo" and cfg["drink_message"] and cfg["setup_required"] is False
    assert "demo_login" not in cfg and "password" not in str(cfg)  # aucun identifiant publié
    res = anon.get("/api/qr.svg", params={"data": "http://example.test/chambre/712"})
    assert res.status_code == 200 and res.text.lstrip().startswith("<svg")


def test_production_mode_disables_reset(client):
    settings.mode = "production"
    try:
        assert client.post("/api/demo/reset").status_code == 403
        assert client.get("/api/config").json()["mode"] == "production"
    finally:
        settings.mode = "demo"


def test_parse_rooms():
    from app.config import parse_rooms
    assert parse_rooms("312-314, 420,421") == [312, 313, 314, 420, 421]


def test_websocket_snapshot_then_broadcast(client):
    with client.websocket_connect("/ws") as ws:
        snap = ws.receive_json()
        assert snap["type"] == "snapshot" and len(snap["rooms"]) == 10
        client.put("/api/rooms/1203/state", json={"state": "on"})
        msg = ws.receive_json()
        assert msg["type"] == "state" and msg["room"]["number"] == 1203 and msg["room"]["state"] == "on"
        ws.send_json({"type": "ping", "t": 1})
        assert ws.receive_json()["type"] == "pong"
