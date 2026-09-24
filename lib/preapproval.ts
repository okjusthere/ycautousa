import { z } from "zod";

export const PREAPPROVAL_CONSENT_VERSION = "2026-09-24" as const;
export const US_STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  AS: "American Samoa",
  GU: "Guam",
  MP: "Northern Mariana Islands",
  PR: "Puerto Rico",
  VI: "U.S. Virgin Islands",
};

export const preapprovalInputSchema = z
  .object({
    // Validate syntax only. This does not verify identity or pull credit.
    ssn: z
      .string()
      .trim()
      .max(20)
      .transform((value) => value.replace(/[\s-]/g, ""))
      .refine(
        (value) =>
          /^(?!000|666|9\d{2})\d{3}(?!00)\d{2}(?!0000)\d{4}$/.test(value),
        "Enter a valid nine-digit SSN.",
      ),
    addressLine1: z.string().trim().min(2).max(200),
    addressLine2: z.string().trim().max(100).default(""),
    city: z.string().trim().min(2).max(100),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => Object.hasOwn(US_STATES, value), "Choose a state."),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}(?:-\d{4})?$/),
    residenceYears: z.number().int().min(0).max(100),
    residenceMonths: z.number().int().min(0).max(11),
    consent: z.literal(true),
  })
  .strict();
export type PreapprovalInput = z.infer<typeof preapprovalInputSchema>;

export const preapprovalPhoneSchema = z
  .string()
  .trim()
  .max(40)
  .regex(/^\+?[\d\s().-]+$/)
  .refine((value) => {
    const digits = value.replace(/\D/g, "").length;
    return digits >= 7 && digits <= 15;
  }, "Enter a valid phone number.");

export const preapprovalStoredDataSchema = preapprovalInputSchema
  .extend({
    name: z.string().trim().min(2).max(100),
    phone: preapprovalPhoneSchema,
    email: z.string().trim().email().max(254),
    submittedAt: z.string().datetime(),
    consentVersion: z.literal(PREAPPROVAL_CONSENT_VERSION),
  })
  .strict();
export type PreapprovalStoredData = z.infer<typeof preapprovalStoredDataSchema>;

export const preapprovalMetadataSchema = z
  .object({
    status: z.enum(["received", "deleted"]),
    submittedAt: z.string().datetime(),
    deletedAt: z.string().datetime().nullable(),
  })
  .strict();
export type PreapprovalMetadata = z.infer<typeof preapprovalMetadataSchema>;

export const PREAPPROVAL_VIEW_REASONS = [
  "application_review",
  "customer_follow_up",
  "data_correction",
] as const;
export const preapprovalViewSchema = z
  .object({
    reason: z.enum(PREAPPROVAL_VIEW_REASONS),
  })
  .strict();
