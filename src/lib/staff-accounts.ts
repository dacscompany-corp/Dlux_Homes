// Rules for staff accounts (the employees table), shared by account creation
// and editing so a newly added Owner, CSR or Cleaner always works everywhere:
//
//   - the role is exactly one of the three portals' roles — anything else
//     ("cleaner", "Housekeeping") could sign in to no portal at all;
//   - the email is stored trimmed and lowercase, and staff login compares it
//     case-insensitively, so "Juan@Gmail.com" and "juan@gmail.com" are one account;
//   - only an Owner can create an Owner, or give/take away the Owner role —
//     otherwise a CSR could promote themselves.
//
// Pure, so the rules are unit-tested without a database.

export const STAFF_ROLES = ["Owner", "CSR", "Cleaner"] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const MIN_PASSWORD_LENGTH = 8;

export function isStaffRole(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type StaffCheck = { ok: true } | { ok: false; status: number; error: string };

/** Validates a new staff account. `callerRole` is the signed-in Owner/CSR. */
export function checkNewStaff(
  input: { first_name?: unknown; last_name?: unknown; email?: unknown; password?: unknown; role?: unknown },
  callerRole: string | null | undefined,
): StaffCheck {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (!text(input.first_name) || !text(input.last_name)) {
    return { ok: false, status: 400, error: "First and last name are required." };
  }
  if (!EMAIL_RE.test(normalizeEmail(input.email))) {
    return { ok: false, status: 400, error: "Enter a valid email address." };
  }
  if (typeof input.password !== "string" || input.password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, status: 400, error: `The password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (!isStaffRole(input.role)) {
    return { ok: false, status: 400, error: `Role must be one of: ${STAFF_ROLES.join(", ")}.` };
  }
  if (input.role === "Owner" && callerRole !== "Owner") {
    return { ok: false, status: 403, error: "Only an Owner can create another Owner account." };
  }
  return { ok: true };
}

/** Whether `callerRole` may change an account's role from `current` to `next`. */
export function checkRoleChange(callerRole: string | null | undefined, current: string | null | undefined, next: unknown): StaffCheck {
  if (!isStaffRole(next)) {
    return { ok: false, status: 400, error: `Role must be one of: ${STAFF_ROLES.join(", ")}.` };
  }
  if ((next === "Owner" || current === "Owner") && next !== current && callerRole !== "Owner") {
    return { ok: false, status: 403, error: "Only an Owner can give or remove the Owner role." };
  }
  return { ok: true };
}
