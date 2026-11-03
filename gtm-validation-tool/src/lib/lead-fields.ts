/**
 * The lead columns that come from the source data (CSV import or a manual
 * edit). Everything else on a lead is either system-managed (ids, owner,
 * timestamps) or a validation result written only by the job processor.
 */
export const LEAD_SOURCE_FIELDS = [
  "full_name",
  "company_name",
  "position",
  "email",
  "industry",
  "state",
  "domain",
  "employee_size",
  "country",
  "company_description",
  "company_linkedin",
  "linkedin_url",
  "website",
] as const;

export type LeadSourceField = (typeof LEAD_SOURCE_FIELDS)[number];

/** Returns only the source fields present on `input`; ignores anything else. */
export function pickLeadSourceFields(input: unknown): Partial<Record<LeadSourceField, unknown>> {
  const picked: Partial<Record<LeadSourceField, unknown>> = {};
  if (!input || typeof input !== "object") return picked;
  for (const field of LEAD_SOURCE_FIELDS) {
    if (field in input) picked[field] = (input as Record<string, unknown>)[field];
  }
  return picked;
}

/**
 * Builds the source columns for a new lead: text fields become strings
 * (missing -> ""), employee_size becomes a number or null.
 */
export function toLeadSourceRow(input: unknown) {
  const picked = pickLeadSourceFields(input);
  const text = (v: unknown) => (v == null ? "" : String(v));
  const size = Number(picked.employee_size);
  return {
    full_name: text(picked.full_name),
    company_name: text(picked.company_name),
    position: text(picked.position),
    email: text(picked.email),
    industry: text(picked.industry),
    state: text(picked.state),
    domain: text(picked.domain),
    employee_size:
      picked.employee_size == null || picked.employee_size === "" || !Number.isFinite(size)
        ? null
        : Math.trunc(size),
    country: text(picked.country),
    company_description: text(picked.company_description),
    company_linkedin: text(picked.company_linkedin),
    linkedin_url: text(picked.linkedin_url),
    website: text(picked.website),
  };
}
