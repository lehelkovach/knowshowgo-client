# knowshowgo-client (Python)

Python SDK for the KnowShowGo semantic memory engine. Paired with the server
release of the same `X.Y.Z`.

```bash
pip install knowshowgo-client
# or, straight from a tag:
pip install "git+https://github.com/lehelkovach/knowshowgo-client.git@v0.2.20-client#subdirectory=python"
```

```python
from knowshowgo_client import KnowShowGoClient

client = KnowShowGoClient.public_api(default_owner_user_id="my-app")
client.connect()
```

`from client import KnowShowGoClient` still works when `python/` is on
`sys.path`, through the compatibility shim in `python/client.py`.

Tests: `python -m unittest discover -s python/tests -p 'test_*.py'` from the
repo root. The full SDK documentation lives in the repository README.
