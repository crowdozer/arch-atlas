"""L1 entry - absolute package import + stdlib bare."""
from pkg.a import run
import os


def main():
    print(run(), os.name)


if __name__ == "__main__":
    main()
