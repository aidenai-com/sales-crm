"""
Wire shapes for contacts, the roles they can hold, and their attachment to a deal.
"""

import uuid
from datetime import datetime

from pydantic import Field, computed_field

from app.models.enums import ContactType
from app.schemas.common import ORMModel, PayloadModel

# --- Roles -------------------------------------------------------------------


class ContactRoleRead(ORMModel):
    id: uuid.UUID
    key: str
    name: str
    position: int
    #: Cannot be deleted, and its key cannot change. Champion is the only one, because the stage gate
    #: tests for it by key.
    is_system: bool


class ContactRoleCreate(PayloadModel):
    name: str = Field(min_length=1, max_length=120)
    #: Appended to the end of the list when omitted.
    position: int | None = Field(default=None, ge=1)
    # No `key` and no `is_system`. The key is derived from the name by the server, and only the seeded
    # champion is a system role — a client that could set either could disable the champion gate by
    # creating a second role keyed "champion".


class ContactRoleUpdate(PayloadModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    position: int | None = Field(default=None, ge=1)


# --- Contacts ----------------------------------------------------------------


class ContactRead(ORMModel):
    id: uuid.UUID
    created_at: datetime
    account_id: uuid.UUID
    full_name: str
    email: str
    phone: str
    linkedin_url: str
    designation: str
    contact_type: ContactType


class ContactDetail(ContactRead):
    """A contact with everything a list or drawer needs, so neither has to fetch the account."""

    account_name: str
    #: How many deals this contact is attached to, in any role.
    deal_count: int

    @computed_field  # type: ignore[prop-decorator]
    @property
    def missing_details(self) -> list[str]:
        """
        Which of email, phone and LinkedIn are blank.

        Surfaced on every contact rather than only on champions: these three are what the stage gate
        will demand, and discovering the gap at the point of a blocked stage move is too late to be
        useful. Named fields rather than a boolean so the UI can say what to go and fill in.
        """
        return [
            label
            for label, value in (
                ("email", self.email),
                ("phone", self.phone),
                ("LinkedIn", self.linkedin_url),
            )
            if not value
        ]


class ContactCreate(PayloadModel):
    account_id: uuid.UUID
    full_name: str = Field(min_length=1, max_length=255)
    # Blank rather than absent: there is no difference between "no phone" and "phone unknown", and one
    # empty representation keeps the completeness check a single comparison.
    email: str = Field(default="", max_length=320)
    phone: str = Field(default="", max_length=60)
    linkedin_url: str = Field(default="", max_length=500)
    designation: str = Field(default="", max_length=160)
    contact_type: ContactType


class ContactUpdate(PayloadModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=60)
    linkedin_url: str | None = Field(default=None, max_length=500)
    designation: str | None = Field(default=None, max_length=160)
    contact_type: ContactType | None = None
    # `account_id` is absent. Moving a contact between companies is not an edit — their designation
    # and every deal they are attached to belong to the old account. Create a new contact instead.


# --- Deal contacts -----------------------------------------------------------


class DealRoleRead(ORMModel):
    """
    A role this deal tracks, and how many people currently fill it.

    `filled_count` rather than the people themselves: the deal page renders roles and contacts as one
    grouped list, and it already has the contacts. This exists so a role nobody fills yet still appears.
    """

    id: uuid.UUID
    role_id: uuid.UUID
    role_key: str
    role_name: str
    position: int
    filled_count: int


class DealContactRead(ORMModel):
    """One contact on a deal, flattened so the deal page renders without further lookups."""

    id: uuid.UUID
    contact_id: uuid.UUID
    #: Null when nobody has worked out yet what this person is on this deal.
    role_id: uuid.UUID | None
    role_key: str | None
    role_name: str | None
    full_name: str
    email: str
    phone: str
    linkedin_url: str
    designation: str
    contact_type: ContactType
    account_id: uuid.UUID
    account_name: str
    missing_details: list[str]


class DealContactCreate(PayloadModel):
    """Attaching somebody to a deal. The role is optional — see `DealContact.role_id`."""

    contact_id: uuid.UUID
    role_id: uuid.UUID | None = None


class DealContactUpdate(PayloadModel):
    """
    Remapping an existing attachment.

    `role_id` is explicitly nullable rather than omitted-means-unchanged, because *unmapping* somebody
    is a thing the owner needs to do — a champion who turned out not to be one has to be demotable
    without detaching them from the deal entirely.
    """

    role_id: uuid.UUID | None = None


class DealRoleCreate(PayloadModel):
    """Adding a role for this deal to track, filled or not."""

    role_id: uuid.UUID


class DealPeople(ORMModel):
    """
    Everything the deal page needs about who is involved: the roles tracked, and the people attached.

    One object rather than two endpoints, because the panel renders them together and the interesting
    states are the mismatches — a role nobody fills, a person in no role. Fetching the halves separately
    would let the client draw a moment where one had arrived and the other had not.
    """

    roles: list[DealRoleRead]
    contacts: list[DealContactRead]


class DealContactAssignment(PayloadModel):
    """
    One contact, optionally already in a role, as sent when creating a deal.

    Separate from `DealContactCreate` only because it appears inline in `DealCreate`; keeping the two
    names distinct stops a later change to the deal-creation payload silently altering the standalone
    endpoint's contract.
    """

    contact_id: uuid.UUID
    role_id: uuid.UUID | None = None


__all__ = [
    "ContactCreate",
    "DealContactUpdate",
    "DealRoleCreate",
    "DealRoleRead",
    "DealPeople",
    "ContactDetail",
    "ContactRead",
    "ContactRoleCreate",
    "ContactRoleRead",
    "ContactRoleUpdate",
    "ContactUpdate",
    "DealContactAssignment",
    "DealContactCreate",
    "DealContactRead",
]
