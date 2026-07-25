"use client";

import Link from "next/link";

import {
  FORMAT_LABELS,
  PLATFORM_LABELS,
  STATUS_LABELS,
  type ComplianceFlag,
  type ContentItem,
} from "@/lib/types/content";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function ReviewQueueTable({ items }: { items: ContentItem[] }) {
  return (
    <div className="rounded-xl border">
      <Table>
          <TableHeader>
          <TableRow>
            <TableHead className="w-16">Media</TableHead>
            <TableHead>Item</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Format</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Compliance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-muted-foreground">
                Queue is empty.
              </TableCell>
            </TableRow>
          ) : (
            items.map((item) => {
              const flags = (item.compliance_flags ?? []) as ComplianceFlag[];
              const thumb = item.media_urls?.[0];
              return (
                <TableRow key={item.id}>
                  <TableCell>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt=""
                        className="h-10 w-10 rounded object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/content/${item.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {item.title || item.copy.slice(0, 48) || "Untitled"}
                    </Link>
                    {item.variant_group_id ? (
                      <p className="text-xs text-muted-foreground">
                        Variant group {item.variant_group_id.slice(0, 8)}
                      </p>
                    ) : null}
                    {item.platform === "instagram" && !thumb ? (
                      <p className="text-xs text-destructive">Needs image</p>
                    ) : null}
                  </TableCell>
                  <TableCell>{PLATFORM_LABELS[item.platform]}</TableCell>
                  <TableCell>{FORMAT_LABELS[item.format]}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{STATUS_LABELS[item.status]}</Badge>
                  </TableCell>
                  <TableCell>
                    {flags.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Clean</span>
                    ) : (
                      <Badge variant="destructive">{flags.length} flags</Badge>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
