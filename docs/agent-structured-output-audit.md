# Agent structured-output audit

Every Claude call that returns **structured JSON for persistence** must go through
`runClaudeJson` / `runClaudeJsonWithDocument` (Anthropic tool-use + Zod).

Last audited: 2026-07-27.

## Shared path (required)

| Helper | Mechanism |
|--------|-----------|
| `lib/agents/claude-json.ts` → `runClaudeJson` | Force tool `emit_structured_result`; input_schema from Zod via `z.toJSONSchema`; Zod parse second gate; **max_tokens continuation** when truncated |
| `lib/agents/claude-document.ts` → `runClaudeJsonWithDocument` | Same tool-use pattern + PDF document block |

## Call sites — structured agents

| Agent / entry | Path | Notes |
|---------------|------|-------|
| Planning `generateMarketingPlan` | **structured** | `maxTokens: 16000` + truncation retry |
| Meetings (standup/weekly/board/annual) | **structured** | |
| Content (batch/single/script/repurpose/…) | **structured** | |
| Content growth review | **structured** | |
| Ads (creative/copy/optimisation prompts) | **structured** | |
| Email | **structured** | |
| SEO | **structured** | |
| CRM | **structured** | |
| Finance | **structured** | |
| Reviews / reports | **structured** | |
| Analytics ask / anomalies | **structured** | |
| Compliance | **structured** | |
| Brand website extract | **structured** | `webSearch: true` |
| Brand guidelines PDF | **structured (document)** | |
| Research (brand/competitor/…) | **structured** | Migrated from freeform text JSON; `webSearch: true` |

## Intentional non-structured (free text)

| Call site | Why OK |
|-----------|--------|
| `lib/meetings/actions.ts` meeting chat | Conversational Q&A, not Zod-persisted JSON |

## Do not add

- New `anthropic.messages.create` + `JSON.parse` + Zod for agent outputs
- Prompts that say “return JSON matching the schema” without sending the schema via tool input_schema
