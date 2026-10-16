"""SignLine Emergency Communication Assistant.

Helps Deaf and non-speaking people prepare an emergency report from signs, a configured personal
gesture or accessible buttons, review and confirm it, and share it through an explicitly configured
destination. Recognition is provider-based: this version ships a deterministic mock provider, and the
real SignLine model plugs in through the same event contract (services/recognition).

Nothing here contacts real emergency services.
"""
