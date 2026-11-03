import { createClient } from "@/lib/supabase/server";
import { ICP_VERTICALS } from "@/types";

export async function getValidationPrompt(
  userId: string,
  projectId: string,
  type: string
): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("validation_prompts")
    .select("prompt")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .eq("type", type)
    .maybeSingle();

  if (error) throw error;
  return data?.prompt ?? null;
}

export async function saveValidationPrompt(
  userId: string,
  projectId: string,
  type: string,
  prompt: string,
  model?: string | null
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("validation_prompts")
    .upsert(
      {
        user_id: userId,
        project_id: projectId,
        type,
        prompt,
        model: model ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,project_id,type" }
    );

  if (error) throw error;
}

export function getDefaultIcpPrompt(): string {
  const verticals = ICP_VERTICALS.map((v) => `- ${v}`).join("\n");

  return `ICP CRITERIA
A lead matches our ICP when the company operates in one of our target industries and is a good fit for our outbound motion.

TARGET INDUSTRIES
${verticals}

COMPANY CHARACTERISTICS
- The company's primary business, products, industry, and description clearly align with a target vertical.
- The company website, domain, and description support the classification.

GEOGRAPHY
- Consider the company's country and state when provided.

COMPANY SIZE
- Consider employee size when provided.

POSITIVE SIGNALS
- Company description and website clearly describe a target industry.
- Industry and domain strongly align with a target vertical.

NEGATIVE SIGNALS
- No clear industry signal.
- Company does not operate in any target vertical.

DECISION RULE
- Do not classify a company based solely on the person's job title.
- Set vertical_match to true only when the company clearly matches a target vertical.
- Otherwise set vertical_match to false.

UNCERTAINTY RULE
- If there is insufficient evidence to confirm a match, set vertical_match to false and matched_vertical to null.`;
}
