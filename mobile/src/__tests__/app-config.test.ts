const {
  resolveBuildProfile,
  validateBuildApiUrl,
  validateBuildConfiguration,
} = require("../../app.config.js");
const { validateApiUrl } = require("../lib/constants");
const easConfig = require("../../eas.json");

const forbiddenUrls = [
  ["IPv6 loopback", "https://[::1]:8000"],
  ["canonicalized IPv6 loopback", "https://[0:0:0:0:0:0:0:1]:8000"],
  ["IPv6 unspecified address", "https://[::]:8000"],
  ["IPv4-compatible IPv6 loopback", "https://[::127.0.0.1]:8000"],
  ["IPv4 loopback", "https://127.0.0.1:8000"],
  ["localhost subdomain", "https://api.localhost:8000"],
  ["wildcard IPv4", "https://0.0.0.0:8000"],
  ["private IPv4", "https://10.20.30.40"],
  ["private IPv4 172.16/12", "https://172.16.0.1"],
  ["private IPv4 192.168/16", "https://192.168.1.1"],
  ["shared IPv4", "https://100.64.0.1"],
  ["link-local IPv4", "https://169.254.10.20"],
  ["private IPv6", "https://[fd12:3456::1]"],
  ["private IPv6 fc00/7", "https://[fc00::1]"],
  ["link-local IPv6", "https://[fe80::1]"],
  ["IPv4-mapped private IPv6", "https://[::ffff:192.168.1.1]"],
];

describe("EAS API URL validation", () => {
  it.each(["development", "preview", "production"])("associates the %s profile with its explicit EAS marker", (profile) => {
    expect(easConfig.build[profile].env.MOMENTUM_BUILD_PROFILE).toBe(profile);
    expect(resolveBuildProfile({ MOMENTUM_BUILD_PROFILE: profile })).toBe(profile);
  });

  it("checks the explicit profile marker against EAS_BUILD_PROFILE when both exist", () => {
    expect(resolveBuildProfile({ EAS_BUILD_PROFILE: "production" })).toBe("production");
    expect(() => resolveBuildProfile({
      MOMENTUM_BUILD_PROFILE: "preview",
      EAS_BUILD_PROFILE: "production",
    })).toThrow(/does not match/);
  });

  it("preserves local Expo development and explicit localhost configuration", () => {
    expect(validateBuildConfiguration({})).toBeNull();
    expect(() => validateBuildConfiguration({ MOMENTUM_BUILD_PROFILE: "development" })).not.toThrow();
    expect(() => validateBuildConfiguration({
      MOMENTUM_BUILD_PROFILE: "development",
      EXPO_PUBLIC_API_BASE_URL: "http://localhost:8000",
    })).not.toThrow();
    expect(validateApiUrl("http://localhost:8000", true)).toBe("http://localhost:8000");
  });

  it("rejects unknown profiles and empty explicit markers", () => {
    expect(() => validateBuildApiUrl("staging", "https://api.example.com")).toThrow(/Unsupported EAS build profile/);
    expect(() => validateBuildConfiguration({ MOMENTUM_BUILD_PROFILE: "staging" })).toThrow(/Unsupported EAS build profile/);
    expect(() => resolveBuildProfile({ MOMENTUM_BUILD_PROFILE: " " })).toThrow(/must name/);
  });

  it.each(["preview", "production"])("requires a public HTTPS URL for %s during config validation", (profile) => {
    expect(() => validateBuildConfiguration({ MOMENTUM_BUILD_PROFILE: profile })).toThrow(/required/);
    expect(() => validateBuildConfiguration({
      MOMENTUM_BUILD_PROFILE: profile,
      EXPO_PUBLIC_API_BASE_URL: "http://api.example.com",
    })).toThrow(/HTTPS/);
    expect(() => validateBuildConfiguration({
      MOMENTUM_BUILD_PROFILE: profile,
      EXPO_PUBLIC_API_BASE_URL: "https://api.example.com",
    })).not.toThrow();
    expect(() => validateBuildConfiguration({
      MOMENTUM_BUILD_PROFILE: profile,
      EXPO_PUBLIC_API_BASE_URL: "https://8.8.8.8",
    })).not.toThrow();
    expect(() => validateBuildConfiguration({
      MOMENTUM_BUILD_PROFILE: profile,
      EXPO_PUBLIC_API_BASE_URL: "https://[2606:4700:4700::1111]",
    })).not.toThrow();
  });

  it.each([
    "https://api.example.com",
    "https://8.8.8.8",
    "https://[2606:4700:4700::1111]",
  ])("allows public HTTPS URLs in the runtime validator: %s", (url) => {
    expect(validateApiUrl(url, false)).toBe(url);
  });

  it.each(forbiddenUrls)("rejects %s in the build-time and runtime validators", (_label, url) => {
    expect(() => validateApiUrl(url, false)).toThrow(/public hostname/);
    expect(() => validateBuildApiUrl("production", url)).toThrow(/public hostname/);
  });

  it("rejects insecure schemes and malformed URLs", () => {
    expect(() => validateBuildApiUrl("preview", "http://api.example.com")).toThrow(/HTTPS/);
    expect(() => validateApiUrl("http://api.example.com", false)).toThrow(/HTTPS/);
    expect(() => validateApiUrl("ftp://api.example.com", true)).toThrow(/HTTP or HTTPS/);
    expect(() => validateApiUrl("not a URL", false)).toThrow(/valid absolute/);
    expect(() => validateApiUrl("https://user:password@api.example.com", false)).toThrow(/URL credentials/);
    expect(() => validateBuildApiUrl("production", "https://user:password@api.example.com")).toThrow(/URL credentials/);
  });
});
