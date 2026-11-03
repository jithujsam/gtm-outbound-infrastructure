import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toLeadSourceRow } from "@/lib/lead-fields";
import { EMAIL_CHECK_STATUSES } from "@/types";

const MAX_PAGE_SIZE = 100;

// PostgREST's or() filter uses , ( ) as syntax, so user text containing them
// broke the query (e.g. searching "Acme, Inc" returned a 500).
function sanitizeSearch(value: string): string {
  return value.replace(/[,()*\\"]/g, " ").trim();
}

const ALLOWED_SORT_COLS = [
  "full_name",
  "company_name",
  "email",
  "industry",
  "position",
  "state",
  "domain",
  "country",
  "email_check",
  "vertical_match",
  "matched_vertical",
  "email_score",
  "status",
  "safe_to_send",
  "created_at",
  "updated_at",
] as const;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(_request.url);
  const idsonly = url.searchParams.get("idsonly") === "true";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "10", 10) || 10)
  );
  const search = sanitizeSearch(url.searchParams.get("search") ?? "");

  const emailCheck = url.searchParams
    .getAll("email_check")
    .filter((v) => v === "null" || (EMAIL_CHECK_STATUSES as readonly string[]).includes(v));
  const verticalMatch = url.searchParams.getAll("vertical_match").filter(Boolean);
  const safeToSend = url.searchParams.getAll("safe_to_send").filter(Boolean);
  const industry = url.searchParams.get("industry")?.trim();
  const company = url.searchParams.get("company")?.trim();
  const domain = url.searchParams.get("domain")?.trim();

  const sortCol = url.searchParams.get("sort")?.trim();
  const sortOrder = url.searchParams.get("order")?.trim() === "desc" ? "desc" : "asc";
  const ids = url.searchParams.getAll("ids").filter(Boolean);
  const offset = (page - 1) * limit;

  const col = sortCol && (ALLOWED_SORT_COLS as readonly string[]).includes(sortCol)
    ? sortCol
    : "created_at";

  let query = supabase
    .from("leads")
    .select(idsonly ? "id" : "*", { count: "exact" })
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order(col, { ascending: sortOrder === "asc" });

  if (ids.length > 0) {
    query = query.in("id", ids);
  }

  if (search) {
    const ilike = `%${search}%`;
    query = query.or(
      `full_name.ilike.${ilike},company_name.ilike.${ilike},email.ilike.${ilike},position.ilike.${ilike},industry.ilike.${ilike},matched_vertical.ilike.${ilike}`
    );
  }

  if (emailCheck.length > 0) {
    const nonNull = emailCheck.filter((v) => v !== "null");
    const hasNull = emailCheck.includes("null");
    if (hasNull && nonNull.length > 0) {
      query = query.or(`email_check.is.null,email_check.in.(${nonNull.map((v) => `"${v}"`).join(",")})`);
    } else if (hasNull) {
      query = query.is("email_check", null);
    } else {
      query = query.in("email_check", nonNull);
    }
  }

  if (verticalMatch.length > 0) {
    const nonNull = verticalMatch.filter((v) => v !== "null");
    const hasNull = verticalMatch.includes("null");
    if (hasNull && nonNull.length > 0) {
      const boolVals = nonNull.map((v) => v === "true");
      query = query.or(`vertical_match.is.null,vertical_match.in.(${boolVals.join(",")})`);
    } else if (hasNull) {
      query = query.is("vertical_match", null);
    } else {
      query = query.in("vertical_match", nonNull.map((v) => v === "true"));
    }
  }

  if (safeToSend.length > 0) {
    const nonNull = safeToSend.filter((v) => v !== "null");
    const hasNull = safeToSend.includes("null");
    if (hasNull && nonNull.length > 0) {
      const boolVals = nonNull.map((v) => v === "true");
      query = query.or(`safe_to_send.is.null,safe_to_send.in.(${boolVals.join(",")})`);
    } else if (hasNull) {
      query = query.is("safe_to_send", null);
    } else {
      query = query.in("safe_to_send", nonNull.map((v) => v === "true"));
    }
  }

  if (industry) {
    query = query.ilike("industry", `%${industry}%`);
  }

  if (company) {
    query = query.ilike("company_name", `%${company}%`);
  }

  if (domain) {
    query = query.ilike("domain", `%${domain}%`);
  }

  if (idsonly) {
    const { data: idRows, error: idErr } = await query;
    if (idErr) return NextResponse.json({ error: idErr.message }, { status: 500 });
    return NextResponse.json({ ids: idRows?.map((r: any) => r.id) ?? [] });
  }

  const { data, error, count } = await query.range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data,
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const leads = (Array.isArray(body) ? body : [body]).filter(
    (lead): lead is Record<string, unknown> => !!lead && typeof lead === "object"
  );
  if (leads.length === 0) {
    return NextResponse.json({ error: "No leads in request" }, { status: 400 });
  }

  // Only source columns are accepted. Validation results (vertical_match,
  // email_check, safe_to_send, ...) are written by the job processor only,
  // so an import cannot mark leads as validated.
  const leadsWithProject = leads.map((lead) => ({
    ...toLeadSourceRow(lead),
    project_id: projectId,
    user_id: user.id,
  }));

  const { data, error } = await supabase
    .from("leads")
    .insert(leadsWithProject)
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
