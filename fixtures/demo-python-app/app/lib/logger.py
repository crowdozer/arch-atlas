"""Tiny structured logger — common fan-in leaf."""


def info(msg: str, **extra) -> None:
    print("[demo-python]", msg, extra or "")


def warn(msg: str, **extra) -> None:
    print("[demo-python:warn]", msg, extra or "")
