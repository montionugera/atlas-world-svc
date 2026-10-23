"""Route dispatcher, static mounts and the review-queue writer for the Atlas World
observatory (`scripts/catalog_explorer_web.py`).

This package must never import `catalog_explorer_web`: the server runs that file as
`__main__`, so importing it by name would load a second copy of the 29k-line module.
Anything that needs the handler's helpers receives the handler as an argument instead.
"""
