import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "..");

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(SRC, relativePath), "utf-8");
}

function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(SRC, relativePath));
}

// ─── Courses: File structure ───

describe("courses file structure", () => {
  it("has courses screen", () => {
    expect(fileExists("app/(app)/(work)/courses.tsx")).toBe(true);
  });

  it("courses screen is not a placeholder", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).not.toContain("Placeholder");
    expect(content).toContain("CoursesScreen");
  });

  it("courses screen imports useCourses hook", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).toContain("useCourses");
  });

  it("courses screen imports useCreateCourse hook", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).toContain("useCreateCourse");
  });

  it("courses screen imports useUpdateCourse hook", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).toContain("useUpdateCourse");
  });

  it("courses screen imports useDeleteCourse hook", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).toContain("useDeleteCourse");
  });

  it("courses screen has list view", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).toContain("FlatList");
  });

  it("courses screen has create modal", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).toContain("showForm");
    expect(content).toContain("CourseFormModal");
  });

  it("courses screen has delete confirmation", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).toContain("deletingCourse");
    expect(content).toContain("Alert.alert");
  });

  it("courses screen has color picker", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).toContain("COURSE_COLORS");
    expect(content).toContain("colorSwatch");
  });

  it("courses screen has pull-to-refresh", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).toContain("RefreshControl");
    expect(content).toContain("refetch");
  });

  it("courses screen has empty state", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).toContain("No courses yet");
  });

  it("courses screen shows backlog count per course", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).toContain("useBacklogItems");
    expect(content).toContain("backlogCountForCourse");
  });
});

// ─── Courses: Types ───

describe("courses types", () => {
  it("types.ts defines CourseUpdatePayload", () => {
    const content = readFile("services/types.ts");
    expect(content).toContain("CourseUpdatePayload");
    expect(content).toContain("name?: string");
    expect(content).toContain("color?: string");
  });

  it("types.ts defines Course with all fields", () => {
    const content = readFile("services/types.ts");
    expect(content).toContain("interface Course");
    expect(content).toContain("id: string");
    expect(content).toContain("user_id: string");
    expect(content).toContain("name: string");
    expect(content).toContain("color: string");
    expect(content).toContain("created_at: string");
    expect(content).toContain("updated_at: string");
  });

  it("types.ts defines CourseCreatePayload", () => {
    const content = readFile("services/types.ts");
    expect(content).toContain("CourseCreatePayload");
  });
});

// ─── Courses: Hooks ───

describe("courses hooks", () => {
  it("hooks.ts has useUpdateCourse", () => {
    const content = readFile("services/hooks.ts");
    expect(content).toContain("useUpdateCourse");
    expect(content).toContain("/api/v1/courses/${id}");
    expect(content).toContain("CourseUpdatePayload");
  });

  it("hooks.ts has useDeleteCourse", () => {
    const content = readFile("services/hooks.ts");
    expect(content).toContain("useDeleteCourse");
    expect(content).toContain("api.delete");
  });

  it("useUpdateCourse invalidates courses and backlog", () => {
    const content = readFile("services/hooks.ts");
    const section = content.slice(content.indexOf("useUpdateCourse"));
    expect(section).toContain('queryKey: ["courses"]');
    expect(section).toContain('queryKey: ["backlog"]');
  });

  it("useDeleteCourse invalidates courses, backlog, and dashboard", () => {
    const content = readFile("services/hooks.ts");
    const section = content.slice(content.indexOf("useDeleteCourse"));
    expect(section).toContain('queryKey: ["courses"]');
    expect(section).toContain('queryKey: ["backlog"]');
    expect(section).toContain('queryKey: ["dashboard"]');
  });
});

// ─── Goals: File structure ───

describe("goals file structure", () => {
  it("has goals screen", () => {
    expect(fileExists("app/(app)/(work)/goals.tsx")).toBe(true);
  });

  it("goals screen is not a placeholder", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).not.toContain("Placeholder");
    expect(content).toContain("GoalsScreen");
  });

  it("goals screen imports useGoals hook", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("useGoals");
  });

  it("goals screen imports useCreateGoal hook", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("useCreateGoal");
  });

  it("goals screen imports useUpdateGoal hook", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("useUpdateGoal");
  });

  it("goals screen imports useDeleteGoal hook", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("useDeleteGoal");
  });

  it("goals screen has active/achieved tabs", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("active");
    expect(content).toContain("achieved");
    expect(content).toContain("GOAL_TABS");
  });

  it("goals screen has list view", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("FlatList");
  });

  it("goals screen has create modal", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("showForm");
    expect(content).toContain("GoalFormModal");
  });

  it("goals screen has delete confirmation", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("Alert.alert");
    expect(content).toContain("Delete Goal");
  });

  it("goals screen has mark achieved action", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("handleMarkAchieved");
    expect(content).toContain("Achieve");
  });

  it("goals screen has category picker", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("GOAL_CATEGORIES");
    expect(content).toContain("Academic");
  });

  it("goals screen has target date picker", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("DateTimePicker");
    expect(content).toContain("target_date");
  });

  it("goals screen has pull-to-refresh", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("RefreshControl");
    expect(content).toContain("refetch");
  });

  it("goals screen has empty state", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("No active goals");
    expect(content).toContain("No achieved goals");
  });

  it("goals screen has overdue indicator", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("isOverdue");
    expect(content).toContain("Overdue");
  });
});

// ─── Goals: Types ───

describe("goals types", () => {
  it("types.ts defines Goal interface", () => {
    const content = readFile("services/types.ts");
    expect(content).toContain("interface Goal");
    expect(content).toContain("id: string");
    expect(content).toContain("user_id: string");
    expect(content).toContain("title: string");
    expect(content).toContain("description: string | null");
    expect(content).toContain("target_date: string | null");
    expect(content).toContain("status: string");
    expect(content).toContain("category: string | null");
    expect(content).toContain("created_at: string");
    expect(content).toContain("updated_at: string");
  });

  it("types.ts defines GoalCreatePayload", () => {
    const content = readFile("services/types.ts");
    expect(content).toContain("GoalCreatePayload");
    expect(content).toContain("title: string");
  });

  it("types.ts defines GoalUpdatePayload with status union", () => {
    const content = readFile("services/types.ts");
    expect(content).toContain("GoalUpdatePayload");
    expect(content).toContain('"active"');
    expect(content).toContain('"achieved"');
    expect(content).toContain('"abandoned"');
  });
});

// ─── Goals: Hooks ───

describe("goals hooks", () => {
  it("hooks.ts has useGoals with status filter", () => {
    const content = readFile("services/hooks.ts");
    expect(content).toContain("useGoals");
    expect(content).toContain("/api/v1/goals");
    expect(content).toContain("status");
  });

  it("hooks.ts has useCreateGoal", () => {
    const content = readFile("services/hooks.ts");
    expect(content).toContain("useCreateGoal");
    expect(content).toContain("GoalCreatePayload");
  });

  it("hooks.ts has useUpdateGoal", () => {
    const content = readFile("services/hooks.ts");
    expect(content).toContain("useUpdateGoal");
    expect(content).toContain("GoalUpdatePayload");
    expect(content).toContain("/api/v1/goals/${id}");
  });

  it("hooks.ts has useDeleteGoal", () => {
    const content = readFile("services/hooks.ts");
    expect(content).toContain("useDeleteGoal");
    expect(content).toContain("api.delete");
  });

  it("useGoals uses correct query key with status", () => {
    const content = readFile("services/hooks.ts");
    const section = content.slice(content.indexOf("useGoals"));
    expect(section).toContain('queryKey: ["goals"');
  });

  it("goal hooks invalidate goals query", () => {
    const content = readFile("services/hooks.ts");
    const goalsSection = content.slice(content.indexOf("// ─── Goals"));
    const invalidations = (
      goalsSection.match(/invalidateQueries.*goals/g) ?? []
    ).length;
    expect(invalidations).toBeGreaterThanOrEqual(3);
  });
});

// ─── Goals: API contract ───

describe("goals API contract", () => {
  it("hooks.ts uses correct goal endpoints", () => {
    const content = readFile("services/hooks.ts");
    expect(content).toContain("/api/v1/goals");
  });

  it("hooks.ts goal status filter uses query param", () => {
    const content = readFile("services/hooks.ts");
    const goalsSection = content.slice(content.indexOf("useGoals"));
    expect(goalsSection).toContain("?status=");
  });
});

// ─── Navigation ───

describe("work navigation", () => {
  it("backlog index has section navigation", () => {
    const content = readFile("app/(app)/(work)/index.tsx");
    expect(content).toContain("SECTION_TABS");
    expect(content).toContain("Backlog");
    expect(content).toContain("Courses");
    expect(content).toContain("Goals");
  });

  it("backlog index navigates to courses screen", () => {
    const content = readFile("app/(app)/(work)/index.tsx");
    expect(content).toContain('/(app)/(work)/courses');
  });

  it("backlog index navigates to goals screen", () => {
    const content = readFile("app/(app)/(work)/index.tsx");
    expect(content).toContain('/(app)/(work)/goals');
  });

  it("backlog index header title is Work", () => {
    const content = readFile("app/(app)/(work)/index.tsx");
    expect(content).toContain(">Work<");
  });

  it("courses screen has back button", () => {
    const content = readFile("app/(app)/(work)/courses.tsx");
    expect(content).toContain("router.back()");
  });

  it("goals screen has back button", () => {
    const content = readFile("app/(app)/(work)/goals.tsx");
    expect(content).toContain("router.back()");
  });

  it("work layout includes all screens", () => {
    const content = readFile("app/(app)/(work)/_layout.tsx");
    expect(content).toContain('"index"');
    expect(content).toContain('"[id]"');
    expect(content).toContain('"courses"');
    expect(content).toContain('"goals"');
  });
});

// ─── Query invalidation consistency ───

describe("query invalidation consistency", () => {
  it("course update invalidates both courses and backlog", () => {
    const content = readFile("services/hooks.ts");
    const section = content.slice(content.indexOf("useUpdateCourse"));
    expect(section).toContain('queryKey: ["courses"]');
    expect(section).toContain('queryKey: ["backlog"]');
  });

  it("course delete invalidates courses, backlog, and dashboard", () => {
    const content = readFile("services/hooks.ts");
    const section = content.slice(content.indexOf("useDeleteCourse"));
    expect(section).toContain('queryKey: ["courses"]');
    expect(section).toContain('queryKey: ["backlog"]');
    expect(section).toContain('queryKey: ["dashboard"]');
  });

  it("goal create/update/delete only invalidate goals", () => {
    const content = readFile("services/hooks.ts");
    const goalsStart = content.indexOf("// ─── Goals");
    const scheduleStart = content.indexOf("// ─── Weekly Schedule");
    // Extract only the Goals section (not the Schedule section below it)
    const goalsSection = content.slice(goalsStart, scheduleStart);
    // Goal mutations should NOT invalidate backlog or dashboard
    expect(goalsSection).not.toContain('queryKey: ["backlog"]');
    expect(goalsSection).not.toContain('queryKey: ["dashboard"]');
  });
});
