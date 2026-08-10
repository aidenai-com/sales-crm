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

    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)

    #: Whether deals on this pipeline carry a Partner alongside the Customer (R8).
    tracks_partner: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

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
