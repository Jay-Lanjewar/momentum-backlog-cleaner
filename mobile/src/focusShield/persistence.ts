import { EMPTY_PROGRESS } from "./adaptive";
import type { ChallengeProgress } from "./types";

const KEY_PREFIX = "momentum.focus-shield.v2.";

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

function keyFor(userId: string): string {
  return `${KEY_PREFIX}${encodeURIComponent(userId)}`;
}

function isProgress(value: unknown): value is ChallengeProgress {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ChallengeProgress>;
  if (item.version !== 2 || !item.skills || typeof item.skills !== "object" || Array.isArray(item.skills) || !Array.isArray(item.recentQuestionIds)) return false;
  if (Object.keys(item.skills).length > 500 || Object.keys(item.skills).some((key) => key.length > 200)) return false;
  if (item.recentQuestionIds.length > 30 || !item.recentQuestionIds.every((id) => typeof id === "string" && id.length <= 100)) return false;
  return Object.values(item.skills).every((raw) => {
    if (!raw || typeof raw !== "object") return false;
    const skill = raw as Partial<ChallengeProgress["skills"][string]>;
    return Number.isInteger(skill.attempts) && skill.attempts! >= 0
      && Number.isInteger(skill.correct) && skill.correct! >= 0 && skill.correct! <= skill.attempts!
      && Number.isInteger(skill.hinted) && skill.hinted! >= 0 && skill.hinted! <= skill.attempts!
      && Number.isInteger(skill.hintedCorrect) && skill.hintedCorrect! >= 0 && skill.hintedCorrect! <= skill.hinted! && skill.hintedCorrect! <= skill.correct!
      && Number.isInteger(skill.streak) && skill.streak! >= -1 && skill.streak! <= 2
      && (skill.difficulty === 1 || skill.difficulty === 2 || skill.difficulty === 3)
      && Number.isFinite(skill.mastery) && skill.mastery! >= 0 && skill.mastery! <= 100
      && Number.isFinite(skill.confidence) && skill.confidence! >= 0 && skill.confidence! <= 100
      && Array.isArray(skill.recentOutcomes) && skill.recentOutcomes.length <= 8
      && skill.recentOutcomes.every((outcome) => outcome === 0 || outcome === 0.5 || outcome === 1)
      && typeof skill.lastAttemptAt === "string" && skill.lastAttemptAt.length <= 40;
  });
}

export function loadProgress(userId: string): ChallengeProgress {
  const target = storage();
  if (!target || !userId) return EMPTY_PROGRESS;
  try {
    const raw = target.getItem(keyFor(userId));
    if (!raw || raw.length > 128_000) return EMPTY_PROGRESS;
    const parsed: unknown = JSON.parse(raw);
    return isProgress(parsed) ? parsed : EMPTY_PROGRESS;
  } catch {
    return EMPTY_PROGRESS;
  }
}

export function saveProgress(userId: string, progress: ChallengeProgress): boolean {
  const target = storage();
  if (!target || !userId) return false;
  try {
    if (!isProgress(progress)) return false;
    target.setItem(keyFor(userId), JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

export function clearProgress(userId: string): void {
  const target = storage();
  if (!target || !userId) return;
  try { target.removeItem(keyFor(userId)); } catch { /* local progress remains recoverable on next successful write */ }
}
