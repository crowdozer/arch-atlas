"""User model."""
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class User:
    id: str
    email: str
    name: str

    def to_dict(self) -> dict:
        return asdict(self)
