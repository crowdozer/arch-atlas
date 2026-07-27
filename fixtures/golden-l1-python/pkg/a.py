"""Module a — relative sibling + bare external package."""
from . import b as sibling_b
from pkg.b import helper
import requests


def run():
    return helper() + sibling_b.util()
