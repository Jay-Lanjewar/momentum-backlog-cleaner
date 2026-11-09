const baseConfig = require("./app.json");
const { Buffer } = require("node:buffer");

const PRODUCTION_API_HOSTS = new Set(["momentum-backlog-cleaner.onrender.com"]);
// Treat the currently configured project as protected until QA infrastructure
// is provisioned and its exact project origin is approved.
const NON_QA_SUPABASE_HOSTS = new Set(["hzmbrhbpninwhtwhibyi.supabase.co"]);
const PREVIEW_APPLICATION_ID = "com.momentum.app.qa";
const PREVIEW_RUNTIME_VERSION = "1.1.1-qa";
// Intentionally empty until the infrastructure owner approves exact QA origins.
// This is source-controlled configuration, never a value supplied by EAS env.
const QA_ENDPOINT_ALLOWLIST = Object.freeze({
  apiOrigin: "https://momentum-qa-api.onrender.com",
  supabaseOrigin: "https://vmcyeypkkmneuvwymrbe.supabase.co",
});

function normalizeHostname(hostname) {
  const unwrapped = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return unwrapped.toLowerCase().replace(/\.$/, "");
}

function parseIpv4(hostname) {
  const octets = hostname.split(".");
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet))) return null;
  const numbers = octets.map(Number);
  return numbers.some((octet) => octet > 255) ? null : numbers;
}

// Block non-global IP ranges; DNS names are not resolved or classified here.
function isNonPublicIpv4([first, second, third]) {
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 192 && second === 0 && (third === 0 || third === 2))
    || (first === 192 && second === 88 && third === 99)
    || (first === 198 && (second === 18 || second === 19 || second === 51 && third === 100))
    || (first === 203 && second === 0 && third === 113)
    || first >= 224;
}

function parseIpv6(hostname) {
  if (!hostname.includes(":")) return null;
  const halves = hostname.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half) => half
    ? half.split(":").map((part) => /^[\da-f]{1,4}$/i.test(part) ? parseInt(part, 16) : NaN)
    : [];
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  const missing = 8 - left.length - right.length;
  if (missing < (halves.length === 2 ? 1 : 0)) return null;
  const words = [...left, ...Array.from({ length: missing }, () => 0), ...right];
  return words.length === 8 && words.every(Number.isInteger) ? words : null;
}

function isNonPublicIpv6(words) {
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return isNonPublicIpv4([
      words[6] >> 8,
      words[6] & 0xff,
      words[7] >> 8,
      words[7] & 0xff,
    ]);
  }
  const isUnspecified = words.every((word) => word === 0);
  const isLoopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  const isIpv4Compatible = words.slice(0, 6).every((word) => word === 0);
  const isUniqueLocal = (words[0] & 0xfe00) === 0xfc00;
  const isLinkLocal = (words[0] & 0xffc0) === 0xfe80;
  const isSiteLocal = (words[0] & 0xffc0) === 0xfec0;
  const isMulticast = (words[0] & 0xff00) === 0xff00;
  const isDocumentation = words[0] === 0x2001 && words[1] === 0x0db8;
  return isUnspecified || isLoopback || isIpv4Compatible || isUniqueLocal || isLinkLocal
    || isSiteLocal || isMulticast || isDocumentation;
}

function isNonPublicHostname(hostname) {
  const normalized = normalizeHostname(hostname);
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  const ipv4 = parseIpv4(normalized);
  if (ipv4) return isNonPublicIpv4(ipv4);
  const ipv6 = parseIpv6(normalized);
  return ipv6 ? isNonPublicIpv6(ipv6) : false;
}

function validateApiUrl(value, allowLocal) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be a valid absolute HTTP(S) URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must not contain URL credentials.");
  }
  if (!allowLocal && (url.protocol !== "https:" || isNonPublicHostname(url.hostname))) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must use HTTPS and a public hostname outside development.");
  }
  return url;
}

function resolveBuildProfile(env = process.env) {
  const marker = env.MOMENTUM_BUILD_PROFILE?.trim();
  const easProfile = env.EAS_BUILD_PROFILE?.trim();
  if ("MOMENTUM_BUILD_PROFILE" in env && !marker) {
    throw new Error("MOMENTUM_BUILD_PROFILE must name the selected EAS build profile.");
  }
  if (marker && easProfile && marker !== easProfile) {
    throw new Error("MOMENTUM_BUILD_PROFILE does not match EAS_BUILD_PROFILE.");
  }
  return marker || easProfile || null;
}

function validateBuildApiUrl(profile, value) {
  if (!profile) return; // Plain local Expo commands have no EAS build profile.
  if (!["development", "preview", "production"].includes(profile)) {
    throw new Error(`Unsupported EAS build profile: ${profile}.`);
  }
  if (profile !== "development" && (!value || !value.trim())) {
    throw new Error(`EXPO_PUBLIC_API_BASE_URL is required for the ${profile} build profile.`);
  }
  if (value?.trim()) {
    validateApiUrl(value, profile === "development");
  }
}

function requirePreviewValue(env, name, guidance) {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Preview build requires ${name}. ${guidance}`);
  }
  return value;
}

function isSupabaseServiceRoleKey(value) {
  if (/^sb_secret_/i.test(value)) return true;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
}

function requireApprovedQaOrigin(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Preview builds are blocked because the exact QA endpoint allowlist has not been configured in mobile/app.config.js.");
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`The QA endpoint allowlist entry for ${name} must be an exact HTTPS origin.`);
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.pathname !== "/"
    || url.search
    || url.hash
    || value !== url.origin
  ) {
    throw new Error(`The QA endpoint allowlist entry for ${name} must be a canonical HTTPS origin without credentials or a path.`);
  }
  return url.origin;
}

function getApprovedQaOrigins(allowlist) {
  const apiOrigin = requireApprovedQaOrigin(allowlist?.apiOrigin, "apiOrigin");
  const supabaseOrigin = requireApprovedQaOrigin(allowlist?.supabaseOrigin, "supabaseOrigin");
  return { apiOrigin, supabaseOrigin };
}

function parsePreviewUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Preview ${name} must be a valid absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`Preview ${name} must use HTTPS.`);
  }
  if (url.username || url.password) {
    throw new Error(`Preview ${name} must not contain URL credentials.`);
  }
  if (url.search || url.hash) {
    throw new Error(`Preview ${name} must not contain a query or fragment.`);
  }
  if (isNonPublicHostname(url.hostname)) {
    throw new Error(`Preview ${name} must use a public HTTPS host.`);
  }
  return url;
}

function validatePreviewConfiguration(env, allowlist = QA_ENDPOINT_ALLOWLIST) {
  const approvedOrigins = getApprovedQaOrigins(allowlist);
  if (env.MOMENTUM_QA_ENVIRONMENT?.trim().toLowerCase() !== "qa") {
    throw new Error('Preview build requires MOMENTUM_QA_ENVIRONMENT="qa" in the preview profile.');
  }

  const apiValue = requirePreviewValue(
    env,
    "EXPO_PUBLIC_API_BASE_URL",
    "Set it to the dedicated QA API URL in the EAS preview environment.",
  );
  const apiUrl = parsePreviewUrl(apiValue, "EXPO_PUBLIC_API_BASE_URL");
  const apiHost = normalizeHostname(apiUrl.hostname);
  if (PRODUCTION_API_HOSTS.has(apiHost)) {
    throw new Error("Preview EXPO_PUBLIC_API_BASE_URL points to a protected production API host. Configure the dedicated QA API.");
  }
  if (apiUrl.origin !== approvedOrigins.apiOrigin) {
    throw new Error("Preview EXPO_PUBLIC_API_BASE_URL does not match the explicitly approved QA API origin.");
  }

  const supabaseValue = requirePreviewValue(
    env,
    "EXPO_PUBLIC_SUPABASE_URL",
    "Set it to the dedicated QA Supabase project URL in the EAS preview environment.",
  );
  const supabaseUrl = parsePreviewUrl(supabaseValue, "EXPO_PUBLIC_SUPABASE_URL");
  if (supabaseUrl.pathname !== "/") {
    throw new Error("Preview EXPO_PUBLIC_SUPABASE_URL must be the exact QA Supabase project origin without a path.");
  }
  if (NON_QA_SUPABASE_HOSTS.has(normalizeHostname(supabaseUrl.hostname))) {
    throw new Error("Preview EXPO_PUBLIC_SUPABASE_URL points to a protected non-QA Supabase project. Configure the dedicated QA project.");
  }
  if (supabaseUrl.origin !== approvedOrigins.supabaseOrigin) {
    throw new Error("Preview EXPO_PUBLIC_SUPABASE_URL does not match the explicitly approved QA Supabase project origin.");
  }

  const publishableKey = requirePreviewValue(
    env,
    "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "Set the QA project's publishable key; never use a service-role key in the mobile app.",
  );
  if (isSupabaseServiceRoleKey(publishableKey)) {
    throw new Error("Preview EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must not contain a Supabase service-role credential.");
  }
  if (!publishableKey.startsWith("sb_publishable_") && !publishableKey.startsWith("eyJ")) {
    throw new Error("Preview EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a Supabase publishable key or legacy anon JWT.");
  }
  if (publishableKey.startsWith("eyJ")) {
    const parts = publishableKey.split(".");
    let role;
    try {
      role = parts.length === 3
        ? JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"))?.role
        : undefined;
    } catch {
      role = undefined;
    }
    if (role === "service_role") {
      throw new Error("Preview EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must not contain a Supabase service-role credential.");
    }
    if (role !== "anon") {
      throw new Error("Preview EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be a publishable key or a valid legacy anon JWT.");
    }
  }
}

function validateBuildConfiguration(env = process.env, allowlist = QA_ENDPOINT_ALLOWLIST) {
  const profile = resolveBuildProfile(env);
  if (profile === "preview") {
    validatePreviewConfiguration(env, allowlist);
  } else {
    validateBuildApiUrl(profile, env.EXPO_PUBLIC_API_BASE_URL);
  }
  return profile;
}

function resolveExpoConfig(env = process.env, allowlist = QA_ENDPOINT_ALLOWLIST) {
  const profile = validateBuildConfiguration(env, allowlist);
  const config = JSON.parse(JSON.stringify(baseConfig.expo));
  if (profile === "preview") {
    config.android.package = PREVIEW_APPLICATION_ID;
    config.runtimeVersion = PREVIEW_RUNTIME_VERSION;
  }
  return config;
}

module.exports = () => {
  return resolveExpoConfig();
};

module.exports.validateBuildApiUrl = validateBuildApiUrl;
module.exports.resolveBuildProfile = resolveBuildProfile;
module.exports.validateBuildConfiguration = validateBuildConfiguration;
module.exports.resolveExpoConfig = resolveExpoConfig;
module.exports.PREVIEW_APPLICATION_ID = PREVIEW_APPLICATION_ID;
module.exports.PREVIEW_RUNTIME_VERSION = PREVIEW_RUNTIME_VERSION;
module.exports.QA_ENDPOINT_ALLOWLIST = QA_ENDPOINT_ALLOWLIST;
