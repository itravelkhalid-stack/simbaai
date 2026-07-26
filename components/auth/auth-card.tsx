import { SimbaWordmark } from "@/components/brand/simba-wordmark";
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
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_var(--sem-accent-soft),_var(--sem-surface-soft)_45%,_var(--sem-highlight))] px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <SimbaWordmark size="lg" className="mb-2" />
          <CardTitle className="text-2xl font-bold">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <div className="px-6 pb-6">{children}</div>
      </Card>
    </div>
  );
}
