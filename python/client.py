"""Compatibility shim.

Earlier releases were used as ``from client import KnowShowGoClient`` with
``python/`` on ``sys.path``. The SDK now lives in the ``knowshowgo_client``
package; this module re-exports it so that import path keeps working.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from knowshowgo_client.client import *  # noqa: E402,F401,F403
from knowshowgo_client.client import (  # noqa: E402
    EntityProxy,
    KnowShowGoClient,
    LOCAL_API_BASE_URL,
    PUBLIC_API_BASE_URL,
    matches_route,
    resolve_base_url,
)
