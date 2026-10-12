#!/usr/bin/env python3
"""Lanceur Green Housekeeping : une seule commande.

    python run.py            installe ce qui manque, compile le frontend,
                             démarre le serveur sur 0.0.0.0:8000
    python run.py --dev      mode développement (Vite + rechargement à chaud)
    python run.py --reset    repart du jeu de données initial
    python run.py --port 9000
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import socket
import subprocess
import sys
import venv
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
VENV = BACKEND / ".venv"
PY = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
DB_FILE = BACKEND / "data" / "green_housekeeping.db"

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
except Exception:
    pass


def step(msg: str) -> None:
    print(f"\n> {msg}", flush=True)


def fail(msg: str) -> None:
    print(f"\n[ERREUR] {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def run(cmd: list, cwd: Path) -> None:
    res = subprocess.run([str(c) for c in cmd], cwd=cwd)
    if res.returncode != 0:
        fail(f"La commande a échoué : {' '.join(map(str, cmd))}")


# ------------------------------------------------------------------ backend

def ensure_backend() -> None:
    if sys.version_info < (3, 10):
        fail(f"Python 3.11+ requis (trouvé {sys.version.split()[0]}).")
    if sys.version_info < (3, 11):
        print(f"  (Python {sys.version.split()[0]} détecté : 3.11+ recommandé, 3.10 fonctionne.)")
    if not PY.exists():
        step("Création de l'environnement Python (backend/.venv)")
        venv.create(VENV, with_pip=True)
    req = (BACKEND / "requirements.txt").read_bytes()
    digest = hashlib.sha256(req).hexdigest()
    stamp = VENV / ".requirements.sha256"
    if not stamp.exists() or stamp.read_text().strip() != digest:
        step("Installation des dépendances Python")
        run([PY, "-m", "pip", "install", "--disable-pip-version-check", "-q", "-r", "requirements.txt"], BACKEND)
        stamp.write_text(digest)


# ----------------------------------------------------------------- frontend

def newest_mtime(paths: list[Path]) -> float:
    latest = 0.0
    for p in paths:
        if p.is_dir():
            for f in p.rglob("*"):
                if f.is_file():
                    latest = max(latest, f.stat().st_mtime)
        elif p.exists():
            latest = max(latest, p.stat().st_mtime)
    return latest


def ensure_frontend(build: bool = True) -> None:
    npm = shutil.which("npm")
    dist = FRONTEND / "dist" / "index.html"
    sources = [FRONTEND / "src", FRONTEND / "public", FRONTEND / "index.html", FRONTEND / "package.json",
               FRONTEND / "vite.config.ts", FRONTEND / "tailwind.config.js"]
    stale = not dist.exists() or newest_mtime(sources) > dist.stat().st_mtime
    if build and not stale:
        return
    if npm is None:
        if dist.exists():
            print("  (npm introuvable : utilisation du frontend déjà compilé.)")
            return
        fail("Node.js 18+ est requis pour compiler le frontend : https://nodejs.org")
    modules = FRONTEND / "node_modules"
    lock = FRONTEND / "package-lock.json"
    marker = modules / ".package-lock.json"
    if not modules.exists() or not marker.exists() or (FRONTEND / "package.json").stat().st_mtime > marker.stat().st_mtime:
        step("Installation des dépendances frontend (npm)")
        run([npm, "ci" if lock.exists() else "install", "--no-audit", "--no-fund"], FRONTEND)
    if build:
        step("Compilation du frontend")
        run([npm, "run", "build"], FRONTEND)


# ------------------------------------------------------------------ réseau

def lan_ips() -> list[str]:
    ips: list[str] = []
    try:  # interface par défaut (aucun paquet n'est envoyé)
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        ips += socket.gethostbyname_ex(socket.gethostname())[2]
    except OSError:
        pass
    seen, out = set(), []
    for ip in ips:
        if ip.startswith("127.") or ip.startswith("169.254.") or ip in seen:
            continue
        seen.add(ip)
        out.append(ip)
    return out


def port_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("0.0.0.0", port))
            return True
        except OSError:
            return False


def banner(port: int) -> None:
    ips = lan_ips()
    host = ips[0] if ips else "localhost"
    phone = f"http://{host}:{port}/chambre/313"
    print("\n" + "=" * 64)
    print("  Green Housekeeping · SunyGreen — démo prête")
    print("=" * 64)
    print(f"  Dashboard (laptop)   http://localhost:{port}/dashboard")
    print(f"  Bouton (téléphone)   {phone}")
    for other in ips[1:]:
        print(f"                       http://{other}:{port}/chambre/313  (autre interface)")
    print("  Chambres disponibles : 312-316, 420-424")
    if ips:
        print("\n  Scannez ce QR code avec le téléphone (même Wi-Fi) :\n")
        subprocess.run([str(PY), "-c", "import segno,sys; segno.make(sys.argv[1], micro=False).terminal(compact=True)", phone],
                       env=dict(os.environ, PYTHONIOENCODING="utf-8"))
    else:
        print("\n  Aucune adresse réseau détectée : connectez le laptop au Wi-Fi ou à un partage de connexion.")
    print("\n  Ctrl+C pour arrêter.\n", flush=True)


# -------------------------------------------------------------------- main

def main() -> None:
    ap = argparse.ArgumentParser(description="Lance la démo Green Housekeeping.")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--dev", action="store_true", help="Vite (5173) + uvicorn --reload")
    ap.add_argument("--reset", action="store_true", help="supprime la base et repart du jeu initial")
    args = ap.parse_args()

    if not port_free(args.port):
        fail(f"Le port {args.port} est déjà utilisé : la démo tourne peut-être déjà "
             f"(ouvrez http://localhost:{args.port}/dashboard). Sinon : python run.py --port {args.port + 1}")

    ensure_backend()
    ensure_frontend(build=not args.dev)

    if args.reset:
        for suffix in ("", "-wal", "-shm"):
            Path(str(DB_FILE) + suffix).unlink(missing_ok=True)
        print("  Base réinitialisée.")

    uvicorn = [str(PY), "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", str(args.port),
               "--no-access-log", "--ws-ping-interval", "10", "--ws-ping-timeout", "10"]
    procs: list[subprocess.Popen] = []
    try:
        if args.dev:
            procs.append(subprocess.Popen(uvicorn + ["--reload"], cwd=BACKEND))
            env = dict(os.environ, GH_BACKEND=f"http://127.0.0.1:{args.port}")
            procs.append(subprocess.Popen([shutil.which("npm") or "npm", "run", "dev"], cwd=FRONTEND, env=env))
            banner(5173)
        else:
            procs.append(subprocess.Popen(uvicorn, cwd=BACKEND))
            banner(args.port)
        procs[0].wait()
    except KeyboardInterrupt:
        pass
    finally:
        for p in procs:
            if p.poll() is None:
                p.terminate()
        for p in procs:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        print("\nServeur arrêté.")


if __name__ == "__main__":
    main()
