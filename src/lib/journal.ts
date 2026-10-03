export type Place = "field" | "pond" | "lamplight" | "grove";
export type Mood = "quiet" | "bright" | "cloudy" | "heavy";
export type Keepsake = "bird" | "flower" | "light";

export interface JournalEntry {
  id: string;
  text: string;
  mood: Mood;
  form: Keepsake;
  place: Place;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export const PLACES: { id: Place; label: string; line: string }[] = [
  { id: "field", label: "旷野", line: "风经过这里，什么也不催促。" },
  { id: "pond", label: "池畔", line: "坐一会儿，等水面慢慢平静。" },
  { id: "lamplight", label: "暮灯", line: "天色晚了，还有一盏灯等你。" },
  { id: "grove", label: "竹径", line: "再往前走一段，听竹叶轻响。" },
];
export const MOODS: { id: Mood; label: string; color: string }[] = [
  { id: "quiet", label: "平静", color: "#78837c" },
  { id: "bright", label: "晴朗", color: "#b19762" },
  { id: "cloudy", label: "阴天", color: "#818d9c" },
  { id: "heavy", label: "有点累", color: "#9d807f" },
];
export const FORMS: { id: Keepsake; label: string }[] = [
  { id: "bird", label: "一只鸟" },
  { id: "flower", label: "一簇花" },
  { id: "light", label: "一盏灯" },
];
export const JOURNAL_KEY = "silent-island.journal.v1";
export const DRAFT_KEY = "silent-island.draft.v1";
export const MAX_TEXT = 280;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function parseJournal(value: unknown): JournalEntry[] {
  if (!isObject(value) || value.version !== 1 || !Array.isArray(value.entries)) {
    throw new Error("这不是孤岛手记的备份文件。");
  }
  if (value.entries.length > 5000) throw new Error("手记数量超过了导入上限。");
  const ids = new Set<string>();
  return value.entries.map((entry: unknown) => {
    if (!isObject(entry) || typeof entry.id !== "string" || !entry.id || entry.id.length > 100 ||
      ids.has(entry.id) || typeof entry.text !== "string" || !entry.text.trim() ||
      entry.text.length > MAX_TEXT || !MOODS.some((m) => m.id === entry.mood) ||
      !FORMS.some((f) => f.id === entry.form) || !PLACES.some((p) => p.id === entry.place) ||
      typeof entry.createdAt !== "string" || !Number.isFinite(Date.parse(entry.createdAt)) ||
      typeof entry.updatedAt !== "string" || !Number.isFinite(Date.parse(entry.updatedAt)) ||
      (entry.deletedAt !== undefined && (typeof entry.deletedAt !== "string" || !Number.isFinite(Date.parse(entry.deletedAt))))) {
      throw new Error("备份里的手记格式不完整，未改动现有内容。");
    }
    ids.add(entry.id);
    return {
      id: entry.id, text: entry.text, mood: entry.mood as Mood, form: entry.form as Keepsake,
      place: entry.place as Place, createdAt: entry.createdAt, updatedAt: entry.updatedAt,
      ...(entry.deletedAt ? { deletedAt: entry.deletedAt as string } : {}),
    };
  });
}

export function serializeJournal(entries: JournalEntry[]): string {
  return JSON.stringify({ version: 1, entries }, null, 2);
}

export function mergeJournal(current: JournalEntry[], incoming: JournalEntry[]): JournalEntry[] {
  const merged = new Map(current.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    const previous = merged.get(entry.id);
    if (!previous || Date.parse(entry.updatedAt) > Date.parse(previous.updatedAt)) merged.set(entry.id, entry);
  }
  return [...merged.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function shortDate(date: string): string {
  return new Date(date).toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}
