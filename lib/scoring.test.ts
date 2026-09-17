import { describe, expect, it } from "vitest";

import type { Answer, AnswerValue } from "./models";
import { questions } from "./questions";
import { calculateInspectionScore, roundScore } from "./scoring";

const EXPECTED_CRITICAL_CODES = [
  "1.1",
  "1.4",
  "1.5",
  "1.7",
  "1.9",
  "2.1",
  "2.2",
  "2.3",
  "2.4",
  "2.5",
  "2.6",
  "4.1",
  "4.3",
  "5.1",
] as const;

const PDF_SAMPLE_ANSWERS: Partial<Record<string, AnswerValue>> = {
  "1.2": "NA",
  "2.1": "NA",
  "3.2": "NA",
  "4.1": 1,
  "4.6": 1,
  "5.2": 1,
  "5.5": 1,
  "5.6": 1,
  "5.7": "NA",
  "5.11": "NA",
};

function buildAnswers(overrides: Partial<Record<string, AnswerValue>> = {}): Answer[] {
  return questions.map((question) => ({
    id: `answer-${question.code}`,
    inspectionId: "inspection-test",
    questionCode: question.code,
    questionTextSnapshot: question.fullText,
    categoryCode: question.categoryCode,
    selectedValue: Object.hasOwn(overrides, question.code) ? overrides[question.code]! : 2,
    weightSnapshot: question.weight,
    isCriticalSnapshot: Boolean(question.critical),
    isExcludableSnapshot: Boolean(question.excludable),
    updatedAt: "2026-09-17T00:00:00.000Z",
  }));
}

describe("calculateInspectionScore", () => {
  it("keeps the approved 14-question Critical Defect matrix", () => {
    expect(questions.filter((question) => question.critical).map((question) => question.code)).toEqual(
      EXPECTED_CRITICAL_CODES,
    );
  });

  it("matches the legacy Google Sheet calculation for the verified PDF sample", () => {
    const result = calculateInspectionScore(buildAnswers(PDF_SAMPLE_ANSWERS));

    expect(result.isComplete).toBe(true);
    expect(result.categories).toEqual([
      expect.objectContaining({ categoryCode: "1", earnedScore: 24, fullScore: 24, percentage: 100 }),
      expect.objectContaining({ categoryCode: "2", earnedScore: 12, fullScore: 12, percentage: 100 }),
      expect.objectContaining({ categoryCode: "3", earnedScore: 10, fullScore: 10, percentage: 100 }),
      expect.objectContaining({ categoryCode: "4", earnedScore: 19, fullScore: 22 }),
      expect.objectContaining({ categoryCode: "5", earnedScore: 26, fullScore: 32, percentage: 81.25 }),
    ]);
    expect(result.categories[3].percentage).toBeCloseTo((19 / 22) * 100, 10);
    expect(result.overallPercentage).toBeCloseTo(93.5227272727, 10);
    expect(roundScore(result.overallPercentage!)).toBe(93.52);
    expect(result.criticalDefect).toEqual({
      status: "PASS",
      failedQuestionCodes: [],
      incompleteQuestionCodes: [],
    });
  });

  it.each(EXPECTED_CRITICAL_CODES)("fails when Critical Defect %s is scored 0", (questionCode) => {
    const result = calculateInspectionScore(buildAnswers({ [questionCode]: 0 }));

    expect(result.criticalDefect).toEqual({
      status: "FAIL",
      failedQuestionCodes: [questionCode],
      incompleteQuestionCodes: [],
    });
  });

  it("does not fail the Critical Defect gate when a non-critical question is scored 0", () => {
    const result = calculateInspectionScore(buildAnswers({ "1.3": 0 }));

    expect(result.criticalDefect.status).toBe("PASS");
    expect(result.criticalDefect.failedQuestionCodes).toEqual([]);
  });

  it("allows N/A for excludable Critical Defect question 2.1", () => {
    const result = calculateInspectionScore(buildAnswers({ "2.1": "NA" }));
    const category = result.categories.find((item) => item.categoryCode === "2");

    expect(result.criticalDefect.status).toBe("PASS");
    expect(category).toEqual(expect.objectContaining({ fullScore: 12, excludedQuestionCodes: ["2.1"] }));
  });

  it("marks an invalid N/A on a non-excludable Critical Defect as incomplete", () => {
    const result = calculateInspectionScore(buildAnswers({ "1.1": "NA" }));
    const category = result.categories.find((item) => item.categoryCode === "1");

    expect(result.isComplete).toBe(false);
    expect(result.overallPercentage).toBeNull();
    expect(result.criticalDefect).toEqual({
      status: "INCOMPLETE",
      failedQuestionCodes: [],
      incompleteQuestionCodes: ["1.1"],
    });
    expect(category?.invalidAnswerQuestionCodes).toEqual(["1.1"]);
  });

  it("does not calculate an overall percentage while an answer is missing", () => {
    const result = calculateInspectionScore(buildAnswers({ "1.1": null }));

    expect(result.isComplete).toBe(false);
    expect(result.overallPercentage).toBeNull();
    expect(result.criticalDefect.status).toBe("INCOMPLETE");
  });
});
