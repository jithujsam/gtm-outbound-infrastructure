import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pickLeadSourceFields } from "@/lib/lead-fields";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; leadId: string }> }
) {
  const { projectId, leadId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("project_id", projectId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; leadId: string }> }
) {
  const { projectId, leadId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = pickLeadSourceFields(body);

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // A changed email invalidates the previous Clearout verdict; clear it so
  // the lead is not shown as verified/safe to send for an address that was
  // never checked.
  if ("email" in updates) {
    const { data: current } = await supabase
      .from("leads")
      .select("email")
      .eq("id", leadId)
      .eq("project_id", projectId)
      .maybeSingle();
    if (current && current.email !== updates.email) {
      Object.assign(updates, {
        email_check: null,
        safe_to_send: null,
        email_score: null,
        status: null,
        smtp_provider: null,
        mx_record: null,
        account: null,
        clearout_domain: null,
      });
    }
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", leadId)
    .eq("project_id", projectId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; leadId: string }> }
) {
  const { projectId, leadId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("project_id", projectId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
