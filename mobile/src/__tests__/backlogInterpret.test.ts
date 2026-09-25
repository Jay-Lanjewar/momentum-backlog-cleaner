import {
  countDraftTasks,
  createTaskDraft,
  draftSubjectKey,
  draftsToPayload,
  interpretBacklogInput,
} from "@/lib/backlogInterpret";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function tomorrowKey(): string {
  const now = new Date(Date.now() + 86_400_000);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const EXAMPLE_LINES = [
  "Maths quadratic equations practice 20 questions",
  "Physics motion revise notes by Friday",
  "Chemistry atoms and molecules chapter",
  "English worksheet tomorrow",
];

describe("interpretBacklogInput", () => {
  it("keeps one course per example line", () => {
    const drafts = interpretBacklogInput(EXAMPLE_LINES.join("\n"));

    expect(drafts.map((draft) => draft.subject)).toEqual([
      "Maths",
      "Physics",
      "Chemistry",
      "English",
    ]);
    expect(countDraftTasks(drafts)).toBe(4);
    expect(drafts.every((draft) => !draft.subjectUncertain)).toBe(true);
  });

  it("moves quantities into notes and leaves duration empty", () => {
    const drafts = interpretBacklogInput(EXAMPLE_LINES.join("\n"));
    const maths = drafts[0].tasks[0];
    const chemistry = drafts[2].tasks[0];

    expect(maths.title).toBe("quadratic equations practice");
    expect(maths.description).toBe("20 questions");
    expect(maths.estimated_minutes).toBeNull();
    expect(chemistry.title).toBe("atoms and molecules chapter");
    expect(chemistry.description).toBeNull();
    expect(chemistry.estimated_minutes).toBeNull();
    expect(chemistry.due_date).toBeNull();
  });

  it("reads weekdays and words as due dates", () => {
    const drafts = interpretBacklogInput(EXAMPLE_LINES.join("\n"));
    const fridayDue = drafts[1].tasks[0].due_date;
    const tomorrowDue = drafts[3].tasks[0].due_date;

    expect(fridayDue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${fridayDue}T00:00:00`).getDay()).toBe(5);
    expect(tomorrowDue).toBe(tomorrowKey());
    expect(drafts[1].tasks[0].title).toBe("motion revise notes");
    expect(drafts[3].tasks[0].title).toBe("worksheet");
  });

  it("converts explicit durations into estimates", () => {
    const drafts = interpretBacklogInput(
      "Physics revise 45 min\nChemistry read 2h",
    );

    expect(drafts[0].tasks[0]).toMatchObject({
      title: "revise",
      estimated_minutes: 45,
    });
    expect(drafts[1].tasks[0]).toMatchObject({
      title: "read",
      estimated_minutes: 120,
    });
  });

  it("does not invent an estimate for tiny durations", () => {
    const drafts = interpretBacklogInput("Maths 4 min recap");

    expect(drafts[0].tasks[0].estimated_minutes).toBeNull();
    expect(drafts[0].tasks[0].title).toBe("4 min recap");
  });

  it("raises priority for urgent wording and bang prefix", () => {
    const drafts = interpretBacklogInput(
      "Chemistry urgent revision\n! Maths trigonometry sheet",
    );

    expect(drafts[0].tasks[0]).toMatchObject({
      title: "revision",
      priority: 1,
    });
    expect(drafts[1].tasks[0]).toMatchObject({
      title: "trigonometry sheet",
      priority: 1,
    });
  });

  it("groups blank-line sections by subject", () => {
    const drafts = interpretBacklogInput(
      "Physics\nMotion\nGravitation\n\nMaths\nTriangles",
    );

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ subject: "Physics" });
    expect(drafts[0].tasks.map((task) => task.title)).toEqual([
      "Motion",
      "Gravitation",
    ]);
    expect(drafts[1]).toMatchObject({ subject: "Maths" });
    expect(drafts[1].tasks.map((task) => task.title)).toEqual(["Triangles"]);
  });

  it("uses a subject header inside a loose list", () => {
    const drafts = interpretBacklogInput("Physics\nMotion\nGravitation");

    expect(drafts).toHaveLength(1);
    expect(drafts[0].subject).toBe("Physics");
    expect(countDraftTasks(drafts)).toBe(2);
  });

  it("falls back to an uncertain subject when nothing is detected", () => {
    const drafts = interpretBacklogInput("Finish project\nBuy lab notebook");

    expect(drafts).toHaveLength(1);
    expect(drafts[0].subject).toBe("");
    expect(drafts[0].subjectUncertain).toBe(true);
    expect(countDraftTasks(drafts)).toBe(2);

    const payload = draftsToPayload(drafts);
    expect(payload.courses).toEqual([
      { name: "General", color: expect.stringMatching(/^#[0-9a-fA-F]{6}$/) },
    ]);
    expect(payload.backlog.map((item) => item.course_index)).toEqual([0, 0]);
  });

  it("keeps edits when the source text is unchanged", () => {
    const first = interpretBacklogInput("Physics\nMotion");
    first[0].tasks[0].title = "Motion revised";
    first[0].tasks[0].priority = 1;

    const second = interpretBacklogInput("Physics\nMotion", first);

    expect(second[0].tasks[0].title).toBe("Motion revised");
    expect(second[0].tasks[0].priority).toBe(1);
  });

  it("re-interprets fresh when the source text changed", () => {
    const first = interpretBacklogInput("Physics\nMotion");
    first[0].tasks[0].title = "Motion revised";

    const second = interpretBacklogInput(
      "Physics\nMotion\n\nMaths\nTriangles",
      first,
    );

    expect(second).toHaveLength(2);
    expect(second[0].tasks[0].title).toBe("Motion");
    expect(second[1].tasks[0].title).toBe("Triangles");
  });
});

describe("draftsToPayload", () => {
  it("emits the backend backlog contract fields", () => {
    const payload = draftsToPayload(
      interpretBacklogInput(
        "Chemistry lab write-up due 2026-10-05\nChemistry atoms 45 min",
      ),
    );

    expect(payload.courses).toEqual([
      { name: "Chemistry", color: expect.stringMatching(/^#[0-9a-fA-F]{6}$/) },
    ]);
    expect(payload.backlog).toEqual([
      {
        title: "lab write-up",
        course_index: 0,
        priority: 3,
        estimated_minutes: null,
        due_date: "2026-10-05T00:00:00",
      },
      {
        title: "atoms",
        course_index: 0,
        priority: 3,
        estimated_minutes: 45,
      },
    ]);
  });

  it("merges duplicate subjects case-insensitively", () => {
    const payload = draftsToPayload(
      interpretBacklogInput("Physics\nMotion\n\nphysics\nGravitation"),
    );

    expect(payload.courses).toHaveLength(1);
    expect(payload.backlog.map((item) => item.course_index)).toEqual([0, 0]);
  });

  it("drops courses that no longer have tasks", () => {
    const payload = draftsToPayload([
      { subject: "Physics", subjectUncertain: false, sourceText: "a", tasks: [] },
      {
        subject: "Maths",
        subjectUncertain: false,
        sourceText: "a",
        tasks: [createTaskDraft("Triangles")],
      },
    ]);

    expect(payload.courses.map((course) => course.name)).toEqual(["Maths"]);
    expect(payload.backlog).toEqual([
      {
        title: "Triangles",
        course_index: 0,
        priority: 3,
        estimated_minutes: null,
      },
    ]);
  });

  it("truncates titles to the backend limit", () => {
    const draft = createTaskDraft("x".repeat(300));
    const payload = draftsToPayload([
      { subject: "Physics", subjectUncertain: false, sourceText: "a", tasks: [draft] },
    ]);

    expect(payload.backlog[0].title).toHaveLength(255);
  });
});

describe("helpers", () => {
  it("counts tasks across drafts", () => {
    const drafts = interpretBacklogInput("Physics\nMotion\nGravitation");

    expect(countDraftTasks(drafts)).toBe(2);
    expect(countDraftTasks([])).toBe(0);
  });

  it("normalizes subject keys with a General fallback", () => {
    expect(draftSubjectKey("  Physics ")).toBe("physics");
    expect(draftSubjectKey("")).toBe("general");
  });
});
