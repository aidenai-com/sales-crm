"""
How long a deal has been where it is, and whether that is too long.

**No new column.** Ageing is derived from three things the application already records: the deal's creation
date, each stage's expected duration, and the stage-change activity written every time a deal moves. A stored
`days_in_stage` would be wrong within a day of being written, for the same reason deal health is never
stored.

There are two measures here, and which one applies depends on what the record can actually support.

**Time in the current stage**, when a stage-change activity exists for the deal: `now - the latest move`.
This is the sharp signal and the one the requirement asks for — a rep parked in Discovery for three months
is visible immediately, compared against that stage's own expected days.

**Time in the pipeline against the cycle so far**, when no move was ever logged: `now - created_at` compared
with the *cumulative* expected days of every stage up to and including the current one. A deal created 151
days ago sitting in a stage the process says should have been reached by day 141 is provably behind, even
though nothing records when it arrived. Attributing all 151 days to the current stage would be the wrong
answer — it would blame one stage for the whole pipeline's delay — so this compares like with like instead.

Both produce the same shape of answer: days used, days expected, days over. The reported `basis` says which
measure was used, because "47 days in Validate" and "151 days to reach Validate" are different claims and a
screen that presented them identically would be overstating one of them.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Literal

from app.models import Deal, Stage, StageKind

#: Which evidence the figure rests on.
#:
#: `stage` is measured from a logged move and describes the current stage alone. `cycle` is measured from
#: creation against every stage up to here, and is used when no move was ever recorded — it is a weaker claim
#: about one stage but an equally firm claim about the deal.
AgeingBasis = Literal["stage", "cycle"]


@dataclass(frozen=True)
class Ageing:
    """What is known about a deal's age, and the verdict that follows from it."""

    basis: AgeingBasis
    #: Days elapsed on whichever clock `basis` names.
    days_used: int
    #: What the process allows on that same clock. None when the stages carry no expected duration, in which
    #: case nothing can be judged and `days_over` is zero rather than a guess.
    days_expected: int | None
    #: Positive when the deal has run past its allowance. Zero when inside it, or when unknowable.
    days_over: int
    #: Days left before it runs over. None once it already has, or when unknowable.
    days_left: int | None

    @property
    def is_stuck(self) -> bool:
        return self.days_over > 0


def cumulative_expected_days(stages: Sequence[Stage], position: int) -> int | None:
    """
    How long the process allows to *reach the end of* the stage at `position`.

    Sums the open stages up to and including it. Terminal stages are excluded because nothing is expected to
    leave Closed Won, and including a null one anywhere in the run returns None — a partial sum would be a
    smaller allowance than the process actually gives, so it would flag deals that are fine.
    """
    relevant = [
        stage
        for stage in stages
        if stage.kind is StageKind.OPEN and stage.position <= position
    ]
    if not relevant:
        return None
    if any(stage.expected_days is None for stage in relevant):
        return None
    return sum(stage.expected_days or 0 for stage in relevant)


def stage_entered_at(deal: Deal, last_stage_change: datetime | None) -> tuple[datetime, bool]:
    """
    When the deal arrived in its current stage, and whether that is a fact or a floor.

    The activity feed is the record of moves, so its latest stage-change is the arrival. With none logged the
    best available answer is the deal's own creation — true as a *lower bound* on how long it has been here,
    which is why the second element of the pair exists: a caller must not print an estimate as a measurement.
    """
    if last_stage_change is not None:
        return last_stage_change, True
    created = deal.created_at
    return (created if created.tzinfo else created.replace(tzinfo=UTC)), False


def deal_ageing(
    deal: Deal,
    stages: Sequence[Stage],
    last_stage_change: datetime | None,
    today: date | None = None,
) -> Ageing | None:
    """
    The age of one deal, or None when it is closed.

    Closed deals are exempt outright. A won deal that took nine months took nine months; reporting it as
    overdue would fill an exceptions list with history nobody can act on.
    """
    if deal.stage.kind is not StageKind.OPEN:
        return None

    today = today or datetime.now(UTC).date()
    entered, exact = stage_entered_at(deal, last_stage_change)

    if exact:
        days_used = (today - entered.date()).days
        days_expected = deal.stage.expected_days
        basis: AgeingBasis = "stage"
    else:
        created = deal.created_at
        created = created if created.tzinfo else created.replace(tzinfo=UTC)
        days_used = (today - created.date()).days
        days_expected = cumulative_expected_days(stages, deal.stage.position)
        basis = "cycle"

    # Negative elapsed time is impossible in the data but trivially possible from a clock skew or a
    # back-dated record, and a negative age would sort to the top of a worst-first list.
    days_used = max(days_used, 0)

    if days_expected is None:
        return Ageing(basis=basis, days_used=days_used, days_expected=None, days_over=0, days_left=None)

    difference = days_used - days_expected
    return Ageing(
        basis=basis,
        days_used=days_used,
        days_expected=days_expected,
        days_over=max(difference, 0),
        days_left=None if difference > 0 else -difference,
    )
