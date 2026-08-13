import uuid

from pydantic import Field, model_validator

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
<<<<<<< Updated upstream
=======
    #: How long a deal is expected to spend here. Null on terminal stages, and on stages configured before
    #: the field existed.
    expected_days: int | None
    #: Whether the champion requirement applies while a deal sits here — true from the gate stage onward.
    #: Derived from the pipeline's gate position, never stored on the stage: one gate, one source.
    champion_required: bool = False
    #: True for the one stage that *is* the gate, so the UI can mark where the rule begins rather than
    #: painting an indistinguishable band down half the pipeline.
    is_champion_gate: bool = False
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======
    #: Expected time in this stage, in days. Bounded at a year: a stage nobody expects to clear inside
    #: twelve months is not a stage, it is a parking space, and a typo of 3650 should be caught here.
    expected_days: int | None = Field(default=None, ge=1, le=365)
>>>>>>> Stashed changes
    entry_criteria: list[str] | None = None
    exit_criteria: list[str] | None = None
    key_activities: list[str] | None = None
    #: Plain strings on create: nothing references them yet, so there are no ids to preserve.
    deliverables: list[str] | None = None

    # No `requires_champion`. The gate is one position on the pipeline, declared once in
    # `PipelineTemplateCreate` — a flag here could describe two gates, or a gap where the rule lapses and
    # returns, and neither is a thing a sales process can mean.


class StageUpdate(PayloadModel):
    """
    Editing a stage. **The champion gate is absent here and cannot be changed after creation.**

    A movable gate is unsafe in a way that is not obvious. Moving it *earlier* makes deals that were
    compliant yesterday non-compliant today, retroactively, in somebody else's book; moving it *later*
    silently retires a requirement people were relying on with no record that it ever applied. Either way
    the pipeline stops describing the deals inside it, and no warning before the change fixes that — the
    damage is to the history, not to the moment.

    Setting it at creation has none of those problems for one reason: **a pipeline being created holds no
    deals.** Whatever the gate says is true of every deal that will ever run through it, from the first one
    onward. That is the whole argument, and it is why this is a stricter design rather than a simpler one.

    `expected_days` *is* editable, and the difference is worth stating: it is an expectation, not a rule.
    Nothing is refused because of it, so revising it re-reads history rather than rewriting it.

    `PayloadModel` forbids unknown fields, so an attempt to send a gate is a 422 naming the field rather
    than a change that is quietly dropped. A caller who thinks they are moving a gate must find out that
    they are not.
    """

    name: str | None = Field(default=None, min_length=1, max_length=160)
    short_name: str | None = Field(default=None, min_length=1, max_length=60)
    probability: int | None = Field(default=None, ge=0, le=100)
    color: str | None = Field(default=None, pattern=HEX_COLOR)
    kind: StageKind | None = None
    wip_limit: int | None = Field(default=None, ge=0)
<<<<<<< Updated upstream
=======
    expected_days: int | None = Field(default=None, ge=1, le=365)
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
    #: Deals on this pipeline carry a Partner alongside the Customer (R8).
    tracks_partner: bool
=======
    #: The stage position from which a champion is required, or null. Returned so the UI can say where the
    #: rule starts in one place instead of inferring it from the stages.
    champion_gate_position: int | None = None
>>>>>>> Stashed changes
    stages: list[StageRead]


class PipelineTemplateCreate(PayloadModel):
    """
    A new pipeline, its stages, and the one place its champion gate can be set.

    `stages` exists because the gate can only be set at creation. If a pipeline could only be created from
    the defaults and then edited, there would be no way to gate it at all — the requirement would be
    reachable only on stages added later, which is not a design, it is a gap. So the whole shape is
    declared here.

    All three stage inputs are alternatives, in this order of precedence: explicit `stages`, then
    `copy_stages_from`, then the built-in defaults. Copying is still creation, so a copy carries the
    original's gate — which is the point of copying a working pipeline.
    """

    name: str = Field(min_length=1, max_length=120)
    tracks_partner: bool = False
    #: Copy the stages of an existing template instead of starting from the defaults.
    copy_stages_from: uuid.UUID | None = None
    #: The full stage list, in order. Omitted uses the defaults; an empty list is refused, because a
    #: pipeline with no stages has nowhere for a deal to sit.
    stages: list["StageCreate"] | None = Field(default=None, min_length=1)
    #: The 1-based stage position from which a champion becomes mandatory. Null means this pipeline never
    #: asks for one. Validated against the stage list below.
    champion_gate_position: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def _gate_must_name_a_workable_stage(self) -> "PipelineTemplateCreate":
        """
        The gate has to point at an open stage that exists, and not the last one.

        Checked here rather than in the service because it is a statement about the payload, and a 422 that
        names the field is a better answer than a 409 after the pipeline is half made.

        Pointing at the *final* open stage is refused because the rule would then have no effect: the
        requirement is on moving past the gate, and there is nowhere past the last open stage except the
        terminal ones, which are exempt. A gate that cannot ever fire is a setting somebody will trust.
        """
        if self.champion_gate_position is None or self.stages is None:
            return self

        open_positions = [
            position
            for position, stage in enumerate(self.stages, start=1)
            if stage.kind is StageKind.OPEN
        ]
        if self.champion_gate_position not in open_positions:
            raise ValueError(
                "The champion gate must sit on one of the pipeline's open stages, "
                "not a Closed Won or Closed Lost stage."
            )
        if self.champion_gate_position == max(open_positions):
            raise ValueError(
                "The champion gate cannot sit on the last open stage — nothing comes after it, "
                "so the requirement would never apply. Put it on an earlier stage."
            )
        return self


class PipelineTemplateUpdate(PayloadModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    tracks_partner: bool | None = None


class PipelineTemplateDuplicate(PayloadModel):
    name: str = Field(min_length=1, max_length=120)


class ReassignResult(ORMModel):
    reassigned: int

