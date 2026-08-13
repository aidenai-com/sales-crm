from fastapi import APIRouter

from app.api.v1 import (
    accounts,
    activities,
    analytics,
    assistant,
    auth,
    checklists,
    contacts,
    dashboard,
    deals,
    lemlist,
    pipelines,
    reminders,
    team,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(accounts.router)
api_router.include_router(deals.router)
# After `deals`, so the fixed paths in deals.py are matched before this router's
# /deals/{deal_id}/... patterns get a chance to swallow them.
api_router.include_router(checklists.router)
api_router.include_router(activities.router)
api_router.include_router(contacts.router)
api_router.include_router(reminders.router)
api_router.include_router(pipelines.router)
api_router.include_router(dashboard.router)
api_router.include_router(analytics.router)
api_router.include_router(team.router)
api_router.include_router(assistant.router)
api_router.include_router(lemlist.router)
# The callback, separately, because it is the one route in this API with no authenticated user: lemlist
# calls it and authenticates with a shared secret in the body. Kept as its own router so that fact is
# visible here rather than buried in one decorator.
api_router.include_router(lemlist.webhook_router)
