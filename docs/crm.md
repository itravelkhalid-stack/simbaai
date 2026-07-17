# CRM

Module path: `/crm`

Contacts, deals, lifecycle funnel, and marketing-attributed revenue.

## Tables

- `crm_contacts` — email unique per brand, lifecycle stage, tags, revenue, lead score
- `crm_pipelines` / `crm_deals` — ordered stages jsonb, kanban stage moves
- `crm_activities` — timeline (note/email/call/meeting/task/status_change)
- `crm_orders` — Shopify/WooCommerce/manual order idempotency + revenue
- `crm_form_submissions` — inbound form captures
- `crm_pipeline_reviews` — weekly AI summaries

See migration `00012_crm_module.sql`.

## Inbound integrations

| Endpoint | Purpose |
|----------|---------|
| `POST /api/crm/forms` | Form submissions → lead contact |
| `POST /api/crm/webhooks/shopify?organization_id=&brand_id=` | Orders → contact + revenue |
| `POST /api/crm/webhooks/woocommerce?organization_id=&brand_id=` | Same for Woo |

Auth: header `x-crm-secret` or `Authorization: Bearer` matching `CRM_WEBHOOK_SECRET`.

Email CSV imports and “Sync email subscribers” upsert CRM contacts.

## AI

- Lead score 0–100 with reasoning (contact detail)
- Follow-up email draft in brand voice
- Weekly pipeline review (Inngest `crm/weekly-pipeline-review`, Mon 07:00 UTC)

## UI

- `/crm` — funnel chart + latest pipeline review
- `/crm/contacts` — filters + sync
- `/crm/contacts/[id]` — timeline, AI actions, deals
- `/crm/deals` — drag-and-drop kanban

CRM order revenue feeds Reviews `crm_revenue` KPI.
