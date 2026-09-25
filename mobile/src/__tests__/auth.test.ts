// Auth flow tests — file structure and module verification (RNTL v14 compatible)

import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "..");
const AUTH = path.join(SRC, "app/(auth)");
const ONBOARDING = path.join(SRC, "app/(onboarding)");
const APP = path.join(SRC, "app/(app)");

function fileExists(p: string): boolean {
  return fs.existsSync(p);
}

describe("Auth screen files", () => {
  it("has login.tsx", () => {
    expect(fileExists(path.join(AUTH, "login.tsx"))).toBe(true);
  });

  it("has register.tsx", () => {
    expect(fileExists(path.join(AUTH, "register.tsx"))).toBe(true);
  });

  it("has verify-email.tsx", () => {
    expect(fileExists(path.join(AUTH, "verify-email.tsx"))).toBe(true);
  });

  it("has forgot-password.tsx", () => {
    expect(fileExists(path.join(AUTH, "forgot-password.tsx"))).toBe(true);
  });

  it("has reset-password.tsx", () => {
    expect(fileExists(path.join(AUTH, "reset-password.tsx"))).toBe(true);
  });

  it("has auth _layout.tsx", () => {
    expect(fileExists(path.join(AUTH, "_layout.tsx"))).toBe(true);
  });
});

describe("Confirm deep-link screen", () => {
  it("has confirm.tsx in app root (outside auth group)", () => {
    expect(fileExists(path.join(SRC, "app", "confirm.tsx"))).toBe(true);
  });

  it("confirm.tsx imports Linking from expo-linking", () => {
    const content = fs.readFileSync(path.join(SRC, "app", "confirm.tsx"), "utf-8");
    expect(content).toContain("expo-linking");
  });

  it("confirm.tsx calls supabase.auth.setSession", () => {
    const content = fs.readFileSync(path.join(SRC, "app", "confirm.tsx"), "utf-8");
    expect(content).toContain("setSession");
  });

  it("confirm.tsx uses setConfirming to block AuthGate during processing", () => {
    const content = fs.readFileSync(path.join(SRC, "app", "confirm.tsx"), "utf-8");
    expect(content).toContain("setConfirming");
  });
});

describe("Onboarding files", () => {
  it("has onboarding _layout.tsx", () => {
    expect(fileExists(path.join(ONBOARDING, "_layout.tsx"))).toBe(true);
  });

  it("has onboarding index.tsx (wizard)", () => {
    expect(fileExists(path.join(ONBOARDING, "index.tsx"))).toBe(true);
  });
});

describe("Settings screen", () => {
  it("has settings.tsx in (me)", () => {
    expect(fileExists(path.join(APP, "(me)/settings.tsx"))).toBe(true);
  });

  it("settings.tsx contains sign out logic", () => {
    const content = fs.readFileSync(
      path.join(APP, "(me)/settings.tsx"),
      "utf-8",
    );
    expect(content).toContain("signOut");
    expect(content).toContain("clearAuth");
  });
});

describe("Auth layout includes all screens", () => {
  it("layout references login, register, forgot-password, reset-password, verify-email", () => {
    const content = fs.readFileSync(path.join(AUTH, "_layout.tsx"), "utf-8");
    expect(content).toContain("login");
    expect(content).toContain("register");
    expect(content).toContain("forgot-password");
    expect(content).toContain("reset-password");
    expect(content).toContain("verify-email");
  });
});

describe("Forgot password supplies redirectTo", () => {
  it("forgot-password.tsx passes redirectTo momentum://confirm", () => {
    const content = fs.readFileSync(
      path.join(AUTH, "forgot-password.tsx"),
      "utf-8",
    );
    expect(content).toContain("resetPasswordForEmail");
    expect(content).toContain('redirectTo: "momentum://confirm"');
  });
});

describe("Verify-email resend uses Android redirect", () => {
  it("verify-email.tsx resend passes emailRedirectTo momentum://confirm", () => {
    const content = fs.readFileSync(
      path.join(AUTH, "verify-email.tsx"),
      "utf-8",
    );
    expect(content).toContain("resend");
    expect(content).toContain("emailRedirectTo");
    expect(content).toContain('emailRedirectTo: "momentum://confirm"');
  });
});

describe("Reset password screen", () => {
  it("reset-password.tsx calls supabase.auth.updateUser", () => {
    const content = fs.readFileSync(
      path.join(AUTH, "reset-password.tsx"),
      "utf-8",
    );
    expect(content).toContain("updateUser");
    expect(content).toContain("password");
  });

  it("reset-password.tsx requires an active session", () => {
    const content = fs.readFileSync(
      path.join(AUTH, "reset-password.tsx"),
      "utf-8",
    );
    expect(content).toContain("getSession");
    expect(content).toContain("/(auth)/login");
  });

  it("reset-password.tsx clears confirming", () => {
    const content = fs.readFileSync(
      path.join(AUTH, "reset-password.tsx"),
      "utf-8",
    );
    expect(content).toContain("setConfirming");
  });

  it("reset-password.tsx navigates to (app) after successful update", () => {
    const content = fs.readFileSync(
      path.join(AUTH, "reset-password.tsx"),
      "utf-8",
    );
    expect(content).toContain('router.replace("/(app)")');
  });
});

describe("Register flow includes email redirect", () => {
  it("register.tsx passes emailRedirectTo with momentum scheme", () => {
    const content = fs.readFileSync(path.join(AUTH, "register.tsx"), "utf-8");
    expect(content).toContain("emailRedirectTo");
    expect(content).toContain("momentum://confirm");
  });
});

describe("Root layout has onboarding gate", () => {
  it("_layout.tsx references (onboarding)", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/_layout.tsx"),
      "utf-8",
    );
    expect(content).toContain("(onboarding)");
    expect(content).toContain("profile");
  });

  it("_layout.tsx checks confirming flag before AuthGate redirect", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/_layout.tsx"),
      "utf-8",
    );
    expect(content).toContain("confirming");
  });

  it("_layout.tsx guards /confirm route from AuthGate redirect", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/_layout.tsx"),
      "utf-8",
    );
    expect(content).toContain('(segments[0] as string) === "confirm"');
  });

  it("_layout.tsx guards /reset-password route from AuthGate redirect", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/_layout.tsx"),
      "utf-8",
    );
    expect(content).toContain("reset-password");
    expect(content).toContain("inResetRoute");
  });

  it("_layout.tsx redirects authenticated profile-less users outside auth/onboarding to onboarding", () => {
    const content = fs.readFileSync(
      path.join(SRC, "app/_layout.tsx"),
      "utf-8",
    );
    expect(content).toContain("isAuthenticated && !user?.profile");
    expect(content).toContain('router.replace("/(onboarding)")');
  });

  it("onboarding final action calls handleFinish", () => {
    const content = fs.readFileSync(
      path.join(ONBOARDING, "index.tsx"),
      "utf-8",
    );
    expect(content).toContain("handleFinish");
    expect(content).toContain("api.post");
    expect(content).toContain('"/api/v1/onboarding"');
    expect(content).toContain('router.replace("/(app)")');
  });

  it("onboarding final submit guards against duplicate submission", () => {
    const content = fs.readFileSync(
      path.join(ONBOARDING, "index.tsx"),
      "utf-8",
    );
    expect(content).toContain("submittingRef");
    expect(content).toContain("if (submittingRef.current) return");
  });

  it("onboarding final submit handles errors with Alert", () => {
    const content = fs.readFileSync(
      path.join(ONBOARDING, "index.tsx"),
      "utf-8",
    );
    expect(content).toContain("Alert.alert");
    expect(content).toContain("setSubmitting(false)");
    expect(content).toContain("submittingRef.current = false");
  });

  it("onboarding keeps backlog parser UI and parsed confirmation", () => {
    const content = fs.readFileSync(
      path.join(ONBOARDING, "index.tsx"),
      "utf-8",
    );
    expect(content).toContain("What do you need to get done?");
    expect(content).toContain("Here&apos;s what I understood");
    expect(content).toContain("Here's what Momentum understood");
    expect(content).toContain("Interpret tasks");
    expect(content).toContain("Looks correct");
    expect(content).toContain("parseBacklogInput");
  });

  it("onboarding first-run uses default profile/schedule and empty goals", () => {
    const content = fs.readFileSync(
      path.join(ONBOARDING, "index.tsx"),
      "utf-8",
    );
    expect(content).toContain("goals: []");
    expect(content).toContain('earliest_start: "16:00"');
    expect(content).toContain("DEFAULT_DAILY_TARGET_MINUTES = 120");
    expect(content).toContain("daily_target_minutes: dailyTarget");
    expect(content).toContain('type: "school"');
    expect(content).toContain("buildDefaultSchedule");
  });

  it("onboarding collects availability during first run", () => {
    const content = fs.readFileSync(
      path.join(ONBOARDING, "index.tsx"),
      "utf-8",
    );
    expect(content).toContain("When are you busy?");
    expect(content).toContain(
      "Add only what's fixed. Momentum plans study time around it.",
    );
    expect(content).toContain("+ Add commitment");
    expect(content).toContain("buildSchedule");
  });

  it("onboarding prefetches dashboard after onboarding POST", () => {
    const content = fs.readFileSync(
      path.join(ONBOARDING, "index.tsx"),
      "utf-8",
    );
    expect(content).toContain("prefetchQuery");
    expect(content).toContain("dashboardQueryKey");
    expect(content).toContain("fetchDashboard");
    expect(content).toContain("Promise.all");
    expect(content).toContain('api.get<AuthMeResponse>("/api/v1/auth/me"');
    expect(content).toContain("Saving your work...");
    expect(content).toContain("Building your plan...");
    expect(content).not.toContain("Understanding your work");
  });

  it("onboarding no longer contains removed Welcome/Name/Exam/Weekday steps", () => {
    const content = fs.readFileSync(
      path.join(ONBOARDING, "index.tsx"),
      "utf-8",
    );
    expect(content).not.toContain("Welcome to Momentum");
    expect(content).not.toContain("Get Started");
    expect(content).not.toContain("What's your name?");
    expect(content).not.toContain("Any exam deadlines?");
    expect(content).not.toContain("What does your weekday look like?");
    expect(content).not.toContain("WEEKDAY_TYPES");
    expect(content).not.toContain("displayStep");
  });

  it("confirm.tsx uses useLinkingURL from expo-linking for URL detection", () => {
    const content = fs.readFileSync(path.join(SRC, "app", "confirm.tsx"), "utf-8");
    expect(content).toContain("useLinkingURL");
    expect(content).toContain("expo-linking");
  });

  it("confirm.tsx uses processed guard to prevent double-processing", () => {
    const content = fs.readFileSync(path.join(SRC, "app", "confirm.tsx"), "utf-8");
    expect(content).toContain("processed");
  });
});

describe("Login screen has auth links", () => {
  it("login.tsx has forgot-password link", () => {
    const content = fs.readFileSync(path.join(AUTH, "login.tsx"), "utf-8");
    expect(content).toContain("forgot-password");
  });

  it("login.tsx has register link", () => {
    const content = fs.readFileSync(path.join(AUTH, "login.tsx"), "utf-8");
    expect(content).toContain("register");
  });
});
