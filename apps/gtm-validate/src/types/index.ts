import type { Database } from "./database";

export type Project = Database["public"]["Tables"]["projects"]["Row"];
export type ProjectInsert = Database["public"]["Tables"]["projects"]["Insert"];

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];

export type IntegrationSettings = Database["public"]["Tables"]["integration_settings"]["Row"];

export type ValidationPrompt = Database["public"]["Tables"]["validation_prompts"]["Row"];

export type LeadFormData = Omit<
  LeadInsert,
  "id" | "project_id" | "user_id" | "created_at" | "updated_at"
>;

export const ICP_VERTICALS = [
  "D2C / E-commerce",
  "Defense / Aviation",
  "Fintech",
  "Pharma",
  "Semiconductor / Data Center",
] as const;

export type IcpVertical = (typeof ICP_VERTICALS)[number];

export const EMAIL_CHECK_STATUSES = ["Valid", "Invalid", "Unknown"] as const;

export type EmailCheckStatus = (typeof EMAIL_CHECK_STATUSES)[number];

export interface DashboardStats {
  totalProjects: number;
  totalLeads: number;
  validatedLeads: number;
  icpMatchRate: number;
}
