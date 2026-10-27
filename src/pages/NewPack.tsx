import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ClipboardPaste,
  FileUp,
  ScanText,
  Search,
  UploadCloud,
  X,
} from "lucide-react";
import { api, type PackSummary } from "../api";
import { OriginCard, useOriginDetect } from "../components/OriginCard";
import { originName } from "@shared/origin";
import { ACCEPT, extractFile, plainText, sourceTypeOf } from "../lib/extract";
import { isStaleBuildError, reloadForNewVersion } from "../lib/lazyPage";
import type { OcrProgress } from "../lib/extract/ocr";
import type { SourceBlock } from "@shared/engine/types";

type Tab = "file" | "paste" | "topic";

const TOPIC_IDEAS = [
  "Photosynthesis",
  "Supply and demand",
  "Law of contract",
  "Krebs cycle",
  "History of Uganda",
  "Operating system",
  "Hypertension",
  "Marketing mix",
];

export default function NewPack() {
  const nav = useNavigate();
  const [tab, setTab] = useState<Tab>("file");
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [topic, setTopic] = useState("");
  const [title, setTitle] = useState("");
  const [examDate, setExamDate] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Scanned PDFs: read chosen pages with text recognition on this device
  const [scan, setScan] = useState<{
    pages: number;
    from: number;
    to: number;
  } | null>(null);
  const [ocr, setOcr] = useState<OcrProgress | null>(null);
  const abort = useRef<AbortController | null>(null);
  // the file is read as soon as it is chosen, so we can say where it is from before making the pack
  const [read, setRead] = useState<{ file: File; result: Awaited<ReturnType<typeof extractFile>> } | null>(null);
  const [pasteText, setPasteText] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setPasteText(text.length > 150 ? text : ""), 900);
    return () => window.clearTimeout(t);
  }, [text]);
  const headText = tab === "file" ? (read && read.file === file && !read.result.needsOcr ? plainText(read.result).slice(0, 8000) : null) : tab === "paste" ? pasteText.slice(0, 8000) || null : null;
  const det = useOriginDetect(headText, tab === "file" ? file?.name || "" : "");
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [paperPack, setPaperPack] = useState<number | "">("");
  useEffect(() => {
    if (det.origin?.isPaper && !packs) api<{ packs: PackSummary[] }>("/packs").then((r) => setPacks(r.packs ?? [])).catch(() => setPacks([]));
  }, [det.origin?.isPaper, packs]);

  useEffect(() => {
    if (!file) return;
    let gone = false;
    extractFile(file, () => {})
      .then((result) => !gone && setRead({ file, result }))
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [file]);

  /** A past paper belongs with its course: add it to a pack's past papers (the Exam coach uses them). */
  async function addAsPastPaper() {
    if (!paperPack || !headText) return;
    setError(null);
    setBusy("Reading the questions…");
    try {
      const all = tab === "file" && read ? plainText(read.result) : text;
      await api(`/packs/${paperPack}/past-papers`, { body: { name: originName(det.origin, file?.name.replace(/\.[a-z0-9]+$/i, "") || "Past paper"), text: all, origin: det.origin } });
      nav(`/pack/${paperPack}/paper#past-papers`);
    } catch (e: any) {
      setError(e.message || "Something went wrong. Try again.");
      setBusy(null);
    }
  }

  const pickFile = (f: File | undefined | null) => {
    setError(null);
    setWarning(null);
    setScan(null);
    if (!f) return;
    if (!sourceTypeOf(f)) {
      setError(
        "That file type isn’t supported yet. Use a PDF, Word (.docx), PowerPoint (.pptx) or text file.",
      );
      return;
    }
    setFile(f);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    pickFile(e.dataTransfer.files?.[0]);
  };

  async function create() {
    setError(null);
    setWarning(null);
    try {
      let id: number;
      const exam = examDate || null;
      if (tab === "file") {
        if (!file) return setError("Choose a file first.");
        setBusy("Opening your file…");
        const r = read && read.file === file ? read.result : await extractFile(file, setBusy);
        if (r.warning) setWarning(r.warning);
        if (r.needsOcr) {
          if (r.type === "image") return await readScan(1, 1, "image");
          setScan({
            pages: r.pages || 1,
            from: 1,
            to: Math.min(r.pages || 1, 30),
          });
          setBusy(null);
          return;
        }
        setBusy("Finding the key ideas and making your flashcards…");
        const res = await api<{ id: number }>("/packs", {
          body: {
            sourceType: r.type,
            sourceName: file.name,
            title: title || undefined,
            blocks: r.blocks,
            examDate: exam,
            origin: det.origin || undefined,
          },
        });
        id = res.id;
      } else if (tab === "paste") {
        if (text.trim().split(/\s+/).length < 40)
          return setError(
            "Paste a bit more — at least a paragraph or two of notes.",
          );
        setBusy("Finding the key ideas and making your flashcards…");
        const res = await api<{ id: number }>("/packs", {
          body: {
            sourceType: "paste",
            title: title || undefined,
            text,
            examDate: exam,
            origin: det.origin && (det.origin.university || det.origin.courseCode || det.origin.year) ? det.origin : undefined,
          },
        });
        id = res.id;
      } else {
        if (topic.trim().length < 2) return setError("Type a topic first.");
        setBusy("Gathering free material on this topic…");
        const res = await api<{ id: number }>("/packs/topic", {
          body: { topic, examDate: exam },
        });
        id = res.id;
      }
      nav(`/pack/${id}?new=1`);
    } catch (e: any) {
      if (isStaleBuildError(e) && reloadForNewVersion()) {
        setBusy("Charis Study was just updated. Reloading…");
        return;
      }
      setError(e.message || "Something went wrong. Try again.");
      setBusy(null);
    }
  }

  async function readScan(
    from: number,
    to: number,
    kind: "pdf" | "image" = "pdf",
  ) {
    if (!file) return;
    setError(null);
    abort.current = new AbortController();
    setBusy("Reading your scan…");
    try {
      const { ocrImages, ocrPdf } = await import("../lib/extract/ocr");
      const blocks: SourceBlock[] =
        kind === "image"
          ? await ocrImages([file], setOcr, abort.current.signal)
          : await ocrPdf(file, from, to, setOcr, abort.current.signal);
      if (abort.current.signal.aborted)
        throw new Error("Stopped. Choose fewer pages and try again.");
      const words = blocks.reduce((n, b) => n + b.text.split(/\s+/).length, 0);
      if (words < 40)
        throw new Error(
          "We couldn’t recognise enough text on those pages. Try other pages, or a clearer scan or photo.",
        );
      setOcr(null);
      setBusy("Finding the key ideas and making your flashcards…");
      const base = title || file.name.replace(/\.[a-z0-9]+$/i, "");
      const partial = kind === "pdf" && scan && (from > 1 || to < scan.pages);
      const res = await api<{ id: number }>("/packs", {
        body: {
          sourceType: kind === "image" ? "image" : "pdf",
          sourceName: file.name,
          title: partial ? `${base} (pages ${from}–${to})` : base,
          blocks,
          examDate: examDate || null,
        },
      });
      nav(`/pack/${res.id}?new=1`);
    } catch (e: any) {
      setError(e.message || "Something went wrong. Try again.");
      setOcr(null);
      setBusy(null);
    }
  }

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <h1>New study pack</h1>
      <p className="muted">
        Give Charis Study your material. It will be split into short lessons
        with flashcards, quizzes and memory tricks.
      </p>
      <Link to="/library" className="sheet tight lib-banner" style={{ marginBottom: 18, textDecoration: 'none', color: 'inherit' }}>
        <span>
          <strong>Check the library first.</strong> <span className="small muted">A classmate may already have shared these notes, a book or past papers for your course — add them in one tap.</span>
        </span>
        <span className="btn small">Search the library</span>
      </Link>

      <div
        className="segmented"
        role="tablist"
        aria-label="How to add material"
        style={{ margin: "8px 0 18px" }}
      >
        <button
          role="tab"
          aria-pressed={tab === "file"}
          aria-selected={tab === "file"}
          onClick={() => setTab("file")}
        >
          <FileUp size={17} /> Upload a file
        </button>
        <button
          role="tab"
          aria-pressed={tab === "paste"}
          aria-selected={tab === "paste"}
          onClick={() => setTab("paste")}
        >
          <ClipboardPaste size={17} /> Paste notes
        </button>
        <button
          role="tab"
          aria-pressed={tab === "topic"}
          aria-selected={tab === "topic"}
          onClick={() => setTab("topic")}
        >
          <Search size={17} /> Only a topic
        </button>
      </div>

      <div className="sheet stack">
        {tab === "file" &&
          (file ? (
            <div
              className="row between"
              style={{
                padding: "14px 16px",
                borderRadius: 14,
                background: "var(--paper-2)",
                border: "1px solid var(--line)",
              }}
            >
              <div className="row" style={{ minWidth: 0 }}>
                <FileUp size={22} color="var(--biro)" />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {file.name}
                  </div>
                  <div className="small muted">
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </div>
                </div>
              </div>
              <button
                className="btn ghost icon small"
                onClick={() => setFile(null)}
                aria-label="Remove file"
                disabled={!!busy}
              >
                <X size={18} />
              </button>
            </div>
          ) : (
            <div
              className={`dropzone ${over ? "over" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => input.current?.click()}
              onKeyDown={(e) =>
                (e.key === "Enter" || e.key === " ") && input.current?.click()
              }
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={onDrop}
            >
              <UploadCloud
                size={36}
                color="var(--biro)"
                style={{ margin: "0 auto 10px" }}
              />
              <div style={{ fontWeight: 600 }}>
                Tap to choose a file, or drop it here
              </div>
              <div className="small muted">
                PDF, PowerPoint (.pptx), Word (.docx), text, or photos of notes.
                Scanned PDFs work too.
              </div>
              <input
                ref={input}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </div>
          ))}

        {tab === "paste" && (
          <div className="field">
            <label htmlFor="notes">Your notes</label>
            <textarea
              id="notes"
              className="textarea ruled"
              style={{ minHeight: 280 }}
              placeholder={
                "Paste lecture notes, a chapter or a handout here.\n\nTip: keep the headings — they become your lessons."
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <span className="hint">
              {text.trim()
                ? `${text.trim().split(/\s+/).length} words`
                : "Headings, bullet points and definitions all help."}
            </span>
          </div>
        )}

        {(tab === "file" || tab === "paste") && det.origin && (
          <OriginCard origin={det.origin} refining={det.refining} ai={det.ai} onChange={det.setOrigin} />
        )}
        {(tab === "file" || tab === "paste") && det.origin?.isPaper && (
          <div className="origin-paper-offer small">
            <span>
              <strong>Tip:</strong> add a past paper to its course’s study pack, and the Exam coach predicts what will come up.
            </span>
            {packs && packs.length > 0 && (
              <>
                <select className="input" style={{ maxWidth: 260 }} value={paperPack} onChange={(e) => setPaperPack(e.target.value ? Number(e.target.value) : "")} aria-label="Study pack for this past paper">
                  <option value="">Choose the course pack…</option>
                  {packs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <button className="btn small primary" onClick={addAsPastPaper} disabled={!paperPack || !!busy}>
                  Add as a past paper
                </button>
              </>
            )}
            <span className="muted">Or make a study pack from it below.</span>
          </div>
        )}
        {tab === "topic" && (
          <>
            <div className="field">
              <label htmlFor="topic">What do you need to learn?</label>
              <input
                id="topic"
                className="input"
                placeholder="e.g. Osmosis, Contract law, Inflation"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
              <span className="hint">
                We build lessons from Wikipedia and Simple English Wikipedia,
                and add links to free videos, textbooks and past-paper searches.
              </span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {TOPIC_IDEAS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="chip"
                  onClick={() => setTopic(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          </>
        )}

        <hr className="divider" />
        <div className="grid cols-2" style={{ gap: 14 }}>
          {tab !== "topic" && (
            <div className="field">
              <label htmlFor="title">Name this pack (optional)</label>
              <input
                id="title"
                className="input"
                placeholder={
                  file
                    ? file.name.replace(/\.[a-z0-9]+$/i, "")
                    : "e.g. BIO 1101 Lecture 3"
                }
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="exam">Exam date (optional)</label>
            <input
              id="exam"
              className="input"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
            />
            <span className="hint">
              Flashcards are timed so you review everything before this day.
            </span>
          </div>
        </div>

        {tab === "file" && scan && file && (
          <div
            className="sheet tight stack ai-card"
            style={{
              borderLeftColor: "var(--warn)",
              background: "var(--paper-2)",
            }}
          >
            <strong className="row" style={{ gap: 8 }}>
              <ScanText size={20} color="var(--biro)" /> This PDF is scanned (
              {scan.pages} pages)
            </strong>
            <p className="small" style={{ margin: 0 }}>
              Its pages are pictures, so we’ll read them with text recognition
              right here on your device (nothing is uploaded). It takes a few
              seconds per page — keep this tab open.
              {scan.pages > 40 &&
                " For a big book, make one pack per chapter or topic: it’s faster and gives you better lessons."}
            </p>
            <div className="row" style={{ gap: 6 }}>
              {[
                [1, Math.min(scan.pages, 20)],
                [1, Math.min(scan.pages, 50)],
                ...(scan.pages > 50 ? [[51, Math.min(scan.pages, 100)]] : []),
                [1, scan.pages],
              ]
                .filter(
                  ([a, b], i, all) =>
                    all.findIndex(([x, y]) => x === a && y === b) === i,
                )
                .map(([a, b]) => (
                  <button
                    key={`${a}-${b}`}
                    className="chip"
                    aria-pressed={scan.from === a && scan.to === b}
                    onClick={() => setScan({ ...scan, from: a, to: b })}
                    disabled={!!busy}
                  >
                    {a === 1 && b === scan.pages
                      ? `All ${scan.pages} pages`
                      : `Pages ${a}–${b}`}
                  </button>
                ))}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <label className="small" htmlFor="pf">
                From page
              </label>
              <input
                id="pf"
                type="number"
                className="input"
                style={{ width: 90, minHeight: 36 }}
                min={1}
                max={scan.pages}
                value={scan.from}
                onChange={(e) =>
                  setScan({
                    ...scan,
                    from: Math.max(
                      1,
                      Math.min(scan.pages, Number(e.target.value) || 1),
                    ),
                  })
                }
                disabled={!!busy}
              />
              <label className="small" htmlFor="pt">
                to
              </label>
              <input
                id="pt"
                type="number"
                className="input"
                style={{ width: 90, minHeight: 36 }}
                min={1}
                max={scan.pages}
                value={scan.to}
                onChange={(e) =>
                  setScan({
                    ...scan,
                    to: Math.max(
                      1,
                      Math.min(scan.pages, Number(e.target.value) || 1),
                    ),
                  })
                }
                disabled={!!busy}
              />
              <span className="small muted">
                {Math.max(0, scan.to - scan.from + 1)} pages, about{" "}
                {Math.max(1, Math.round(((scan.to - scan.from + 1) * 6) / 60))}{" "}
                min
              </span>
            </div>
            {ocr ? (
              <div>
                <div className="row between small" style={{ marginBottom: 4 }}>
                  <span>
                    {ocr.stage === "starting"
                      ? "Getting text recognition ready (first time only downloads about 3 MB)…"
                      : `Reading page ${ocr.page} (${ocr.done} of ${ocr.total})`}
                  </span>
                  <span className="muted">
                    {ocr.secondsLeft != null && ocr.done > 0
                      ? `about ${ocr.secondsLeft > 90 ? `${Math.ceil(ocr.secondsLeft / 60)} min` : `${ocr.secondsLeft} s`} left`
                      : ""}
                  </span>
                </div>
                <div className="meter">
                  <span
                    style={{
                      width: `${(ocr.done / Math.max(1, ocr.total)) * 100}%`,
                    }}
                  />
                </div>
                <button
                  className="btn small ghost"
                  style={{ marginTop: 6 }}
                  onClick={() => abort.current?.abort()}
                >
                  Stop
                </button>
              </div>
            ) : (
              <div>
                <button
                  className="btn primary"
                  onClick={() =>
                    readScan(
                      Math.min(scan.from, scan.to),
                      Math.max(scan.from, scan.to),
                    )
                  }
                  disabled={!!busy}
                >
                  <ScanText size={17} /> Read pages{" "}
                  {Math.min(scan.from, scan.to)}–{Math.max(scan.from, scan.to)}{" "}
                  and make my pack
                </button>
              </div>
            )}
          </div>
        )}
        {warning && (
          <div
            className="error-box"
            style={{ background: "var(--paper-2)", color: "var(--warn)" }}
          >
            {warning}
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        {!(scan && tab === "file") && (
          <button
            className="btn primary big block"
            onClick={create}
            disabled={!!busy}
          >
            {busy ? (
              <>
                <span
                  className="spinner"
                  style={{
                    width: 18,
                    height: 18,
                    borderWidth: 2,
                    borderColor: "rgba(255,255,255,.4)",
                    borderTopColor: "#fff",
                  }}
                />{" "}
                {busy}
              </>
            ) : (
              "Make my study pack"
            )}
          </button>
        )}
        <p className="hint" style={{ textAlign: "center", margin: 0 }}>
          Files are read on your device. Only the text is saved to your account.
        </p>
      </div>
    </div>
  );
}
