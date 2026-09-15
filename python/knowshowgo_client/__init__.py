"""KnowShowGo Python client.

    from knowshowgo_client import KnowShowGoClient

Paired with the KnowShowGo server release of the same X.Y.Z; see the server's
docs/VERSION-MATRIX.md. ``__version__`` is written by scripts/bump-version.mjs
alongside package.json and pyproject.toml.
"""

from .client import *  # noqa: F401,F403
from .client import (  # explicit re-exports for tooling
    EntityProxy,
    KnowShowGoClient,
    LOCAL_API_BASE_URL,
    PUBLIC_API_BASE_URL,
    matches_route,
    resolve_base_url,
)

__version__ = "0.2.12.dev0"
