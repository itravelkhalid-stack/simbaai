import { createClient } from "@/lib/supabase/server";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export async function IntegrationHealthBanners() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("integration_health")
    .select("provider, status, detail")
    .in("status", ["degraded", "down"]);

  if (!data?.length) return null;

  return (
    <div className="mb-4 space-y-2">
      {data.map((row) => (
        <Alert
          key={row.provider}
          variant={row.status === "down" ? "destructive" : "default"}
        >
          <AlertTitle>
            {row.provider} is {row.status}
          </AlertTitle>
          <AlertDescription>
            {row.detail ??
              "This integration is experiencing issues. Some features may be unavailable."}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
