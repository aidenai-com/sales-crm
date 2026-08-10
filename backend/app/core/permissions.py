"""
Who can see and change what.

Every rule here is enforced in the API, not in the client. Hiding a button stops an
honest mistake; it does not stop a request. The frontend mirrors these rules so the UI
does not offer actions that will fail, but this module is the boundary that matters.

The model, as agreed:

  Admin   sees and changes everything.
  Rep     sees deals and leads they own, plus the accounts those hang off so the
          hierarchy still resolves. Moves and edits only their own deals. Never changes
          who owns a deal, and never creates or deletes an account.
"""

import uuid

from fastapi import HTTPException, status
from sqlalchemy import Select, or_, select

from app.models import Account, Activity, Deal, Lead, User, UserRole


def is_admin(user: User) -> bool:
    return user.role is UserRole.ADMIN


def forbid(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


# --- Read scoping ------------------------------------------------------------


def visible_account_ids(user_id: uuid.UUID) -> Select:
    """
    Accounts a rep is allowed to see.

    Ownership of the account is not the only route in. A rep who owns a deal under Bank
    of America must see Bank of America, or that deal has a parent it cannot resolve and
    the account tree breaks. Partner accounts named on their deals are included for the
    same reason — the board renders the partner's name.
    """
    return select(Account.id).where(
        or_(
            Account.owner_id == user_id,
            Account.id.in_(select(Lead.account_id).where(Lead.owner_id == user_id)),
            Account.id.in_(select(Deal.account_id).where(Deal.owner_id == user_id)),
            Account.id.in_(
                select(Deal.partner_id).where(
                    Deal.owner_id == user_id, Deal.partner_id.is_not(None)
                )
            ),
        )
    )


def scope_accounts(stmt: Select, user: User) -> Select:
    if is_admin(user):
        return stmt
    return stmt.where(Account.id.in_(visible_account_ids(user.id)))


def scope_leads(stmt: Select, user: User) -> Select:
    # Strictly owned. A rep who owns the *account* still does not see another rep's lead
    # under it — that is what "view only their respective leads" means.
    if is_admin(user):
        return stmt
    return stmt.where(Lead.owner_id == user.id)


def scope_deals(stmt: Select, user: User) -> Select:
    if is_admin(user):
        return stmt
    return stmt.where(Deal.owner_id == user.id)


def scope_activities(stmt: Select, user: User) -> Select:
    """
    An activity is visible when its subject is.

    Authorship is deliberately not a route in: a rep who logged a call against a deal that
    has since been reassigned should no longer see it, because they can no longer see the
    deal it describes.
    """
    if is_admin(user):
        return stmt
    return stmt.where(
        or_(
            Activity.deal_id.in_(select(Deal.id).where(Deal.owner_id == user.id)),
            Activity.lead_id.in_(select(Lead.id).where(Lead.owner_id == user.id)),
            Activity.account_id.in_(visible_account_ids(user.id)),
        )
    )


# --- Write guards ------------------------------------------------------------
#
# These raise rather than return a boolean. A permission check that can be forgotten at
# the call site is not a permission check.


def require_admin(user: User, action: str) -> None:
    if not is_admin(user):
        raise forbid(f"Only an administrator can {action}")


def require_deal_owner(user: User, deal: Deal, action: str = "change this deal") -> None:
    if is_admin(user) or deal.owner_id == user.id:
        return
    raise forbid(f"You can only {action} if you own it")


def require_lead_owner(user: User, lead: Lead, action: str = "change this business unit") -> None:
    if is_admin(user) or lead.owner_id == user.id:
        return
    raise forbid(f"You can only {action} if you own it")


def require_account_owner(user: User, account: Account, action: str = "change this account") -> None:
    if is_admin(user) or account.owner_id == user.id:
        return
    raise forbid(f"You can only {action} if you own it")


def require_own_assignment(user: User, owner_id: uuid.UUID | None) -> None:
    """
    A rep may only create records assigned to themselves.

    Without this, "reps cannot reassign" would be trivially bypassed: create the deal
    already owned by someone else, or create it owned by yourself on someone else's
    behalf and then it is yours.
    """
    if is_admin(user) or owner_id is None or owner_id == user.id:
        return
    raise forbid("You can only assign records to yourself")


def require_no_owner_change(user: User, current_owner: uuid.UUID, new_owner: uuid.UUID | None) -> None:
    """
    Reassignment is admin-only.

    This is the hole that would otherwise undo the whole model: if a rep could set
    `owner_id`, they could take any deal they can see and inherit full edit rights over it.
    """
    if new_owner is None or new_owner == current_owner or is_admin(user):
        return
    raise forbid("Only an administrator can change who owns a record")
