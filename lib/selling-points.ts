import { z } from "zod";

export const MAX_SELLING_POINTS = 2;
export const SELLING_POINT_LIMITS = { zh: 12, en: 28 } as const;

const sellingPointSchema = z
  .object({
    zh: z.string().trim().max(SELLING_POINT_LIMITS.zh).default(""),
    en: z.string().trim().max(SELLING_POINT_LIMITS.en).default(""),
  })
  .strict()
  .refine((point) => Boolean(point.zh || point.en), {
    message: "Enter a selling point in at least one language",
  });

export type VehicleSellingPoint = z.infer<typeof sellingPointSchema>;

export const sellingPointsSchema = z
  .array(sellingPointSchema)
  .max(MAX_SELLING_POINTS)
  .superRefine((points, context) => {
    const seen = { zh: new Set<string>(), en: new Set<string>() };
    for (const [index, point] of points.entries()) {
      for (const language of ["zh", "en"] as const) {
        const value =
          language === "en" ? point[language].toLowerCase() : point[language];
        if (!value) continue;
        if (seen[language].has(value))
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Selling points must not repeat",
            path: [index, language],
          });
        seen[language].add(value);
      }
    }
  });

/** Older records and malformed stored values have no public selling points. */
export function parseSellingPoints(value: unknown): VehicleSellingPoint[] {
  if (typeof value !== "string") return [];
  try {
    const result = sellingPointsSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : [];
  } catch {
    return [];
  }
}
