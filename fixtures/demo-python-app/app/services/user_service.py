"""User service - owns in-memory roster."""
from app.lib.logger import info
from app.models.user import User

_users: dict[str, User] = {}


def bootstrap_users() -> None:
    if _users:
        return
    for u in (
        User(id="u1", email="ada@example.com", name="Ada"),
        User(id="u2", email="grace@example.com", name="Grace"),
    ):
        _users[u.id] = u
    info("users bootstrapped", count=len(_users))


def list_users() -> list[User]:
    return list(_users.values())


def get_user(user_id: str) -> User | None:
    return _users.get(user_id)
