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
)
from app.services import health as health_service
from app.services.serializers import deal_detail

router = APIRouter(tags=["accounts"])


@router.get("/accounts", response_model=list[AccountRead])
async def list_accounts(
    db: DbSession,
    user: CurrentUser,
    include_partners: bool = Query(default=True),
) -> list[Account]:
    return await accounts_repo.list_all(db, user, include_partners=include_partners)


@router.get("/accounts/tree", response_model=list[AccountNode])
async def account_tree(db: DbSession, user: CurrentUser) -> list[AccountNode]:
    """
    The hierarchical drill-down required by R3: Account -> Lead -> Deal, with a rolled-up
    health badge and open value at every level.

    Built from three queries — accounts with leads, all deals, and one grouped
    last-activity lookup — rather than walking the tree per node.
    """
    accounts = await accounts_repo.list_with_leads(db, user, include_partners=False)
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
                    owner_name=lead.owner.full_name,
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


@router.get("/accounts/{account_id}", response_model=AccountRead)
async def read_account(db: DbSession, user: CurrentUser, account_id: uuid.UUID) -> Account:
    account = await accounts_repo.get(db, account_id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    # 404 rather than 403 for an account outside the caller's scope: a 403 would confirm
    # the record exists, which is itself information a rep is not entitled to.
    visible = await accounts_repo.list_all(db, user)
    if account.id not in {a.id for a in visible}:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    return account


@router.post("/accounts", response_model=AccountRead, status_code=status.HTTP_201_CREATED)
async def create_account(db: DbSession, _: AdminUser, payload: AccountCreate) -> Account:
    account = Account(**payload.model_dump())
    db.add(account)
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

    for field, value in fields.items():
        setattr(account, field, value)

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
    if await accounts_repo.get(db, payload.account_id) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")

    # Reps may create leads, but only ones they own — otherwise "reps cannot reassign"
    # is bypassed by simply creating the record already assigned elsewhere.
    permissions.require_own_assignment(user, payload.owner_id)

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
    permissions.require_no_owner_change(user, lead.owner_id, fields.get("owner_id"))

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
