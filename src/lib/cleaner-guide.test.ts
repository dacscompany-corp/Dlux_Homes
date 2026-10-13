import { describe, it, expect } from "vitest";
import {
  GUIDE_AREAS, QUIZ_QUESTIONS, PREP_ITEMS, PREP_GROUP_LABELS, EMPTY_PROGRESS,
  gradeQuiz, isReadyForCleaning, prepCheckedToday,
} from "./cleaner-guide";

const allIds = QUIZ_QUESTIONS.map((q) => q.id);
const allCorrect = Object.fromEntries(QUIZ_QUESTIONS.map((q) => [q.id, q.answer]));

describe("bilingual content", () => {
  it("has English and Tagalog for every text", () => {
    const texts = [
      ...GUIDE_AREAS.flatMap((a) => [a.title, a.summary, ...a.steps, ...a.tips]),
      ...QUIZ_QUESTIONS.flatMap((q) => [q.area, q.question, q.explanation, ...q.options]),
      ...PREP_ITEMS.map((i) => i.label),
      ...Object.values(PREP_GROUP_LABELS),
    ];
    for (const text of texts) {
      expect(text.en.trim(), JSON.stringify(text)).not.toBe("");
      expect(text.tl.trim(), JSON.stringify(text)).not.toBe("");
    }
  });
});

describe("gradeQuiz", () => {
  it("passes every question answered correctly", () => {
    expect(gradeQuiz(allIds, allCorrect)).toEqual({ correct: allIds, missed: [] });
  });

  it("marks wrong and unanswered questions as missed", () => {
    const [first, second, ...rest] = QUIZ_QUESTIONS;
    const answers = { ...allCorrect, [first.id]: (first.answer + 1) % first.options.length, [second.id]: undefined };
    const result = gradeQuiz(allIds, answers);
    expect(result.missed).toEqual([first.id, second.id]);
    expect(result.correct).toEqual(rest.map((q) => q.id));
  });

  it("only grades the questions being retried", () => {
    const retry = [QUIZ_QUESTIONS[2].id];
    expect(gradeQuiz(retry, allCorrect)).toEqual({ correct: retry, missed: [] });
  });
});

describe("isReadyForCleaning", () => {
  const today = "2026-10-12";
  const allPrep = PREP_ITEMS.map((i) => i.id);

  it("needs the quiz passed", () => {
    expect(isReadyForCleaning({ ...EMPTY_PROGRESS, prepDate: today, prepChecked: allPrep }, today)).toBe(false);
  });

  it("needs every prep item ticked", () => {
    const progress = { ...EMPTY_PROGRESS, quizPassed: true, prepDate: today, prepChecked: allPrep.slice(1) };
    expect(isReadyForCleaning(progress, today)).toBe(false);
  });

  it("is ready when passed and today's checklist is complete", () => {
    expect(isReadyForCleaning({ ...EMPTY_PROGRESS, quizPassed: true, prepDate: today, prepChecked: allPrep }, today)).toBe(true);
  });

  it("does not count yesterday's checklist for today", () => {
    const progress = { ...EMPTY_PROGRESS, quizPassed: true, prepDate: "2026-10-11", prepChecked: allPrep };
    expect(prepCheckedToday(progress, today)).toEqual([]);
    expect(isReadyForCleaning(progress, today)).toBe(false);
  });
});
