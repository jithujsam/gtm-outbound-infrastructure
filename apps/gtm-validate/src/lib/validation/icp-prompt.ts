import type { Lead } from "@/types";

/**
 * Stable, project-agnostic instructions for the ICP classification engine.
 * Project-specific ICP criteria live in the user prompt, never here.
 */
export const ICP_SYSTEM_PROMPT = `You are an ICP classification engine.

Evaluate every supplied lead against the ICP criteria provided by the user.
Follow the user's ICP criteria exactly.
Do not invent additional ICP requirements.

Use company information as the primary evidence.
Use available company name, industry, domain, description, title, and other supplied fields as evidence.

Never invent a lead ID.
Never modify a supplied lead ID.
Never omit a supplied lead.
Return exactly one classification per supplied lead.

Set vertical_match to true only when the lead clearly matches the user's defined ICP.
Set matched_vertical to the matching ICP category when there is one.
Set matched_vertical to null when there is no match.
Provide concise reasoning based on available evidence.

Follow the structured response schema exactly.
Never return prose outside the required structured output.`;

function display(value: unknown): string {
  if (value === null || value === undefined || value === "") return "N/A";
  return String(value);
}

/**
 * Formats one lead with only the fields needed for ICP classification.
 */
export function formatLeadForIcp(lead: Lead): string {
  return [
    `Lead ID: ${display(lead.id)}`,
    `Name: ${display(lead.full_name)}`,
    `Company: ${display(lead.company_name)}`,
    `Industry: ${display(lead.industry)}`,
    `Domain: ${display(lead.domain)}`,
    `Position: ${display(lead.position)}`,
    `Employee Size: ${display(lead.employee_size)}`,
    `Country: ${display(lead.country)}`,
    `State: ${display(lead.state)}`,
    `Company Description: ${display(lead.company_description)}`,
    `Website: ${display(lead.website)}`,
    `Company LinkedIn: ${display(lead.company_linkedin)}`,
    `LinkedIn URL: ${display(lead.linkedin_url)}`,
  ].join("\n");
}

/**
 * Builds the user prompt: project ICP criteria (once) followed by lead data.
 * The criteria must not be repeated for each lead.
 */
export function buildIcpUserPrompt(criteria: string, leadBlocks: string[]): string {
  const blocks = leadBlocks.join("\n\n---\n\n");
  return `${criteria.trim()}\n\nLEADS TO CLASSIFY\n\n${blocks}`;
}
