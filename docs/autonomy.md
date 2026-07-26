# Autonomy engine (Phase D)

Per-brand operating mode for outbound agent actions.

## Brand columns (`00025_autonomy_engine.sql`)

| Column | Meaning |
|--------|---------|
| `autonomy_mode` | `approval` (default) or `autonomous` |
| `channel_modes` | Optional overrides: `ads`, `organic_social`, `email`, … |
| `agent_activity_paused` | Kill switch — halt autonomous execution + scheduled publishing |
| `autonomy_min_roas` / `autonomy_max_cpa_pence` | Soft KPI pause thresholds (overridden by `brand_kpis` when set) |

UI: **Brand → Autonomy**.

## Authorization

Every agent outbound path calls `authorizeAgentAction()` in `lib/autonomy/authorize.ts`:

- Kill switch blocks execution
- Approval mode queues recommendations / human review
- Autonomous ads still pass Phase C `authorizeAdWrite` limits
- Agent budget increases capped at **+20%/day**
- Organic publish blocked on compliance `fail` (even when autonomous)
- Human-approved scheduled posts may still fire in approval mode unless the kill switch is on

Successful autonomous actions write `audit_events` with `actor=agent` and notify org admins.

## Jobs

| Cron | Function |
|------|----------|
| Daily 08:00 UTC | Ads optimisation — recommendations always; executes pauses/budget shifts only when ads channel is autonomous |
| Monday 09:00 UTC | Organic growth review — feeds next content plan brief / proposed slots |
