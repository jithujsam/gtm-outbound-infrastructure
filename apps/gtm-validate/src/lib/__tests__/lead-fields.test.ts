import { describe, it, expect } from "vitest";
import { pickLeadSourceFields, toLeadSourceRow } from "../lead-fields";

describe("pickLeadSourceFields", () => {
  it("keeps source fields and drops validation/system fields", () => {
    const picked = pickLeadSourceFields({
      email: "a@b.com",
      company_name: "Acme",
      vertical_match: true,
      email_check: "Valid",
      safe_to_send: true,
      user_id: "someone-else",
      id: "x",
    });
    expect(picked).toEqual({ email: "a@b.com", company_name: "Acme" });
  });

  it("returns an empty object for non-objects", () => {
    expect(pickLeadSourceFields(null)).toEqual({});
    expect(pickLeadSourceFields("x")).toEqual({});
  });
});

describe("toLeadSourceRow", () => {
  it("fills missing text with empty strings", () => {
    const row = toLeadSourceRow({ email: "a@b.com" });
    expect(row.email).toBe("a@b.com");
    expect(row.full_name).toBe("");
    expect(row.employee_size).toBeNull();
  });

  it("parses numeric employee size and nulls non-numeric ranges", () => {
    expect(toLeadSourceRow({ employee_size: "250" }).employee_size).toBe(250);
    expect(toLeadSourceRow({ employee_size: "51-200" }).employee_size).toBeNull();
    expect(toLeadSourceRow({ employee_size: "" }).employee_size).toBeNull();
  });

  it("never carries validation columns", () => {
    const row = toLeadSourceRow({ email: "a@b.com", vertical_match: true }) as Record<string, unknown>;
    expect("vertical_match" in row).toBe(false);
  });
});
