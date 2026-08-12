import uuid

from pydantic import Field

from app.models.enums import StageKind
from app.schemas.common import ORMModel, PayloadModel

HEX_COLOR = r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$"


class DeliverableRead(ORMModel):
    id: uuid.UUID
    text: str
    position: int


class DeliverableWrite(PayloadModel):
    """
    One deliverable in a stage-update payload.

    `id` present means "this existing row, possibly with new text or a new position"; `id`
    absent means "a new row". A row whose id does not appear in the list is deleted.

    The id is what makes renaming safe. Replacing the whole set on every save — the obvious
    implementation when the client sends plain strings — would issue new ids each time and
    cascade-delete every rep's checkmarks and attachments the first time an admin fixed a
    typo. See `StageDeliverable`.
    """

    id: uuid.UUID | None = None
    text: str = Field(min_length=1)


class StageRead(ORMModel):
    id: uuid.UUID
    name: str
    short_name: str
    probability: int
    color: str
    kind: StageKind
    position: int
    wip_limit: int | None
    #: Whether a deal needs a complete champion before it can enter this stage. Enforced, unlike the
    #: criteria below.
    requires_champion: bool
    # Methodology reference content (spec 6.2). Returned so the client can render the
    # read-only stage playbook; never enforced.
    entry_criteria: list[str] | None
    exit_criteria: list[str] | None
    key_activities: list[str] | None
    #: Rows, not strings — a rep ticks these off and files documents against them.
    deliverables: list[DeliverableRead]


class StageCreate(PayloadModel):
    name: str = Field(min_length=1, max_length=160)
    short_name: str | None = Field(default=None, max_length=60)
    probability: int = Field(default=10, ge=0, le=100)
    color: str = Field(default="#4a90e2", pattern=HEX_COLOR)
    kind: StageKind = StageKind.OPEN
    wip_limit: int | None = Field(default=None, ge=0)
    requires_champion: bool = False
    entry_criteria: list[str] | None = None
    exit_criteria: list[str] | None = None
    key_activities: list[str] | None = None
    #: Plain strings on create: nothing references them yet, so there are no ids to preserve.
    deliverables: list[str] | None = None


class StageUpdate(PayloadModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    short_name: str | None = Field(default=None, min_length=1, max_length=60)
    probability: int | None = Field(default=None, ge=0, le=100)
    color: str | None = Field(default=None, pattern=HEX_COLOR)
    kind: StageKind | None = None
    wip_limit: int | None = Field(default=None, ge=0)
    requires_champion: bool | None = None
    entry_criteria: list[str] | None = None
    exit_criteria: list[str] | None = None
    key_activities: list[str] | None = None
    #: Omitted leaves deliverables untouched. Sent, it is the complete desired list — order
    #: in the array becomes `position`, and anything missing is removed.
    deliverables: list[DeliverableWrite] | None = None


class StageReorder(PayloadModel):
    """Zero-based target index within the template's ordered stages."""

    to_index: int = Field(ge=0)


class StageReassign(PayloadModel):
    to_stage_id: uuid.UUID


class PipelineTemplateRead(ORMModel):
    id: uuid.UUID
    name: str
    stages: list[StageRead]


class PipelineTemplateCreate(PayloadModel):
    name: str = Field(min_length=1, max_length=120)
    #: Copy the stages of an existing template instead of starting from the defaults.
    copy_stages_from: uuid.UUID | None = None


class PipelineTemplateUpdate(PayloadModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)


class PipelineTemplateDuplicate(PayloadModel):
    name: str = Field(min_length=1, max_length=120)


class ReassignResult(ORMModel):
    reassigned: int
