from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ORMModel(BaseModel):
    """
    Base for response models.

    Serialises as camelCase so the wire format matches the React client's existing types
    verbatim, while Python keeps snake_case. `populate_by_name` means requests may send
    either spelling.
    """

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class PayloadModel(BaseModel):
    """Base for request bodies. Rejects unknown fields rather than ignoring typos."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
    )


class Message(ORMModel):
    detail: str
