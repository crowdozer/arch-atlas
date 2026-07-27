"""Module a — imports sibling, relative, and external."""
from pkg.b import helper, util as u
from . import b as sibling_b
import requests


def run():
    return helper() + len(u())
