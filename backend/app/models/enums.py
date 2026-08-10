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

    Two of these are written by the server rather than logged by a person: STAGE_CHANGE when
    a deal moves, and DOCUMENT when a file is filed against or removed from a deliverable.
    Neither is offered in the log-activity form — see `LoggableActivityKind` on the frontend.

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


class ActivitySubjectType(str, enum.Enum):
    ACCOUNT = "account"
    LEAD = "lead"
    DEAL = "deal"


class Health(str, enum.Enum):
    """Always derived, never stored. See `app.services.health`."""

    HEALTHY = "healthy"
    CLOSING_SOON = "closing-soon"
    AT_RISK = "at-risk"
