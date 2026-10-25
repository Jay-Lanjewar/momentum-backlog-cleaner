const baseConfig = require("./app.json");

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

function validateBuildConfiguration(env = process.env) {
  const profile = resolveBuildProfile(env);
  validateBuildApiUrl(profile, env.EXPO_PUBLIC_API_BASE_URL);
  return profile;
}

module.exports = () => {
  validateBuildConfiguration();
  return baseConfig.expo;
};

module.exports.validateBuildApiUrl = validateBuildApiUrl;
module.exports.resolveBuildProfile = resolveBuildProfile;
module.exports.validateBuildConfiguration = validateBuildConfiguration;
