import type { AutomationRecipe } from "@/lib/types/automations";

export function getRecipes(): AutomationRecipe[] {
  return [
    {
      id: "weekly_content_topup",
      name: "Weekly content top-up",
      description:
        "When scheduled posts drop below 5, queue a content batch for approval.",
      trigger: {
        type: "metric_threshold",
        metric: "scheduled_posts",
        op: "<",
        value: 5,
        days: 1,
      },
      conditions: [],
      actions: [
        {
          type: "run_agent",
          agent: "content_batch",
          brief: "Weekly content top-up — generate posts for the next 7 days",
        },
        {
          type: "notify",
          channels: ["in_app", "email"],
          title: "Content top-up queued",
          body: "Scheduled posts were low; a content batch was queued for approval.",
        },
      ],
    },
    {
      id: "roas_drop_pause",
      name: "Alert + pause when ROAS drops",
      description:
        "When ROAS stays below 1.5 for 3 days, notify and pause the campaign.",
      trigger: {
        type: "metric_threshold",
        metric: "roas",
        op: "<",
        value: 1.5,
        days: 3,
      },
      conditions: [],
      actions: [
        {
          type: "notify",
          channels: ["in_app", "email", "slack"],
          title: "ROAS below target",
          body: "Campaign ROAS has been below 1.5 for 3 days.",
        },
        {
          type: "pause_ad_campaign",
          use_trigger_campaign: true,
        },
      ],
    },
    {
      id: "welcome_on_lead_tag",
      name: "Welcome flow when tagged lead",
      description:
        "When a contact is tagged 'lead', tag for welcome and notify the team.",
      trigger: {
        type: "event",
        event: "contact.tagged",
        tag: "lead",
      },
      conditions: [],
      actions: [
        {
          type: "add_contact_tag",
          tag: "welcome_queued",
          use_trigger_contact: true,
        },
        {
          type: "notify",
          channels: ["in_app"],
          title: "New lead tagged",
          body: "A contact was tagged lead — welcome follow-up ready.",
        },
      ],
    },
    {
      id: "monthly_research_refresh",
      name: "Monthly research refresh",
      description:
        "On the 1st of each month at 08:00 UTC, refresh brand research.",
      trigger: {
        type: "schedule",
        frequency: "daily",
        at_hour: 8,
        at_minute: 0,
      },
      conditions: [
        {
          logic: "and",
          rules: [{ field: "day_of_month", op: "eq", value: 1 }],
        },
      ],
      actions: [
        { type: "run_agent", agent: "research_refresh" },
        {
          type: "notify",
          channels: ["in_app"],
          title: "Research refresh started",
          body: "Monthly research refresh was triggered by automation.",
        },
      ],
    },
  ];
}
