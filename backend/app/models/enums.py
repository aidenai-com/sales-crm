import enum


class UserRole(str, enum.Enum):
    """spec 6.3: pipeline editing is admin-only; reps get everything else."""

    ADMIN = "admin"
    REP = "rep"


class StageKind(str, enum.Enum):
    """
    What a stage means for reporting.

    Explicit rather than inferred from probability: a Closed Lost stage sits at 0%, so
    deriving "open" from `probability < 100` would count lost deals as open pipeline.
    """

    OPEN = "open"
    WON = "won"
    LOST = "lost"


class ActivityKind(str, enum.Enum):
    """
    What kind of thing happened.

<<<<<<< Updated upstream
    Two of these are written by the server rather than logged by a person: STAGE_CHANGE when
    a deal moves, and DOCUMENT when a file is filed against or removed from a deliverable.
    Neither is offered in the log-activity form — see `LoggableActivityKind` on the frontend.
=======
    Four of these are written by the server rather than logged by a person: STAGE_CHANGE when a
    deal moves, DOCUMENT when a file is filed against or removed from a deliverable, NUDGE when an
    administrator chases a deal's owner, and CONTACT_CHANGE when the people on a deal or the roles
    it tracks change. None is offered in the log-activity form — see `LoggableActivityKind` on the
    frontend.

    NUDGE and CONTACT_CHANGE do NOT count as touches. See `NON_TOUCH_KINDS` in
    `app.services.health`: an administrator asking for work to happen is not the work happening, and
    counting it would clear the very staleness flag that prompted the nudge. Nor is filing who is
    involved contact with them — a deal whose champion was mapped three weeks ago and never called
    since is exactly the stale deal the flag exists to surface.
>>>>>>> Stashed changes

    The frontend groups these into three coloured categories (touchpoint, document, system).
    That grouping is derived from the kind and deliberately not stored: it has no exceptions,
    so a column could only ever drift out of step with this enum.
    """

    # Values keep the frontend's hyphenated wire format.
    CALL = "call"
    MEETING = "meeting"
    EMAIL = "email"
    NOTE = "note"
    STAGE_CHANGE = "stage-change"
    DOCUMENT = "document"
<<<<<<< Updated upstream
=======
    NUDGE = "nudge"
    CONTACT_CHANGE = "contact-change"
>>>>>>> Stashed changes


class ActivitySubjectType(str, enum.Enum):
    ACCOUNT = "account"
    LEAD = "lead"
    DEAL = "deal"


class Health(str, enum.Enum):
    """Always derived, never stored. See `app.services.health`."""

    HEALTHY = "healthy"
    CLOSING_SOON = "closing-soon"
    AT_RISK = "at-risk"


class LemlistSyncStatus(str, enum.Enum):
    """
    Where a lemlist connection's import stands.

    `SYNCING` is held in the database rather than in memory so a second sync request can be refused while
    one is running — a full import walks every campaign under a 20-request-per-2-second budget, and two
    overlapping runs would spend that budget racing each other to write the same rows.

    `ERROR` is separate from `IDLE` because they need different offers: an idle connection needs a "sync
    now" button, and a failed one needs the reason and a retry.
    """

    IDLE = "idle"
    SYNCING = "syncing"
    ERROR = "error"
