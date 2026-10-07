# KnowShowGo over MCP

The server speaks the [Model Context Protocol](https://modelcontextprotocol.io)
at `POST /mcp`, so an MCP client gets the memory layer with no SDK at all. The
same token that this client uses works there, and the two write to the same
graph: a claim stored through `remember` over MCP is what `client.ask(...)`
reads back here, and the other way round.

| Host | URL | Auth |
|------|-----|------|
| production | `https://api.knowshowgo.com/mcp` | `Authorization: Bearer ksg_…` (401 without one) |
| dev | `https://dev.knowshowgo.com/mcp` | token, or `X-KSG-Owner: <you>` as a soft identity |
| local | `http://127.0.0.1:3000/mcp` | none needed |

Tokens come from <https://knowshowgo.com/developers>. The transport is
Streamable HTTP in stateless mode: one JSON response per request, no sessions.

## Tools

| Tool | Writes | What it does |
|------|--------|--------------|
| `remember` | yes | Store text plus the claims it states (`claims: [{subject, predicate, object}]`); every claim is versioned with provenance |
| `correct` | yes | Store a correction; the earlier claim is kept next to it, not overwritten |
| `ask` | no | One fact: `subject` + `predicate` → the believed value, the evidence and who said it; `state: "conflicted"` when sources disagree |
| `recall` | no | Memories near a query |
| `search_knowledge` | no | Concepts and objects near a query |
| `upsert_object` / `get_object` | yes / no | Typed records (the same objects as `client.objects` here) |
| `search_procedures` | no | Procedures, with their steps |
| `resolve_topic` | no | A topic by tag, never creating one |
| `feedback` | yes | File a bug, idea or question with the operators; returns a `ref` to quote later |

The server runs no LLM, so the calling model passes the facts it read as
`claims`. The full contract, metering and the auth table are in the server's
[`docs/MCP.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/MCP.md).

## Connect

Claude Code:

```bash
claude mcp add --transport http knowshowgo https://api.knowshowgo.com/mcp \
  --header "Authorization: Bearer $KSG_API_TOKEN"
```

Cursor, Windsurf and other clients that read `mcp.json`:

```json
{
  "mcpServers": {
    "knowshowgo": {
      "url": "https://api.knowshowgo.com/mcp",
      "headers": { "Authorization": "Bearer ksg_…" }
    }
  }
}
```

The claude.ai connector UI needs OAuth for remote servers, which the endpoint
does not offer yet; use Claude Code or a desktop client that takes a header.

## Discovery

The server describes itself at `https://api.knowshowgo.com/.well-known/mcp.json`
(endpoint, transport, auth mode, where a token comes from, tool names). Its
listing for the official MCP Registry is `mcp/server.json` in this repo,
published by the `publish-mcp-registry.yml` workflow under the GitHub-verified
namespace `io.github.lehelkovach`.

## Feedback

The `feedback` tool files a ticket into the same graph: say what broke, what
you expected, and which tool was in use. You get a `ref` like `FB-…`; quote it
when you follow up. Tickets are never deleted.

## When to use which

- **An agent that already runs in an MCP host** (Claude Code, Cursor, a
  desktop assistant): MCP. Nothing to install, the model calls the tools itself.
- **Checking an answer** from either side: the MCP tool `verify_answer` and this client's `verify_answer()` call the same `POST /api2.0/verify/answer`, which verdicts an answer claim by claim against stored claims.
- **Your own code** (a service, a script, a test): this client. It has the
  full surface, typed objects, procedures, Logic IR and the verification calls
  that MCP leaves out.
- **Both at once** is fine. Pass the same owner (token) and each side sees the
  other's writes. Give each agent its own `agent` name on MCP writes so the
  claims stay attributable.
