/**
 * Helpers for Settings > Security (optional 2-step authentication).
 *
 * Supabase Auth is the source of truth for factor state; these helpers only
 * pick factors out of an `mfa.listFactors()` response, turn MFA error codes
 * into student-facing copy, and format what the Security screen displays.
 */

/** The subset of a Supabase `Factor` the Security screen cares about. */
export type TotpFactor = {
  id: string;
  factor_type: string;
  status: string;
  friendly_name?: string | null;
};

/** Shape of an `mfa.listFactors()` response (buckets vary by factor type). */
export type FactorList = {
  all?: TotpFactor[] | null;
  totp?: TotpFactor[] | null;
};

const GENERIC_MFA_ERROR = "Something went wrong. Please try again.";

const MFA_ERROR_COPY: Record<string, string> = {
  mfa_verification_failed:
    "That code didn't match. Check the code in your authenticator app and try again.",
  mfa_verification_rejected:
    "That code wasn't accepted. Try again with the newest code.",
  mfa_challenge_expired:
    "That code expired. Enter the newest code from your authenticator app and try again.",
  mfa_factor_not_found:
    "We couldn't find that authenticator. Start the setup again.",
  mfa_factor_name_conflict:
    "Momentum is already set up on this account.",
  too_many_enrolled_mfa_factors:
    "You've reached the limit for authenticator apps. Remove one before adding another.",
  insufficient_aal:
    "Sign out, then sign in again to manage 2-step authentication.",
  mfa_totp_enroll_not_enabled:
    "2-step authentication isn't available right now. Please try again later.",
  mfa_totp_verify_not_enabled:
    "2-step authentication isn't available right now. Please try again later.",
};

function errorCodeOf(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error as { code?: unknown };
    if (typeof code === "string" && code.length > 0) return code;
  }
  return null;
}

/**
 * Friendly copy for any MFA failure. Accepts anything thrown or returned by
 * supabase-js — Supabase error text must never reach the screen.
 */
export function friendlyMfaError(error: unknown): string {
  const code = errorCodeOf(error);
  if (code && MFA_ERROR_COPY[code]) return MFA_ERROR_COPY[code];
  if (error instanceof TypeError) {
    return "You're offline. Check your connection and try again.";
  }
  return GENERIC_MFA_ERROR;
}

/**
 * Copy for a failed login-time code check — shorter than the Security
 * screen's wording because the user just came from the sign-in form.
 * Anything else falls through to friendlyMfaError (never Supabase text).
 */
export function challengeErrorCopy(error: unknown): string {
  const code = errorCodeOf(error);
  if (code === "mfa_verification_failed") {
    return "That code didn't match. Try again.";
  }
  if (code === "mfa_challenge_expired") {
    return "That verification request expired. Try again.";
  }
  return friendlyMfaError(error);
}

function findTotpFactor(
  factors: FactorList | null | undefined,
  status: string,
): TotpFactor | null {
  const buckets = [factors?.all, factors?.totp];
  for (const bucket of buckets) {
    const hit = (bucket ?? []).find(
      (factor) => factor.factor_type === "totp" && factor.status === status,
    );
    if (hit) return hit;
  }
  return null;
}

/** The verified TOTP factor — 2-step authentication is on. */
export function pickVerifiedTotpFactor(
  factors: FactorList | null | undefined,
): TotpFactor | null {
  return findTotpFactor(factors, "verified");
}

/** A TOTP factor enrolled but never verified — setup started, not finished. */
export function pickUnverifiedTotpFactor(
  factors: FactorList | null | undefined,
): TotpFactor | null {
  return findTotpFactor(factors, "unverified");
}

const QR_DATA_URI_PREFIX = "data:image/svg+xml;utf-8,";

/**
 * auth-js wraps the enroll() QR code as an SVG data URI; unwrap it to the raw
 * SVG source the screen feeds to SvgXml. Returns "" when nothing renderable.
 */
export function qrSvgFromDataUri(value: string | null | undefined): string {
  if (!value) return "";
  if (value.startsWith(QR_DATA_URI_PREFIX)) {
    return value.slice(QR_DATA_URI_PREFIX.length).trim();
  }
  const trimmed = value.trim();
  return trimmed.startsWith("<") ? trimmed : "";
}

/** Group the manual-entry secret into readable 4-character blocks. */
export function formatSecret(secret: string | null | undefined): string {
  if (!secret) return "";
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/** A complete 6-digit verification code. */
export function isValidTotpCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}
