"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowLeft, Bird, BookOpen, Check, ChevronLeft, ChevronRight, Flower2, Lamp, Leaf, Moon, Pencil, RotateCcw, Search, Settings2, Trash2, Trees, Upload, Volume2, VolumeX, Waves, X } from "lucide-react";
import type { HealingMotif, HealingPhase } from "./ink-poles-canvas";
import { DRAFT_KEY, FORMS, JOURNAL_KEY, MAX_TEXT, MOODS, PLACES, mergeJournal, parseJournal, serializeJournal, shortDate } from "@/lib/journal";
import type { JournalEntry, Keepsake, Mood, Place } from "@/lib/journal";
import { clampProgress, placeAtProgress, ROUTE_STOPS } from "@/lib/island-route";
import { IslandAudio } from "@/lib/island-audio";

const InkPolesCanvas = dynamic(() => import("./ink-island-three"), { ssr: false });
const PLACE_ICONS = { field: Leaf, pond: Waves, lamplight: Moon, grove: Trees };
const FORM_ICONS = { bird: Bird, flower: Flower2, light: Lamp };
type Panel = "write" | "archive" | "read" | "settings" | null;
export type InkPolesChrome = "full" | "none";
export type InkPolesLayout = "fullscreen" | "inline";
export interface InkPolesWrapperProps {
  initialMotif?: HealingMotif;
  autoCycle?: boolean;
  chrome?: InkPolesChrome;
  layout?: InkPolesLayout;
  className?: string;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.hidden = true;
  try {
    document.body.appendChild(anchor);
    anchor.click();
    return url;
  } catch (cause) {
    URL.revokeObjectURL(url);
    throw cause;
  } finally {
    anchor.remove();
  }
}

function postcardLines(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const content = text.replace(/\s+/gu, " ").trim();
  const characters = typeof Intl.Segmenter === "function"
    ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(content), (part) => part.segment)
    : Array.from(content);
  const lines: string[] = [];
  let cursor = 0;
  for (let row = 0; row < maxLines && cursor < characters.length; row++) {
    const line: string[] = [];
    while (cursor < characters.length && ctx.measureText(line.join("") + characters[cursor]).width <= width) {
      line.push(characters[cursor++]);
    }
    if (row === maxLines - 1 && cursor < characters.length) {
      while (line.length && ctx.measureText(line.join("") + "…").width > width) line.pop();
      if (ctx.measureText("…").width <= width) line.push("…");
    }
    lines.push(line.join("").trim());
  }
  return lines;
}

function createPostcard(source: HTMLCanvasElement, quote: string, signature: string): HTMLCanvasElement {
  if (!source.width || !source.height) throw new Error("风景还未准备好，请稍后重试。");
  const scale = source.clientWidth > 0 ? source.width / source.clientWidth : Math.max(1, window.devicePixelRatio || 1);
  const width = source.width / scale;
  const padding = Math.min(24, width * .08);
  const textWidth = width - padding * 2;
  const bandHeight = 122;
  const postcard = document.createElement("canvas");
  postcard.width = source.width;
  postcard.height = source.height + Math.ceil(bandHeight * scale);
  const ctx = postcard.getContext("2d");
  if (!ctx) throw new Error("无法生成明信片，请稍后重试。");
  ctx.drawImage(source, 0, 0);
  ctx.fillStyle = "#e3e4e0";
  ctx.fillRect(0, source.height, postcard.width, postcard.height - source.height);
  // Keep the scenery's native pixels; draw the separate inscription band in CSS-pixel units.
  ctx.setTransform(scale, 0, 0, scale, 0, source.height);
  ctx.fillStyle = "rgba(49,45,39,.7)";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = '18px "KaiTi", "STKaiti", serif';
  postcardLines(ctx, quote, textWidth, 2).forEach((line, row) => ctx.fillText(line, width / 2, 20 + row * 27));
  ctx.font = "11px sans-serif";
  ctx.fillStyle = "rgba(49,45,39,.45)";
  const caption = postcardLines(ctx, signature, textWidth, 1)[0] ?? "";
  ctx.fillText(caption, width / 2, 86);
  return postcard;
}

export default function InkPolesWrapper({ initialMotif = "bird", autoCycle = true, chrome = "full", layout = "fullscreen", className }: InkPolesWrapperProps = {}) {
  const [phase, setPhase] = useState<HealingPhase>("entering");
  const [motif] = useState(initialMotif);
  const [sceneKey, setSceneKey] = useState(0);
  const [place, setPlace] = useState<Place>("field");
  const [progress, setProgress] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundBusy, setSoundBusy] = useState(false);
  const [volume, setVolume] = useState(.35);
  const [inkStrength, setInkStrength] = useState(.65);
  const audioRef = useRef<IslandAudio | null>(null);
  const pendingPlace = useRef<Place | null>(null);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string>();
  const [panel, setPanel] = useState<Panel>(null);
  const [paused, setPaused] = useState(false);
  const [tension, setTension] = useState(0);
  const [text, setText] = useState("");
  const [mood, setMood] = useState<Mood>("quiet");
  const [form, setForm] = useState<Keepsake>("bird");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [settledSearch, setSettledSearch] = useState("");
  const [searchComposing, setSearchComposing] = useState(false);
  const [moodFilter, setMoodFilter] = useState("all");
  const [showTrash, setShowTrash] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [today, setToday] = useState("");
  const [delivery, setDelivery] = useState<{ url: string; name: string } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const tensionRef = useRef(0);
  const tensionRafRef = useRef<number | null>(null);
  const mountedRef = useRef(false);
  const deliveryUrlRef = useRef<string | null>(null);
  const deliveryRequestRef = useRef(0);
  const saveLockRef = useRef(false);
  const lastExportRef = useRef(-Infinity);

  useEffect(() => {
    if (searchComposing) return;
    const timer = window.setTimeout(() => setSettledSearch(search), 200);
    return () => clearTimeout(timer);
  }, [search, searchComposing]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;
    const visibility = () => {
      const audio = audioRef.current;
      if (!audio) return;
      void audio.setHidden(document.hidden).then(() => {
        if (!active || audioRef.current !== audio) return;
        const state = audio.state;
        setSoundEnabled(state.enabled);
        if (state.lastError && !state.enabled) setError("声音未能恢复，请再点一次声音按钮重试。");
      });
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      active = false;
      mountedRef.current = false;
      deliveryRequestRef.current += 1;
      document.removeEventListener("visibilitychange", visibility);
      audioRef.current?.dispose(); audioRef.current = null;
      if (deliveryUrlRef.current) URL.revokeObjectURL(deliveryUrlRef.current);
      deliveryUrlRef.current = null;
      if (tensionRafRef.current !== null) cancelAnimationFrame(tensionRafRef.current);
    };
  }, []);
  useEffect(() => { audioRef.current?.setProgress(progress); }, [progress]);
  useEffect(() => { audioRef.current?.setVolume(volume); }, [volume]);

  const toggleSound = async () => {
    if (soundBusy) return;
    if (audioRef.current?.state.enabled) { audioRef.current.setEnabled(false); setSoundEnabled(audioRef.current.state.enabled); return; }
    setSoundBusy(true);
    const audio = audioRef.current ??= new IslandAudio();
    try {
      audio.setVolume(volume); audio.setProgress(progress);
      await audio.start();
      if (!mountedRef.current || audioRef.current !== audio) return;
      await audio.setHidden(document.hidden);
      if (!mountedRef.current || audioRef.current !== audio) return;
      setSoundEnabled(audio.state.enabled);
      setError(audio.state.lastError && !audio.state.enabled ? "声音暂时无法开启，请再点一次声音按钮重试。" : "");
    } catch {
      if (mountedRef.current && audioRef.current === audio) {
        setSoundEnabled(audio.state.enabled);
        setError("声音暂时无法开启，请再点一次声音按钮重试。");
      }
    } finally {
      if (mountedRef.current && audioRef.current === audio) setSoundBusy(false);
    }
  };
  const travel = useCallback((value: number) => {
    const next = clampProgress(value);
    setProgress(next); setPlace(placeAtProgress(next));
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setToday(shortDate(new Date().toISOString()));
      try {
        const saved = localStorage.getItem(JOURNAL_KEY);
        if (saved) setEntries(parseJournal(JSON.parse(saved)));
        setReady(true);
      } catch { setError("本地手记暂时无法读取。请先导出备份，勿清除浏览器数据。"); }
    });
    const sync = (event: StorageEvent) => {
      if (event.key !== JOURNAL_KEY) return;
      try { setEntries(event.newValue ? parseJournal(JSON.parse(event.newValue)) : []); }
      catch { setError("另一窗口的手记未能同步，请检查备份。"); }
    };
    window.addEventListener("storage", sync);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("storage", sync); if (tensionRafRef.current !== null) cancelAnimationFrame(tensionRafRef.current); };
  }, []);

  useEffect(() => {
    const timeout = phase === "entering" ? 4200 : phase === "revealing" ? 8600 : phase === "leaving" ? 1900 : 0;
    if (!timeout || paused || panel) return;
    const timer = window.setTimeout(() => {
      if (phase === "leaving") {
        if (pendingPlace.current) { setPlace(pendingPlace.current); pendingPlace.current = null; }
        setSceneKey((key) => key + 1);
        setPhase(autoCycle ? "entering" : "idle");
      } else setPhase("idle");
    }, timeout);
    return () => clearTimeout(timer);
  }, [phase, sceneKey, autoCycle, paused, panel]);
  useEffect(() => {
    if (panel) {
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
      if (panel === "write") dialogRef.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    }
    else dialogRef.current?.close();
  }, [panel]);
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 10000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (panel !== "write" || editingId) return;
    const timer = window.setTimeout(() => {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, mood, form })); }
      catch { setError("草稿未能保存，请导出手记或检查浏览器存储空间。"); }
    }, 350);
    return () => clearTimeout(timer);
  }, [text, mood, form, panel, editingId]);

  const activeEntries = entries.filter((entry) => !entry.deletedAt);
  const visibleEntries = useMemo(() => entries.filter((entry) => !entry.deletedAt && entry.place === place), [entries, place]);
  const selected = activeEntries.find((entry) => entry.id === selectedId && entry.place === place) ?? visibleEntries[0];
  const renderedEntries = useMemo(() => {
    if (!selectedId || visibleEntries.slice(0, 12).some((entry) => entry.id === selectedId)) return visibleEntries;
    const focused = visibleEntries.find((entry) => entry.id === selectedId);
    return focused ? [focused, ...visibleEntries.filter((entry) => entry.id !== selectedId)] : visibleEntries;
  }, [visibleEntries, selectedId]);
  const currentPlace = PLACES.find((p) => p.id === place)!;
  const filtered = entries.filter((entry) => Boolean(entry.deletedAt) === showTrash && (moodFilter === "all" || entry.mood === moodFilter) && entry.text.toLocaleLowerCase().includes(settledSearch.toLocaleLowerCase()));
  const days = new Set(activeEntries.map((entry) => new Date(entry.createdAt).toLocaleDateString())).size;

  const commit = (next: JournalEntry[]): boolean => {
    try {
      // Read at commit time, so another tab's newer records are not overwritten.
      const raw = localStorage.getItem(JOURNAL_KEY);
      const merged = mergeJournal(raw ? parseJournal(JSON.parse(raw)) : [], next);
      parseJournal({ version: 1, entries: merged });
      localStorage.setItem(JOURNAL_KEY, serializeJournal(merged));
      setEntries(merged); setError(""); setReady(true);
      return true;
    } catch { setError("没有保存成功，文字仍在这里。请检查存储空间或先导出备份。"); return false; }
  };
  const openWrite = (entry?: JournalEntry) => {
    saveLockRef.current = false;
    setError(""); setEditingId(entry?.id ?? null);
    if (entry) { setText(entry.text); setMood(entry.mood); setForm(entry.form); }
    else {
      let draft: { text?: string; mood?: Mood; form?: Keepsake } = {};
      try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}"); } catch { /* Invalid drafts must not block writing. */ }
      setText(typeof draft?.text === "string" ? draft.text.slice(0, MAX_TEXT) : "");
      setMood(MOODS.some((m) => m.id === draft?.mood) ? draft.mood! : "quiet");
      setForm(FORMS.some((f) => f.id === draft?.form) ? draft.form! : "bird");
    }
    setPanel("write");
  };
  const saveEntry = (event: React.FormEvent) => {
    event.preventDefault();
    const content = text.trim(); if (!content || !ready || saveLockRef.current) return;
    saveLockRef.current = true;
    const old = entries.find((entry) => entry.id === editingId);
    const now = new Date().toISOString();
    const entry: JournalEntry = { id: old?.id ?? crypto.randomUUID(), text: content, mood, form, place: old?.place ?? place, createdAt: old?.createdAt ?? now, updatedAt: now };
    if (!commit([entry, ...entries.filter((e) => e.id !== entry.id)])) { saveLockRef.current = false; return; }
    try { if (!old) localStorage.removeItem(DRAFT_KEY); } catch { /* The journal has already committed. */ }
    setPlace(entry.place); setProgress(ROUTE_STOPS[entry.place]); setSelectedId(entry.id); setPanel(null); setText(""); setEditingId(null);
    setSceneKey((key) => key + 1); setPhase("revealing"); setMessage(old ? "这句心事，重新安放好了。" : "留在岛上了。");
  };
  const changePlace = (next: Place) => {
    setPlace(next); setProgress(ROUTE_STOPS[next]); setPhase("idle"); setTension(0);
  };
  const closePanel = () => {
    if (panel === "write" && !editingId) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ text, mood, form })); }
      catch { setError("草稿没有保存成功，暂时不要关闭这个窗口。"); return; }
    }
    setPanel(null);
  };
  const handleWireRelease = useCallback((value: number) => {
    if (value < .12) return;
    setSceneKey((key) => key + 1); setPhase("revealing");
  }, []);
  const handleTension = useCallback((value: number) => {
    tensionRef.current = value;
    if (tensionRafRef.current !== null) return;
    tensionRafRef.current = requestAnimationFrame(() => { setTension(tensionRef.current); tensionRafRef.current = null; });
  }, []);
  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => { canvasRef.current = canvas; }, []);
  const openEntry = useCallback((id: string) => { setSelectedId(id); setPanel("read"); }, []);

  const deliver = (blob: Blob, name: string, notice: string) => {
    const url = download(blob, name);
    if (deliveryUrlRef.current) URL.revokeObjectURL(deliveryUrlRef.current);
    deliveryUrlRef.current = url;
    setDelivery({ url, name }); setMessage(notice); setError("");
  };
  const exportBackup = () => {
    if (performance.now() - lastExportRef.current < 500) return;
    lastExportRef.current = performance.now();
    ++deliveryRequestRef.current;
    let contents = serializeJournal(entries);
    try { contents = localStorage.getItem(JOURNAL_KEY) ?? contents; } catch { /* Export the in-memory copy. */ }
    const name = `孤岛手记-${new Date().toISOString().slice(0, 10)}.json`;
    try { deliver(new Blob([contents], { type: "application/json" }), name, "手记备份已生成。"); }
    catch { setError("备份下载未能生成，请重试。"); }
  };
  const exportPostcard = () => {
    if (performance.now() - lastExportRef.current < 500) return;
    lastExportRef.current = performance.now();
    const request = ++deliveryRequestRef.current;
    const source = canvasRef.current;
    if (!source) { setError("风景还未准备好，请稍后重试。"); return; }
    try {
      const postcard = createPostcard(source, selected?.text ?? currentPlace.line, `孤岛 · ${currentPlace.label} · ${today}`);
      postcard.toBlob((blob) => {
        if (!mountedRef.current || request !== deliveryRequestRef.current) return;
        if (!blob) { setError("明信片生成失败，请重试。"); return; }
        try { deliver(blob, "孤岛明信片.png", "明信片已生成。"); }
        catch { setError("明信片下载未能生成，请重试。"); }
      }, "image/png");
    } catch { setError("明信片生成失败，请稍后重试。"); }
  };
  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      if (file.size > 8 * 1024 * 1024) throw new Error("备份文件过大，未导入。");
      const incoming = parseJournal(JSON.parse(await file.text()));
      if (commit(mergeJournal(entries, incoming))) setMessage("备份已合并，原有手记仍在。");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "文件无法读取，未改动原有手记。"); }
  };
  const removeEntry = (entry: JournalEntry) => {
    const now = new Date().toISOString();
    if (commit(entries.map((e) => e.id === entry.id ? { ...e, deletedAt: now, updatedAt: now } : e))) { setPanel("archive"); setMessage("已移到纸篓，可以随时找回。"); }
  };
  const restoreEntry = (entry: JournalEntry) => {
    const restored = { ...entry, updatedAt: new Date().toISOString() }; delete restored.deletedAt;
    if (commit(entries.map((e) => e.id === entry.id ? restored : e))) setMessage("这句心事，找回来了。");
  };

  return (
    <main className={["ink-stage", layout === "inline" ? "ink-stage--inline" : "", className].filter(Boolean).join(" ")} data-phase={phase} data-place={place}>
      <InkPolesCanvas progress={progress} inkStrength={inkStrength} onProgressChange={travel} motif={place === "lamplight" ? "moon" : place === "pond" ? "island" : motif} phase={phase} sceneKey={sceneKey} place={place} entries={renderedEntries} selectedId={selected?.id} paused={paused || panel !== null} onWireRelease={handleWireRelease} onWireTensionChange={handleTension} onKeepsakeSelect={openEntry} onCanvasReady={handleCanvasReady} />
      {chrome === "full" && <>
        <header className="island-header">
          <div className="island-brand"><h1>孤岛<span className="island-seal" aria-hidden="true">闲</span></h1><p>山行手记<span className="small-rule" />{today || "片刻独处"}</p></div>
          <div className="header-actions">
            <button className="icon-button" aria-label={soundEnabled ? "关闭声音" : "开启声音"} aria-pressed={soundEnabled} title={soundEnabled ? "关闭声音" : "开启声音"} disabled={soundBusy} onClick={toggleSound}>{soundEnabled ? <Volume2 /> : <VolumeX />}</button>
            <button className="icon-button archive-trigger" aria-label="我的手记" title="我的手记" onClick={() => { setShowTrash(false); setPanel("archive"); }}><BookOpen /><span>手记</span>{activeEntries.length > 0 && <small>{activeEntries.length}</small>}</button>
            <button className="icon-button" aria-label="岛屿设置" title="岛屿设置" onClick={() => setPanel("settings")}><Settings2 /></button>
          </div>
        </header>
        <footer className="island-footer">
          <div className="place-heading" key={place}><span className="place-index">0{PLACES.findIndex((p) => p.id === place) + 1} / 0{PLACES.length}</span><h2>{currentPlace.label}</h2><p>{currentPlace.line}</p></div>
          <div className="route-control">
            <button className="icon-button" aria-label="沿小路后退" title="沿小路后退" disabled={progress <= 0} onClick={() => travel(progress - .12)}><ChevronLeft /></button>
            <input type="range" aria-label="漫步进度" min={0} max={100} step={1} value={Math.round(progress * 100)} onChange={(event) => travel(Number(event.target.value) / 100)} aria-valuetext={`${currentPlace.label}，${Math.round(progress * 100)}%`} />
            <button className="icon-button" aria-label="沿小路前进" title="沿小路前进" disabled={progress >= 1} onClick={() => travel(progress + .12)}><ChevronRight /></button>
          </div>
          <button className="write-trigger" onClick={() => openWrite()} disabled={!ready}><Pencil size={16} /><span>留下一句</span><span className="write-arrow"><ChevronRight size={15} /></span></button>
          <nav className="place-nav" aria-label="岛上地点">{PLACES.map((p) => { const Icon = PLACE_ICONS[p.id]; return <button key={p.id} aria-current={p.id === place ? "page" : undefined} onClick={() => changePlace(p.id)}><Icon /><span>{p.label}</span><i /></button>; })}</nav>
          {selected && <div className="island-footnote"><button onClick={() => openEntry(selected.id)} className="quote-button" title="打开这句手记"><p>{selected.text}</p></button></div>}
        </footer>
        {tension > .03 && <div className="tension-thread" aria-hidden="true"><div style={{ transform: `scaleX(${tension})` }} /></div>}
        <div className="toast" role="status" aria-live="polite">{message && <>{message}{delivery && <a href={delivery.url} download={delivery.name}>下载文件</a>}</>}</div>
        {error && !panel && <div className="global-error" role="alert">{error}<button onClick={exportBackup}>导出备份</button><button className="icon-button" aria-label="关闭提示" onClick={() => setError("")}><X /></button></div>}
        <dialog className="island-dialog" ref={dialogRef} aria-labelledby="panel-title" onCancel={(event) => { event.preventDefault(); closePanel(); }}>
          <div className="panel-header"><span>{panel === "write" ? "给自己的一封短信" : panel === "settings" ? "只属于你的岛" : "岛上的心事"}</span><button className="icon-button" aria-label="关闭面板" title="关闭" onClick={closePanel}><X /></button></div>
          {panel === "write" && <form onSubmit={saveEntry} className="write-form">
            <h2 id="panel-title">{editingId ? "再写一遍" : "今天，心里有什么？"}</h2>
            <p className="panel-subtitle">{today} · {PLACES.find((p) => p.id === (entries.find((e) => e.id === editingId)?.place ?? place))?.label}</p>
            <label className="sr-only" htmlFor="journal-text">你的心事</label><textarea id="journal-text" autoFocus value={text} onChange={(event) => setText(event.target.value)} maxLength={MAX_TEXT} placeholder="可以是一件小事，也可以只是一个词。" required />
            <div className="text-count">{text.length} / {MAX_TEXT}</div>
            <fieldset><legend>此刻的天气</legend><div className="mood-options">{MOODS.map((m) => <label key={m.id} className={mood === m.id ? "selected" : ""}><input type="radio" name="mood" value={m.id} checked={mood === m.id} onChange={() => setMood(m.id)} /><i style={{ background: m.color }} /><span>{m.label}</span></label>)}</div></fieldset>
            <fieldset><legend>让它成为</legend><div className="form-options">{FORMS.map((f) => { const Icon = FORM_ICONS[f.id]; return <label key={f.id} className={form === f.id ? "selected" : ""}><input type="radio" name="form" value={f.id} checked={form === f.id} onChange={() => setForm(f.id)} /><Icon size={22} /><span>{f.label}</span><Check size={12} className="form-check" /></label>; })}</div></fieldset>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="form-bottom"><span>仅保存在这台设备</span><button className="primary-button" disabled={!text.trim() || !ready} type="submit">{editingId ? "保存修改" : "留在岛上"}<ChevronRight size={16} /></button></div>
          </form>}
          {panel === "archive" && <section className="archive-panel">
            <h2 id="panel-title">{showTrash ? "纸篓" : "我的手记"}</h2><p className="panel-subtitle">{activeEntries.length} 句心事，{days} 个有记录的日子</p>
            <div className="archive-toolbar"><label className="search-field"><Search size={15} /><input aria-label="搜索手记" placeholder="找一句话" value={search} onChange={(e) => setSearch(e.target.value)} onCompositionStart={() => setSearchComposing(true)} onCompositionEnd={(e) => { setSearch(e.currentTarget.value); setSearchComposing(false); }} /></label><select aria-label="按心情筛选" value={moodFilter} onChange={(e) => setMoodFilter(e.target.value)}><option value="all">所有天气</option>{MOODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></div>
            <div className="archive-tabs"><button aria-pressed={!showTrash} onClick={() => setShowTrash(false)}>手记</button><button aria-pressed={showTrash} onClick={() => setShowTrash(true)}>纸篓 {entries.filter((e) => e.deletedAt).length || ""}</button></div>
            <div className="entry-list">{filtered.length ? filtered.map((entry) => { const Icon = FORM_ICONS[entry.form]; return <article key={entry.id} className="entry-row"><button className="entry-open" onClick={() => { setPlace(entry.place); setProgress(ROUTE_STOPS[entry.place]); setSelectedId(entry.id); setPanel("read"); }} disabled={showTrash}><span className="entry-meta"><i style={{ background: MOODS.find((m) => m.id === entry.mood)?.color }} />{shortDate(entry.createdAt)}<span>{PLACES.find((p) => p.id === entry.place)?.label}</span></span><p>{entry.text}</p><Icon size={14} /></button>{showTrash && <button className="icon-button" aria-label="恢复手记" title="恢复" onClick={() => restoreEntry(entry)}><RotateCcw /></button>}</article>; }) : <div className="empty-archive"><BookOpen size={28} /><p>{search || moodFilter !== "all" ? "没有找到这句心事。" : showTrash ? "纸篓里空空的。" : "岛上还没有你的字迹。"}</p>{!showTrash && !search && <button className="text-button" onClick={() => openWrite()}>写下第一句<ChevronRight size={14} /></button>}</div>}</div>
            {error && <p className="form-error" role="alert">{error}</p>}
          </section>}
          {panel === "read" && selected && <section className="read-panel"><button className="text-button back-button" onClick={() => setPanel("archive")}><ArrowLeft size={14} />全部手记</button><h2 id="panel-title">{shortDate(selected.createdAt)}</h2><p className="panel-subtitle">{MOODS.find((m) => m.id === selected.mood)?.label} · {PLACES.find((p) => p.id === selected.place)?.label}</p><div className="read-text">{selected.text}</div><p className="keepsake-label">{(() => { const Icon = FORM_ICONS[selected.form]; return <Icon size={17} />; })()}{FORMS.find((f) => f.id === selected.form)?.label}留在这里</p><div className="read-actions"><button className="text-button" onClick={() => openWrite(selected)}><Pencil size={14} />修改</button><button className="text-button" onClick={() => { setPanel(null); setSceneKey((key) => key + 1); setPhase("revealing"); }}><Leaf size={14} />回到风景</button><button className="icon-button" aria-label="移到纸篓" title="移到纸篓，可恢复" onClick={() => removeEntry(selected)}><Trash2 /></button></div></section>}
          {panel === "read" && !selected && <section><h2 id="panel-title">这句心事不在这里了</h2><button className="text-button" onClick={() => setPanel("archive")}>返回手记<ArrowLeft size={14} /></button></section>}
          {panel === "read" && error && <p className="form-error" role="alert">{error}</p>}
          {panel === "settings" && <section className="settings-panel">
            <h2 id="panel-title">岛屿设置</h2><p className="panel-subtitle">留一点安静给自己。</p>
            <div className="setting-row"><label htmlFor="motion">风景摇曳</label><input id="motion" type="checkbox" role="switch" checked={!paused} onChange={(e) => setPaused(!e.target.checked)} /></div>
            <div className="volume-row"><label htmlFor="ink-strength">墨韵</label><input id="ink-strength" type="range" min={0} max={100} value={Math.round(inkStrength * 100)} onChange={(e) => setInkStrength(Number(e.target.value) / 100)} /><output htmlFor="ink-strength">{Math.round(inkStrength * 100)}%</output></div>
            <div className="setting-row"><label htmlFor="sound">山间声音</label><input id="sound" type="checkbox" role="switch" checked={soundEnabled} disabled={soundBusy} onChange={toggleSound} /></div>
            <div className="volume-row"><label htmlFor="volume">音量</label><input id="volume" type="range" min={0} max={100} value={Math.round(volume * 100)} onChange={(e) => setVolume(Number(e.target.value) / 100)} /><output htmlFor="volume">{Math.round(volume * 100)}%</output></div>
            <button className="secondary-button postcard-action" onClick={exportPostcard}><ArrowDownToLine size={16} />保存此刻的风景</button>
            {delivery?.name.endsWith(".png") && <a className="backup-receipt" href={delivery.url} download={delivery.name}>下载明信片 PNG</a>}
            <h3>手记备份</h3><p className="privacy-note">文字保存在当前浏览器，不会上传。换设备或清除浏览器数据前，请导出备份。</p>
            <div className="backup-actions"><button className="secondary-button" onClick={exportBackup}><ArrowDownToLine size={16} />导出手记</button><button className="secondary-button" onClick={() => importRef.current?.click()}><Upload size={16} />导入备份</button></div>
            {delivery?.name.endsWith(".json") && <a className="backup-receipt" href={delivery.url} download={delivery.name}>下载备份文件</a>}
            <input ref={importRef} className="sr-only" type="file" accept="application/json,.json" aria-label="手记备份文件" onChange={importBackup} />
            <p className="privacy-note">导入会合并手记，不会清空已有内容。纸篓中的手记也会一起备份。</p>
            <button className="text-button" onClick={() => { setShowTrash(true); setPanel("archive"); }}><Trash2 size={14} />打开纸篓<ChevronRight size={14} /></button>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="settings-signature">孤岛<span>愿你在这里，轻轻落地。</span></div>
          </section>}
        </dialog>
      </>}
    </main>
  );
}
