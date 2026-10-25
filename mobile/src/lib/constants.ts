const configuredApiUrl = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
const localApiUrl = "http://localhost:8000";

type ParsedIpv4 = [number, number, number, number];

function normalizeHostname(hostname: string): string {
  const unwrapped = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
  return unwrapped.toLowerCase().replace(/\.$/, "");
}

function parseIpv4(hostname: string): ParsedIpv4 | null {
  const octets = hostname.split(".");
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet))) {
    return null;
  }
  const numbers = octets.map(Number);
  if (numbers.some((octet) => octet > 255)) return null;
  return numbers as ParsedIpv4;
}

// Block non-global IP ranges; DNS names are not resolved or classified here.
function isNonPublicIpv4([first, second, third]: ParsedIpv4): boolean {
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127) // shared address space
    || (first === 169 && second === 254) // link-local
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 192 && second === 0 && (third === 0 || third === 2))
    || (first === 192 && second === 88 && third === 99)
    || (first === 198 && (second === 18 || second === 19 || second === 51 && third === 100))
    || (first === 203 && second === 0 && third === 113)
    || first >= 224; // multicast and reserved
}

function parseIpv6(hostname: string): number[] | null {
  if (!hostname.includes(":")) return null;
  const halves = hostname.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half: string) => half
    ? half.split(":").map((part) => /^[\da-f]{1,4}$/i.test(part) ? parseInt(part, 16) : NaN)
    : [];
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  const missing = 8 - left.length - right.length;
  if (missing < (halves.length === 2 ? 1 : 0)) return null;
  const words = [...left, ...Array.from({ length: missing }, () => 0), ...right];
  return words.length === 8 && words.every(Number.isInteger) ? words : null;
}

function isNonPublicIpv6(words: number[]): boolean {
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    const mappedIpv4: ParsedIpv4 = [
      words[6] >> 8,
      words[6] & 0xff,
      words[7] >> 8,
      words[7] & 0xff,
    ];
    return isNonPublicIpv4(mappedIpv4);
  }

  const isUnspecified = words.every((word) => word === 0);
  const isLoopback = words.slice(0, 7).every((word) => word === 0) && words[7] === 1;
  const isIpv4Compatible = words.slice(0, 6).every((word) => word === 0);
  const isUniqueLocal = (words[0] & 0xfe00) === 0xfc00; // fc00::/7
  const isLinkLocal = (words[0] & 0xffc0) === 0xfe80; // fe80::/10
  const isSiteLocal = (words[0] & 0xffc0) === 0xfec0; // deprecated fec0::/10
  const isMulticast = (words[0] & 0xff00) === 0xff00;
  const isDocumentation = words[0] === 0x2001 && words[1] === 0x0db8;
  return isUnspecified || isLoopback || isIpv4Compatible || isUniqueLocal || isLinkLocal
    || isSiteLocal || isMulticast || isDocumentation;
}

function isNonPublicHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true;
  const ipv4 = parseIpv4(normalized);
  if (ipv4) return isNonPublicIpv4(ipv4);
  const ipv6 = parseIpv6(normalized);
  return ipv6 ? isNonPublicIpv6(ipv6) : false;
}

export function validateApiUrl(value: string, allowLocal: boolean): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be a valid absolute HTTP(S) URL.");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must not contain URL credentials.");
  }
  if (!allowLocal && (parsed.protocol !== "https:" || isNonPublicHostname(parsed.hostname))) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must use HTTPS and a public hostname outside development.");
  }
  return value.trim().replace(/\/+$/, "");
}

const isDevelopment = typeof __DEV__ !== "undefined" && __DEV__;
if (!configuredApiUrl && !isDevelopment) {
  throw new Error("EXPO_PUBLIC_API_BASE_URL is required outside development.");
}
export const API_BASE_URL = validateApiUrl(
  configuredApiUrl || localApiUrl,
  isDevelopment,
);

export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
