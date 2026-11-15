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
The server speaks MCP revision `2026-07-28` (no handshake, `server/discover`)
and the earlier revisions back to `2024-11-05` on the same URL, so any current
client connects.

## Tools

34 tools. A `read` token sees the 19 that write nothing; a `write` token sees
all of them.

| Group | Tools |
|-------|-------|
| Memory | `remember` (store text plus the claims it states, versioned with provenance), `correct` (a correction kept next to the earlier claim), `ask` (one fact: the believed value, the evidence and who said it; `conflicted` when sources disagree), `recall`, `search_knowledge`, `resolve_topic` |
| Checking answers | `verify_answer` (a verdict per claim), `ground_claim` (which concept each term is about, or ambiguous, or undefined), `check_membership`, `assimilate_exemplar`, `merge_concepts`, `unmerge_concept`, `assert_proposition` |
| Reasoning with receipts | `evaluate`, `derive`, `explain`, `add_rule`, `list_rules`, `set_rule_enabled`, `apply_rule`, `check_rules`, `saturate`, `bind_pattern`, `close_relation`, `join_rules` |
| Events and episodes | `remember_event`, `find_events`, `recall_episodes`, `describe_event` |
| Objects and procedures | `upsert_object` / `get_object` (the same objects as `client.objects` here), `search_procedures` (verified only unless `include` asks for drafts or retired), `procedure_evaluation` |
| Feedback | `feedback` (a bug, idea or question for the operators; returns a `ref` to quote later) |

The server runs no LLM, so the calling model passes the facts it read as
`claims`. The full contract, each tool's REST route, metering and the auth
table are in the server's
[`docs/MCP.md`](https://github.com/lehelkovach/knowshowgo/blob/main/docs/MCP.md).

## Connect

claude.ai and Claude Desktop (custom connector, signs in with OAuth):

1. Mint a token at <https://knowshowgo.com/developers>.
2. Customize → Connectors → Add custom connector. URL
   `https://api.knowshowgo.com/mcp`.
3. On the consent page, paste the `ksg_…` token and approve. The connector
   holds a one-hour access token and renews it for 30 days.

ChatGPT and other OAuth-capable clients connect the same way: the server
advertises its authorization server, accepts client ID metadata documents and
dynamic registration, and requires PKCE.

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
- **Grounding a claim** from either side: the MCP tool `ground_claim` and this client's `ground()` call the same `POST /api2.0/ground`, which says which concept each term is about, or that it is ambiguous (with candidates) or undefined.
- **Checking an answer** from either side: the MCP tool `verify_answer` and this client's `verify_answer()` call the same `POST /api2.0/verify/answer`, which verdicts an answer claim by claim against stored claims.
- **Your own code** (a service, a script, a test): this client. It has the
  full surface, typed objects, procedures, Logic IR and the verification calls
  that MCP leaves out.
- **Both at once** is fine. Pass the same owner (token) and each side sees the
  other's writes. Give each agent its own `agent` name on MCP writes so the
  claims stay attributable.
