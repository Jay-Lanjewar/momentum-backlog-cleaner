// Backlog text parser — mirrors web behaviour exactly.
// Supports blank-line-separated groups, dash-separated groups, and single-group fallback.

interface ParsedGroup {
  subject: string;
  items: string[];
}

export function parseBacklogInput(text: string): ParsedGroup[] {
  if (!text.trim()) return [];

  const lines = text.split("\n");
  const groups: string[][] = [];
  let current: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "") {
      if (current.length > 0) {
        groups.push(current);
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) groups.push(current);

  // Strategy 1: blank-line-separated groups
  if (groups.length > 1 && groups.every((g) => g.length >= 1)) {
    return groups.map((g) => ({
      subject: g[0],
      items: g.slice(1),
    }));
  }

  // Strategy 2: dash-separated
  const allDash = lines.filter((l) => l.trim()).every((l) => l.includes("-"));
  if (allDash) {
    const map = new Map<string, string[]>();
    for (const line of lines) {
      const idx = line.indexOf("-");
      const subject = line.slice(0, idx).trim();
      const item = line.slice(idx + 1).trim();
      if (subject && item) {
        const existing = map.get(subject) ?? [];
        existing.push(item);
        map.set(subject, existing);
      }
    }
    if (map.size > 0) {
      return Array.from(map.entries()).map(([subject, items]) => ({
        subject,
        items,
      }));
    }
  }

  // Strategy 3: catch-all
  const nonEmpty = lines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (nonEmpty.length > 0) {
    return [{ subject: "General", items: nonEmpty }];
  }

  return [];
}

export function getTotalTopics(parsed: ParsedGroup[]): number {
  return parsed.reduce((sum, g) => sum + g.items.length, 0);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function passwordStrength(pw: string): { label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { label: "Weak", color: "#EF4444" };
  if (score === 2) return { label: "Fair", color: "#F97316" };
  if (score === 3) return { label: "Good", color: "#22C55E" };
  return { label: "Strong", color: "#10B981" };
}

export const COURSE_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#ef4444", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6b7280",
];
