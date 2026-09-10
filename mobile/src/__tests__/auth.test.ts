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

  it("has auth _layout.tsx", () => {
    expect(fileExists(path.join(AUTH, "_layout.tsx"))).toBe(true);
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
  it("layout references login, register, forgot-password, verify-email", () => {
    const content = fs.readFileSync(path.join(AUTH, "_layout.tsx"), "utf-8");
    expect(content).toContain("login");
    expect(content).toContain("register");
    expect(content).toContain("forgot-password");
    expect(content).toContain("verify-email");
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
