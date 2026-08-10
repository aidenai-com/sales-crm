"""
Outbound notification, behind one small interface.

Which implementation is used is decided by configuration, not by code: `SMTP_HOST` set means
mail is sent, blank means it is logged. A fresh checkout therefore works with no credentials
at all, and dropping real ones into `.env` switches sending on without touching a line here.

This protocol is also the seam a future Outlook / Microsoft Graph integration attaches to —
a third implementation, chosen the same way, with nothing above it needing to change.
"""

import asyncio
import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from functools import lru_cache
from typing import Protocol

from app.core.config import settings

logger = logging.getLogger("app.notifications")


@dataclass(frozen=True)
class Notification:
    to: str
    subject: str
    body: str


class Notifier(Protocol):
    async def send(self, notification: Notification) -> bool:
        """Returns whether the notification was accepted for delivery."""
        ...


class LoggingNotifier:
    """
    The default. Logs what it would have sent and reports success.

    Reporting success is the right call for a development stand-in: the caller stamps
    `notified_at` and moves on, so behaviour matches production and a reminder is not
    re-processed on every sweep. The log line carries the whole message, so what a rep
    would have received is verifiable without a mail server.
    """

    async def send(self, notification: Notification) -> bool:
        logger.info(
            "[notification not sent — SMTP_HOST is unset] to=%s subject=%s\n%s",
            notification.to,
            notification.subject,
            notification.body,
        )
        return True


class SmtpNotifier:
    """
    Real email over SMTP.

    `smtplib` is synchronous and a slow mail server would otherwise stall the event loop for
    every other request, so the send runs in a worker thread.
    """

    async def send(self, notification: Notification) -> bool:
        try:
            await asyncio.to_thread(self._send_blocking, notification)
        except (smtplib.SMTPException, OSError):
            # Logged, not raised. The caller is a background sweep handling many reminders,
            # and one unreachable mailbox must not stop the rest.
            logger.exception("Could not email %s", notification.to)
            return False
        return True

    def _send_blocking(self, notification: Notification) -> None:
        message = EmailMessage()
        message["From"] = settings.smtp_from
        message["To"] = notification.to
        message["Subject"] = notification.subject
        message.set_content(notification.body)

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=20) as client:
            if settings.smtp_use_tls:
                client.starttls()
            # Anonymous relays exist — an internal mail host often needs no credentials.
            if settings.smtp_user:
                client.login(settings.smtp_user, settings.smtp_password)
            client.send_message(message)


@lru_cache
def get_notifier() -> Notifier:
    if settings.smtp_configured:
        logger.info("Email notifications will be sent via %s", settings.smtp_host)
        return SmtpNotifier()

    logger.info("SMTP_HOST is unset — reminder emails will be logged rather than sent")
    return LoggingNotifier()
