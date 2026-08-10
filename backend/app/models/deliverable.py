import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class DealDeliverableCompletion(UUIDMixin, Base):
    """
    A ticked checkbox: this deal has completed this stage deliverable.

    The row's existence *is* the checkmark. There is no boolean column, because a row with
    `completed = false` would mean the same thing as no row at all, and two encodings of
    one fact drift apart. Unticking deletes the row.

    No `TimestampMixin`: `completed_at` is the only timestamp that means anything here, and
    a separate `created_at` recording the same instant would invite the two to disagree.
    """

    __tablename__ = "deal_deliverable_completions"
    __table_args__ = (
        # Ticking an already-ticked box is idempotent, not a duplicate row.
        UniqueConstraint(
            "deal_id", "stage_deliverable_id", name="uq_completion_deal_deliverable"
        ),
    )

    deal_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_deliverable_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey(
            "stage_deliverables.id",
            ondelete="CASCADE",
            # The convention-derived name would exceed Postgres' 63-character limit.
            name="fk_deal_deliverable_completions_deliverable_id",
        ),
        nullable=False,
        index=True,
    )
    completed_by_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    deal: Mapped["Deal"] = relationship()  # noqa: F821
    deliverable: Mapped["StageDeliverable"] = relationship(lazy="joined")  # noqa: F821
    completed_by: Mapped["User"] = relationship(lazy="joined")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Completion deal={self.deal_id} deliverable={self.stage_deliverable_id}>"


class Attachment(UUIDMixin, TimestampMixin, Base):
    """
    A document filed against a deal's stage deliverable.

    Keyed to the deliverable, not to the completion row. The requirement is that a document
    is not mandatory for ticking the box; the converse has to hold too, or attaching a draft
    proposal would silently mark the deliverable done. Keeping the two independent is what
    lets a rep upload evidence first and tick second, or tick without uploading at all.

    The file itself lives in object storage — see `app.services.storage`. This row holds
    only metadata, and `storage_key` is generated server-side so a caller can never point a
    row at another deal's prefix.
    """

    __tablename__ = "attachments"
    __table_args__ = (CheckConstraint("size_bytes > 0", name="size_positive"),)

    deal_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("deals.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage_deliverable_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True),
        ForeignKey("stage_deliverables.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    #: As the user named it, for display and for the download filename. Never used to build
    #: a storage key — `storage_key` is the only path that touches the bucket.
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(160), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), nullable=False, unique=True)

    uploaded_by_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    deal: Mapped["Deal"] = relationship()  # noqa: F821
    deliverable: Mapped["StageDeliverable"] = relationship()  # noqa: F821
    uploaded_by: Mapped["User"] = relationship(lazy="joined")  # noqa: F821

    def __repr__(self) -> str:
        return f"<Attachment {self.filename} ({self.size_bytes} bytes)>"
