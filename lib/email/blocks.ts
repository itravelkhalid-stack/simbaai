import type { EmailBlock } from "@/lib/types/email";

function newId() {
  return globalThis.crypto.randomUUID();
}

export function createBlock(type: EmailBlock["type"]): EmailBlock {
  const id = newId();
  switch (type) {
    case "heading":
      return { id, type, content: { text: "Heading", align: "left" } };
    case "text":
      return {
        id,
        type,
        content: { text: "Write your email copy here.", align: "left" },
      };
    case "image":
      return {
        id,
        type,
        content: { src: "https://placehold.co/600x300", alt: "Image", href: "" },
      };
    case "button":
      return {
        id,
        type,
        content: {
          label: "Shop now",
          href: "https://example.com",
          align: "center",
        },
      };
    case "divider":
      return { id, type, content: { color: "#e5e7eb" } };
    case "product":
      return {
        id,
        type,
        content: {
          name: "Product name",
          price: "$49",
          image: "https://placehold.co/240x240",
          href: "https://example.com/product",
          description: "Short product description",
        },
      };
    default:
      return { id, type: "text", content: { text: "" } };
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderBlock(block: EmailBlock): string {
  const c = block.content;
  switch (block.type) {
    case "heading":
      return `<tr><td align="${c.align || "left"}" style="padding:16px 24px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:1.3;font-weight:700;color:#111827;">${escapeHtml(c.text || "")}</td></tr>`;
    case "text":
      return `<tr><td align="${c.align || "left"}" style="padding:8px 24px 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#374151;">${escapeHtml(c.text || "").replaceAll("\n", "<br/>")}</td></tr>`;
    case "image": {
      const img = `<img src="${escapeHtml(c.src || "")}" alt="${escapeHtml(c.alt || "")}" width="552" style="display:block;width:100%;max-width:552px;height:auto;border:0;" />`;
      const inner = c.href
        ? `<a href="${escapeHtml(c.href)}" style="text-decoration:none;">${img}</a>`
        : img;
      return `<tr><td align="center" style="padding:8px 24px;">${inner}</td></tr>`;
    }
    case "button":
      return `<tr><td align="${c.align || "center"}" style="padding:16px 24px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
          <td bgcolor="#111827" style="border-radius:6px;">
            <a href="${escapeHtml(c.href || "#")}" style="display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;">${escapeHtml(c.label || "Click")}</a>
          </td>
        </tr></table>
      </td></tr>`;
    case "divider":
      return `<tr><td style="padding:8px 24px;"><hr style="border:none;border-top:1px solid ${escapeHtml(c.color || "#e5e7eb")};margin:0;" /></td></tr>`;
    case "product":
      return `<tr><td style="padding:16px 24px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e5e7eb;border-radius:8px;">
          <tr>
            <td width="140" valign="top" style="padding:12px;">
              <img src="${escapeHtml(c.image || "")}" alt="" width="116" style="display:block;border:0;border-radius:6px;" />
            </td>
            <td valign="top" style="padding:12px;font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:18px;font-weight:700;color:#111827;">${escapeHtml(c.name || "")}</div>
              <div style="font-size:16px;color:#059669;margin:6px 0;">${escapeHtml(c.price || "")}</div>
              <div style="font-size:14px;color:#4b5563;margin-bottom:10px;">${escapeHtml(c.description || "")}</div>
              <a href="${escapeHtml(c.href || "#")}" style="font-size:14px;font-weight:700;color:#111827;">View product →</a>
            </td>
          </tr>
        </table>
      </td></tr>`;
    default:
      return "";
  }
}

export function renderEmailHtml(params: {
  preheader?: string | null;
  blocks: EmailBlock[];
  footerHtml: string;
  brandName: string;
}) {
  const preheader = escapeHtml(params.preheader || "");
  const body = params.blocks.map(renderBlock).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(params.brandName)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6;padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden;">
        ${body}
        <tr>
          <td style="padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#6b7280;background:#f9fafb;border-top:1px solid #e5e7eb;">
            ${params.footerHtml}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function blocksToPlainText(blocks: EmailBlock[], footerText: string) {
  const lines = blocks.map((block) => {
    switch (block.type) {
      case "heading":
      case "text":
        return block.content.text || "";
      case "button":
        return `${block.content.label || ""}: ${block.content.href || ""}`;
      case "product":
        return `${block.content.name || ""} — ${block.content.price || ""}\n${block.content.description || ""}\n${block.content.href || ""}`;
      default:
        return "";
    }
  });
  return [...lines.filter(Boolean), "", footerText].join("\n\n");
}
