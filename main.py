"""Compatibility entry point for hosts configured with ``python main.py``."""

from runpy import run_module


if __name__ == "__main__":
    run_module("bot", run_name="__main__")