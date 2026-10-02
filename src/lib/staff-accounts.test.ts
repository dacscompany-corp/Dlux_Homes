import { describe, it, expect } from "vitest";
import { checkNewStaff, checkRoleChange, isStaffRole, normalizeEmail } from "./staff-accounts";

const valid = { first_name: "Ana", last_name: "Cruz", email: "ana@example.com", password: "longenough", role: "Cleaner" };

describe("normalizeEmail", () => {
  it("trims and lowercases, so one person is one account", () => {
    expect(normalizeEmail("  Juan@Gmail.COM ")).toBe("juan@gmail.com");
  });
  it("is empty for anything that isn't text", () => {
    expect(normalizeEmail(undefined)).toBe("");
    expect(normalizeEmail(42)).toBe("");
  });
});

describe("isStaffRole", () => {
  it("accepts exactly the three portal roles", () => {
    for (const r of ["Owner", "CSR", "Cleaner"]) expect(isStaffRole(r)).toBe(true);
  });
  it("rejects anything that would log in to no portal", () => {
    for (const r of ["cleaner", "Housekeeping", "Partner", "", null]) expect(isStaffRole(r)).toBe(false);
  });
});

describe("checkNewStaff", () => {
  it("accepts a complete new cleaner from a CSR", () => {
    expect(checkNewStaff(valid, "CSR")).toEqual({ ok: true });
  });

  it("requires a first and last name", () => {
    expect(checkNewStaff({ ...valid, last_name: "  " }, "Owner")).toMatchObject({ ok: false, status: 400 });
  });

  it("requires a real email", () => {
    expect(checkNewStaff({ ...valid, email: "not-an-email" }, "Owner")).toMatchObject({ ok: false, status: 400 });
  });

  it("requires a password of at least 8 characters", () => {
    expect(checkNewStaff({ ...valid, password: "short" }, "Owner")).toMatchObject({ ok: false, status: 400 });
    expect(checkNewStaff({ ...valid, password: undefined }, "Owner")).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a role no portal accepts", () => {
    expect(checkNewStaff({ ...valid, role: "cleaner" }, "Owner")).toMatchObject({ ok: false, status: 400 });
  });

  it("lets only an Owner create an Owner", () => {
    expect(checkNewStaff({ ...valid, role: "Owner" }, "CSR")).toMatchObject({ ok: false, status: 403 });
    expect(checkNewStaff({ ...valid, role: "Owner" }, "Owner")).toEqual({ ok: true });
  });
});

describe("checkRoleChange", () => {
  it("lets a CSR move a cleaner to CSR", () => {
    expect(checkRoleChange("CSR", "Cleaner", "CSR")).toEqual({ ok: true });
  });

  it("stops a CSR promoting anyone (themselves included) to Owner", () => {
    expect(checkRoleChange("CSR", "CSR", "Owner")).toMatchObject({ ok: false, status: 403 });
  });

  it("stops a CSR demoting an Owner", () => {
    expect(checkRoleChange("CSR", "Owner", "Cleaner")).toMatchObject({ ok: false, status: 403 });
  });

  it("lets an Owner change any role", () => {
    expect(checkRoleChange("Owner", "CSR", "Owner")).toEqual({ ok: true });
    expect(checkRoleChange("Owner", "Owner", "CSR")).toEqual({ ok: true });
  });

  it("refuses a role no portal accepts", () => {
    expect(checkRoleChange("Owner", "Cleaner", "Manager")).toMatchObject({ ok: false, status: 400 });
  });
});
