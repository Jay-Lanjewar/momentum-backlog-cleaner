import { parseBacklogInput, COURSE_COLORS } from "./onboarding";

export interface TaskDraft {
  id: string;
  title: string;
  priority: number;
  estimated_minutes: number | null;
  due_date: string | null;
  description: string | null;
}

export interface CourseDraft {
  subject: string;
  subjectUncertain: boolean;
  sourceText: string;
  tasks: TaskDraft[];
}

export interface OnboardingCoursePayload {
  name: string;
  color: string;
}

export interface OnboardingBacklogPayload {
  title: string;
  course_index: number;
  priority: number;
  estimated_minutes: number | null;
  due_date?: string;
  description?: string;
}

export interface DraftsPayload {
  courses: OnboardingCoursePayload[];
  backlog: OnboardingBacklogPayload[];
}

export const DEFAULT_SUBJECT = "General";

const DEFAULT_PRIORITY = 3;
const MIN_ESTIMATED_MINUTES = 5;
const MAX_ESTIMATED_MINUTES = 1440;
const TITLE_MAX_LENGTH = 255;
const CATCH_ALL_SUBJECT = "General";

const SUBJECT_BY_KEY: Record<string, string> = {
  mathematics: "Mathematics",
  "political science": "Political Science",
  "computer science": "Computer Science",
  accountancy: "Accountancy",
  chemistry: "Chemistry",
  geography: "Geography",
  economics: "Economics",
  sociology: "Sociology",
  psychology: "Psychology",
  commerce: "Commerce",
  english: "English",
  french: "French",
  spanish: "Spanish",
  german: "German",
  history: "History",
  physics: "Physics",
  biology: "Biology",
  science: "Science",
  hindi: "Hindi",
  maths: "Maths",
  music: "Music",
  math: "Math",
  art: "Art",
  cs: "CS",
};

const SUBJECT_KEYS = Object.keys(SUBJECT_BY_KEY).sort(
  (a, b) => b.length - a.length,
);

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tues: 2,
  tue: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thurs: 4,
  thur: 4,
  thu: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const QUANTITY_PATTERN =
  /\b\d{1,3}\s+(?:questions?|pages?|chapters?|exercises?|problems?|worksheets?|sheets?|articles?|paragraphs?|lines?|topics?|sections?|videos?|cards?|notes?|items?)\b/gi;

let taskCounter = 0;

function nextTaskId(): string {
  taskCounter += 1;
  return `t${taskCounter}`;
}

export function createTaskDraft(title = ""): TaskDraft {
  return {
    id: nextTaskId(),
    title,
    priority: DEFAULT_PRIORITY,
    estimated_minutes: null,
    due_date: null,
    description: null,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(year: number, month: number, day: number): string | null {
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

function localDateKey(date: Date): string {
  return dateKey(date.getFullYear(), date.getMonth() + 1, date.getDate()) ?? "";
}

function weekdayKey(index: number, now: Date): string {
  const daysAhead = (index - now.getDay() + 7) % 7;
  return localDateKey(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead),
  );
}

function isWordBoundary(line: string, index: number): boolean {
  if (index >= line.length) return true;
  return !/[a-z0-9]/i.test(line[index]);
}

function canonicalSubject(value: string): string | null {
  return SUBJECT_BY_KEY[value.trim().toLowerCase()] ?? null;
}

function removeAt(text: string, index: number, length: number): string {
  return `${text.slice(0, index)} ${text.slice(index + length)}`;
}

function removeDated(text: string, index: number, length: number): string {
  const connector = /\b(?:due|by|on)\s*$/i.exec(text.slice(0, index));
  if (connector) {
    return `${text.slice(0, connector.index)} ${text.slice(index + length)}`;
  }
  return removeAt(text, index, length);
}

function tidy(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/^[\s:;\-–,]+/, "")
    .replace(/[\s:;\-–,]+$/, "")
    .trim();
}

function detectSubject(
  line: string,
): { subject: string; rest: string } | null {
  const separator = /^([A-Za-z][A-Za-z&' ]{0,40}?)(?::|\s+-\s+)\s*(.+)$/.exec(
    line,
  );
  if (separator) {
    const subject = canonicalSubject(separator[1]);
    if (subject) {
      return { subject, rest: separator[2].trim() };
    }
  }
  const lower = line.toLowerCase();
  for (const key of SUBJECT_KEYS) {
    if (lower.startsWith(key) && isWordBoundary(line, key.length)) {
      const rest = line.slice(key.length).trim();
      if (rest) {
        return { subject: SUBJECT_BY_KEY[key], rest };
      }
      return null;
    }
  }
  return null;
}

function extractDue(text: string): { dueDate: string; rest: string } | null {
  const iso = /\b\d{4}-\d{2}-\d{2}\b/.exec(text);
  if (iso) {
    const [year, month, day] = iso[0].split("-").map(Number);
    if (dateKey(year, month, day)) {
      return {
        dueDate: iso[0],
        rest: removeDated(text, iso.index, iso[0].length),
      };
    }
  }

  const slash = /\b\d{1,2}\/\d{1,2}\b/.exec(text);
  if (slash) {
    const [first, second] = slash[0].split("/").map(Number);
    if (first > 12 && second >= 1 && second <= 12) {
      const key = dateKey(new Date().getFullYear(), second, first);
      if (key) {
        return {
          dueDate: key,
          rest: removeDated(text, slash.index, slash[0].length),
        };
      }
    }
  }

  const dayWord = /\b(?:by\s+|due\s+|due\s+on\s+)?(today|tomorrow)\b/i.exec(text);
  if (dayWord) {
    const now = new Date();
    const dueDate =
      dayWord[1].toLowerCase() === "tomorrow"
        ? localDateKey(
            new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
          )
        : localDateKey(now);
    if (dueDate) {
      return { dueDate, rest: removeAt(text, dayWord.index, dayWord[0].length) };
    }
  }

  const weekday =
    /\b(?:by|due)(?:\s+on)?\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thurs?|thu|fri|sat)\b/i.exec(
      text,
    );
  if (weekday) {
    const index = WEEKDAY_INDEX[weekday[1].toLowerCase()];
    if (index !== undefined) {
      const dueDate = weekdayKey(index, new Date());
      if (dueDate) {
        return {
          dueDate,
          rest: removeAt(text, weekday.index, weekday[0].length),
        };
      }
    }
  }

  return null;
}

function extractDuration(
  text: string,
): { minutes: number; rest: string } | null {
  const patterns: { source: string; factor: number }[] = [
    { source: "\\b(\\d{1,3})\\s*(?:mins?|minutes?|m)\\b", factor: 1 },
    { source: "\\b(\\d{1,2})\\s*(?:h|hrs?|hours?)\\b", factor: 60 },
  ];
  let best: { index: number; length: number; minutes: number } | null = null;
  for (const pattern of patterns) {
    const match = new RegExp(pattern.source, "i").exec(text);
    if (!match) continue;
    const minutes = Number(match[1]) * pattern.factor;
    if (minutes < MIN_ESTIMATED_MINUTES || minutes > MAX_ESTIMATED_MINUTES) {
      continue;
    }
    if (!best || match.index < best.index) {
      best = { index: match.index, length: match[0].length, minutes };
    }
  }
  if (!best) return null;
  return {
    minutes: best.minutes,
    rest: removeAt(text, best.index, best.length),
  };
}

function extractQuantity(
  text: string,
): { notes: string; rest: string } | null {
  const pattern = new RegExp(QUANTITY_PATTERN.source, "gi");
  const hits: { index: number; length: number; value: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    hits.push({
      index: match.index,
      length: match[0].length,
      value: match[0].trim(),
    });
  }
  if (hits.length === 0) return null;
  let rest = text;
  for (let i = hits.length - 1; i >= 0; i--) {
    rest = removeAt(rest, hits[i].index, hits[i].length);
  }
  return { notes: hits.map((hit) => hit.value).join(", "), rest };
}

function interpretLine(
  raw: string,
): { subject: string | null; task: TaskDraft } {
  const source = raw.trim();
  let text = source;
  let priority = DEFAULT_PRIORITY;

  const urgent = /\burgent\b/i.exec(text);
  if (urgent) {
    priority = 1;
    text = `${text.slice(0, urgent.index)} ${text.slice(
      urgent.index + urgent[0].length,
    )}`;
  }
  const bang = /^!\s*/.exec(text);
  if (bang) {
    priority = 1;
    text = text.slice(bang[0].length);
  }

  let subject: string | null = null;
  const detected = detectSubject(text);
  if (detected) {
    subject = detected.subject;
    text = detected.rest;
  }

  const due = extractDue(text);
  if (due) text = due.rest;

  const duration = extractDuration(text);
  if (duration) text = duration.rest;

  const quantity = extractQuantity(text);
  if (quantity) text = quantity.rest;

  return {
    subject,
    task: {
      id: nextTaskId(),
      title: tidy(text) || source,
      priority,
      estimated_minutes: duration?.minutes ?? null,
      due_date: due?.dueDate ?? null,
      description: quantity?.notes ?? null,
    },
  };
}

function buildDrafts(text: string): CourseDraft[] {
  const groups = parseBacklogInput(text);
  const drafts: CourseDraft[] = [];

  const pushTask = (subject: string, uncertain: boolean, task: TaskDraft) => {
    const key = subject.trim().toLowerCase();
    const existing = drafts.find(
      (draft) => draft.subject.trim().toLowerCase() === key,
    );
    if (existing) {
      existing.tasks.push(task);
      if (!uncertain && existing.subjectUncertain) {
        existing.subject = subject;
        existing.subjectUncertain = false;
      }
      return;
    }
    drafts.push({
      subject,
      subjectUncertain: uncertain,
      sourceText: text,
      tasks: [task],
    });
  };

  for (const group of groups) {
    const catchAll = group.subject === CATCH_ALL_SUBJECT;
    let headerSubject: string | null = null;
    for (let i = 0; i < group.items.length; i++) {
      const raw = group.items[i];
      if (catchAll) {
        const exact = SUBJECT_BY_KEY[raw.trim().toLowerCase()];
        if (exact && i < group.items.length - 1) {
          headerSubject = exact;
          continue;
        }
      }
      const interpreted = interpretLine(raw);
      const subject =
        interpreted.subject ??
        (catchAll ? headerSubject : group.subject);
      pushTask(subject ?? "", subject === null, interpreted.task);
    }
  }

  return drafts;
}

export function interpretBacklogInput(
  text: string,
  prevDrafts?: CourseDraft[],
): CourseDraft[] {
  const fresh = buildDrafts(text);
  if (!prevDrafts || prevDrafts.length === 0) return fresh;
  if (prevDrafts[0].sourceText !== text) return fresh;
  return prevDrafts.map((course, index) => {
    const match = fresh[index];
    return match ? { ...match, ...course, sourceText: text } : course;
  });
}

export function countDraftTasks(drafts: CourseDraft[]): number {
  return drafts.reduce((total, course) => total + course.tasks.length, 0);
}

export function draftSubjectKey(subject: string): string {
  return subject.trim().toLowerCase() || DEFAULT_SUBJECT.toLowerCase();
}

export function draftsToPayload(drafts: CourseDraft[]): DraftsPayload {
  const courses: OnboardingCoursePayload[] = [];
  const indexByKey = new Map<string, number>();
  const backlog: OnboardingBacklogPayload[] = [];

  for (const course of drafts) {
    for (const task of course.tasks) {
      const name = course.subject.trim() || DEFAULT_SUBJECT;
      const key = draftSubjectKey(name);
      let courseIndex = indexByKey.get(key);
      if (courseIndex === undefined) {
        courseIndex = courses.length;
        indexByKey.set(key, courseIndex);
        courses.push({
          name,
          color: COURSE_COLORS[courseIndex % COURSE_COLORS.length],
        });
      }
      const title = task.title.trim().slice(0, TITLE_MAX_LENGTH);
      const entry: OnboardingBacklogPayload = {
        title,
        course_index: courseIndex,
        priority: task.priority,
        estimated_minutes: task.estimated_minutes,
      };
      if (task.due_date) entry.due_date = `${task.due_date}T00:00:00`;
      const description = task.description?.trim();
      if (description) entry.description = description;
      backlog.push(entry);
    }
  }

  return { courses, backlog };
}
