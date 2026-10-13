"use client";

// Cleaner "Guide & Assessment" — read the area guides, pass a short quiz
// (with corrections + retry of missed questions), tick the preparation
// checklist, then "Assessment Completed — Ready for Cleaning". Content and
// rules live in src/lib/cleaner-guide.ts. Used by the desktop User Guide and
// the phone Help screen, in English or Tagalog (the portal's language).
//
// Progress is kept in this browser (per cleaner) — a per-viewer convenience,
// so a storage failure just means starting over, never a broken page.

import { useState } from "react";
import {
  BookOpen, CheckCircle2, ChevronDown, ChevronRight, Circle, ClipboardCheck,
  HelpCircle, Languages, RotateCcw, ShieldCheck, XCircle,
} from "lucide-react";
import {
  GUIDE_AREAS, QUIZ_QUESTIONS, PREP_ITEMS, PREP_GROUP_LABELS, EMPTY_PROGRESS,
  gradeQuiz, isReadyForCleaning, localDayKey, prepCheckedToday,
  type GuideProgress,
} from "@/lib/cleaner-guide";
import type { CleanerLanguage } from "@/lib/cleaner-portal-strings";

type Step = "guide" | "quiz" | "results" | "prep" | "done";

const STEP_IDS: Step[] = ["guide", "quiz", "results", "prep", "done"];

// Screen text (the guide content itself is bilingual in cleaner-guide.ts).
const UI = {
  en: {
    title: "Guide & Assessment",
    subtitle: "Review how to clean each area, check your understanding and prepare for your shift.",
    switchTo: "Tagalog",
    steps: { guide: "Guides", quiz: "Quiz", results: "Results", prep: "Preparation", done: "Ready" } as Record<Step, string>,
    statusReady: "Ready for Cleaning",
    statusPrep: "Quiz passed · prep pending",
    statusNew: "Not started",
    tip: "Tip:",
    backToStatus: "Back to status",
    continuePrep: "Continue to preparation",
    startQuiz: "I've read the guides — start quiz",
    quizAll: (n: number) => `Answer all ${n} questions.`,
    quizRetry: (n: number) => `Retry the ${n} question${n === 1 ? "" : "s"} you missed.`,
    reviewGuides: "Review guides",
    submit: "Submit answers",
    score: (c: number, n: number) => `${c} of ${n} correct`,
    missedHint: "Read the corrections below, then retry the questions you missed.",
    passed: "Great work — you passed the quiz.",
    yourAnswer: "Your answer:",
    correctAnswer: "Correct answer:",
    retryMissed: (n: number) => `Retry missed (${n})`,
    prepIntro: "Check you have everything before today's cleaning. This checklist resets each day.",
    prepCount: (c: number, n: number) => `${c} of ${n} ready`,
    complete: "Complete assessment",
    doneTitle: "Assessment Completed — Ready for Cleaning",
    completedAt: (when: string) => `Completed ${when}`,
    retake: "Retake assessment",
  },
  tl: {
    title: "Gabay at Pagsusulit",
    subtitle: "Alamin kung paano linisin ang bawat bahagi, subukan ang iyong kaalaman at maghanda para sa shift.",
    switchTo: "English",
    steps: { guide: "Gabay", quiz: "Pagsusulit", results: "Resulta", prep: "Paghahanda", done: "Handa" } as Record<Step, string>,
    statusReady: "Handa nang Maglinis",
    statusPrep: "Pasado sa pagsusulit · kulang ang paghahanda",
    statusNew: "Hindi pa nasisimulan",
    tip: "Paalala:",
    backToStatus: "Bumalik sa status",
    continuePrep: "Tumuloy sa paghahanda",
    startQuiz: "Nabasa ko na ang gabay — simulan ang pagsusulit",
    quizAll: (n: number) => `Sagutin ang lahat ng ${n} tanong.`,
    quizRetry: (n: number) => `Ulitin ang ${n} tanong na mali ang sagot.`,
    reviewGuides: "Balikan ang gabay",
    submit: "I-submit ang sagot",
    score: (c: number, n: number) => `${c} sa ${n} ang tama`,
    missedHint: "Basahin ang mga pagtutuwid sa ibaba, saka ulitin ang mga tanong na mali.",
    passed: "Magaling — pasado ka sa pagsusulit.",
    yourAnswer: "Sagot mo:",
    correctAnswer: "Tamang sagot:",
    retryMissed: (n: number) => `Ulitin ang mali (${n})`,
    prepIntro: "Siguraduhing kumpleto ang lahat bago maglinis ngayong araw. Nauulit ang checklist na ito araw-araw.",
    prepCount: (c: number, n: number) => `${c} sa ${n} ang handa`,
    complete: "Tapusin ang pagsusulit",
    doneTitle: "Tapos na ang Pagsusulit — Handa nang Maglinis",
    completedAt: (when: string) => `Natapos ${when}`,
    retake: "Ulitin ang pagsusulit",
  },
};

const C = {
  ink: "#1f1b16", text: "#5a4a3a", muted: "#8B6344", gold: "#8a6a2f",
  cream: "#F7F0E3", line: "#ece5d4", soft: "#FAF7F1",
  okBg: "#d1fae5", okInk: "#065f46", badBg: "#fee2e2", badInk: "#991b1b",
};

const storageKey = (cleanerId: string) => `dlux-cleaner-guide:${cleanerId}`;

function loadProgress(cleanerId: string): GuideProgress {
  try {
    const raw = window.localStorage.getItem(storageKey(cleanerId));
    return raw ? { ...EMPTY_PROGRESS, ...(JSON.parse(raw) as Partial<GuideProgress>) } : EMPTY_PROGRESS;
  } catch { return EMPTY_PROGRESS; }
}

function saveProgress(cleanerId: string, progress: GuideProgress) {
  try { window.localStorage.setItem(storageKey(cleanerId), JSON.stringify(progress)); } catch { /* storage unavailable */ }
}

export default function GuideAssessment({
  cleanerId, lang, onLangChange,
}: {
  cleanerId: string;
  /** The portal's language; the toggle here changes it for the whole portal. */
  lang: CleanerLanguage;
  onLangChange: (next: CleanerLanguage) => void;
}) {
  const t = UI[lang];
  // Restored on first render: callers only mount this once the session has a
  // cleaner id, i.e. in the browser, so storage is available here.
  const [progress, setProgress] = useState<GuideProgress>(() => loadProgress(cleanerId));
  const [step, setStep] = useState<Step>(() => (isReadyForCleaning(progress) ? "done" : progress.quizPassed ? "prep" : "guide"));
  const [openArea, setOpenArea] = useState<string | null>(GUIDE_AREAS[0].id);
  // The questions in the current round — all of them first, then only the missed ones.
  const [round, setRound] = useState<string[]>(QUIZ_QUESTIONS.map((q) => q.id));
  const [answers, setAnswers] = useState<Record<string, number | undefined>>({});
  const [lastResult, setLastResult] = useState<{ correct: string[]; missed: string[] } | null>(null);

  const update = (next: GuideProgress) => {
    setProgress(next);
    if (cleanerId) saveProgress(cleanerId, next);
  };

  const today = localDayKey();
  const ticked = new Set(prepCheckedToday(progress, today));
  const ready = isReadyForCleaning(progress, today);
  const roundQuestions = QUIZ_QUESTIONS.filter((q) => round.includes(q.id));
  const allAnswered = roundQuestions.every((q) => answers[q.id] !== undefined);
  const allQuestionIds = QUIZ_QUESTIONS.map((q) => q.id);

  const startQuiz = (ids: string[]) => {
    setRound(ids);
    setAnswers((prev) => Object.fromEntries(Object.entries(prev).filter(([id]) => !ids.includes(id))));
    setLastResult(null);
    setStep("quiz");
  };

  const submitQuiz = () => {
    const result = gradeQuiz(round, answers);
    setLastResult(result);
    if (result.missed.length === 0) update({ ...progress, quizPassed: true });
    setStep("results");
  };

  const togglePrep = (id: string) => {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id); else next.add(id);
    const checked = PREP_ITEMS.map((i) => i.id).filter((x) => next.has(x));
    update({ ...progress, prepDate: today, prepChecked: checked });
  };

  const finishPrep = () => {
    update({ ...progress, completedAt: new Date().toISOString() });
    setStep("done");
  };

  const retake = () => {
    update({ ...EMPTY_PROGRESS });
    setAnswers({});
    startQuiz(allQuestionIds);
  };

  // Which steps can be clicked: guides always (review anytime); the rest once reachable.
  const canGo = (s: Step) =>
    s === "guide" || s === "quiz" ||
    (s === "results" && !!lastResult) ||
    (s === "prep" && progress.quizPassed) ||
    (s === "done" && ready);

  const primaryBtn = "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
  const ghostBtn = "inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border cursor-pointer";

  return (
    <div className="border" style={{ borderColor: C.line }}>
      {/* Header + status + language */}
      <div className="px-4 sm:px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3" style={{ borderColor: C.line, backgroundColor: C.soft }}>
        <div>
          <p className="font-bold text-base" style={{ color: C.ink }}>{t.title}</p>
          <p className="text-xs mt-0.5" style={{ color: C.muted }}>{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={ready ? { backgroundColor: C.okBg, color: C.okInk } : { backgroundColor: C.cream, color: C.gold }}>
            {ready ? t.statusReady : progress.quizPassed ? t.statusPrep : t.statusNew}
          </span>
          <button type="button" onClick={() => onLangChange(lang === "en" ? "tl" : "en")}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border cursor-pointer"
            style={{ borderColor: "#d9d1c2", color: C.gold, backgroundColor: "#ffffff" }}>
            <Languages className="w-3.5 h-3.5" />{t.switchTo}
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div className="px-4 sm:px-5 py-3 border-b flex flex-wrap gap-1.5" style={{ borderColor: C.line }}>
        {STEP_IDS.map((id, i) => {
          const on = step === id;
          return (
            <button key={id} type="button" disabled={!canGo(id)}
              onClick={() => (id === "quiz" && step !== "quiz" ? startQuiz(allQuestionIds) : setStep(id))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: on ? C.ink : "transparent", color: on ? "#faf7f1" : C.text, border: `1px solid ${on ? C.ink : "#d9d1c2"}` }}>
              <span className="font-mono">{i + 1}</span>{t.steps[id]}
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-5">
        {/* Guides: instructions per area (review anytime) */}
        {step === "guide" && (
          <div className="space-y-3">
            {GUIDE_AREAS.map((area) => {
              const open = openArea === area.id;
              return (
                <div key={area.id} className="border" style={{ borderColor: C.line }}>
                  <button type="button" onClick={() => setOpenArea(open ? null : area.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer">
                    <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: C.gold }} />
                    <span className="flex-1 min-w-0">
                      <span className="block font-semibold text-sm" style={{ color: C.ink }}>{area.title[lang]}</span>
                      <span className="block text-xs" style={{ color: C.muted }}>{area.summary[lang]}</span>
                    </span>
                    {open ? <ChevronDown className="w-4 h-4" style={{ color: C.muted }} /> : <ChevronRight className="w-4 h-4" style={{ color: C.muted }} />}
                  </button>
                  {open && (
                    <div className="px-4 pb-4">
                      {area.media && area.media.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                          {area.media.map((m, i) => (
                            <figure key={i}>
                              {m.kind === "video"
                                ? <video src={m.url} controls className="w-full border" style={{ borderColor: C.line }} />
                                // eslint-disable-next-line @next/next/no-img-element
                                : <img src={m.url} alt={m.caption?.[lang] || area.title[lang]} className="w-full border" style={{ borderColor: C.line }} />}
                              {m.caption && <figcaption className="text-xs mt-1" style={{ color: C.muted }}>{m.caption[lang]}</figcaption>}
                            </figure>
                          ))}
                        </div>
                      )}
                      <ol className="space-y-2">
                        {area.steps.map((s, i) => (
                          <li key={i} className="flex gap-3 text-sm" style={{ color: C.text }}>
                            <span className="w-6 h-6 rounded-full flex-shrink-0 grid place-items-center text-xs font-semibold" style={{ backgroundColor: C.cream, color: C.gold }}>{i + 1}</span>
                            <span className="pt-0.5">{s[lang]}</span>
                          </li>
                        ))}
                      </ol>
                      {area.tips.length > 0 && (
                        <div className="mt-3 p-3 text-xs space-y-1" style={{ backgroundColor: C.cream, color: "#6b5040" }}>
                          {area.tips.map((tip, i) => <p key={i}><strong>{t.tip}</strong> {tip[lang]}</p>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="flex justify-end pt-1">
              {ready ? (
                <button type="button" onClick={() => setStep("done")} className={ghostBtn} style={{ borderColor: C.line, color: C.muted }}>{t.backToStatus}</button>
              ) : progress.quizPassed ? (
                <button type="button" onClick={() => setStep("prep")} className={primaryBtn} style={{ backgroundColor: C.ink }}>{t.continuePrep} <ChevronRight className="w-4 h-4" /></button>
              ) : (
                <button type="button" onClick={() => startQuiz(allQuestionIds)} className={primaryBtn} style={{ backgroundColor: C.ink }}>{t.startQuiz} <ChevronRight className="w-4 h-4" /></button>
              )}
            </div>
          </div>
        )}

        {/* Quiz */}
        {step === "quiz" && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: C.muted }}>
              {round.length === QUIZ_QUESTIONS.length ? t.quizAll(round.length) : t.quizRetry(round.length)}
            </p>
            {roundQuestions.map((q, qi) => (
              <fieldset key={q.id} className="border p-4" style={{ borderColor: C.line }}>
                <legend className="px-1 text-xs uppercase tracking-wider" style={{ color: C.gold }}>{q.area[lang]}</legend>
                <p className="font-semibold text-sm mb-3 flex gap-2" style={{ color: C.ink }}><HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: C.gold }} />{qi + 1}. {q.question[lang]}</p>
                <div className="space-y-2">
                  {q.options.map((opt, oi) => {
                    const picked = answers[q.id] === oi;
                    return (
                      <label key={oi} className="flex items-start gap-2.5 p-2.5 border cursor-pointer text-sm"
                        style={{ borderColor: picked ? C.gold : C.line, backgroundColor: picked ? C.cream : "transparent", color: C.text }}>
                        <input type="radio" name={`q-${q.id}`} checked={picked} onChange={() => setAnswers({ ...answers, [q.id]: oi })} className="mt-0.5" />
                        {opt[lang]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            <div className="flex justify-between gap-2">
              <button type="button" onClick={() => setStep("guide")} className={ghostBtn} style={{ borderColor: C.line, color: C.muted }}><BookOpen className="w-4 h-4" /> {t.reviewGuides}</button>
              <button type="button" disabled={!allAnswered} onClick={submitQuiz} className={primaryBtn} style={{ backgroundColor: C.ink }}>{t.submit}</button>
            </div>
          </div>
        )}

        {/* Results + corrections */}
        {step === "results" && lastResult && (
          <div className="space-y-4">
            <div className="p-4 flex items-center gap-3" style={lastResult.missed.length ? { backgroundColor: C.badBg, color: C.badInk } : { backgroundColor: C.okBg, color: C.okInk }}>
              {lastResult.missed.length ? <XCircle className="w-5 h-5 flex-shrink-0" /> : <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
              <div>
                <p className="font-semibold text-sm">{t.score(lastResult.correct.length, round.length)}</p>
                <p className="text-xs">{lastResult.missed.length ? t.missedHint : t.passed}</p>
              </div>
            </div>
            {roundQuestions.map((q) => {
              const ok = lastResult.correct.includes(q.id);
              const given = answers[q.id];
              return (
                <div key={q.id} className="border p-4" style={{ borderColor: ok ? "#a7f3d0" : "#fecaca" }}>
                  <p className="font-semibold text-sm flex gap-2" style={{ color: C.ink }}>
                    {ok ? <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: C.okInk }} /> : <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: C.badInk }} />}
                    {q.question[lang]}
                  </p>
                  {!ok && (
                    <div className="mt-2 text-sm space-y-1" style={{ color: C.text }}>
                      <p>{t.yourAnswer} <span style={{ color: C.badInk }}>{given !== undefined ? q.options[given][lang] : "—"}</span></p>
                      <p>{t.correctAnswer} <span style={{ color: C.okInk, fontWeight: 600 }}>{q.options[q.answer][lang]}</span></p>
                    </div>
                  )}
                  <p className="mt-2 text-xs" style={{ color: C.muted }}>{q.explanation[lang]}</p>
                </div>
              );
            })}
            <div className="flex justify-between gap-2">
              <button type="button" onClick={() => setStep("guide")} className={ghostBtn} style={{ borderColor: C.line, color: C.muted }}><BookOpen className="w-4 h-4" /> {t.reviewGuides}</button>
              {lastResult.missed.length ? (
                <button type="button" onClick={() => startQuiz(lastResult.missed)} className={primaryBtn} style={{ backgroundColor: C.ink }}><RotateCcw className="w-4 h-4" /> {t.retryMissed(lastResult.missed.length)}</button>
              ) : (
                <button type="button" onClick={() => setStep(ready ? "done" : "prep")} className={primaryBtn} style={{ backgroundColor: C.ink }}>{t.continuePrep} <ChevronRight className="w-4 h-4" /></button>
              )}
            </div>
          </div>
        )}

        {/* Preparation checklist (resets daily) */}
        {(step === "prep" || (step === "done" && !ready)) && (
          <div className="space-y-4">
            <p className="text-sm" style={{ color: C.muted }}>{t.prepIntro}</p>
            {(["Supplies", "Equipment", "Safety"] as const).map((group) => (
              <div key={group} className="border" style={{ borderColor: C.line }}>
                <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider flex items-center gap-2" style={{ backgroundColor: C.soft, color: C.gold }}>
                  {group === "Safety" ? <ShieldCheck className="w-3.5 h-3.5" /> : <ClipboardCheck className="w-3.5 h-3.5" />}{PREP_GROUP_LABELS[group][lang]}
                </div>
                {PREP_ITEMS.filter((i) => i.group === group).map((item) => {
                  const done = ticked.has(item.id);
                  return (
                    <button key={item.id} type="button" onClick={() => togglePrep(item.id)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm cursor-pointer border-t" style={{ borderColor: C.cream, color: C.text }}>
                      {done ? <CheckCircle2 className="w-5 h-5 flex-shrink-0" style={{ color: C.okInk }} /> : <Circle className="w-5 h-5 flex-shrink-0" style={{ color: "#D4BFA0" }} />}
                      <span style={{ textDecoration: done ? "line-through" : "none", color: done ? "#A89080" : C.text }}>{item.label[lang]}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="flex justify-between items-center gap-2">
              <span className="text-xs" style={{ color: C.muted }}>{t.prepCount(ticked.size, PREP_ITEMS.length)}</span>
              <button type="button" disabled={ticked.size < PREP_ITEMS.length} onClick={finishPrep} className={primaryBtn} style={{ backgroundColor: C.okInk }}>
                <CheckCircle2 className="w-4 h-4" /> {t.complete}
              </button>
            </div>
          </div>
        )}

        {/* Completed */}
        {step === "done" && ready && (
          <div className="text-center py-6">
            <CheckCircle2 className="w-12 h-12 mx-auto" style={{ color: C.okInk }} />
            <p className="font-bold text-lg mt-3" style={{ color: C.ink }}>{t.doneTitle}</p>
            {progress.completedAt && (
              <p className="text-xs mt-1" style={{ color: C.muted }}>
                {t.completedAt(new Date(progress.completedAt).toLocaleString(lang === "tl" ? "fil-PH" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}
              </p>
            )}
            <div className="flex flex-wrap justify-center gap-2 mt-5">
              <button type="button" onClick={() => setStep("guide")} className={ghostBtn} style={{ borderColor: C.line, color: C.gold }}><BookOpen className="w-4 h-4" /> {t.reviewGuides}</button>
              <button type="button" onClick={retake} className={ghostBtn} style={{ borderColor: C.line, color: C.muted }}><RotateCcw className="w-4 h-4" /> {t.retake}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
