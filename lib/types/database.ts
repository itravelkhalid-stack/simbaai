import type {
  Brand,
  BrandAudience,
  BrandProduct,
  Competitor,
  ResearchDocument,
  ResearchProject,
  ResearchProjectStatus,
  ResearchProjectType,
} from "@/lib/types/research";

export type OrgMemberRole =
  | "org_owner"
  | "org_admin"
  | "org_member"
  | "org_viewer";

export type MembershipStatus = "active" | "invited" | "removed";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type AgentRunStatus = "queued" | "running" | "complete" | "failed";
export type OrgPlan = "free" | "starter" | "growth" | "agency";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  plan: OrgPlan;
  settings: Record<string, unknown>;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  billing_email: string | null;
  plan_period_start: string | null;
  plan_period_end: string | null;
  deletion_requested_at: string | null;
  deletion_scheduled_for: string | null;
  deletion_requested_by: string | null;
  created_at: string;
};

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type OrganizationMember = {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgMemberRole;
  invited_by: string | null;
  status: MembershipStatus;
  created_at: string;
};

export type Invitation = {
  id: string;
  organization_id: string;
  email: string;
  role: OrgMemberRole;
  token: string;
  invited_by: string | null;
  status: InvitationStatus;
  expires_at: string;
  created_at: string;
};

export type AgentRun = {
  id: string;
  organization_id: string;
  module: string;
  agent_name: string;
  status: AgentRunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  tokens_in: number;
  tokens_out: number;
  cost_pence: number;
  duration_ms: number | null;
  error: string | null;
  logs: Array<{ at: string; message: string; level?: string }>;
  progress: number;
  model: string | null;
  research_project_id: string | null;
  created_at: string;
  updated_at: string;
};

type TableDef<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      organizations: TableDef<
        Organization,
        {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          plan?: OrgPlan;
          settings?: Record<string, unknown>;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          stripe_price_id?: string | null;
          billing_email?: string | null;
          plan_period_start?: string | null;
          plan_period_end?: string | null;
          deletion_requested_at?: string | null;
          deletion_scheduled_for?: string | null;
          deletion_requested_by?: string | null;
          created_at?: string;
        },
        Partial<Organization>
      >;
      profiles: TableDef<
        Profile,
        {
          id: string;
          full_name?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<Omit<Profile, "id">>
      >;
      organization_members: TableDef<
        OrganizationMember,
        {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: OrgMemberRole;
          invited_by?: string | null;
          status?: MembershipStatus;
          created_at?: string;
        },
        Partial<OrganizationMember>
      >;
      invitations: TableDef<
        Invitation,
        {
          id?: string;
          organization_id: string;
          email: string;
          role?: OrgMemberRole;
          token?: string;
          invited_by?: string | null;
          status?: InvitationStatus;
          expires_at?: string;
          created_at?: string;
        },
        Partial<Invitation>
      >;
      agent_runs: TableDef<
        AgentRun,
        {
          id?: string;
          organization_id: string;
          module: string;
          agent_name: string;
          status?: AgentRunStatus;
          input?: Record<string, unknown>;
          output?: Record<string, unknown> | null;
          tokens_in?: number;
          tokens_out?: number;
          cost_pence?: number;
          duration_ms?: number | null;
          error?: string | null;
          logs?: AgentRun["logs"];
          progress?: number;
          model?: string | null;
          research_project_id?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<AgentRun>
      >;
      platform_admins: TableDef<
        { user_id: string; created_at: string },
        { user_id: string; created_at?: string },
        Partial<{ user_id: string; created_at: string }>
      >;
      brands: TableDef<
        Brand,
        {
          id?: string;
          organization_id: string;
          name: string;
          website?: string | null;
          positioning?: string | null;
          brand_voice?: string | null;
          target_audience?: string | null;
          guidelines?: Record<string, unknown>;
          social_handles?: Record<string, unknown>;
          logo_url?: string | null;
          primary_color?: string | null;
          secondary_color?: string | null;
          accent_color?: string | null;
          font_heading?: string | null;
          font_body?: string | null;
          tagline?: string | null;
          products_summary?: string | null;
          is_primary?: boolean;
          created_at?: string;
          updated_at?: string;
        },
        Partial<Brand>
      >;
      brand_audiences: TableDef<
        BrandAudience,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          description?: string | null;
          demographics?: Record<string, unknown>;
          psychographics?: Record<string, unknown>;
          channel_behaviour?: Record<string, unknown>;
          messaging_angles?: string[];
          source_research_project_id?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<BrandAudience>
      >;
      brand_products: TableDef<
        BrandProduct,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          description?: string | null;
          category?: string | null;
          price_pence?: number | null;
          currency?: string;
          url?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        },
        Partial<BrandProduct>
      >;
      org_webhook_secrets: TableDef<
        {
          id: string;
          organization_id: string;
          provider: "shopify" | "woocommerce" | "forms" | "generic";
          secret: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          provider: "shopify" | "woocommerce" | "forms" | "generic";
          secret: string;
          created_at?: string;
          updated_at?: string;
        },
        Partial<{
          secret: string;
          updated_at: string;
        }>
      >;
      research_projects: TableDef<
        ResearchProject,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          type: ResearchProjectType;
          status?: ResearchProjectStatus;
          title: string;
          brief?: Record<string, unknown>;
          latest_agent_run_id?: string | null;
          refreshed_from_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        },
        Partial<ResearchProject>
      >;
      research_documents: TableDef<
        ResearchDocument,
        {
          id?: string;
          organization_id: string;
          project_id: string;
          section: string;
          content: string;
          sources?: ResearchDocument["sources"];
          confidence?: number | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        },
        Partial<ResearchDocument>
      >;
            competitors: TableDef<
        Competitor,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          website?: string | null;
          social_handles?: Record<string, unknown>;
          positioning?: string | null;
          strengths?: string[];
          weaknesses?: string[];
          pricing_notes?: string | null;
          content_strategy?: string | null;
          ad_presence?: string | null;
          seo_strengths?: string | null;
          social_performance?: string | null;
          comparison?: Record<string, unknown>;
          source_research_project_id?: string | null;
          last_analyzed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<Competitor>
      >;
      content_pillars: TableDef<
        import("@/lib/types/content").ContentPillar,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          description?: string | null;
          target_pct?: number;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/content").ContentPillar>
      >;
      content_items: TableDef<
        import("@/lib/types/content").ContentItem,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          pillar_id?: string | null;
          platform: import("@/lib/types/content").ContentPlatform;
          format?: import("@/lib/types/content").ContentFormat;
          status?: import("@/lib/types/content").ContentItemStatus;
          title?: string | null;
          copy?: string;
          hashtags?: string[];
          media_urls?: string[];
          structured?: Record<string, unknown>;
          compliance_flags?: import("@/lib/types/content").ComplianceFlag[];
          rejection_reason?: string | null;
          scheduled_at?: string | null;
          published_at?: string | null;
          platform_post_id?: string | null;
          ai_generated?: boolean;
          campaign_id?: string | null;
          plan_id?: string | null;
          variant_group_id?: string | null;
          source_item_id?: string | null;
          agent_run_id?: string | null;
          publish_error?: string | null;
          publish_attempts?: number;
          last_publish_attempt_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/content").ContentItem>
      >;
      content_comments: TableDef<
        import("@/lib/types/content").ContentComment,
        {
          id?: string;
          organization_id: string;
          item_id: string;
          user_id: string;
          comment: string;
          resolved?: boolean;
          created_at?: string;
        },
        Partial<import("@/lib/types/content").ContentComment>
      >;
      content_plans: TableDef<
        import("@/lib/types/content").ContentPlan,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          title: string;
          status?: import("@/lib/types/content").ContentPlanStatus;
          start_date: string;
          end_date: string;
          brief?: Record<string, unknown>;
          agent_run_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/content").ContentPlan>
      >;
      content_plan_slots: TableDef<
        import("@/lib/types/content").ContentPlanSlot,
        {
          id?: string;
          organization_id: string;
          plan_id: string;
          pillar_id?: string | null;
          platform: import("@/lib/types/content").ContentPlatform;
          format?: import("@/lib/types/content").ContentFormat;
          topic: string;
          scheduled_at?: string | null;
          status?: import("@/lib/types/content").ContentPlanSlotStatus;
          content_item_id?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/content").ContentPlanSlot>
      >;
      social_connections: TableDef<
        import("@/lib/social/types").SocialConnection,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          platform: import("@/lib/types/content").ContentPlatform;
          account_name: string;
          account_id: string;
          access_token_encrypted: string;
          refresh_token_encrypted?: string | null;
          token_expires_at?: string | null;
          scopes?: string[];
          status?: import("@/lib/social/types").SocialConnectionStatus;
          metadata?: Record<string, unknown>;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/social/types").SocialConnection>
      >;
      content_metrics: TableDef<
        import("@/lib/social/types").ContentMetric,
        {
          id?: string;
          organization_id: string;
          content_item_id: string;
          platform: import("@/lib/types/content").ContentPlatform;
          platform_post_id: string;
          captured_at?: string;
          impressions?: number;
          reach?: number;
          likes?: number;
          comments?: number;
          shares?: number;
          saves?: number;
          clicks?: number;
          raw?: Record<string, unknown>;
          created_at?: string;
        },
        Partial<import("@/lib/social/types").ContentMetric>
      >;
      email_lists: TableDef<
        import("@/lib/types/email").EmailList,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/email").EmailList>
      >;
      email_subscribers: TableDef<
        import("@/lib/types/email").EmailSubscriber,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          list_id: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          custom_fields?: Record<string, unknown>;
          status?: import("@/lib/types/email").EmailSubscriberStatus;
          source?: string | null;
          consent_timestamp?: string | null;
          consent_source?: string | null;
          unsubscribed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/email").EmailSubscriber>
      >;
      email_tags: TableDef<
        {
          id: string;
          organization_id: string;
          brand_id: string;
          name: string;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          brand_id: string;
          name: string;
          created_at: string;
        }>
      >;
      email_subscriber_tags: TableDef<
        {
          subscriber_id: string;
          tag_id: string;
          organization_id: string;
          created_at: string;
        },
        {
          subscriber_id: string;
          tag_id: string;
          organization_id: string;
          created_at?: string;
        },
        Partial<{
          subscriber_id: string;
          tag_id: string;
          organization_id: string;
          created_at: string;
        }>
      >;
      email_segments: TableDef<
        import("@/lib/types/email").EmailSegment,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          description?: string | null;
          rules?: import("@/lib/types/email").SegmentRuleGroup;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/email").EmailSegment>
      >;
      email_suppression_list: TableDef<
        {
          id: string;
          organization_id: string;
          email: string;
          reason: string;
          source: string | null;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          email: string;
          reason: string;
          source?: string | null;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          email: string;
          reason: string;
          source: string | null;
          created_at: string;
        }>
      >;
      email_sending_domains: TableDef<
        import("@/lib/types/email").EmailSendingDomain,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          domain: string;
          resend_domain_id?: string | null;
          status?: import("@/lib/types/email").EmailDomainStatus;
          dns_records?: Array<Record<string, unknown>>;
          from_email?: string | null;
          from_name?: string | null;
          physical_address?: string | null;
          region?: string | null;
          created_at?: string;
          updated_at?: string;
          verified_at?: string | null;
        },
        Partial<import("@/lib/types/email").EmailSendingDomain>
      >;
      email_campaigns: TableDef<
        import("@/lib/types/email").EmailCampaign,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          subject?: string;
          subject_variants?: string[];
          ab_test?: boolean;
          preheader?: string | null;
          blocks?: import("@/lib/types/email").EmailBlock[];
          html_content?: string;
          plain_text?: string;
          status?: import("@/lib/types/email").EmailCampaignStatus;
          list_ids?: string[];
          segment_id?: string | null;
          sending_domain_id?: string | null;
          scheduled_at?: string | null;
          sent_at?: string | null;
          stats?: Record<string, number>;
          brief?: string | null;
          agent_run_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/email").EmailCampaign>
      >;
      email_flows: TableDef<
        import("@/lib/types/email").EmailFlow,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          trigger_type?: import("@/lib/types/email").EmailFlowTrigger;
          status?: import("@/lib/types/email").EmailFlowStatus;
          strategy?: Record<string, unknown>;
          list_id?: string | null;
          agent_run_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/email").EmailFlow>
      >;
      email_flow_steps: TableDef<
        import("@/lib/types/email").EmailFlowStep,
        {
          id?: string;
          organization_id: string;
          flow_id: string;
          position: number;
          delay_hours?: number;
          subject?: string;
          preheader?: string | null;
          blocks?: import("@/lib/types/email").EmailBlock[];
          html_content?: string;
          condition?: Record<string, unknown>;
          goal?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/email").EmailFlowStep>
      >;
      email_events: TableDef<
        {
          id: string;
          organization_id: string;
          campaign_id: string | null;
          flow_step_id: string | null;
          subscriber_id: string | null;
          email: string;
          event_type: import("@/lib/types/email").EmailEventType;
          provider_message_id: string | null;
          meta: Record<string, unknown>;
          occurred_at: string;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          campaign_id?: string | null;
          flow_step_id?: string | null;
          subscriber_id?: string | null;
          email: string;
          event_type: import("@/lib/types/email").EmailEventType;
          provider_message_id?: string | null;
          meta?: Record<string, unknown>;
          occurred_at?: string;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          campaign_id: string | null;
          flow_step_id: string | null;
          subscriber_id: string | null;
          email: string;
          event_type: import("@/lib/types/email").EmailEventType;
          provider_message_id: string | null;
          meta: Record<string, unknown>;
          occurred_at: string;
          created_at: string;
        }>
      >;
      ad_connections: TableDef<
        import("@/lib/types/ads").AdConnection,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          platform: import("@/lib/types/ads").AdPlatform;
          account_id: string;
          account_name: string;
          access_token_encrypted: string;
          refresh_token_encrypted?: string | null;
          token_expires_at?: string | null;
          scopes?: string[];
          status?: import("@/lib/types/ads").AdConnectionStatus;
          metadata?: Record<string, unknown>;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/ads").AdConnection>
      >;
      ad_media_plans: TableDef<
        import("@/lib/types/ads").AdMediaPlan,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          goal_brief: string;
          monthly_budget_pence: number;
          currency?: string;
          target_roas?: number | null;
          objective?: string | null;
          plan?: import("@/lib/types/ads").MediaPlanPayload;
          status?: import("@/lib/types/ads").AdMediaPlanStatus;
          agent_run_id?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/ads").AdMediaPlan>
      >;
      ad_campaigns: TableDef<
        import("@/lib/types/ads").AdCampaign,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          connection_id?: string | null;
          media_plan_id?: string | null;
          platform: import("@/lib/types/ads").AdPlatform;
          platform_campaign_id?: string | null;
          name: string;
          objective?: string | null;
          status?: import("@/lib/types/ads").AdCampaignStatus;
          daily_budget_pence?: number | null;
          lifetime_budget_pence?: number | null;
          currency?: string;
          start_date?: string | null;
          end_date?: string | null;
          targeting?: Record<string, unknown>;
          funnel_stage?: string | null;
          target_roas?: number | null;
          is_managed?: boolean;
          last_sync_at?: string | null;
          last_error?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/ads").AdCampaign>
      >;
      ad_creatives: TableDef<
        import("@/lib/types/ads").AdCreative,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          campaign_id: string;
          format?: string;
          headline?: string | null;
          primary_text?: string | null;
          description?: string | null;
          cta?: string | null;
          hook?: string | null;
          media_urls?: string[];
          status?: import("@/lib/types/ads").AdCreativeStatus;
          platform_creative_id?: string | null;
          rejection_reason?: string | null;
          variant_label?: string | null;
          agent_run_id?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/ads").AdCreative>
      >;
      ad_metrics_daily: TableDef<
        import("@/lib/types/ads").AdMetricDaily,
        {
          id?: string;
          organization_id: string;
          campaign_id: string;
          metric_date: string;
          spend_pence?: number;
          impressions?: number;
          clicks?: number;
          conversions?: number;
          revenue_pence?: number;
          cpm?: number;
          cpc_pence?: number;
          ctr?: number;
          roas?: number;
          currency?: string;
          raw?: Record<string, unknown>;
          created_at?: string;
        },
        Partial<import("@/lib/types/ads").AdMetricDaily>
      >;
      ad_recommendations: TableDef<
        import("@/lib/types/ads").AdRecommendation,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          campaign_id?: string | null;
          recommendation_type?: import("@/lib/types/ads").AdRecommendationType;
          title: string;
          rationale: string;
          payload?: Record<string, unknown>;
          status?: import("@/lib/types/ads").AdRecommendationStatus;
          dismiss_reason?: string | null;
          applied_at?: string | null;
          dismissed_at?: string | null;
          applied_by?: string | null;
          agent_run_id?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/ads").AdRecommendation>
      >;
      seo_projects: TableDef<
        import("@/lib/types/seo").SeoProject,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          domain: string;
          gsc_connected?: boolean;
          gsc_site_url?: string | null;
          gsc_access_token_encrypted?: string | null;
          gsc_refresh_token_encrypted?: string | null;
          gsc_token_expires_at?: string | null;
          keyword_map?: import("@/lib/types/seo").SeoKeywordMap;
          last_audit_at?: string | null;
          last_gsc_sync_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/seo").SeoProject>
      >;
      seo_keywords: TableDef<
        import("@/lib/types/seo").SeoKeyword,
        {
          id?: string;
          organization_id: string;
          project_id: string;
          keyword: string;
          intent?: import("@/lib/types/seo").SeoKeywordIntent;
          volume?: number | null;
          difficulty?: number | null;
          current_position?: number | null;
          previous_position?: number | null;
          target_url?: string | null;
          priority?: import("@/lib/types/seo").SeoKeywordPriority;
          pillar?: string | null;
          cluster?: string | null;
          tracked?: boolean;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/seo").SeoKeyword>
      >;
      seo_pages: TableDef<
        import("@/lib/types/seo").SeoPage,
        {
          id?: string;
          organization_id: string;
          project_id: string;
          url: string;
          title?: string | null;
          meta_description?: string | null;
          h1?: string | null;
          status?: import("@/lib/types/seo").SeoPageStatus;
          issues?: import("@/lib/types/seo").SeoPageIssue[];
          word_count?: number | null;
          has_schema?: boolean;
          missing_alt_count?: number;
          broken_link_count?: number;
          pagespeed_score?: number | null;
          pagespeed_raw?: Record<string, unknown>;
          last_audited_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/seo").SeoPage>
      >;
      seo_content_briefs: TableDef<
        import("@/lib/types/seo").SeoContentBrief,
        {
          id?: string;
          organization_id: string;
          project_id: string;
          keyword_id: string;
          title: string;
          brief_markdown?: string;
          outline?: string[];
          entities?: string[];
          internal_links?: string[];
          target_word_count?: number;
          search_intent?: string | null;
          status?: import("@/lib/types/seo").SeoBriefStatus;
          agent_run_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/seo").SeoContentBrief>
      >;
      seo_articles: TableDef<
        import("@/lib/types/seo").SeoArticle,
        {
          id?: string;
          organization_id: string;
          project_id: string;
          brief_id: string;
          title: string;
          content_markdown?: string;
          status?: import("@/lib/types/seo").SeoArticleStatus;
          published_url?: string | null;
          checklist_score?: number | null;
          checklist?: import("@/lib/types/seo").SeoArticleChecklist | Record<string, unknown>;
          agent_run_id?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/seo").SeoArticle>
      >;
      seo_gsc_daily: TableDef<
        import("@/lib/types/seo").SeoGscDaily,
        {
          id?: string;
          organization_id: string;
          project_id: string;
          metric_date: string;
          query?: string;
          page?: string;
          impressions?: number;
          clicks?: number;
          ctr?: number;
          position?: number;
          created_at?: string;
        },
        Partial<import("@/lib/types/seo").SeoGscDaily>
      >;
      seo_weekly_summaries: TableDef<
        import("@/lib/types/seo").SeoWeeklySummary,
        {
          id?: string;
          organization_id: string;
          project_id: string;
          week_start: string;
          week_end: string;
          summary_markdown: string;
          highlights?: string[];
          metrics?: Record<string, unknown>;
          agent_run_id?: string | null;
          created_at?: string;
        },
        Partial<import("@/lib/types/seo").SeoWeeklySummary>
      >;
      marketing_plans: TableDef<
        import("@/lib/types/planning").MarketingPlan,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          title: string;
          goal_brief: string;
          period_type?: import("@/lib/types/planning").MarketingPlanPeriod;
          period_start: string;
          period_end: string;
          objectives?: import("@/lib/types/planning").PlanDocument["objectives"];
          document?: import("@/lib/types/planning").PlanDocument;
          section_approvals?: import("@/lib/types/planning").SectionApprovals;
          status?: import("@/lib/types/planning").MarketingPlanStatus;
          budget_pence?: number | null;
          currency?: string;
          agent_run_id?: string | null;
          created_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/planning").MarketingPlan>
      >;
      campaigns: TableDef<
        import("@/lib/types/planning").Campaign,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          plan_id?: string | null;
          name: string;
          goal?: string | null;
          kpi?: import("@/lib/types/planning").PlanKpi[];
          budget_pence?: number;
          spent_pence?: number;
          currency?: string;
          start_date?: string | null;
          end_date?: string | null;
          channels?: string[];
          status?: import("@/lib/types/planning").MarketingCampaignStatus;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/planning").Campaign>
      >;
      campaign_tasks: TableDef<
        import("@/lib/types/planning").CampaignTask,
        {
          id?: string;
          organization_id: string;
          campaign_id: string;
          title: string;
          description?: string | null;
          module?: import("@/lib/types/planning").CampaignTaskModule;
          assignee_type?: import("@/lib/types/planning").CampaignAssigneeType;
          assignee_id?: string | null;
          status?: import("@/lib/types/planning").CampaignTaskStatus;
          due_date?: string | null;
          linked_entity?: Record<string, unknown>;
          sort_order?: number;
          started_at?: string | null;
          completed_at?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/planning").CampaignTask>
      >;
      campaign_activities: TableDef<
        import("@/lib/types/planning").CampaignActivity,
        {
          id?: string;
          organization_id: string;
          campaign_id: string;
          task_id?: string | null;
          actor_type?: string;
          actor_id?: string | null;
          message: string;
          meta?: Record<string, unknown>;
          created_at?: string;
        },
        Partial<import("@/lib/types/planning").CampaignActivity>
      >;
      notifications: TableDef<
        import("@/lib/types/planning").Notification,
        {
          id?: string;
          organization_id: string;
          user_id: string;
          title: string;
          body?: string | null;
          link?: string | null;
          category?: import("@/lib/types/platform").NotificationCategory;
          read_at?: string | null;
          created_at?: string;
        },
        Partial<import("@/lib/types/planning").Notification>
      >;
      notification_preferences: TableDef<
        import("@/lib/types/platform").NotificationPreference,
        {
          id?: string;
          user_id: string;
          category: import("@/lib/types/platform").NotificationCategory;
          email_digest?: import("@/lib/types/platform").EmailDigestPreference;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/platform").NotificationPreference>
      >;
      org_notification_settings: TableDef<
        import("@/lib/types/platform").OrgNotificationSettings,
        {
          organization_id: string;
          slack_webhook_url?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/platform").OrgNotificationSettings>
      >;
      org_feature_flags: TableDef<
        import("@/lib/types/platform").OrgFeatureFlag,
        {
          id?: string;
          organization_id: string;
          flag_key: string;
          enabled?: boolean;
          meta?: Record<string, unknown>;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/platform").OrgFeatureFlag>
      >;
      platform_announcements: TableDef<
        import("@/lib/types/platform").PlatformAnnouncement,
        {
          id?: string;
          title: string;
          body: string;
          severity?: string;
          active?: boolean;
          starts_at?: string;
          ends_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/platform").PlatformAnnouncement>
      >;
      org_onboarding_progress: TableDef<
        import("@/lib/types/platform").OrgOnboardingProgress,
        {
          organization_id: string;
          steps?: import("@/lib/types/platform").OrgOnboardingProgress["steps"];
          dismissed_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/platform").OrgOnboardingProgress>
      >;
      meetings: TableDef<
        import("@/lib/types/meetings").Meeting,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          type: import("@/lib/types/meetings").MeetingType;
          title: string;
          scheduled_for: string;
          status?: import("@/lib/types/meetings").MeetingStatus;
          agenda?: import("@/lib/types/meetings").MeetingAgendaItem[];
          minutes_markdown?: string;
          executive_summary?: string | null;
          decisions?: import("@/lib/types/meetings").MeetingDecision[];
          actions?: import("@/lib/types/meetings").MeetingActionItem[];
          context_snapshot?: Record<string, unknown>;
          blockers?: import("@/lib/types/meetings").MeetingBlocker[];
          agent_run_id?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/meetings").Meeting>
      >;
      meeting_actions: TableDef<
        import("@/lib/types/meetings").MeetingAction,
        {
          id?: string;
          organization_id: string;
          meeting_id: string;
          description: string;
          owner_type?: import("@/lib/types/meetings").MeetingOwnerType;
          owner_id?: string | null;
          due_date?: string | null;
          status?: import("@/lib/types/meetings").MeetingActionStatus;
          linked_task_id?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/meetings").MeetingAction>
      >;
      meeting_comments: TableDef<
        import("@/lib/types/meetings").MeetingComment,
        {
          id?: string;
          organization_id: string;
          meeting_id: string;
          user_id: string;
          body: string;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/meetings").MeetingComment>
      >;
      meeting_chat_messages: TableDef<
        import("@/lib/types/meetings").MeetingChatMessage,
        {
          id?: string;
          organization_id: string;
          meeting_id: string;
          user_id?: string | null;
          role: "user" | "assistant";
          content: string;
          created_at?: string;
        },
        Partial<import("@/lib/types/meetings").MeetingChatMessage>
      >;
      brand_kpis: TableDef<
        import("@/lib/types/reviews").BrandKpi,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          metric_key: string;
          label: string;
          target_value?: number;
          unit?: string;
          channel?: string | null;
          is_north_star?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/reviews").BrandKpi>
      >;
      brand_report_settings: TableDef<
        import("@/lib/types/reviews").BrandReportSettings,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          daily_enabled?: boolean;
          daily_hour_utc?: number;
          weekly_enabled?: boolean;
          weekly_weekday?: number;
          weekly_hour_utc?: number;
          monthly_enabled?: boolean;
          monthly_day?: number;
          monthly_hour_utc?: number;
          quarterly_enabled?: boolean;
          quarterly_hour_utc?: number;
          auto_email_enabled?: boolean;
          recipients?: string[];
          primary_color?: string;
          secondary_color?: string;
          logo_url?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/reviews").BrandReportSettings>
      >;
      reports: TableDef<
        import("@/lib/types/reviews").Report,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          type: import("@/lib/types/reviews").ReportType;
          title: string;
          period_start: string;
          period_end: string;
          status?: import("@/lib/types/reviews").ReportStatus;
          content?: import("@/lib/types/reviews").ReportContent;
          pdf_url?: string | null;
          sent_to?: string[];
          agent_run_id?: string | null;
          error?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/reviews").Report>
      >;
      crm_pipelines: TableDef<
        import("@/lib/types/crm").CrmPipeline,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          stages?: import("@/lib/types/crm").CrmPipelineStage[];
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/crm").CrmPipeline>
      >;
      crm_contacts: TableDef<
        import("@/lib/types/crm").CrmContact,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          email: string;
          name?: string | null;
          phone?: string | null;
          company?: string | null;
          source?: string | null;
          tags?: string[];
          custom_fields?: Record<string, unknown>;
          lifecycle_stage?: import("@/lib/types/crm").CrmLifecycleStage;
          owner_id?: string | null;
          total_revenue_pence?: number;
          lead_score?: number | null;
          lead_score_reasoning?: string | null;
          lead_scored_at?: string | null;
          email_subscriber_id?: string | null;
          last_activity_at?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/crm").CrmContact>
      >;
      crm_deals: TableDef<
        import("@/lib/types/crm").CrmDeal,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          contact_id: string;
          pipeline_id: string;
          name: string;
          value_pence?: number;
          stage: string;
          expected_close?: string | null;
          won_at?: string | null;
          lost_at?: string | null;
          lost_reason?: string | null;
          sort_order?: number;
          stalled_since?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/crm").CrmDeal>
      >;
      crm_activities: TableDef<
        import("@/lib/types/crm").CrmActivity,
        {
          id?: string;
          organization_id: string;
          contact_id: string;
          deal_id?: string | null;
          type: import("@/lib/types/crm").CrmActivityType;
          content: string;
          user_id?: string | null;
          meta?: Record<string, unknown>;
          created_at?: string;
        },
        Partial<import("@/lib/types/crm").CrmActivity>
      >;
      crm_orders: TableDef<
        import("@/lib/types/crm").CrmOrder,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          contact_id: string;
          provider: import("@/lib/types/crm").CrmOrder["provider"];
          external_id: string;
          order_total_pence?: number;
          currency?: string;
          ordered_at?: string;
          raw?: Record<string, unknown>;
          created_at?: string;
        },
        Partial<import("@/lib/types/crm").CrmOrder>
      >;
      crm_form_submissions: TableDef<
        {
          id: string;
          organization_id: string;
          brand_id: string;
          contact_id: string | null;
          form_name: string;
          payload: Record<string, unknown>;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          contact_id?: string | null;
          form_name?: string;
          payload?: Record<string, unknown>;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          brand_id: string;
          contact_id: string | null;
          form_name: string;
          payload: Record<string, unknown>;
          created_at: string;
        }>
      >;
      crm_pipeline_reviews: TableDef<
        import("@/lib/types/crm").CrmPipelineReview,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          week_start: string;
          summary_markdown: string;
          stalled_deal_ids?: string[];
          next_actions?: Array<{ deal_id?: string; action: string }>;
          agent_run_id?: string | null;
          created_at?: string;
        },
        Partial<import("@/lib/types/crm").CrmPipelineReview>
      >;
      budgets: TableDef<
        import("@/lib/types/finance").Budget,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          period_start: string;
          period_end: string;
          channel: import("@/lib/types/finance").FinanceChannel;
          planned_pence?: number;
          currency?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/finance").Budget>
      >;
      expenses: TableDef<
        import("@/lib/types/finance").Expense,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          expense_date: string;
          channel: import("@/lib/types/finance").FinanceChannel;
          description: string;
          amount_pence?: number;
          currency?: string;
          source?: import("@/lib/types/finance").ExpenseSource;
          reference?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/finance").Expense>
      >;
      revenue_records: TableDef<
        import("@/lib/types/finance").RevenueRecord,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          revenue_date: string;
          source: import("@/lib/types/finance").RevenueSource;
          amount_pence?: number;
          currency?: string;
          orders_count?: number;
          reference?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/finance").RevenueRecord>
      >;
      brand_finance_settings: TableDef<
        import("@/lib/types/finance").BrandFinanceSettings,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          cogs_pct?: number;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/finance").BrandFinanceSettings>
      >;
      finance_weekly_summaries: TableDef<
        import("@/lib/types/finance").FinanceWeeklySummary,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          week_start: string;
          summary_markdown: string;
          alerts?: import("@/lib/types/finance").FinanceWeeklySummary["alerts"];
          reallocation_suggestions?: import("@/lib/types/finance").FinanceWeeklySummary["reallocation_suggestions"];
          agent_run_id?: string | null;
          created_at?: string;
        },
        Partial<import("@/lib/types/finance").FinanceWeeklySummary>
      >;
      billing_events: TableDef<
        {
          id: string;
          organization_id: string;
          stripe_event_id: string | null;
          event_type: string;
          payload: Record<string, unknown>;
          created_at: string;
        },
        {
          id?: string;
          organization_id: string;
          stripe_event_id?: string | null;
          event_type: string;
          payload?: Record<string, unknown>;
          created_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          stripe_event_id: string | null;
          event_type: string;
          payload: Record<string, unknown>;
          created_at: string;
        }>
      >;
      analytics_daily: TableDef<
        import("@/lib/types/analytics").AnalyticsDaily,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          metric_date: string;
          channel: import("@/lib/types/analytics").AnalyticsChannel;
          impressions?: number;
          engagements?: number;
          clicks?: number;
          sessions?: number;
          leads?: number;
          sales?: number;
          revenue_pence?: number;
          spend_pence?: number;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/analytics").AnalyticsDaily>
      >;
      ga4_connections: TableDef<
        import("@/lib/types/analytics").Ga4Connection,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          property_id: string;
          property_name?: string | null;
          access_token_encrypted: string;
          refresh_token_encrypted?: string | null;
          token_expires_at?: string | null;
          status?: string;
          last_sync_at?: string | null;
          last_error?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/analytics").Ga4Connection>
      >;
      analytics_ga4_daily: TableDef<
        import("@/lib/types/analytics").AnalyticsGa4Daily,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          metric_date: string;
          source?: string;
          medium?: string;
          sessions?: number;
          conversions?: number;
          created_at?: string;
        },
        Partial<import("@/lib/types/analytics").AnalyticsGa4Daily>
      >;
      analytics_anomalies: TableDef<
        import("@/lib/types/analytics").AnalyticsAnomaly,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          metric_date: string;
          channel?: import("@/lib/types/analytics").AnalyticsChannel;
          metric_key: string;
          severity?: string;
          title: string;
          detail: string;
          current_value?: number | null;
          baseline_value?: number | null;
          delta_pct?: number | null;
          ai_context?: string | null;
          acknowledged_at?: string | null;
          created_at?: string;
        },
        Partial<import("@/lib/types/analytics").AnalyticsAnomaly>
      >;
      analytics_chat_messages: TableDef<
        import("@/lib/types/analytics").AnalyticsChatMessage,
        {
          id?: string;
          organization_id: string;
          brand_id?: string | null;
          user_id?: string | null;
          role: "user" | "assistant";
          content: string;
          query_plan?: Record<string, unknown> | null;
          chart?: import("@/lib/types/analytics").AnalyticsChartSpec | null;
          created_at?: string;
        },
        Partial<import("@/lib/types/analytics").AnalyticsChatMessage>
      >;
      compliance_profiles: TableDef<
        import("@/lib/types/compliance").ComplianceProfile,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          industry?: import("@/lib/types/compliance").ComplianceIndustryPreset;
          jurisdictions?: string[];
          regulated?: boolean;
          rules?: import("@/lib/types/compliance").ComplianceRule[];
          required_disclaimers?: string[];
          banned_claims?: string[];
          banned_terms?: string[];
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/compliance").ComplianceProfile>
      >;
      compliance_checks: TableDef<
        import("@/lib/types/compliance").ComplianceCheck,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          entity_type: import("@/lib/types/compliance").ComplianceEntityType;
          entity_id: string;
          status?: import("@/lib/types/compliance").ComplianceCheckStatus;
          findings?: import("@/lib/types/compliance").ComplianceFinding[];
          checked_at?: string;
          override_by?: string | null;
          override_reason?: string | null;
          overridden_at?: string | null;
          agent_run_id?: string | null;
          created_at?: string;
        },
        Partial<import("@/lib/types/compliance").ComplianceCheck>
      >;
      audit_events: TableDef<
        import("@/lib/types/compliance").AuditEvent,
        {
          id?: string;
          organization_id: string;
          actor_user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          summary: string;
          before_state?: Record<string, unknown> | null;
          after_state?: Record<string, unknown> | null;
          meta?: Record<string, unknown>;
          created_at?: string;
        },
        Partial<import("@/lib/types/compliance").AuditEvent>
      >;
      automations: TableDef<
        import("@/lib/types/automations").Automation,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          name: string;
          description?: string | null;
          status?: import("@/lib/types/automations").AutomationStatus;
          trigger?: import("@/lib/types/automations").AutomationTrigger;
          conditions?: import("@/lib/types/automations").ConditionGroup[];
          actions?: import("@/lib/types/automations").AutomationAction[];
          webhook_secret?: string | null;
          last_run_at?: string | null;
          run_count?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/automations").Automation>
      >;
      automation_runs: TableDef<
        import("@/lib/types/automations").AutomationRun,
        {
          id?: string;
          organization_id: string;
          automation_id: string;
          status?: import("@/lib/types/automations").AutomationRunStatus;
          trigger_data?: Record<string, unknown>;
          actions_executed?: Array<Record<string, unknown>>;
          error?: string | null;
          started_at?: string;
          finished_at?: string | null;
          created_at?: string;
        },
        Partial<import("@/lib/types/automations").AutomationRun>
      >;
      brand_automation_settings: TableDef<
        import("@/lib/types/automations").BrandAutomationSettings,
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          auto_publish_channels?: string[];
          daily_budget_action_cap_pence?: number;
          slack_webhook_url?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<import("@/lib/types/automations").BrandAutomationSettings>
      >;
      automation_budget_usage: TableDef<
        {
          id: string;
          organization_id: string;
          brand_id: string;
          usage_date: string;
          used_pence: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id: string;
          brand_id: string;
          usage_date: string;
          used_pence?: number;
          created_at?: string;
          updated_at?: string;
        },
        Partial<{
          id: string;
          organization_id: string;
          brand_id: string;
          usage_date: string;
          used_pence: number;
          created_at: string;
          updated_at: string;
        }>
      >;
      job_dead_letters: TableDef<
        {
          id: string;
          organization_id: string | null;
          provider: string;
          job_name: string;
          event_name: string | null;
          payload: Record<string, unknown>;
          error: string;
          attempts: number;
          status: "open" | "retrying" | "resolved" | "discarded";
          agent_run_id: string | null;
          last_error_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          organization_id?: string | null;
          provider: string;
          job_name: string;
          event_name?: string | null;
          payload?: Record<string, unknown>;
          error: string;
          attempts?: number;
          status?: "open" | "retrying" | "resolved" | "discarded";
          agent_run_id?: string | null;
          last_error_at?: string;
          resolved_at?: string | null;
          resolved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        Partial<{
          status: "open" | "retrying" | "resolved" | "discarded";
          error: string;
          attempts: number;
          resolved_at: string | null;
          resolved_by: string | null;
          payload: Record<string, unknown>;
          updated_at: string;
          last_error_at: string;
        }>
      >;
      integration_health: TableDef<
        {
          provider: string;
          status: "ok" | "degraded" | "down" | "unknown";
          detail: string | null;
          checked_at: string;
          meta: Record<string, unknown>;
        },
        {
          provider: string;
          status?: "ok" | "degraded" | "down" | "unknown";
          detail?: string | null;
          checked_at?: string;
          meta?: Record<string, unknown>;
        },
        Partial<{
          status: "ok" | "degraded" | "down" | "unknown";
          detail: string | null;
          checked_at: string;
          meta: Record<string, unknown>;
        }>
      >;
    };
    Views: Record<string, never>;
    Functions: {
      create_organization: {
        Args: { p_name: string; p_slug: string };
        Returns: Organization;
      };
      accept_invitation: {
        Args: { p_token: string };
        Returns: OrganizationMember;
      };
      is_platform_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      is_org_member: {
        Args: { p_organization_id: string };
        Returns: boolean;
      };
      has_org_role: {
        Args: {
          p_organization_id: string;
          p_roles: OrgMemberRole[];
        };
        Returns: boolean;
      };
    };
    Enums: {
      org_member_role: OrgMemberRole;
      membership_status: MembershipStatus;
      invitation_status: InvitationStatus;
      agent_run_status: AgentRunStatus;
      org_plan: OrgPlan;
      research_project_type: ResearchProjectType;
      research_project_status: ResearchProjectStatus;
      notification_category: import("@/lib/types/platform").NotificationCategory;
      email_digest_preference: import("@/lib/types/platform").EmailDigestPreference;
    };
    CompositeTypes: Record<string, never>;
  };
};
