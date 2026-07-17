import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#eef2ff,_#f8fafc_45%,_#f1f5f9)] px-4 py-10">
      <Card className="w-full max-w-md border-border/70 shadow-sm">
        <CardHeader>
          <p className="text-xs font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            GrowthOS
          </p>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">{children}</div>
      </Card>
    </div>
  );
}
