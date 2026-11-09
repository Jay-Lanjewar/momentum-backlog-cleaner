export type ChallengeSubject =
  | "mathematics"
  | "physics"
  | "chemistry"
  | "biology"
  | "english"
  | "history"
  | "geography"
  | "civics"
  | "economics"
  | "computer-science"
  | "other-language";

export type Difficulty = 1 | 2 | 3;
export type AnswerType = "single-choice" | "true-false" | "multiple-choice" | "number" | "text";

export interface ChallengeQuestion {
  id: string;
  version: number;
  grades: number[];
  board: string;
  subject: ChallengeSubject;
  topic: string;
  skill: string;
  /** Difficulty requested by the student model; difficulty is what was delivered. */
  requestedDifficulty?: Difficulty;
  difficulty: Difficulty;
  prompt: string;
  answerType: AnswerType;
  choices?: string[];
  correctAnswer: string | number | string[];
  hint?: string;
  explanation: string;
}

export interface CurriculumTopic {
  id: string;
  label: string;
  subject: ChallengeSubject;
  grades: number[];
  board: string;
  skills: string[];
}

export interface ChallengeContext {
  grade: number | null;
  board: string | null;
  subject: ChallengeSubject | null;
  topic: string | null;
  confidence: "high" | "medium" | "low";
}

export interface SkillMastery {
  attempts: number;
  correct: number;
  hinted: number;
  hintedCorrect: number;
  streak: number;
  difficulty: Difficulty;
  mastery: number;
  confidence: number;
  recentOutcomes: number[];
  lastAttemptAt: string;
}

export interface ChallengeProgress {
  version: 2;
  skills: Record<string, SkillMastery>;
  recentQuestionIds: string[];
}

export interface AnswerResult {
  correct: boolean;
  normalizedAnswer: string;
}
