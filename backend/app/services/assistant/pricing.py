"""
Tokens to money.

Rates are configuration, not constants in this file, and they default to zero. That is a
deliberate refusal to guess: published model prices change, and a dashboard showing a
confidently wrong cost is worse than one showing none — a number on a screen gets quoted in a
budget meeting whether or not anyone checked it.

Until the rates are set, `cost_usd` is stored as NULL and the dashboard reports token counts with
the rate marked unset.
"""

from decimal import Decimal, ROUND_HALF_UP

from app.core.config import settings

PER_MILLION = Decimal(1_000_000)


def cost_for(prompt_tokens: int, completion_tokens: int) -> Decimal | None:
    """
    Cost of one call, or None when no rate is configured.

    Computed in `Decimal`, not float: these are summed across thousands of rows for a monthly
    total, and float addition drifts. Rounded to six places to match the column.
    """
    if not settings.assistant_pricing_configured:
        return None

    prompt = Decimal(prompt_tokens) * Decimal(str(settings.openai_input_cost_per_1m)) / PER_MILLION
    completion = (
        Decimal(completion_tokens) * Decimal(str(settings.openai_output_cost_per_1m)) / PER_MILLION
    )
    return (prompt + completion).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
