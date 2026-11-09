import { questionsFor } from "./questions";
import { generateQuestionVariation } from "./generators";
import type { ChallengeQuestion, ChallengeProgress, Difficulty, SkillMastery } from "./types";

export const EMPTY_PROGRESS: ChallengeProgress = { version: 2, skills: {}, recentQuestionIds: [] };

export function masteryFor(progress: ChallengeProgress, skill: string): SkillMastery | null {
  return progress.skills[skill] ?? null;
}

export function masteryKey(subject: string, topic: string, skill: string): string {
  return `${subject}.${topic}.${skill}`;
}

/**
 * Transparent per-skill rule: begin at level 1. Three consecutive correct
 * answers without hints raise one level; two consecutive incorrect answers
 * lower one level. Hinted correct answers count as half credit and break the
 * promotion streak. A single response never changes the level.
 * Mastery is the hint-weighted lifetime accuracy; confidence combines sample
 * size (up to eight observations) with consistency of the last eight outcomes.
 */
export function updateMastery(
  previous: SkillMastery | null,
  correct: boolean,
  hintUsed: boolean,
  now = new Date(),
): SkillMastery {
  const attempts = (previous?.attempts ?? 0) + 1;
  const correctCount = (previous?.correct ?? 0) + (correct ? 1 : 0);
  const hinted = (previous?.hinted ?? 0) + (hintUsed ? 1 : 0);
  const hintedCorrect = (previous?.hintedCorrect ?? 0) + (correct && hintUsed ? 1 : 0);
  let streak = correct && !hintUsed
    ? Math.max(previous?.streak ?? 0, 0) + 1
    : correct ? 0 : Math.min(previous?.streak ?? 0, 0) - 1;
  let difficulty: Difficulty = previous?.difficulty ?? 1;
  if (streak >= 3) {
    difficulty = Math.min(3, difficulty + 1) as Difficulty;
    streak = 0;
  } else if (streak <= -2) {
    difficulty = Math.max(1, difficulty - 1) as Difficulty;
    streak = 0;
  }
  const priorOutcomes = previous?.recentOutcomes ?? [];
  const outcome = correct ? (hintUsed ? 0.5 : 1) : 0;
  const recentOutcomes = [...priorOutcomes, outcome].slice(-8);
  const weightedCorrect = correctCount - hintedCorrect + hintedCorrect * 0.5;
  const mastery = Math.round((weightedCorrect / attempts) * 100);
  const mean = recentOutcomes.reduce((sum, value) => sum + value, 0) / recentOutcomes.length;
  const variance = recentOutcomes.reduce((sum, value) => sum + (value - mean) ** 2, 0) / recentOutcomes.length;
  const sampleConfidence = Math.min(attempts / 8, 1);
  const consistency = Math.max(0, 1 - Math.sqrt(variance));
  const confidence = Math.round(sampleConfidence * consistency * 100);
  return { attempts, correct: correctCount, hinted, hintedCorrect, streak, difficulty, mastery, confidence, recentOutcomes, lastAttemptAt: now.toISOString() };
}

export function selectQuestion(
  topic: string,
  grade: number,
  board: string,
  difficulty: Difficulty,
  excludedIds: readonly string[] = [],
  skill?: string,
  recentIds: readonly string[] = [],
): ChallengeQuestion | null {
  const excluded = new Set(excludedIds);
  const recent = new Set(recentIds);
  const eligible = questionsFor(topic, grade, board).filter((question) => !excluded.has(question.id) && (!skill || question.skill === skill));
  const exact = eligible.filter((question) => question.difficulty === difficulty && !excluded.has(question.id));
  const freshExact = exact.filter((question) => !recent.has(question.id)).sort((a, b) => a.id.localeCompare(b.id));
  if (freshExact.length) return { ...freshExact[0], requestedDifficulty: difficulty };

  // Prefer a new deterministic parameterized item over repeating a static
  // exact-level item. Variant IDs are stable and use the same de-duplication.
  const firstGenerated = generateQuestionVariation(topic, skill ?? "", grade, board, difficulty, 1);
  if (firstGenerated) {
    for (let variant = 1; variant <= 10_000; variant += 1) {
      const generated = variant === 1 ? firstGenerated : generateQuestionVariation(topic, skill ?? "", grade, board, difficulty, variant);
      if (generated && !excluded.has(generated.id) && !recent.has(generated.id)) return generated;
    }
  }

  const options = exact.length ? exact : eligible.filter((question) => !excluded.has(question.id));
  options.sort((a, b) => Math.abs(a.difficulty - difficulty) - Math.abs(b.difficulty - difficulty) || a.id.localeCompare(b.id));
  const delivered = options[0];
  return delivered ? { ...delivered, requestedDifficulty: difficulty } : null;
}

export function difficultyLabel(value: Difficulty): string {
  return value === 1 ? "Getting started" : value === 2 ? "Building confidence" : "Stretch";
}
