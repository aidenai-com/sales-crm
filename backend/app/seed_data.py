"""
Seed content.

The Direct Customer stages are the real AidenAI six-stage process, transcribed from
`Aidenai methodology.md` including probabilities. The criteria, activities, and
deliverables are stored per spec 6.2 and rendered read-only as the deal page's stage
playbook; nothing enforces them, so spec 6.4's deferral of gating holds.
"""

from app.models import StageKind, UserRole

# Mist grey through to deep cobalt, so a board reads as a progression left to right.
RAMP = ("#a6bbd1", "#7ba7d0", "#4a90e2", "#0099ff", "#006bff", "#004eba")
LOST_COLOR = "#c8324f"

# (email, full name, initials, job title, role)
USERS = (
    ("priya.raghavan@aidenai.com", "Priya Raghavan", "PR", "Enterprise AE", UserRole.REP),
    ("marcus.feld@aidenai.com", "Marcus Feld", "MF", "Enterprise AE", UserRole.REP),
    ("dana.okonkwo@aidenai.com", "Dana Okonkwo", "DO", "Partner Manager", UserRole.REP),
    ("tomas.lindqvist@aidenai.com", "Tomas Lindqvist", "TL", "Solutions Architect", UserRole.REP),
    ("aisha.bennett@aidenai.com", "Aisha Bennett", "AB", "Regional Director", UserRole.ADMIN),
)

# (key, name, industry, owner email)
ACCOUNTS = (
    ("jpmc", "JPMorgan Chase", "Banking", "priya.raghavan@aidenai.com"),
    ("bofa", "Bank of America", "Banking", "marcus.feld@aidenai.com"),
    ("citi", "Citigroup", "Banking", "priya.raghavan@aidenai.com"),
    ("wells", "Wells Fargo", "Banking", "marcus.feld@aidenai.com"),
    ("hsbc", "HSBC", "Banking", "aisha.bennett@aidenai.com"),
    ("pru", "Prudential Financial", "Insurance", "priya.raghavan@aidenai.com"),
    ("aetna", "Aetna", "Health Insurance", "aisha.bennett@aidenai.com"),
    ("accenture", "Accenture", "Systems Integrator", "dana.okonkwo@aidenai.com"),
    ("deloitte", "Deloitte", "Systems Integrator", "dana.okonkwo@aidenai.com"),
    ("ntt", "NTT Data", "Systems Integrator", "dana.okonkwo@aidenai.com"),
    ("virtusa", "Virtusa", "Systems Integrator", "dana.okonkwo@aidenai.com"),
)

# (key, account key, business unit)
LEADS = (
    ("jpmc-1", "jpmc", "Corporate & Investment Bank"),
    ("jpmc-2", "jpmc", "Consumer Banking Technology"),
    ("jpmc-3", "jpmc", "Risk & Compliance"),
    ("bofa-1", "bofa", "Wealth & Asset Management"),
    ("bofa-2", "bofa", "Compliance"),
    ("citi-1", "citi", "Global Markets Technology"),
    ("citi-2", "citi", "Treasury & Trade Solutions"),
    ("wells-1", "wells", "Consumer Lending Platform"),
    ("hsbc-1", "hsbc", "Commercial Banking"),
    ("hsbc-2", "hsbc", "Financial Crime Technology"),
    ("pru-1", "pru", "Claims Operations"),
    ("aetna-1", "aetna", "Member Platform Engineering"),
)

DIRECT_STAGES = (
    {
        "name": "Prospecting",
        "short_name": "Prospecting",
        "probability": 5,
        "color": RAMP[0],
        "kind": StageKind.OPEN,
        "entry_criteria": [
            "Fits a personalized ICP vertical",
            "Identifiable pain and trigger signal present",
            "Reachable decision-maker mapped",
            "Budget cycle known or estimable",
            "Account logged in CRM with ICP score",
        ],
        "key_activities": [
            "Build ICP scorecard: legacy scale, transformation mandate, tech debt, AI maturity",
            "Map each account to a motion: modernization / AI agents / AI Centre of Innovation",
            "Research objectives, board strategy, investor-day AI commitments",
            "Identify partner paths for warm intros",
            "Map three personas: CXO, Arch VP, Eng Director",
            "Prioritize 15 Tier-1 direct and 30 Tier-2 partner-assisted accounts",
        ],
        "deliverables": [
            "Territory Account Map, tiered with fit score and primary motion",
            "Account Profile one-pager",
            "Outreach Hypothesis per account",
        ],
        "exit_criteria": [
            "Partner co-sell path flagged",
            "ICP applicability confirmed, not assumed",
            "Territory plan approved in CRM",
            "Outreach hypothesis written per Tier-1 account",
            "At least one engagement signal received",
        ],
    },
    {
        "name": "Discover & Qualify",
        "short_name": "Qualify",
        "probability": 15,
        "color": RAMP[1],
        "kind": StageKind.OPEN,
        "entry_criteria": [
            "First meeting secured with Director+ in tech / digital transformation",
            "Stage-1 hypothesis validated by internal contact or partner intro",
            "No active NDA block or competitive exclusion",
            "Account research done, AE can speak to initiatives pre-call",
        ],
        "key_activities": [
            "Run the 30-question discovery framework, woven into conversation",
            "Map stated objectives to AidenAI initiative areas before any product talk",
            "Capture as-is state in the customer's own words",
            "Surface unrecognized pain with the 40-60% delivery benchmark",
            "Build stakeholder map: budget owner, evaluator, internal champion",
            "Begin MEDDIC: confirm Metrics and Identified Pain",
            "Funding test: find the funded initiative",
            "Identify the coach",
        ],
        "deliverables": [
            "Discovery Notes, verbatim exec pain captured in CRM",
            "Qualification Scorecard with MEDDIC M, I, P populated",
            "Stakeholder Map v1",
            "Go/No-Go recommendation with deal-size range",
        ],
        "exit_criteria": [
            "Exec sponsor confirmed (VP+) with an initiative AidenAI directly addresses",
            "Pain documented in the prospect's own words in CRM",
            "MEDDIC M, I, P populated; Economic Buyer partial",
            "Budget pathway confirmed",
            "Prospect committed to a next step",
        ],
    },
    {
        "name": "Solution Alignment & Competitive Strategy",
        "short_name": "Develop",
        "probability": 30,
        "color": RAMP[2],
        "kind": StageKind.OPEN,
        "entry_criteria": [
            "Stage-2 exit met: funded pain, exec sponsor named, budget pathway",
            "Champion identified and tested",
            "Competitive landscape known",
            "Solutions Architect assigned and briefed",
        ],
        "key_activities": [
            "Deliver an executive briefing, not a demo",
            "Build a unique value proposition in the prospect's own language",
            "Introduce AiDAP 2.0 with named proof points",
            "Set a competitive strategy per competitor: Direct / Divide / Develop / Defend",
            "Run a buying-criteria campaign before any RFP",
            "Champion validation via an exec intro or org chart ask",
            "Begin Technical Validation Exercise planning",
        ],
        "deliverables": [
            "Unique Value Proposition doc",
            "Competitive Strategy memo",
            "Champion Development Plan",
            "TVE Plan draft",
            "Mutual Action Plan v1",
        ],
        "exit_criteria": [
            "Value proposition accepted in writing by Economic Buyer",
            "AidenAI strengths embedded in evaluation criteria pre-RFP",
            "Full MEDDIC populated",
            "Champion confirmed by an action test",
            "TVE scope agreed in writing, start date confirmed",
            "No competitor has exclusive Economic Buyer access",
        ],
    },
    {
        "name": "Technical Validation & ROI Diagnostic",
        "short_name": "Validate",
        "probability": 55,
        "color": RAMP[3],
        "kind": StageKind.OPEN,
        "entry_criteria": [
            "TVE Plan approved and signed by both teams",
            "Delivery team assigned, briefed, available",
            "POC success metrics documented and mutually agreed before work starts",
            "Economic Buyer aligned on post-POC decision timeline",
        ],
        "key_activities": [
            "Run the POC on the prospect's real codebase via AiDAP 2.0",
            "Document before/after state in the customer's own metrics",
            "Build ROI in parallel: hard savings plus soft value",
            "Produce three ROI scenarios: conservative, realistic, aggressive",
            "Escalate any uninfluenced RFP to the Economic Buyer",
            "Get formal technical sign-off from Director / VP Architecture",
            "Preview deployment phases",
        ],
        "deliverables": [
            "POC Results Report with green/amber/red scorecard",
            "ROI Diagnostic, three-scenario model",
            "Technical Validation Summary in business language",
            "Preliminary Deployment Plan, Phase 1-3",
            "Competitive Differentiation Summary",
        ],
        "exit_criteria": [
            "POC declared successful by the technical buyer in writing",
            "ROI ranges presented and accepted by Economic Buyer",
            "No open technical, security, compliance, or architecture blockers",
            "Decision timeline and target close date mutually agreed",
            "AidenAI named preferred vendor or final-two shortlist",
        ],
    },
    {
        "name": "Proposal, Negotiation & Close",
        "short_name": "Propose",
        "probability": 75,
        "color": RAMP[4],
        "kind": StageKind.OPEN,
        "entry_criteria": [
            "Stage-4 exit met: POC success, ROI accepted, preferred status",
            "Full decision process mapped",
            "Funding confirmed this cycle or committed next quarter",
            "Champion driving urgency and sharing intel",
        ],
        "key_activities": [
            "Build a three-option proposal: land, expand, full environment",
            "Always show the full-environment scenario ahead of procurement's ask",
            "Anchor every commercial conversation on accepted ROI",
            "Never negotiate terms before scope is locked",
            'Build the "why now" case',
            "Equip the champion with a talk track and one-page ROI summary",
            "Work procurement and legal in parallel",
            "Pair every concession with a reciprocal commitment",
            "Confirm Customer Success handoff before signature",
        ],
        "deliverables": [
            "Formal Proposal with three options and ROI for each",
            "Executive Summary one-pager for the champion",
            "Negotiation Log",
            "Signed MSA and SOW, or written commitment to sign by a date",
            "Kickoff Readiness Checklist",
        ],
        "exit_criteria": [
            "Signed contract or purchase order received",
            "Kickoff date confirmed on both calendars",
            "Phase-1 success metrics documented in the signed SOW",
            "Sponsor introduced to Customer Success and Delivery lead",
            "Reference and case-study rights secured in the contract",
        ],
    },
    {
        "name": "Deploy & Develop",
        "short_name": "Closed Won",
        "probability": 100,
        "color": RAMP[5],
        "kind": StageKind.WON,
        "entry_criteria": [
            "Closed-won: signed contract, kickoff date in calendar",
            "Delivery team assigned; Customer Success lead introduced to exec sponsor",
            "Phase-1 success metrics documented and agreed in the SOW",
        ],
        "key_activities": [
            "Exec check-ins at Day 30 and Day 60",
            "Document Phase-1 outcomes in the customer's own metrics",
            "Identify Phase-2 expansion: adjacent business unit, use case, or geography",
            "Start Phase-2 discovery at Phase-1 kickoff, not at completion",
            "Develop a new champion for expansion",
            "Flag renewal risks: budget, leadership change, competitor re-entry",
            "Leverage success for analyst and media coverage",
            "Build a referral path",
        ],
        "deliverables": [
            "Phase-1 Success Report",
            "Expansion Account Plan",
            "Renewal Forecast in CRM with risk score",
            "Customer Reference Agreement",
            "Internal Case Study",
        ],
        "exit_criteria": [
            "Phase-1 metrics achieved and documented with customer sign-off",
            "Phase-2 opportunity qualified to Stage 2+ and logged in CRM pipeline",
            "Renewal committed, or active 90 days before expiry",
            "Customer willing to act as a reference",
            "Account Net Revenue Retention on track to 115% or higher",
        ],
    },
    {
        "name": "Closed Lost",
        "short_name": "Closed Lost",
        "probability": 0,
        "color": LOST_COLOR,
        "kind": StageKind.LOST,
    },
)

# R7: the partner pipeline includes an onboarding stage. Post-onboarding, the partner
# enters the GTM motion represented by the Co-Sell stage onward.
PARTNER_STAGES = (
    {"name": "Identify", "short_name": "Identify", "probability": 5, "color": RAMP[0], "kind": StageKind.OPEN},
    {"name": "Onboarding", "short_name": "Onboarding", "probability": 15, "color": RAMP[1], "kind": StageKind.OPEN},
    {"name": "Enabled", "short_name": "Enabled", "probability": 30, "color": RAMP[2], "kind": StageKind.OPEN},
    {"name": "Co-Sell Pipeline", "short_name": "Co-Sell", "probability": 50, "color": RAMP[3], "kind": StageKind.OPEN},
    {"name": "Joint Proposal", "short_name": "Joint Proposal", "probability": 75, "color": RAMP[4], "kind": StageKind.OPEN},
    {"name": "Closed Won", "short_name": "Closed Won", "probability": 100, "color": RAMP[5], "kind": StageKind.WON},
    {"name": "Closed Lost", "short_name": "Closed Lost", "probability": 0, "color": LOST_COLOR, "kind": StageKind.LOST},
)

# (name, stages)
# "AidenAI Direct" is named for what it is — the methodology pipeline from the deck — so
# that adding a second direct-sales pipeline later does not need an awkward name.
PIPELINES = (
    ("AidenAI Direct", DIRECT_STAGES),
    ("Partner Co-Sell", PARTNER_STAGES),
)

# (key, name, account key, lead key, pipeline name, stage name, value,
#  days until close, owner email)
#
# No partner key. A deal has no partner column; who else is involved is expressed by the people
# attached to it, so the seeded partner relationships live in DEAL_PEOPLE further down.
# Negative day offsets are deliberate: they produce at-risk deals so the dashboard's
# needs-attention path is exercised the moment the app is opened.
DEALS = (
    ("d1", "Core Banking AI Modernization", "jpmc", "jpmc-1", "AidenAI Direct", "Proposal, Negotiation & Close", 4_200_000, 5, "priya.raghavan@aidenai.com"),
    ("d2", "Mainframe COBOL Refactor", "jpmc", "jpmc-2", "AidenAI Direct", "Technical Validation & ROI Diagnostic", 2_750_000, 48, "marcus.feld@aidenai.com"),
    ("d3", "Regulatory Reporting Agents", "jpmc", "jpmc-3", "AidenAI Direct", "Discover & Qualify", 890_000, 96, "aisha.bennett@aidenai.com"),
    ("d4", "Advisor Copilot Platform", "bofa", "bofa-1", "AidenAI Direct", "Technical Validation & ROI Diagnostic", 3_100_000, 31, "marcus.feld@aidenai.com"),
    ("d5", "Surveillance Model Rebuild", "bofa", "bofa-2", "AidenAI Direct", "Solution Alignment & Competitive Strategy", 1_450_000, 70, "aisha.bennett@aidenai.com"),
    ("d6", "Trading Platform Latency Programme", "citi", "citi-1", "AidenAI Direct", "Proposal, Negotiation & Close", 5_600_000, -9, "priya.raghavan@aidenai.com"),
    ("d7", "Payments Reconciliation Agents", "citi", "citi-2", "AidenAI Direct", "Solution Alignment & Competitive Strategy", 1_180_000, 58, "priya.raghavan@aidenai.com"),
    ("d8", "Loan Origination Rewrite", "wells", "wells-1", "AidenAI Direct", "Discover & Qualify", 2_300_000, 84, "marcus.feld@aidenai.com"),
    ("d9", "AI Centre of Innovation", "hsbc", "hsbc-1", "AidenAI Direct", "Deploy & Develop", 6_900_000, -26, "aisha.bennett@aidenai.com"),
    ("d10", "Financial Crime Detection Uplift", "hsbc", "hsbc-2", "AidenAI Direct", "Technical Validation & ROI Diagnostic", 2_050_000, 6, "aisha.bennett@aidenai.com"),
    ("d11", "Claims Automation Discovery", "pru", "pru-1", "AidenAI Direct", "Prospecting", 640_000, 140, "priya.raghavan@aidenai.com"),
    ("d12", "Legacy Policy Admin Assessment", "pru", None, "AidenAI Direct", "Prospecting", 320_000, 120, "priya.raghavan@aidenai.com"),
    ("d13", "Member Portal Re-platform", "aetna", "aetna-1", "AidenAI Direct", "Discover & Qualify", 1_900_000, 77, "aisha.bennett@aidenai.com"),
    # Closed Lost at 0%: proves open pipeline is read from stage kind, not probability.
    ("d21", "Data Lake Consolidation", "wells", "wells-1", "AidenAI Direct", "Closed Lost", 1_600_000, -37, "marcus.feld@aidenai.com"),
    # R8: partner-led deals carry both the Partner and the Customer on one record.
    ("d14", "Wealth Data Platform (co-sell)", "bofa", "bofa-1", "Partner Co-Sell", "Co-Sell Pipeline", 3_400_000, 42, "dana.okonkwo@aidenai.com"),
    ("d15", "Risk Engine Modernization (co-sell)", "citi", "citi-1", "Partner Co-Sell", "Joint Proposal", 4_800_000, 4, "dana.okonkwo@aidenai.com"),
    ("d16", "AiDAP Enablement Programme", "wells", None, "Partner Co-Sell", "Onboarding", 450_000, 64, "dana.okonkwo@aidenai.com"),
    ("d17", "Branch Systems Migration (co-sell)", "hsbc", "hsbc-1", "Partner Co-Sell", "Enabled", 2_600_000, 90, "dana.okonkwo@aidenai.com"),
    ("d18", "Insurance Practice Joint GTM", "pru", "pru-1", "Partner Co-Sell", "Identify", 780_000, 155, "dana.okonkwo@aidenai.com"),
    ("d19", "Claims Agents Pilot (co-sell)", "aetna", "aetna-1", "Partner Co-Sell", "Co-Sell Pipeline", 1_250_000, -3, "dana.okonkwo@aidenai.com"),
    ("d20", "Consumer Bank Delivery Partnership", "jpmc", "jpmc-2", "Partner Co-Sell", "Closed Won", 5_100_000, -18, "dana.okonkwo@aidenai.com"),
    ("d22", "Treasury Agents Pilot (co-sell)", "citi", "citi-2", "Partner Co-Sell", "Closed Lost", 520_000, -52, "dana.okonkwo@aidenai.com"),
)

# (subject kind, subject key, activity kind, summary, author email, days ago)
ACTIVITIES = (
    ("deal", "d1", "meeting", "Procurement review of the three-option proposal. Full-environment scenario is the one they are modelling.", "priya.raghavan@aidenai.com", 1),
    ("deal", "d10", "call", "Technical buyer signed off on the POC scorecard in writing. Moving to commercials.", "aisha.bennett@aidenai.com", 2),
    ("account", "bofa", "note", "New CTO starts next month. Re-confirm the exec sponsor before the Q3 push.", "marcus.feld@aidenai.com", 2),
    ("deal", "d4", "meeting", "POC running on the advisor desktop codebase. Baseline story points captured.", "tomas.lindqvist@aidenai.com", 3),
    ("lead", "citi-1", "email", "Global Markets asked for the latency benchmark methodology before the architecture session.", "priya.raghavan@aidenai.com", 4),
    ("deal", "d15", "meeting", "Joint proposal walkthrough with Deloitte. They own the change management workstream.", "dana.okonkwo@aidenai.com", 4),
    ("deal", "d5", "call", "Buying-criteria conversation. Embedded model explainability as a scored requirement.", "aisha.bennett@aidenai.com", 6),
    ("deal", "d8", "note", "Economic buyer identified: SVP Consumer Lending. Budget sits in the 2027 transformation programme.", "marcus.feld@aidenai.com", 7),
    ("deal", "d16", "meeting", "NTT Data onboarding session two of four. Certification track agreed.", "dana.okonkwo@aidenai.com", 8),
    ("deal", "d2", "stage-change", "Moved to Technical Validation & ROI Diagnostic.", "marcus.feld@aidenai.com", 11),
    ("deal", "d13", "call", "Discovery on member portal pain. Quoted 18 months of failed internal rebuild attempts.", "aisha.bennett@aidenai.com", 12),
    ("account", "hsbc", "note", "Phase-1 success report accepted. Reference agreement signed for analyst use.", "aisha.bennett@aidenai.com", 14),
    ("deal", "d7", "email", "Competitive strategy set to Divide. Incumbent only owns the settlement layer.", "priya.raghavan@aidenai.com", 19),
    ("deal", "d11", "note", "ICP score 74. Outreach hypothesis written against the claims cycle-time initiative.", "priya.raghavan@aidenai.com", 24),
    ("deal", "d6", "note", "Signature slipped past the target date. Chasing legal on the DPA redlines.", "priya.raghavan@aidenai.com", 29),
    ("deal", "d17", "meeting", "Virtusa architects certified on AiDAP 2.0. Ready for co-sell motion.", "dana.okonkwo@aidenai.com", 33),
)


# --- Contacts ----------------------------------------------------------------
#
# (key, account key, full name, designation, email, phone, linkedin, side)
#
# Deliberately uneven. Some people are missing a phone or a LinkedIn URL, because the champion gate
# refuses a stage move until a champion has all three and the demo has to be able to *show* that — a
# seed where everybody is complete would make the gate look like dead code.
#
# The four systems integrators carry partner-side people. Those attached to a co-sell deal are what
# "there is a partner on this deal" now means, since no column says so.
CONTACTS = (
    # key            account      name                 designation                     email                             phone              linkedin                              side
    ("c-jpmc-1",  "jpmc",      "Anita Desai",       "MD, Corporate Technology",     "anita.desai@jpmc.example",       "+1 212 555 0142", "linkedin.com/in/anitadesai",       "customer"),
    ("c-jpmc-2",  "jpmc",      "Ravi Menon",        "Head of Platform Engineering",  "ravi.menon@jpmc.example",        "+1 212 555 0177", "linkedin.com/in/ravimenon",        "customer"),
    # No LinkedIn: enough to be a contact, not enough to be a champion.
    ("c-jpmc-3",  "jpmc",      "Sarah Whitfield",   "CIO, Consumer Bank",            "sarah.whitfield@jpmc.example",   "+1 212 555 0198", "",                                 "customer"),
    ("c-bofa-1",  "bofa",      "Daniel Okafor",     "SVP, Wealth Technology",        "daniel.okafor@bofa.example",     "+1 704 555 0113", "linkedin.com/in/danielokafor",     "customer"),
    # No phone.
    ("c-bofa-2",  "bofa",      "Grace Lim",         "Director of Compliance Tech",   "grace.lim@bofa.example",         "",                "linkedin.com/in/gracelim",         "customer"),
    ("c-citi-1",  "citi",      "Marco Bellini",     "Global Head of AI",             "marco.bellini@citi.example",     "+1 212 555 0231", "linkedin.com/in/marcobellini",     "customer"),
    ("c-citi-2",  "citi",      "Yuki Tanaka",       "VP, Markets Technology",        "yuki.tanaka@citi.example",       "+1 212 555 0244", "linkedin.com/in/yukitanaka",       "customer"),
    ("c-wells-1", "wells",     "Brandon Cole",      "Head of Digital Channels",      "brandon.cole@wells.example",     "+1 415 555 0166", "linkedin.com/in/brandoncole",      "customer"),
    ("c-hsbc-1",  "hsbc",      "Priya Nair",        "Regional CTO, APAC",            "priya.nair@hsbc.example",        "+65 6555 0121",   "linkedin.com/in/priyanair",        "customer"),
    ("c-pru-1",   "pru",       "Helen Moss",        "Chief Actuary",                 "helen.moss@pru.example",         "+1 973 555 0155", "linkedin.com/in/helenmoss",        "customer"),
    ("c-aetna-1", "aetna",     "Victor Reyes",      "VP, Claims Automation",         "victor.reyes@aetna.example",     "+1 860 555 0188", "linkedin.com/in/victorreyes",      "customer"),
    # Partner-side.
    ("c-acc-1",   "accenture", "Fiona Gallagher",   "Managing Director, Banking",    "fiona.gallagher@accenture.example", "+44 20 7555 0101", "linkedin.com/in/fionagallagher", "partner"),
    ("c-acc-2",   "accenture", "Samuel Adeyemi",    "Delivery Lead",                 "samuel.adeyemi@accenture.example",  "+44 20 7555 0119", "linkedin.com/in/samueladeyemi",  "partner"),
    ("c-del-1",   "deloitte",  "Clara Jensen",      "Partner, Financial Services",   "clara.jensen@deloitte.example",     "+1 212 555 0301", "linkedin.com/in/clarajensen",    "partner"),
    ("c-ntt-1",   "ntt",       "Kenji Sato",        "Alliance Manager",              "kenji.sato@ntt.example",            "+81 3 5555 0144", "linkedin.com/in/kenjisato",      "partner"),
    # Missing both phone and LinkedIn — the worst case the gate has to report on.
    ("c-vir-1",   "virtusa",   "Nadia Haddad",      "Engagement Director",           "nadia.haddad@virtusa.example",      "",                "",                               "partner"),
)

# --- Who is on which deal ----------------------------------------------------
#
# (deal key, extra tracked role keys, [(contact key, role key or None)])
#
# The three states the model now supports all appear here on purpose, because each one is a thing the
# deal page renders differently and none of them can be reviewed if the demo data never produces it:
#
#   a mapped contact      the ordinary case
#   an unmapped contact   attached before anyone worked out what they are — role key None
#   an unfilled role      tracked because the deal needs one, nobody found yet — via the extra roles
DEAL_PEOPLE = (
    # A complete champion: this deal can advance.
    ("d1",  (), (("c-jpmc-1", "champion"), ("c-jpmc-2", "end-customer"))),
    # Champion with no LinkedIn, so a gated stage will refuse it and say which field is missing.
    ("d2",  ("executive-sponsor",), (("c-jpmc-3", "champion"), ("c-jpmc-2", "end-customer"))),
    # Nobody identified yet, and an exec sponsor still being looked for.
    ("d3",  ("executive-sponsor",), (("c-jpmc-2", None),)),
    ("d4",  (), (("c-bofa-1", "champion"), ("c-bofa-1", "executive-sponsor"))),
    ("d5",  (), (("c-bofa-2", "champion"),)),
    ("d6",  (), (("c-citi-1", "champion"), ("c-citi-2", None))),
    ("d7",  ("champion",), (("c-citi-2", "end-customer"),)),
    ("d8",  (), (("c-wells-1", "champion"),)),
    ("d9",  (), (("c-hsbc-1", "champion"),)),
    ("d10", (), (("c-pru-1", "champion"),)),
    ("d11", (), (("c-aetna-1", "champion"),)),
    # Co-sell deals, each with a partner-side contact. That attachment is the only thing saying a
    # partner is involved.
    ("d14", (), (("c-bofa-1", "champion"), ("c-acc-1", "partner-contact"), ("c-acc-2", "partner-contact"))),
    ("d15", (), (("c-citi-1", "champion"), ("c-acc-1", "partner-contact"))),
    ("d16", (), (("c-wells-1", "champion"), ("c-del-1", "partner-contact"))),
    ("d17", ("executive-sponsor",), (("c-hsbc-1", "champion"), ("c-ntt-1", "partner-contact"))),
    ("d18", (), (("c-pru-1", "champion"), ("c-del-1", "partner-contact"))),
    ("d19", (), (("c-aetna-1", "champion"), ("c-vir-1", "partner-contact"))),
    ("d20", (), (("c-jpmc-1", "champion"), ("c-acc-2", "partner-contact"))),
    ("d22", (), (("c-citi-2", None), ("c-del-1", "partner-contact"))),
)

# The roles seeded by migration b8e13d5a06c7, by key. Repeated here because the seed builds its schema
# from the models and cannot assume the migration's INSERT ran.
CONTACT_ROLES = (
    ("champion", "Champion", 1, True),
    ("executive-sponsor", "Executive Sponsor", 2, False),
    ("end-customer", "End Customer", 3, False),
    ("partner-contact", "Partner Contact", 4, False),
)
