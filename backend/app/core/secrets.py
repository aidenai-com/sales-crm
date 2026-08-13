"""
Encryption for third-party credentials held on behalf of a user.

A lemlist API key is not ours. It grants full read and write access to somebody's outreach account, it
cannot be rotated by us, and lemlist shows it to its owner exactly once — so a leaked copy is a real
incident for them and an unrecoverable one. Storing it in plaintext in a column would make every future
database dump, backup, log of a bad query, and read-only analytics grant a disclosure of it.

Hashing is not an option here, which is the difference between this and a password: we have to *send* the
key to lemlist on every call, so we need it back. That means encryption with a key held outside the
database.

Fernet, from `cryptography`, rather than anything hand-rolled: it is authenticated (AES-128-CBC with an
HMAC-SHA256 tag), so a tampered ciphertext is rejected rather than silently decrypted to garbage that then
gets sent to lemlist as somebody's key.
"""

import base64
import hashlib
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


class SecretUnreadable(Exception):
    """
    Raised when a stored secret cannot be decrypted.

    Almost always means `secret_key` changed — rotating it makes every previously stored credential
    unreadable, which is the correct behaviour and worth saying out loud rather than crashing with a
    library error. The user has to reconnect; nobody can recover the old value, including us.
    """


@lru_cache(maxsize=1)
def _cipher() -> Fernet:
    """
    The cipher, derived from the application's `secret_key`.

    Derived rather than configured separately so a fresh checkout works with no extra setup, and cached
    because key derivation on every request would be pure waste.

    The derivation is a plain SHA-256 of a labelled input, not a password KDF, and that is deliberate:
    `secret_key` is already a high-entropy application secret rather than a human-chosen password, so the
    slow hashing a KDF buys — resistance to brute force over a small search space — protects against
    nothing here. The label keeps this key distinct from the same secret's use for signing JWTs, so a
    weakness in one cannot become a weakness in the other.

    Known limitation, stated plainly: the encryption key lives in the same configuration the application
    reads, so this protects against a leaked *database* and not against a leaked *host*. A real deployment
    should point this at a KMS or a secrets manager. That is a deployment change, not a code change — only
    this function has to grow a branch.
    """
    material = hashlib.sha256(f"lemlist-credential-encryption:{settings.secret_key}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(material))


def encrypt_secret(plaintext: str) -> str:
    """Encrypts a credential for storage. The result is safe to put in a text column."""
    return _cipher().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    """Reads a stored credential back. Raises `SecretUnreadable` if it cannot be trusted."""
    try:
        return _cipher().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise SecretUnreadable(
            "This integration's stored credentials cannot be read. Reconnect the account."
        ) from exc


def fingerprint(plaintext: str) -> str:
    """
    A short, stable, non-reversible label for a credential.

    So the UI can say "the key ending ...4f2a" and a user can tell whether the key we hold is the one they
    think it is, without us ever showing the key back to them. Derived from a hash rather than the last
    characters of the key itself, because the tail of a credential is still part of the credential.
    """
    return hashlib.sha256(plaintext.encode()).hexdigest()[:8]
