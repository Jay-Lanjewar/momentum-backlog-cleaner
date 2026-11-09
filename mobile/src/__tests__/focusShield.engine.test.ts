import { EMPTY_PROGRESS, masteryKey, selectQuestion, updateMastery } from "@/focusShield/adaptive";
import { CURRICULUM, inferSubject, inferTopic, normalizeBoard, parseGrade, supportedSubjects, topicsFor } from "@/focusShield/curriculum";
import { QUESTIONS, questionsFor } from "@/focusShield/questions";
import { generateQuestionVariation } from "@/focusShield/generators";
import { validateAnswer } from "@/focusShield/validation";
import type { SkillMastery } from "@/focusShield/types";

describe("Focus Shield curriculum and context", () => {
    test.each([["Class 9", 9], ["Class 9th", 9], ["Grade 10", 10], ["VIII", 8], ["std. 6", 6], ["Class 12", null], [null, null]] as const)("parses grade %s", (input, expected) => {
    expect(parseGrade(input)).toBe(expected);
  });

  it("normalizes a supported board and preserves unknown board names", () => {
    expect(normalizeBoard("Central Board of Secondary Education")).toBe("CBSE");
    expect(normalizeBoard("ICSE")).toBe("ICSE");
    expect(normalizeBoard(null)).toBeNull();
  });

  it("filters topics by grade and board, while general foundations remain board-neutral", () => {
    expect(topicsFor(9, "CBSE", "physics").map((topic) => topic.id)).toContain("physics-motion");
    expect(topicsFor(8, "CBSE", "physics")).toHaveLength(0);
    expect(topicsFor(9, "ICSE", "physics")).toHaveLength(0);
    expect(topicsFor(8, "ICSE", "mathematics").map((topic) => topic.id)).toContain("math-fractions");
    expect(supportedSubjects(11, "CBSE")).toEqual([]);
  });

  it("matches active course and task context without inventing a topic", () => {
    expect(inferSubject("Physics")).toBe("physics");
    expect(inferSubject("Science")).toBeNull();
    expect(inferTopic("Chapter: Motion and speed", "physics")).toBe("physics-motion");
    expect(inferTopic("Finish worksheet", "physics")).toBeNull();
  });

  it("keeps an explicit, small MVP curriculum matrix", () => {
    expect(new Set(CURRICULUM.map((topic) => topic.subject))).toEqual(new Set(["mathematics", "physics", "chemistry", "biology", "english"]));
    expect(new Set(QUESTIONS.map((question) => question.id)).size).toBe(QUESTIONS.length);
    for (const topic of CURRICULUM) {
      const catalog = QUESTIONS.filter((question) => question.topic === topic.id);
      expect(catalog.length).toBeGreaterThan(0);
      expect(catalog.every((question) => question.subject === topic.subject && topic.skills.includes(question.skill) && question.board === topic.board && question.grades.every((grade) => topic.grades.includes(grade)))).toBe(true);
      expect(catalog.every((question) => question.choices?.includes(String(question.correctAnswer)))).toBe(true);
    }
  });
});

describe("offline question answer validation", () => {
  test.each([
    ["-4", "-4", true], ["0.75", "3/4", true], ["-3/4", "-0.75", true],
    ["2.5", "2.50", true], ["1/0", "1/0", false], ["1e3", "1000", false],
    ["5", "4", false], ["", "0", false], ["12", "1,2", false], ["4", "2+2", true], ["8", "2*(3+1)", true], ["8", "2**3", false],
    ["9", "1/0", false], [".5", "1/2", true], ["-.5", "-1/2", true],
  ])("compares numeric answers safely: %s vs %s", (expected, actual, result) => {
    const question = { ...QUESTIONS[0], answerType: "number" as const, correctAnswer: expected };
    expect(validateAnswer(question, actual).correct).toBe(result);
  });

  it("validates every authored correct answer against its own question", () => {
    for (const question of QUESTIONS) {
      expect(validateAnswer(question, String(question.correctAnswer)).correct).toBe(true);
    }
  });

  it("supports exact multiple-choice sets and case-insensitive text", () => {
    const multi = { ...QUESTIONS[0], answerType: "multiple-choice" as const, correctAnswer: ["A", "C"] };
    expect(validateAnswer(multi, ["C", "A"]).correct).toBe(true);
    expect(validateAnswer(multi, ["A"]).correct).toBe(false);
    const text = { ...QUESTIONS[0], answerType: "true-false" as const, correctAnswer: "True" };
    expect(validateAnswer(text, " true ").correct).toBe(true);
  });

  it("selects grade, board and topic-matched questions without repeating in a sequence", () => {
    const first = selectQuestion("physics-motion", 9, "CBSE", 1);
    expect(first?.subject).toBe("physics");
    expect(first?.topic).toBe("physics-motion");
    expect(first?.grades).toContain(9);
    expect(selectQuestion("physics-motion", 8, "CBSE", 1)).toBeNull();
    expect(selectQuestion("physics-motion", 9, "ICSE", 1)).toBeNull();
    const next = selectQuestion("physics-motion", 9, "CBSE", 1, [first!.id]);
    expect(next).not.toBeNull();
    expect(next?.id).not.toBe(first?.id);
    const last = selectQuestion("physics-motion", 9, "CBSE", 1, [first!.id, next!.id]);
    expect(last?.id).not.toBe(first?.id);
    expect(selectQuestion("physics-motion", 9, "CBSE", 1, [first!.id, next!.id, last!.id])).toBeNull();
    expect(questionsFor("bio-cell", 9, "CBSE").every((question) => question.subject === "biology")).toBe(true);
    expect(selectQuestion("math-integers", 6, "", 1, [], undefined, ["int-01"])?.id).not.toBe("int-01");
  });

  it.each([
    ["math-integers", "integer-subtraction", 6, "general", "mathematics"],
    ["math-fractions", "fraction-equivalence", 6, "general", "mathematics"],
    ["math-linear-equations", "one-step-equations", 7, "general", "mathematics"],
    ["math-ratios", "ratios", 7, "general", "mathematics"],
    ["physics-motion", "distance-time", 9, "CBSE", "physics"],
    ["chem-atoms", "molecular-mass", 9, "CBSE", "chemistry"],
    ["english-agreement", "verb-agreement", 6, "general", "english"],
    ["english-parts", "parts-of-speech", 6, "general", "english"],
  ] as const)("generates validated higher-level variations for %s / %s", (topic, skill, grade, board, subject) => {
    const item = selectQuestion(topic, grade, board, 3, [], skill);
    expect(item).not.toBeNull();
    expect(item?.difficulty).toBe(3);
    expect(item?.requestedDifficulty).toBe(3);
    expect(item?.subject).toBe(subject);
    expect(validateAnswer(item!, String(item!.correctAnswer)).correct).toBe(true);
  });

  it("produces stable unique variants and does not repeat within a sequence", () => {
    const first = generateQuestionVariation("math-ratios", "ratios", 7, "general", 3, 1)!;
    const same = generateQuestionVariation("math-ratios", "ratios", 7, "general", 3, 1)!;
    const second = selectQuestion("math-ratios", 7, "general", 3, [first.id], "ratios")!;
    expect(first.prompt).toBe(same.prompt);
    expect(first.correctAnswer).toBe(same.correctAnswer);
    expect(second.id).not.toBe(first.id);
    expect(second.prompt).not.toBe(first.prompt);
    expect(generateQuestionVariation("math-ratios", "ratios", 7, "general", 3, 10_001)).toBeNull();
  });

  it("delivers the requested higher challenge after per-skill mastery advances", () => {
    let mastery: SkillMastery | null = null;
    for (let i = 0; i < 3; i += 1) mastery = updateMastery(mastery, true, false);
    expect(mastery?.difficulty).toBe(2);
    const delivered = selectQuestion("math-integers", 6, "general", mastery!.difficulty, [], "integer-subtraction");
    expect(delivered?.requestedDifficulty).toBe(2);
    expect(delivered?.difficulty).toBe(2);
    expect(delivered?.id).toMatch(/^generated-v1:/);
  });
});

describe("transparent skill adaptation", () => {
  it("starts at level one and requires a run of three unhinted correct answers to rise once", () => {
    let mastery: SkillMastery | null = null;
    mastery = updateMastery(mastery, true, false);
    expect(mastery.difficulty).toBe(1);
    mastery = updateMastery(mastery, true, false);
    expect(mastery.difficulty).toBe(1);
    mastery = updateMastery(mastery, true, false);
    expect(mastery.difficulty).toBe(2);
  });

  it("reduces one level only after two consecutive incorrect answers", () => {
    let mastery: SkillMastery = { ...updateMastery(null, true, false), difficulty: 3, streak: 0 };
    mastery = updateMastery(mastery, false, false);
    expect(mastery.difficulty).toBe(3);
    mastery = updateMastery(mastery, false, false);
    expect(mastery.difficulty).toBe(2);
  });

  it("starts a fresh correct streak immediately after a mistake", () => {
    let mastery: SkillMastery = { ...updateMastery(null, false, false), difficulty: 2 };
    mastery = updateMastery(mastery, true, false);
    expect(mastery.streak).toBe(1);
    mastery = updateMastery(mastery, true, false);
    mastery = updateMastery(mastery, true, false);
    expect(mastery.difficulty).toBe(3);
  });

  it("counts hints as partial mastery evidence and prevents promotion", () => {
    let mastery = updateMastery(null, true, true);
    mastery = updateMastery(mastery, true, true);
    mastery = updateMastery(mastery, true, true);
    expect(mastery.mastery).toBe(50);
    expect(mastery.difficulty).toBe(1);
    expect(mastery.confidence).toBeGreaterThan(0);
  });

  it("does not subtract mastery credit for an incorrect hinted attempt", () => {
    const mastery = updateMastery(null, false, true);
    expect(mastery.hinted).toBe(1);
    expect(mastery.hintedCorrect).toBe(0);
    expect(mastery.mastery).toBe(0);
  });

  it("keeps skill mastery separate and limits confidence for sparse evidence", () => {
    const fractions = updateMastery(null, true, false);
    const algebra = updateMastery(null, false, false);
    const profile = { ...EMPTY_PROGRESS, skills: { fractions, algebra } };
    expect(profile.skills.fractions.mastery).toBe(100);
    expect(profile.skills.algebra.mastery).toBe(0);
    expect(profile.skills.fractions.confidence).toBeLessThan(100);
  });

  it("namespaces a skill's mastery by subject and topic", () => {
    expect(masteryKey("physics", "motion", "speed")).not.toBe(masteryKey("mathematics", "ratios", "speed"));
    expect(masteryKey("physics", "motion", "speed")).not.toBe(masteryKey("physics", "force", "speed"));
  });
});
