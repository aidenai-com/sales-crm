"""
Reducing a company name to the thing being named.

`Citi`, `CITI`, `Citi Bank Inc.` and `Citibank, N.A.` are one company and would otherwise be four
accounts. The existing `unique` on `accounts.name` catches only an exact repeat, which is the one
case nobody makes.

This module is the single definition of "the same company". The migration's backfill, the unique
index it builds, and the API's duplicate check all call `normalize`, because two implementations of
this rule would drift and the drift would show up as the database rejecting a name the API had just
told the user was free.
"""

import re

#: Legal-form and holding-structure tokens, dropped wholesale.
#:
#: These say how a company is incorporated, not which company it is. `Citi Inc` and `Citi` are the
#: same customer; a rep typing one when the other exists is the duplicate this prevents.
#:
#: Deliberately conservative. Every token here is one that cannot be the whole distinguishing part
#: of a name — which is why `bank`, `technologies`, `systems` and `partners` are absent. Dropping
#: `bank` would fold `Deutsche Bank` into `Deutsche`, and worse, collapse two genuinely different
#: customers whose names differ only by it.
LEGAL_TOKENS = frozenset(
    {
        "inc",
        "incorporated",
        "ltd",
        "limited",
        "llc",
        "llp",
        "lp",
        "plc",
        "corp",
        "corporation",
        "co",
        "company",
        "gmbh",
        "ag",
        "sa",
        "sas",
        "bv",
        "nv",
        "ab",
        "as",
        "oy",
        "pte",
        "pvt",
        "private",
        "na",
        "holdings",
        "holding",
        "group",
        "the",
    }
)


def normalize(name: str) -> str:
    """
    The comparison key for a company name.

    Casefolded, punctuation reduced to spaces, legal-form tokens dropped, whitespace collapsed.

        "Citi"             -> "citi"
        "CITI"             -> "citi"
        "Citibank, N.A."   -> "citibank"
        "Citi Bank Inc."   -> "citi bank"

    Note that `citi bank` and `citibank` are *different* keys. Removing spaces entirely would make
    them equal, and would also make `Sun Trust` equal `Suntrust` — but it would equally collapse
    `Red Hat` into `Redhat` and, less happily, `Net App` into `Netapp` while leaving no way to tell
    a real two-word name from a run-together one. Space differences are caught by the trigram search
    instead, which warns rather than refuses. Only unambiguous collisions are refused outright.

    Returns "" for a name that is nothing but legal tokens ("Ltd", "The Group"). Callers must treat
    an empty key as "no usable name" rather than as a key that can collide, or every such name would
    be a duplicate of every other.
    """
    lowered = name.casefold()
    # Periods and apostrophes are removed rather than turned into spaces, because they sit *inside* a
    # token: "N.A." has to become the single token "na" so it can be recognised as a legal form and
    # dropped. Turning it into spaces yields "n a" — two tokens that match nothing — and
    # "Citibank, N.A." then normalizes to "citibank n a" instead of "citibank".
    tightened = re.sub(r"[.'’]", "", lowered)
    # Everything else becomes a separator: "Citi,Inc" must tokenize as two words, and "AT&T" must not
    # collapse into "att" while "AT T" stays two.
    spaced = re.sub(r"[^a-z0-9]+", " ", tightened)
    tokens = [token for token in spaced.split() if token not in LEGAL_TOKENS]
    return " ".join(tokens)


def is_usable(normalized: str) -> bool:
    """Whether a normalized key can meaningfully be compared against others."""
    return bool(normalized)
