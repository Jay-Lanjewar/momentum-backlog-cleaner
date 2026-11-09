import appJson from "../../app.json";

const {
  resolveBuildProfile,
  validateBuildApiUrl,
  validateBuildConfiguration,
  resolveExpoConfig,
  PREVIEW_APPLICATION_ID,
  PREVIEW_RUNTIME_VERSION,
} = require("../../app.config.js");
const { validateApiUrl } = require("../lib/constants");
const easConfig = require("../../eas.json");

const validPreviewEnv = {
  MOMENTUM_BUILD_PROFILE: "preview",
  MOMENTUM_QA_ENVIRONMENT: "qa",
  EXPO_PUBLIC_API_BASE_URL: "https://focus-shield-api.qa.invalid",
  EXPO_PUBLIC_SUPABASE_URL: "https://focus-shield-qa.supabase.co",
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_qa_test_key",
};
const testQaEndpointAllowlist = Object.freeze({
  apiOrigin: "https://focus-shield-api.qa.invalid",
  supabaseOrigin: "https://focus-shield-qa.supabase.co",
});

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
    expect(easConfig.build[profile].environment).toBe(profile);
    expect(resolveBuildProfile({ MOMENTUM_BUILD_PROFILE: profile })).toBe(profile);
  });

  it("marks only the preview environment as QA", () => {
    expect(easConfig.build.preview.env.MOMENTUM_QA_ENVIRONMENT).toBe("qa");
    expect(easConfig.build.development.env.MOMENTUM_QA_ENVIRONMENT).toBeUndefined();
    expect(easConfig.build.production.env.MOMENTUM_QA_ENVIRONMENT).toBeUndefined();
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

  it("keeps production API validation unchanged", () => {
    expect(() => validateBuildConfiguration({ MOMENTUM_BUILD_PROFILE: "production" })).toThrow(/required/);
    expect(() => validateBuildConfiguration({
      MOMENTUM_BUILD_PROFILE: "production",
      EXPO_PUBLIC_API_BASE_URL: "http://api.example.com",
    })).toThrow(/HTTPS/);
    expect(validateBuildConfiguration({
      MOMENTUM_BUILD_PROFILE: "production",
      EXPO_PUBLIC_API_BASE_URL: "https://momentum-backlog-cleaner.onrender.com",
    })).toBe("production");
  });

  it("requires a QA HTTPS API and explicit QA profile marker for preview", () => {
    expect(() => validateBuildConfiguration({
      MOMENTUM_BUILD_PROFILE: "preview",
      MOMENTUM_QA_ENVIRONMENT: "qa",
    }, testQaEndpointAllowlist)).toThrow(/EXPO_PUBLIC_API_BASE_URL/);
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_API_BASE_URL: "http://focus-shield-api.qa.invalid",
    }, testQaEndpointAllowlist)).toThrow(/HTTPS/);
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      MOMENTUM_QA_ENVIRONMENT: undefined,
    }, testQaEndpointAllowlist)).toThrow(/MOMENTUM_QA_ENVIRONMENT/);
    expect(validateBuildConfiguration(validPreviewEnv, testQaEndpointAllowlist)).toBe("preview");
  });

  it("blocks preview when the QA origin allowlist is explicitly empty", () => {
  expect(() => validateBuildConfiguration(validPreviewEnv, {})).toThrow(
    /allowlist has not been configured/
  );
});

  it.each([
    ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_URL"],
    ["EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  ])("requires %s for a preview build", (_name, field) => {
    const env: Record<string, string | undefined> = { ...validPreviewEnv };
    delete env[field];
    expect(() => validateBuildConfiguration(env, testQaEndpointAllowlist)).toThrow(new RegExp(field));
  });

  it("accepts only the exact approved QA API and Supabase origins", () => {
    expect(validateBuildConfiguration(validPreviewEnv, testQaEndpointAllowlist)).toBe("preview");
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_API_BASE_URL: "https://other-api.qa.invalid",
    }, testQaEndpointAllowlist)).toThrow(/does not match the explicitly approved QA API origin/);
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_SUPABASE_URL: "https://other-project.supabase.co",
    }, testQaEndpointAllowlist)).toThrow(/does not match the explicitly approved QA Supabase project origin/);
  });

  it("rejects unexpected ports and Supabase project references", () => {
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_API_BASE_URL: "https://focus-shield-api.qa.invalid:8443",
    }, testQaEndpointAllowlist)).toThrow(/does not match the explicitly approved QA API origin/);
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_SUPABASE_URL: "https://focus-shield-qa.supabase.co:8443",
    }, testQaEndpointAllowlist)).toThrow(/does not match the explicitly approved QA Supabase project origin/);
  });

  it("rejects known production endpoints even if they are placed in the allowlist", () => {
    const unsafeAllowlist = {
      apiOrigin: "https://momentum-backlog-cleaner.onrender.com",
      supabaseOrigin: "https://hzmbrhbpninwhtwhibyi.supabase.co",
    };
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_API_BASE_URL: unsafeAllowlist.apiOrigin,
    }, unsafeAllowlist)).toThrow(/protected production API host/);
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_SUPABASE_URL: unsafeAllowlist.supabaseOrigin,
    }, { ...testQaEndpointAllowlist, supabaseOrigin: unsafeAllowlist.supabaseOrigin })).toThrow(/protected non-QA Supabase project/);
  });

  it("rejects malformed and credential-bearing preview URLs", () => {
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_API_BASE_URL: "not a URL",
    }, testQaEndpointAllowlist)).toThrow(/valid absolute HTTPS URL/);
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_SUPABASE_URL: "not a URL",
    }, testQaEndpointAllowlist)).toThrow(/valid absolute HTTPS URL/);
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_API_BASE_URL: "https://student:password@focus-shield-api.qa.invalid",
    }, testQaEndpointAllowlist)).toThrow(/must not contain URL credentials/);
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_SUPABASE_URL: "https://student:password@focus-shield-qa.supabase.co",
    }, testQaEndpointAllowlist)).toThrow(/must not contain URL credentials/);
  });

  it("rejects service-role credentials without including the value in errors", () => {
    const secretKey = "sb_secret_do_not_log_this";
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secretKey,
    }, testQaEndpointAllowlist)).toThrow(/must not contain a Supabase service-role credential/);
    const legacyServiceRoleJwt = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.signature`;
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: legacyServiceRoleJwt,
    }, testQaEndpointAllowlist)).toThrow(/must not contain a Supabase service-role credential/);
    try {
      validateBuildConfiguration({ ...validPreviewEnv, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secretKey }, testQaEndpointAllowlist);
    } catch (error) {
      expect((error as Error).message).not.toContain(secretKey);
    }
  });

  it("accepts a legacy anon JWT but not a JWT with an unknown role", () => {
    const jwtHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const anonJwt = `${jwtHeader}.${Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url")}.signature`;
    expect(validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: anonJwt,
    }, testQaEndpointAllowlist)).toBe("preview");
    const unknownRoleJwt = `${jwtHeader}.${Buffer.from(JSON.stringify({ role: "authenticated" })).toString("base64url")}.signature`;
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: unknownRoleJwt,
    }, testQaEndpointAllowlist)).toThrow(/valid legacy anon JWT/);
  });

  it("rejects non-HTTPS or malformed Supabase project URLs in preview", () => {
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_SUPABASE_URL: "http://momentumqa.supabase.co",
    }, testQaEndpointAllowlist)).toThrow(/HTTPS/);
    expect(() => validateBuildConfiguration({
      ...validPreviewEnv,
      EXPO_PUBLIC_SUPABASE_URL: "not a URL",
    }, testQaEndpointAllowlist)).toThrow(/valid absolute HTTPS URL/);
  });

  it("resolves production and development configs without changing their identity or runtime policy", () => {
    const production = resolveExpoConfig({
      MOMENTUM_BUILD_PROFILE: "production",
      EXPO_PUBLIC_API_BASE_URL: "https://api.example.com",
    });
    const development = resolveExpoConfig({ MOMENTUM_BUILD_PROFILE: "development" });
    expect(production.android.package).toBe("com.momentum.app");
    expect(production.runtimeVersion).toEqual({ policy: "appVersion" });
    expect(development.android.package).toBe("com.momentum.app");
    expect(development.runtimeVersion).toEqual({ policy: "appVersion" });
    expect(production.updates.url).toBe(appJson.expo.updates.url);
    expect(development.updates.url).toBe(appJson.expo.updates.url);
  });

  it("resolves the preview package and runtime from the actual Expo config", () => {
    const preview = resolveExpoConfig(validPreviewEnv, testQaEndpointAllowlist);
    expect(preview.android.package).toBe("com.momentum.app.qa");
    expect(preview.android.package).toBe(PREVIEW_APPLICATION_ID);
    expect(preview.runtimeVersion).toBe("1.1.1-qa");
    expect(preview.runtimeVersion).toBe(PREVIEW_RUNTIME_VERSION);
    expect(preview.android.package).not.toBe(appJson.expo.android.package);
    expect(preview.updates.url).toBe(appJson.expo.updates.url);
  });

  it("keeps preview internal and separate from production submission and update channels", () => {
    expect(easConfig.build.preview.distribution).toBe("internal");
    expect(easConfig.build.preview.android.buildType).toBe("apk");
    expect(easConfig.build.preview.environment).toBe("preview");
    expect(easConfig.build.preview.channel).toBe("preview");
    expect(easConfig.build.production.channel).toBe("production");
    expect(easConfig.build.production.env.MOMENTUM_QA_ENVIRONMENT).toBeUndefined();
    expect(easConfig.build.development.env.MOMENTUM_QA_ENVIRONMENT).toBeUndefined();
    expect(easConfig.submit.preview).toBeUndefined();
  });

  it("does not inherit a base runtime version when resolving preview", () => {
    const preview = resolveExpoConfig(validPreviewEnv, testQaEndpointAllowlist);
    expect(preview.runtimeVersion).not.toEqual(appJson.expo.runtimeVersion);
    expect(preview.runtimeVersion).toBe(PREVIEW_RUNTIME_VERSION);
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
