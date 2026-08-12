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

    Three of these are written by the server rather than logged by a person: STAGE_CHANGE when
    a deal moves, DOCUMENT when a file is filed against or removed from a deliverable, and
    NUDGE when an administrator chases a deal's owner. None is offered in the log-activity form
    — see `LoggableActivityKind` on the frontend.

    NUDGE is the one kind that does NOT count as a touch. See `NON_TOUCH_KINDS` in
    `app.services.health`: an administrator asking for work to happen is not the work happening,
    and counting it would clear the very staleness flag that prompted the nudge.

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
    NUDGE = "nudge"


class ActivitySubjectType(str, enum.Enum):
    ACCOUNT = "account"
    LEAD = "lead"
    DEAL = "deal"


class ContactType(str, enum.Enum):
    """
    Which side of the deal a contact sits on.

    The two types named in the requirements. A partner contact's account already *is* the partner
    account, so this duplicates what the foreign key says — it exists because the two are asked for
    separately and because filtering a list needs something cheaper to test than a join.
    """

    CUSTOMER = "customer"
    PARTNER = "partner"


class Health(str, enum.Enum):
    """Always derived, never stored. See `app.services.health`."""

    HEALTHY = "healthy"
    CLOSING_SOON = "closing-soon"
    AT_RISK = "at-risk"
