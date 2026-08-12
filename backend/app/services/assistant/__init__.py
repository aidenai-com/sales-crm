"""
The AI assistant, kept as a package so each concern stays swappable.

    provider.py   talks to the model. Streaming and tool-call assembly, nothing domain-specific.
    tools.py      the only route from a question to the database. Permission-scoped.
    pricing.py    tokens to money.
    usage.py      recording what was spent.
    service.py    the loop that ties them together.

The split matters because these change for unrelated reasons. Swapping model vendors touches
`provider`; adding a question the assistant can answer touches `tools`; a price change touches
`pricing`. None of those should require reading the others.
"""
