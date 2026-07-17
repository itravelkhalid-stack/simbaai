import { z } from "zod";

/** Parse FormData with a Zod schema (string fields). */
export function parseFormData<T extends z.ZodType>(
  schema: T,
  formData: FormData,
): z.infer<T> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      raw[key] = value;
    }
  }
  return schema.parse(raw);
}

export function parseJsonBody<T extends z.ZodType>(
  schema: T,
  body: unknown,
): z.infer<T> {
  return schema.parse(body);
}

/** Common UUID field */
export const uuidSchema = z.string().uuid();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type Pagination = z.infer<typeof paginationSchema>;

export function paginationRange(p: Pagination) {
  const from = (p.page - 1) * p.pageSize;
  const to = from + p.pageSize - 1;
  return { from, to };
}
