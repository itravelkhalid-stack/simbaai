"use client";

import { createBlock } from "@/lib/email/blocks";
import type { EmailBlock, EmailBlockType } from "@/lib/types/email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const BLOCK_TYPES: EmailBlockType[] = [
  "heading",
  "text",
  "image",
  "button",
  "divider",
  "product",
];

export function BlockEmailEditor({
  blocks,
  onChange,
}: {
  blocks: EmailBlock[];
  onChange: (blocks: EmailBlock[]) => void;
}) {
  function updateBlock(id: string, content: Record<string, string>) {
    onChange(
      blocks.map((block) =>
        block.id === id ? { ...block, content: { ...block.content, ...content } } : block,
      ),
    );
  }

  function move(id: string, direction: -1 | 1) {
    const index = blocks.findIndex((b) => b.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= blocks.length) return;
    const copy = [...blocks];
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    onChange(copy);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {BLOCK_TYPES.map((type) => (
          <Button
            key={type}
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...blocks, createBlock(type)])}
          >
            Add {type}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {blocks.map((block, index) => (
          <div key={block.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium capitalize">
                {index + 1}. {block.type}
              </p>
              <div className="flex gap-1">
                <Button type="button" size="xs" variant="outline" onClick={() => move(block.id, -1)}>
                  Up
                </Button>
                <Button type="button" size="xs" variant="outline" onClick={() => move(block.id, 1)}>
                  Down
                </Button>
                <Button
                  type="button"
                  size="xs"
                  variant="destructive"
                  onClick={() => onChange(blocks.filter((b) => b.id !== block.id))}
                >
                  Remove
                </Button>
              </div>
            </div>

            {block.type === "heading" || block.type === "text" ? (
              <div className="space-y-2">
                <Label>Text</Label>
                <Textarea
                  rows={block.type === "text" ? 4 : 2}
                  value={block.content.text || ""}
                  onChange={(e) => updateBlock(block.id, { text: e.target.value })}
                />
              </div>
            ) : null}

            {block.type === "image" ? (
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Image URL</Label>
                  <Input
                    value={block.content.src || ""}
                    onChange={(e) => updateBlock(block.id, { src: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Link (optional)</Label>
                  <Input
                    value={block.content.href || ""}
                    onChange={(e) => updateBlock(block.id, { href: e.target.value })}
                  />
                </div>
              </div>
            ) : null}

            {block.type === "button" ? (
              <div className="grid gap-2 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Label</Label>
                  <Input
                    value={block.content.label || ""}
                    onChange={(e) => updateBlock(block.id, { label: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    value={block.content.href || ""}
                    onChange={(e) => updateBlock(block.id, { href: e.target.value })}
                  />
                </div>
              </div>
            ) : null}

            {block.type === "product" ? (
              <div className="grid gap-2 md:grid-cols-2">
                {(["name", "price", "image", "href", "description"] as const).map((field) => (
                  <div key={field} className="space-y-2">
                    <Label className="capitalize">{field}</Label>
                    <Input
                      value={block.content[field] || ""}
                      onChange={(e) => updateBlock(block.id, { [field]: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
