"""Order model."""
from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Order:
    id: str
    user_id: str
    sku: str
    qty: int
    total_cents: int

    def to_dict(self) -> dict:
        return asdict(self)
