"""
Contacts and the roles they hold on deals.

Contacts have no owner, and every account is visible to every authenticated user, so reads are
unscoped. Writes are open to any authenticated user for the same reason the account create endpoint is
— filing a person is routine work, and a contact nobody can add is a field, not an object.

Role *definitions* are admin-only. Which roles exist is a configuration decision for the whole
company, like a pipeline's stages, not something a rep changes mid-deal.
"""

import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.models import Contact, ContactRole
from app.models.enums import ContactType
from app.repositories import accounts as accounts_repo
from app.repositories import contacts as contacts_repo
from app.schemas.common import Message
from app.schemas.contact import (
    ContactCreate,
    ContactDetail,
    ContactRoleCreate,
    ContactRoleRead,
    ContactRoleUpdate,
    ContactUpdate,
)
from app.services import contacts as contact_service

router = APIRouter(tags=["contacts"])


# --- Roles -------------------------------------------------------------------
#
# Declared before /contacts/{contact_id} so "roles" is not parsed as a contact id.


@router.get("/contacts/roles", response_model=list[ContactRoleRead])
async def list_roles(db: DbSession, _: CurrentUser) -> list[ContactRoleRead]:
    return [contact_service.role_read(role) for role in await contacts_repo.list_roles(db)]


@router.post("/contacts/roles", response_model=ContactRoleRead, status_code=status.HTTP_201_CREATED)
async def create_role(db: DbSession, _: AdminUser, payload: ContactRoleCreate) -> ContactRoleRead:
    """
    Adds a role deals can assign. Administrators only.

    The key is derived from the name rather than supplied, and a derived key that lands on a reserved
    one is refused: a second role keyed `champion` would make the stage gate ambiguous about which of
    them satisfies it.
    """
    key = contact_service.slugify_role(payload.name)
    if key in contact_service.RESERVED_ROLE_KEYS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f'"{payload.name}" is reserved. The Champion role already exists and cannot be duplicated.',
        )

    position = payload.position
    if position is None:
        highest = (await db.execute(select(func.max(ContactRole.position)))).scalar_one_or_none()
        position = (highest or 0) + 1

    role = ContactRole(key=key, name=payload.name.strip(), position=position, is_system=False)
    db.add(role)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A role with that name already exists"
        ) from exc
    await db.refresh(role)
    return contact_service.role_read(role)


@router.patch("/contacts/roles/{role_id}", response_model=ContactRoleRead)
async def update_role(
    db: DbSession, _: AdminUser, role_id: uuid.UUID, payload: ContactRoleUpdate
) -> ContactRoleRead:
    """
    Renames or reorders a role.

    A system role can be renamed but its `key` never changes, so the champion gate keeps working
    against a role now labelled "Advocate". That is the point of having a key at all.
    """
    role = await contacts_repo.get_role(db, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(role, field, value)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="A role with that name already exists"
        ) from exc
    await db.refresh(role)
    return contact_service.role_read(role)


@router.delete("/contacts/roles/{role_id}", response_model=Message)
async def delete_role(db: DbSession, _: AdminUser, role_id: uuid.UUID) -> Message:
    role = await contacts_repo.get_role(db, role_id)
    if role is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Role not found")

    if role.is_system:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"{role.name} is built in and cannot be deleted. It can be renamed.",
        )

    # Refused rather than cascaded. Deleting a role in use would silently strip it from every deal
    # holding it, and "the champion vanished from forty deals" is not an outcome anyone would predict
    # from clicking delete on a settings list.
    if await contacts_repo.role_in_use(db, role_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"{role.name} is assigned on at least one deal. Remove it from those deals before "
                "deleting the role."
            ),
        )

    await db.delete(role)
    await db.commit()
    return Message(detail=f"Deleted {role.name}")


# --- Contacts ----------------------------------------------------------------


@router.get("/contacts", response_model=list[ContactDetail])
async def list_contacts(
    db: DbSession,
    _: CurrentUser,
    account_id: uuid.UUID | None = Query(default=None),
    contact_type: ContactType | None = Query(default=None),
    search: str | None = Query(default=None, max_length=160),
) -> list[ContactDetail]:
    return [
        contact_service.contact_detail(contact, deal_count)
        for contact, deal_count in await contacts_repo.list_contacts(
            db,
            account_id=account_id,
            contact_type=contact_type.value if contact_type else None,
            search=search,
        )
    ]


@router.get("/contacts/{contact_id}", response_model=ContactDetail)
async def read_contact(db: DbSession, _: CurrentUser, contact_id: uuid.UUID) -> ContactDetail:
    contact = await contacts_repo.get(db, contact_id)
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")
    deals = await contacts_repo.deal_count_for_contact(db, contact.id)
    return contact_service.contact_detail(contact, deals)


@router.post("/contacts", response_model=ContactDetail, status_code=status.HTTP_201_CREATED)
async def create_contact(db: DbSession, _: CurrentUser, payload: ContactCreate) -> ContactDetail:
    account = await accounts_repo.get(db, payload.account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    contact = Contact(**payload.model_dump())
    db.add(contact)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Somebody with that email is already filed under {account.name}",
        ) from exc

    reloaded = await contacts_repo.get(db, contact.id)
    assert reloaded is not None  # noqa: S101 — just committed it
    return contact_service.contact_detail(reloaded, 0)


@router.patch("/contacts/{contact_id}", response_model=ContactDetail)
async def update_contact(
    db: DbSession, _: CurrentUser, contact_id: uuid.UUID, payload: ContactUpdate
) -> ContactDetail:
    contact = await contacts_repo.get(db, contact_id)
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(contact, field, value)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Somebody with that email is already filed under this account",
        ) from exc

    deals = await contacts_repo.deal_count_for_contact(db, contact.id)
    return contact_service.contact_detail(contact, deals)


@router.delete("/contacts/{contact_id}", response_model=Message)
async def delete_contact(db: DbSession, _: AdminUser, contact_id: uuid.UUID) -> Message:
    """
    Removes a contact entirely. Administrators only.

    Their `deal_contacts` rows cascade, so a delete quietly strips this person from every deal they
    were on — including, possibly, as its champion. That is why it is not a rep's call: detaching a
    contact from one deal is the reversible action, and it lives on the deal.
    """
    contact = await contacts_repo.get(db, contact_id)
    if contact is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact not found")

    name = contact.full_name
    await db.delete(contact)
    await db.commit()
    return Message(detail=f"Deleted {name}")
