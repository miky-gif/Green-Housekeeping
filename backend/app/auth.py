"""Authentification de l'équipe : mots de passe scrypt, sessions par cookie.

- Le mot de passe n'est jamais stocké : seulement un hachage scrypt salé.
- Le jeton de session n'est jamais stocké : seulement son empreinte SHA-256.
- Cookie HttpOnly, SameSite=Lax, Secure dès que la page est servie en HTTPS.
- Limitation des tentatives de connexion par adresse IP.
"""

import base64
import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import timedelta
from typing import Optional

from fastapi import Depends, Request, Response
from sqlmodel import Session, select

from .db import get_session
from .logic import BusinessError
from .models import AuthSession, User, utcnow

COOKIE = "gk_session"
SHORT_SESSION = timedelta(hours=12)
LONG_SESSION = timedelta(days=30)

_SCRYPT = {"n": 2**14, "r": 8, "p": 1, "dklen": 32}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, **_SCRYPT)
    return "scrypt$" + base64.b64encode(salt).decode() + "$" + base64.b64encode(digest).decode()


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_b64, digest_b64 = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode(), salt=base64.b64decode(salt_b64), **_SCRYPT)
        return hmac.compare_digest(digest, base64.b64decode(digest_b64))
    except (ValueError, TypeError):
        return False


def generate_password() -> str:
    """Mot de passe provisoire lisible (communiqué une seule fois)."""
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789"
    return "-".join("".join(secrets.choice(alphabet) for _ in range(4)) for _ in range(3))


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ------------------------------------------------------------- limitation

_ATTEMPTS: dict[str, deque] = defaultdict(deque)
MAX_FAILURES = 8
WINDOW_S = 600


def check_rate(ip: str) -> None:
    q = _ATTEMPTS[ip]
    now = time.monotonic()
    while q and now - q[0] > WINDOW_S:
        q.popleft()
    if len(q) >= MAX_FAILURES:
        raise BusinessError(429, "Trop de tentatives. Réessayez dans quelques minutes.")


def record_failure(ip: str) -> None:
    _ATTEMPTS[ip].append(time.monotonic())


def clear_failures(ip: str) -> None:
    _ATTEMPTS.pop(ip, None)


# --------------------------------------------------------------- sessions

def login(session: Session, email: str, password: str) -> Optional[User]:
    user = session.exec(select(User).where(User.email == email.strip().lower())).first()
    if user is None:
        # Même coût de calcul qu'un vrai essai : ne révèle pas si l'adresse existe.
        verify_password(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
        return None
    return user if verify_password(password, user.password_hash) else None


def open_session(session: Session, user: User, remember: bool) -> tuple[str, timedelta]:
    token = secrets.token_urlsafe(32)
    ttl = LONG_SESSION if remember else SHORT_SESSION
    session.add(AuthSession(token_hash=_token_hash(token), user_id=user.id, expires_at=utcnow() + ttl))
    session.commit()
    return token, ttl


def close_session(session: Session, token: Optional[str]) -> None:
    if not token:
        return
    row = session.exec(select(AuthSession).where(AuthSession.token_hash == _token_hash(token))).first()
    if row:
        session.delete(row)
        session.commit()


def set_cookie(response: Response, request: Request, token: str, ttl: timedelta, remember: bool) -> None:
    response.set_cookie(
        COOKIE,
        token,
        max_age=int(ttl.total_seconds()) if remember else None,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https",
        path="/",
    )


def _as_aware(dt):
    from datetime import timezone

    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def current_user(request: Request) -> User:
    """Dépendance FastAPI : l'utilisateur connecté, ou 401."""
    token = request.cookies.get(COOKIE)
    if not token:
        raise BusinessError(401, "Connexion requise.")
    with get_session() as s:
        row = s.exec(select(AuthSession).where(AuthSession.token_hash == _token_hash(token))).first()
        if row is None or _as_aware(row.expires_at) < utcnow():
            raise BusinessError(401, "Session expirée. Reconnectez-vous.")
        user = s.get(User, row.user_id)
        if user is None:
            raise BusinessError(401, "Compte introuvable.")
        return user


def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise BusinessError(403, "Réservé aux administrateurs de l'équipe.")
    return user


def user_payload(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name, "title": user.title, "role": user.role}


def create_user(session: Session, *, email: str, name: str, title: str, role: str, password: str) -> User:
    email = email.strip().lower()
    if session.exec(select(User).where(User.email == email)).first():
        raise BusinessError(409, "Un membre utilise déjà cette adresse e-mail.")
    user = User(email=email, name=name.strip(), title=title.strip(), role=role, password_hash=hash_password(password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return user
