import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import StageKind


class PipelineTemplate(UUIDMixin, TimestampMixin, Base):
    """
    A pipeline defined as data, not code (spec 6.2).

    R6 requires two pipelines with different stages, and R7 an onboarding stage on the
    partner one. Because templates are rows, adding a pipeline needs no migration.

    There is deliberately no `type` enum. It used to be direct/partner, which capped the
    system at exactly those two and contradicted spec 6.2's "extensible". It was also only
    ever read to answer one question — should this pipeline show a Partner field alongside
    the Customer — so that question is now its own field and the name is free text.
    """

    __tablename__ = "pipeline_templates"
    __table_args__ = (
        CheckConstraint(
            "champion_gate_position IS NULL OR champion_gate_position >= 1",
            name="champion_gate_position_positive",
        ),
    )

    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)

<<<<<<< Updated upstream
    #: Whether deals on this pipeline carry a Partner alongside the Customer (R8).
    tracks_partner: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
=======
    #: The stage position from which a champion is required, or null for a pipeline that never asks.
    #:
    #: **One position, not a flag per stage, and this is the whole design.** The rule is "from this stage
    #: onward": with the gate at 2, a deal can enter stage 2 freely but cannot leave it — nor stage 3, nor
    #: stage 4 — without a champion who has email, phone and LinkedIn. A boolean on each stage could
    #: represent two gates, or a gap where the requirement lapses and returns, neither of which is a thing
    #: the process can mean. Storing the position makes those states unrepresentable rather than merely
    #: discouraged.
    #:
    #: Set once, when the pipeline is created, and never afterwards. Moving a gate under deals that are
    #: already past it would retroactively make compliant deals non-compliant, and no amount of warning
    #: copy makes that a reasonable thing for one admin to do to everybody else's book.
    champion_gate_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
>>>>>>> Stashed changes

    stages: Mapped[list["Stage"]] = relationship(
        back_populates="pipeline",
        cascade="all, delete-orphan",
        order_by="Stage.position",
        lazy="selectin",
    )
    deals: Mapped[list["Deal"]] = relationship(back_populates="pipeline")  # noqa: F821

    def __repr__(self) -> str:
        return f"<PipelineTemplate {self.name}>"


class Stage(UUIDMixin, TimestampMixin, Base):
    """
    An ordered stage within a template.

    `entry_criteria` / `exit_criteria` / `key_activities` hold the AidenAI methodology
    detail (spec 6.2) as JSONB string arrays. They stay reference content — nothing
    enforces them.

    `deliverables` used to be a fourth JSONB array and is now the `StageDeliverable` table
    below. Once a rep can tick a deliverable off and file a document against it, the
    deliverable needs an identity that survives an admin renaming or reordering it; an
    array index does not. See `StageDeliverable`.
    """

    __tablename__ = "stages"
    __table_args__ = (
        # DEFERRABLE so a reorder can shuffle positions inside one transaction without
        # tripping the constraint on an intermediate state.
        UniqueConstraint(
            "pipeline_template_id",
            "position",
            name="uq_stage_pipeline_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("probability >= 0 AND probability <= 100", name="probability_range"),
        CheckConstraint("position >= 1", name="position_positive"),
        CheckConstraint("wip_limit IS NULL OR wip_limit >= 0", name="wip_limit_non_negative"),
    )

    pipeline_template_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("pipeline_templates.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    short_name: Mapped[str] = mapped_column(String(60), nullable=False)
    probability: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    color: Mapped[str] = mapped_column(String(9), nullable=False, default="#a6bbd1")
    kind: Mapped[StageKind] = mapped_column(
        Enum(StageKind, name="stage_kind", values_callable=lambda e: [m.value for m in e]),
        nullable=False,
        default=StageKind.OPEN,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    wip_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)

<<<<<<< Updated upstream
=======
    #: How long a deal is expected to spend in this stage, in days. Null on terminal stages, where the
    #: question has no meaning — nothing is expected to leave Closed Won.
    #:
    #: Set when the pipeline is configured, alongside the champion gate, because both are statements about
    #: how the process is supposed to run rather than facts about any one deal.
    expected_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # The champion gate is deliberately NOT a per-stage flag. It is one position on the pipeline — see
    # `PipelineTemplate.champion_gate_position` — because the rule is "from this stage onward", which a
    # boolean per stage cannot express without allowing two gates and disagreeing with itself.

>>>>>>> Stashed changes
    entry_criteria: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    exit_criteria: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    key_activities: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)

    pipeline: Mapped[PipelineTemplate] = relationship(back_populates="stages")
    # No cascade: deleting a stage that still holds deals is refused in the service layer
    # (spec 6.3), and RESTRICT makes the database enforce that too.
    deals: Mapped[list["Deal"]] = relationship(back_populates="stage")  # noqa: F821
    deliverables: Mapped[list["StageDeliverable"]] = relationship(
        back_populates="stage",
        cascade="all, delete-orphan",
        order_by="StageDeliverable.position",
        lazy="selectin",
    )

    def __repr__(self) -> str:
        return f"<Stage {self.name} ({self.probability}%)>"


class StageDeliverable(UUIDMixin, TimestampMixin, Base):
    """
    One checkable deliverable on a stage.

    A row rather than an entry in a JSONB array, because per-deal state now hangs off it:
    a rep ticks it complete and files documents against it. Keyed by array index, an admin
    reordering the list in Settings would reassign every rep's checkmarks and attachments
    to the wrong item, silently. A stable id is the whole point.

    Renaming is therefore free — `text` can change without disturbing anything that
    references the row.
    """

    __tablename__ = "stage_deliverables"
    __table_args__ = (
        # DEFERRABLE for the same reason as the stage constraint: a reorder shuffles
        # positions inside one transaction and passes through intermediate collisions.
        UniqueConstraint(
            "stage_id",
            "position",
            name="uq_stage_deliverable_position",
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("position >= 1", name="position_positive"),
    )

    stage_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("stages.id", ondelete="CASCADE"), nullable=False, index=True
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    stage: Mapped[Stage] = relationship(back_populates="deliverables")

    def __repr__(self) -> str:
        return f"<StageDeliverable {self.text[:40]}>"
