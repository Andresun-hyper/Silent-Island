import test from "node:test";
import assert from "node:assert/strict";
import { parseJournal, serializeJournal, mergeJournal, MAX_TEXT } from "../src/lib/journal.ts";

const entry = (id = "one", overrides = {}) => ({ id, text: "A quiet day", mood: "quiet", form: "bird", place: "field", createdAt: "2026-10-02T12:00:00Z", updatedAt: "2026-10-02T12:00:00Z", ...overrides });
const parse = (entries) => parseJournal({ version: 1, entries });

test("backup round-trips text, mood, form and recoverable deletion", () => {
  const entries = [entry(), entry("two", { deletedAt: "2026-10-02T13:00:00Z" })];
  assert.deepEqual(parseJournal(JSON.parse(serializeJournal(entries))), entries);
});
test("rejects unknown versions and invalid records before import", () => {
  for (const value of [null, [], {}, { version: 2, entries: [] }]) assert.throws(() => parseJournal(value));
  for (const change of [{ text: " " }, { text: "x".repeat(MAX_TEXT + 1) }, { mood: "bad" }, { form: "bad" }, { place: "bad" }, { createdAt: "oops" }, { updatedAt: null }, { deletedAt: "oops" }, { id: "" }]) assert.throws(() => parse([entry("one", change)]));
  assert.throws(() => parse([entry(), entry()]));
});
test("preserves separate records and the newest copy during merging", () => {
  const newer = entry("one", { text: "Updated", updatedAt: "2026-10-02T14:00:00Z" });
  const result = mergeJournal([newer, entry("two")], [entry(), entry("three")]);
  assert.equal(result.length, 3);
  assert.equal(result.find((e) => e.id === "one").text, "Updated");
});
test("older backups cannot resurrect a trashed record; newer restore can", () => {
  const trashed = entry("one", { deletedAt: "2026-10-02T14:00:00Z", updatedAt: "2026-10-02T14:00:00Z" });
  assert.ok(mergeJournal([trashed], [entry()])[0].deletedAt);
  const restored = entry("one", { updatedAt: "2026-10-02T15:00:00Z" });
  assert.equal(mergeJournal([trashed], [restored])[0].deletedAt, undefined);
});
test("bounds import volume and strips unexpected payload fields", () => {
  assert.throws(() => parse(Array.from({ length: 5001 }, (_, i) => entry(`${i}`))));
  assert.deepEqual(parse([entry("one", { unexpected: "ignored" })]), [entry()]);
});
