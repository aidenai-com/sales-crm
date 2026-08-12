"""
Who can see and change what.

Every rule here is enforced in the API, not in the client. Hiding a button stops an
honest mistake; it does not stop a request. The frontend mirrors these rules so the UI
does not offer actions that will fail, but this module is the boundary that matters.

The model, as agreed:

  Admin   sees and changes everything.
  Rep     sees every account, every business unit, and the deals they own. Creates accounts,
          business units and deals, always assigned to themselves. Moves and edits only their
          own deals. Never changes who owns a record, and never deletes an account.

Reads and writes are scoped differently on purpose: see everything, change what you own. Account
visibility is company-wide because a rep who cannot see another rep's Citibank is the rep who
creates a second Citibank; account *editing* is still the owner's.
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


def scope_accounts(stmt: Select, user: User) -> Select:
    """
    Every account, to everybody.

    This used to be a union of four routes in — accounts you own, accounts your leads sit under,
    accounts your deals sit under, and partners named on your deals — because a rep who owned a deal
    under Bank of America had to see Bank of America or the account tree had a parent it could not
    resolve. All of that is subsumed: the whole book is visible, so every parent resolves.

    Kept as a function rather than deleted at the call sites. It is the one place to narrow account
    visibility again, and a no-op here is a one-line change where re-threading scoping through eight
    call sites is not.
    """
    return stmt


def scope_leads(stmt: Select, user: User) -> Select:
    """
    Every business unit, to everybody.

    Not a separate decision. Business units no longer carry an owner, so there is nothing on the row
    to scope by, and their account is visible to everyone — the two approved changes compose to this.
    """
    return stmt


def scope_deals(stmt: Select, user: User) -> Select:
    if is_admin(user):
        return stmt
    return stmt.where(Deal.owner_id == user.id)


def scope_activities(stmt: Select, user: User) -> Select:
    """
    An activity is visible when its subject is.

    Which now means account-level and business-unit-level activity is visible to every rep, following
    their subjects. A visible record whose history is hidden is a half-open door — the timeline would
    show gaps a rep could neither read nor explain.

    Deal activity stays owner-scoped, because deals were never made company-wide. This is where the
    commercially sensitive detail sits, so it is the one level that still narrows.

    Authorship is deliberately not a route in: a rep who logged a call against a deal that has since
    been reassigned should no longer see it, because they can no longer see the deal it describes.
    """
    if is_admin(user):
        return stmt
    return stmt.where(
        or_(
            Activity.deal_id.in_(select(Deal.id).where(Deal.owner_id == user.id)),
            Activity.lead_id.is_not(None),
            Activity.account_id.is_not(None),
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
    """
    Delegates to the account, which is where a business unit's ownership now lives.

    The name is kept because every call site reads correctly with it — "require the owner of this
    lead" is still exactly what is being asked, only the answer comes from one table further up.
    Requires `lead.account` to be loaded.
    """
    if is_admin(user) or lead.account.owner_id == user.id:
        return
    raise forbid(f"You can only {action} if you own the account")


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
