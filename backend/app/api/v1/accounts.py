import uuid

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError

from app.api.deps import AdminUser, CurrentUser, DbSession
from app.core import permissions
from app.models import Account, Lead
from app.repositories import accounts as accounts_repo
from app.repositories import deals as deals_repo
from app.schemas.common import Message
from app.schemas.crm import (
    AccountCreate,
    AccountNode,
    AccountRead,
    AccountUpdate,
    LeadCreate,
    LeadNode,
    LeadRead,
    LeadUpdate,
    RollUp,
    SimilarAccount,
)
from app.services import account_names
from app.services import health as health_service
from app.services.serializers import deal_detail

router = APIRouter(tags=["accounts"])


@router.get("/accounts", response_model=list[AccountRead])
async def list_accounts(db: DbSession, user: CurrentUser) -> list[Account]:
    """
    Every account, to every authenticated user.

    The `include_partners` query parameter is gone with the column it filtered on. An account is an
    account; whether a company is acting as a partner shows in the people attached to a deal, not in a
    flag here.
    """
    return await accounts_repo.list_all(db, user)


@router.get("/accounts/tree", response_model=list[AccountNode])
async def account_tree(db: DbSession, user: CurrentUser) -> list[AccountNode]:
    """
    The hierarchical drill-down required by R3: Account -> Lead -> Deal, with a rolled-up
    health badge and open value at every level.

    Built from three queries — accounts with leads, all deals, and one grouped
    last-activity lookup — rather than walking the tree per node.
    """
    accounts = await accounts_repo.list_with_leads(db, user)
    all_deals = await deals_repo.list_all(db, user)
    last_activity = await deals_repo.last_activity_map(db)

    # Leads come from the scoped repository, NOT from `account.leads`. The eager-loaded
    # relationship returns every lead on the account regardless of who owns it, so reading
    # it here would leak other reps' business units into the tree even though /leads
    # filters them correctly.
    visible_leads = await accounts_repo.list_leads(db, user)
    leads_by_account: dict[uuid.UUID, list] = {}
    for lead in visible_leads:
        leads_by_account.setdefault(lead.account_id, []).append(lead)

    deals_by_account: dict[uuid.UUID, list] = {}
    for deal in all_deals:
        deals_by_account.setdefault(deal.account_id, []).append(deal)

    nodes: list[AccountNode] = []
    for account in accounts:
        account_deals = deals_by_account.get(account.id, [])
        health_by_deal = {
            deal.id: health_service.deal_health(deal, last_activity.get(deal.id))
            for deal in account_deals
        }

        lead_nodes: list[LeadNode] = []
        for lead in leads_by_account.get(account.id, []):
            lead_deals = [deal for deal in account_deals if deal.lead_id == lead.id]
            open_value, open_count, rolled = health_service.roll_up(lead_deals, health_by_deal)
            lead_nodes.append(
                LeadNode(
                    id=lead.id,
                    business_unit=lead.business_unit,
                    # A business unit has no owner; the account's is reported so the tree still names
                    # somebody accountable at every level.
                    owner_name=lead.account.owner.full_name,
                    deals=[deal_detail(deal, last_activity) for deal in lead_deals],
                    roll_up=RollUp(open_value=open_value, open_count=open_count, health=rolled),
                )
            )

        direct = [deal for deal in account_deals if deal.lead_id is None]
        open_value, open_count, rolled = health_service.roll_up(account_deals, health_by_deal)

        nodes.append(
            AccountNode(
                id=account.id,
                name=account.name,
                industry=account.industry,
                owner_name=account.owner.full_name,
                leads=lead_nodes,
                direct_deals=[deal_detail(deal, last_activity) for deal in direct],
                roll_up=RollUp(open_value=open_value, open_count=open_count, health=rolled),
            )
        )

    return nodes


# Declared before `/accounts/{account_id}`: FastAPI matches in order, so with this below it "similar"
# would be parsed as an account id and rejected as a malformed UUID. Same reason `/accounts/tree` sits
# above it.
@router.get("/accounts/similar", response_model=list[SimilarAccount])
async def similar_accounts(
    db: DbSession,
    _: CurrentUser,
    name: str = Query(min_length=1, max_length=255),
    limit: int = Query(default=8, ge=1, le=25),
) -> list[SimilarAccount]:
    """
    Accounts that might already be the company the caller is about to create.

    Powers the as-you-type warning on the create form. Read-only and deliberately cheap — a trigram
    index and a prefix scan — because it is called every few keystrokes.

    Each match carries the route that found it, so the form can explain itself rather than showing an
    unexplained list, and can tell a hard collision apart from a resemblance worth a second look.
    """
    return [
        SimilarAccount(
            id=account.id,
            name=account.name,
            industry=account.industry,
            owner_name=account.owner.full_name,
            score=score,
            reason=reason,
            blocks_creation=reason in {"exact", "normalized"},
        )
        for account, score, reason in await accounts_repo.find_similar(db, name, limit=limit)
    ]


@router.get("/accounts/{account_id}", response_model=AccountRead)
async def read_account(db: DbSession, user: CurrentUser, account_id: uuid.UUID) -> Account:
    # No visibility check. Every account is visible to every authenticated user, so the second query
    # this used to run — listing everything the caller could see to test membership — could only ever
    # return true.
    account = await accounts_repo.get(db, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


async def _reject_duplicate_name(db: DbSession, name: str) -> None:
    """
    Refuses a name that is already taken, exactly or after normalization.

    Checked here so the message can name the existing account, which is the only thing that lets
    someone act on it. The partial unique index on `name_normalized` is what actually guarantees it —
    this check can lose a race, the index cannot.
    """
    key = account_names.normalize(name)
    existing = await accounts_repo.get_by_normalized(db, key)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f'"{existing.name}" is already on record and is the same company as "{name}". '
                "Use that account instead of creating a second one."
            ),
        )


@router.post("/accounts", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
async def create_account(db: DbSession, user: CurrentUser, payload: AccountCreate) -> Account:
    """
    Any authorized user may create an account.

    The creator becomes the owner. A rep may only create one assigned to themselves — otherwise "reps
    cannot reassign" is bypassed by creating the record already assigned elsewhere — and an
    administrator can hand it over afterwards.

    Deleting an account is still admin-only: filing a company is routine, destroying one with its
    business units, contacts and deals cascading is not.
    """
    permissions.require_own_assignment(user, payload.owner_id)
    await _reject_duplicate_name(db, payload.name)

    fields = payload.model_dump()
    # Whoever creates it owns it, unless an administrator named somebody else. `require_own_assignment`
    # above has already refused a rep trying to do the same, and reads a null as "myself".
    fields["owner_id"] = fields.get("owner_id") or user.id

    account = Account(**fields)
    account.name_normalized = account_names.normalize(account.name)
    db.add(account)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        # Reached when `_reject_duplicate_name` lost a race, or on the exact-name constraint.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that name already exists",
        ) from exc
    await db.refresh(account)
    return account


@router.patch("/accounts/{account_id}", response_model=AccountRead)
async def update_account(
    db: DbSession, user: CurrentUser, account_id: uuid.UUID, payload: AccountUpdate
) -> Account:
    account = await accounts_repo.get(db, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    permissions.require_account_owner(user, account)
    fields = payload.model_dump(exclude_unset=True)
    permissions.require_no_owner_change(user, account.owner_id, fields.get("owner_id"))

    # A rename has to clear the duplicate check too, or the guard on creation is bypassed by creating
    # "Citi Holdings B" and renaming it to "Citi". Skipped when the name is unchanged, so re-saving a
    # form does not report the account as a duplicate of itself.
    if (new_name := fields.get("name")) and new_name != account.name:
        await _reject_duplicate_name(db, new_name)

    for field, value in fields.items():
        setattr(account, field, value)

    account.name_normalized = account_names.normalize(account.name)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that name already exists",
        ) from exc
    await db.refresh(account)
    return account


@router.delete("/accounts/{account_id}", response_model=Message)
async def delete_account(db: DbSession, _: AdminUser, account_id: uuid.UUID) -> Message:
    account = await accounts_repo.get(db, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    # Leads, deals, and their activities cascade. Deals referenced as a partner have their
    # partner_id set to null rather than being destroyed.
    await db.delete(account)
    await db.commit()
    return Message(detail=f"Deleted {account.name}")


# --- Leads -------------------------------------------------------------------


@router.get("/leads", response_model=list[LeadRead])
async def list_leads(
    db: DbSession,
    user: CurrentUser,
    account_id: uuid.UUID | None = Query(default=None),
) -> list[Lead]:
    return await accounts_repo.list_leads(db, user, account_id=account_id)


@router.post("/leads", response_model=LeadRead, status_code=status.HTTP_201_CREATED)
async def create_lead(db: DbSession, user: CurrentUser, payload: LeadCreate) -> Lead:
    account = await accounts_repo.get(db, payload.account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    # No `require_own_assignment`: a business unit has no owner to assign. Its stewardship follows the
    # account, so the guard that mattered here now lives on the account itself.
    lead = Lead(**payload.model_dump())
    db.add(lead)
    await db.commit()
    await db.refresh(lead)
    return lead


@router.patch("/leads/{lead_id}", response_model=LeadRead)
async def update_lead(
    db: DbSession, user: CurrentUser, lead_id: uuid.UUID, payload: LeadUpdate
) -> Lead:
    lead = await accounts_repo.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    permissions.require_lead_owner(user, lead)
    fields = payload.model_dump(exclude_unset=True)

    for field, value in fields.items():
        setattr(lead, field, value)

    await db.commit()
    await db.refresh(lead)
    return lead


@router.delete("/leads/{lead_id}", response_model=Message)
async def delete_lead(db: DbSession, user: CurrentUser, lead_id: uuid.UUID) -> Message:
    lead = await accounts_repo.get_lead(db, lead_id)
    if lead is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lead not found")

    permissions.require_lead_owner(user, lead, "delete this business unit")

    # Its deals detach to the account rather than vanishing: deleting a business unit
    # should not silently destroy its opportunities.
    await db.delete(lead)
    await db.commit()
    return Message(detail=f"Deleted {lead.business_unit}")
