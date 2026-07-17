# Compliance

Module path: `/compliance`

Brand compliance profiles, automated checks on approval queues, immutable audit log, and GDPR export/deletion.

## Tables

- `compliance_profiles` — per-brand industry, jurisdictions, regulated flag, rules JSON, required_disclaimers, banned_claims, banned_terms
- `compliance_checks` — entity_type (`content` | `ad` | `email` | `seo_article`), status (`pass` | `warn` | `fail`), findings, override fields
- `audit_events` — immutable insert-only log (approvals, publish, overrides, budget/settings changes, export, deletion)
- Org columns: `deletion_requested_at`, `deletion_scheduled_for`, `deletion_requested_by`

Migration: `00015_compliance_module.sql`

## Industry presets

Selectable packs in `/compliance/profile`:

- General ecommerce
- Financial promotions
- Health / wellness
- Alcohol
- Children's products

Each pre-populates rules, disclaimers, and bans — all editable.

## Check agent

`lib/agents/prompts/compliance/checker.ts` + deterministic banned-term/claim scan.

Runs automatically when items enter approval queues:

- Content generate (Inngest) → `compliance_checks` + `content_items.compliance_flags`
- Ad creatives on generate
- SEO articles on draft
- Email campaigns on schedule (check then gate)

## Approval gating

`assertComplianceAllowsApproval` blocks `fail` unless `org_owner` / `org_admin` supplies a logged `overrideReason` (≥ 8 chars). Override writes audit `compliance_override`.

Wired into:

- `approveContentItem`
- `reviewCreative` (approve)
- `approveArticle`
- `scheduleCampaign`

Findings render inline with severity badges in content review, ads approvals, and SEO article UI.

## Audit log

`/compliance/audit` — filterable by action / entity / summary (org admins only).

Also records budget changes (`upsertBudget`) and compliance profile settings changes.

## GDPR

- Export: `GET /api/compliance/export` → ZIP of JSON + CSV (org admin)
- Deletion: request with slug/`DELETE` confirm → 30-day grace → Inngest `compliance/process-deletions` (03:15 UTC) hard-deletes due orgs (cascade)
