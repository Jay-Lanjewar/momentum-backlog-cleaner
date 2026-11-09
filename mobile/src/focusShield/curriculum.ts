import type { ChallengeSubject, CurriculumTopic } from "./types";

/** Deliberately narrow MVP. "general" means foundational practice, not board alignment. */
export const CURRICULUM: readonly CurriculumTopic[] = [
  { id: "math-integers", label: "Integers", subject: "mathematics", grades: [6, 7, 8], board: "general", skills: ["integer-addition", "integer-subtraction"] },
  { id: "math-fractions", label: "Fractions", subject: "mathematics", grades: [6, 7, 8], board: "general", skills: ["fraction-equivalence", "fraction-addition"] },
  { id: "math-linear-equations", label: "Linear equations", subject: "mathematics", grades: [7, 8, 9], board: "general", skills: ["one-step-equations", "two-step-equations"] },
  { id: "math-ratios", label: "Ratios and percentages", subject: "mathematics", grades: [7, 8, 9], board: "general", skills: ["ratios", "percentages"] },
  { id: "physics-motion", label: "Motion", subject: "physics", grades: [9], board: "CBSE", skills: ["speed", "distance-time"] },
  { id: "physics-force", label: "Force and motion", subject: "physics", grades: [9], board: "CBSE", skills: ["force-mass-acceleration"] },
  { id: "chem-atoms", label: "Atoms and molecules", subject: "chemistry", grades: [9], board: "CBSE", skills: ["chemical-formulae", "molecular-mass"] },
  { id: "bio-cell", label: "Cells", subject: "biology", grades: [9], board: "CBSE", skills: ["cell-structures"] },
  { id: "english-agreement", label: "Subject–verb agreement", subject: "english", grades: [6, 7, 8, 9, 10], board: "general", skills: ["verb-agreement"] },
  { id: "english-parts", label: "Parts of speech", subject: "english", grades: [6, 7, 8, 9, 10], board: "general", skills: ["parts-of-speech"] },
];

export const SUBJECT_LABELS: Record<ChallengeSubject, string> = {
  mathematics: "Mathematics", physics: "Physics", chemistry: "Chemistry", biology: "Biology",
  english: "English", history: "History", geography: "Geography", civics: "Civics",
  economics: "Economics", "computer-science": "Computer Science", "other-language": "Other language",
};

export function parseGrade(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = value.trim().toLowerCase();
  const match = text.match(/(?:class|grade|standard|std\.?|^)(?:\s*)(10|[1-9])(?:st|nd|rd|th)?\b/);
  if (match) return Number(match[1]);
  const roman: Record<string, number> = { vi: 6, vii: 7, viii: 8, ix: 9, x: 10 };
  const romanMatch = text.match(/\b(vi{0,3}|ix|x)\b/);
  return romanMatch ? roman[romanMatch[1]] ?? null : null;
}

export function normalizeBoard(board: string | null | undefined): string | null {
  if (!board?.trim()) return null;
  return /\bcbse\b|central board of secondary education/i.test(board) ? "CBSE" : board.trim();
}

export function topicsFor(grade: number | null, board: string | null, subject: ChallengeSubject): CurriculumTopic[] {
  if (grade === null) return [];
  return CURRICULUM.filter((entry) => entry.subject === subject && entry.grades.includes(grade) && (entry.board === "general" || entry.board === board));
}

export function supportedSubjects(grade: number | null, board: string | null): ChallengeSubject[] {
  const subjects = new Set(topicsFor(grade, board, "mathematics").map((x) => x.subject));
  for (const entry of CURRICULUM) {
    if (grade !== null && entry.grades.includes(grade) && (entry.board === "general" || entry.board === board)) subjects.add(entry.subject);
  }
  return [...subjects];
}

export function inferSubject(courseName: string | null | undefined): ChallengeSubject | null {
  if (!courseName) return null;
  const text = courseName.toLowerCase();
  const matches: [RegExp, ChallengeSubject][] = [
    [/math|algebra|geometry|arithmetic/, "mathematics"], [/physics/, "physics"], [/chemistry/, "chemistry"],
    [/biology|life science/, "biology"], [/english|grammar|literature/, "english"], [/history/, "history"],
    [/geography/, "geography"], [/civics|political science/, "civics"], [/economics/, "economics"],
    [/computer|programming|coding/, "computer-science"],
  ];
  const found = matches.filter(([pattern]) => pattern.test(text)).map(([, subject]) => subject);
  return found.length === 1 ? found[0] : null;
}

export function inferTopic(text: string | null | undefined, subject: ChallengeSubject): string | null {
  if (!text) return null;
  const value = text.toLowerCase();
  const candidates = topicsFor(10, "CBSE", subject).concat(
    CURRICULUM.filter((entry) => entry.subject === subject && entry.board === "general"),
    CURRICULUM.filter((entry) => entry.subject === subject && entry.board === "CBSE"),
  );
  const unique = [...new Map(candidates.map((entry) => [entry.id, entry])).values()];
  const aliases: Record<string, string[]> = {
    "math-integers": ["integer", "integers", "negative number"], "math-fractions": ["fraction", "fractions"],
    "math-linear-equations": ["linear equation", "equation", "algebra"], "math-ratios": ["ratio", "percentage", "percent"],
    "physics-motion": ["motion", "speed", "velocity", "distance-time"], "physics-force": ["force", "newton", "acceleration"],
    "chem-atoms": ["atom", "molecule", "chemical formula", "molar mass", "molecular mass"],
    "bio-cell": ["cell", "organelles", "mitochondria", "nucleus"],
    "english-agreement": ["subject verb", "verb agreement", "agreement"], "english-parts": ["parts of speech", "noun", "verb", "adjective", "adverb"],
  };
  return unique.find((entry) => (aliases[entry.id] ?? []).some((alias) => value.includes(alias)))?.id ?? null;
}
