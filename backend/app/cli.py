"""Commandes d'administration.

    python -m app.cli create-admin                 crée un compte administrateur (questions)
    python -m app.cli create-admin --email … --name … --password …
    python -m app.cli ensure-admin                 propose de créer le premier compte si l'équipe est vide

Le mot de passe n'est jamais affiché ni enregistré en clair.
"""

import argparse
import getpass
import sys

from sqlmodel import select

from .auth import create_user
from .db import create_schema, get_session
from .logic import BusinessError
from .models import User

MIN_PASSWORD = 8


def _ask(label: str, default: str = "") -> str:
    value = input(f"  {label}{f' [{default}]' if default else ''} : ").strip()
    return value or default


def _ask_password() -> str:
    while True:
        pw = getpass.getpass(f"  Mot de passe ({MIN_PASSWORD} caractères minimum) : ")
        if len(pw) < MIN_PASSWORD:
            print("  Mot de passe trop court.")
            continue
        if getpass.getpass("  Confirmez le mot de passe : ") != pw:
            print("  Les deux saisies sont différentes.")
            continue
        return pw


def create_admin(email: str = "", name: str = "", title: str = "", password: str = "") -> int:
    create_schema()
    if not (email and name and password):
        if not sys.stdin.isatty():
            print("Indiquez --email, --name et --password (aucun terminal interactif).", file=sys.stderr)
            return 2
        print("\n  Création d'un compte administrateur GreenKeeping")
        name = name or _ask("Nom complet")
        email = email or _ask("Adresse e-mail professionnelle")
        title = title or _ask("Fonction", "Gouvernante générale")
        password = password or _ask_password()
    if "@" not in email or not name:
        print("  Nom ou adresse e-mail invalide.", file=sys.stderr)
        return 2
    if len(password) < MIN_PASSWORD:
        print(f"  Mot de passe trop court ({MIN_PASSWORD} caractères minimum).", file=sys.stderr)
        return 2
    try:
        with get_session() as s:
            user = create_user(s, email=email, name=name, title=title or "Gouvernante générale", role="admin", password=password)
    except BusinessError as e:
        print(f"  {e.message}", file=sys.stderr)
        return 1
    print(f"  Compte administrateur créé : {user.name} <{user.email}>\n")
    return 0


def ensure_admin() -> int:
    """Si l'équipe est vide, propose de créer le premier administrateur."""
    create_schema()
    with get_session() as s:
        if s.exec(select(User.id)).first() is not None:
            return 0
    if not sys.stdin.isatty():
        print("Aucun compte : créez le premier administrateur avec `python -m app.cli create-admin` "
              "ou les variables GH_ADMIN_EMAIL / GH_ADMIN_PASSWORD.")
        return 0
    print("\n  Aucun compte n'existe encore. Créons le premier administrateur.")
    return create_admin()


def main() -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
    except Exception:
        pass
    ap = argparse.ArgumentParser(prog="python -m app.cli", description="Administration GreenKeeping")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("create-admin", help="crée un compte administrateur")
    c.add_argument("--email", default="")
    c.add_argument("--name", default="")
    c.add_argument("--title", default="")
    c.add_argument("--password", default="", help="à éviter : préférez la saisie masquée")
    sub.add_parser("ensure-admin", help="crée le premier administrateur si l'équipe est vide")
    args = ap.parse_args()
    try:
        if args.cmd == "create-admin":
            return create_admin(args.email.strip().lower(), args.name.strip(), args.title.strip(), args.password)
        return ensure_admin()
    except (EOFError, KeyboardInterrupt):
        print("\n  Création annulée. Relancez `python run.py --create-admin` quand vous voulez.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
