import type { Answer, AnswerValue } from "./models";
import { categories, questions, type Category, type Question } from "./questions";

export const SCORING_RULE_VERSION = "gpp-sheet-v1";

export type CriticalDefectStatus = "INCOMPLETE" | "PASS" | "FAIL";

export interface CategoryScore {
  categoryCode: string;
  categoryName: string;
  earnedScore: number;
  fullScore: number;
  percentage: number | null;
  isComplete: boolean;
  unansweredQuestionCodes: string[];
  excludedQuestionCodes: string[];
  invalidAnswerQuestionCodes: string[];
}

export interface CriticalDefectResult {
  status: CriticalDefectStatus;
  failedQuestionCodes: string[];
  incompleteQuestionCodes: string[];
}

export interface InspectionScore {
  ruleVersion: typeof SCORING_RULE_VERSION;
  isComplete: boolean;
  categories: CategoryScore[];
  overallPercentage: number | null;
  criticalDefect: CriticalDefectResult;
}

interface QuestionScoringSnapshot {
  selectedValue: AnswerValue;
  weight: number;
  isCritical: boolean;
  isExcludable: boolean;
}

function getQuestionScoringSnapshot(question: Question, answer: Answer | undefined): QuestionScoringSnapshot {
  return {
    selectedValue: answer?.selectedValue ?? null,
    weight: answer?.weightSnapshot ?? question.weight,
    isCritical: answer?.isCriticalSnapshot ?? Boolean(question.critical),
    isExcludable: answer?.isExcludableSnapshot ?? Boolean(question.excludable),
  };
}

function calculateCategoryScore(
  category: Category,
  categoryQuestions: Question[],
  answerByQuestionCode: Map<string, Answer>,
) {
  let earnedScore = 0;
  let fullScore = 0;
  const unansweredQuestionCodes: string[] = [];
  const excludedQuestionCodes: string[] = [];
  const invalidAnswerQuestionCodes: string[] = [];

  for (const question of categoryQuestions) {
    const snapshot = getQuestionScoringSnapshot(question, answerByQuestionCode.get(question.code));

    if (snapshot.selectedValue === "NA") {
      if (snapshot.isExcludable) {
        excludedQuestionCodes.push(question.code);
        continue;
      }

      invalidAnswerQuestionCodes.push(question.code);
      fullScore += 2 * snapshot.weight;
      continue;
    }

    fullScore += 2 * snapshot.weight;

    if (snapshot.selectedValue === null) {
      unansweredQuestionCodes.push(question.code);
      continue;
    }

    earnedScore += snapshot.selectedValue * snapshot.weight;
  }

  const isComplete =
    unansweredQuestionCodes.length === 0 &&
    invalidAnswerQuestionCodes.length === 0 &&
    fullScore > 0;

  return {
    categoryCode: category.code,
    categoryName: category.name,
    earnedScore,
    fullScore,
    percentage: isComplete ? (earnedScore / fullScore) * 100 : null,
    isComplete,
    unansweredQuestionCodes,
    excludedQuestionCodes,
    invalidAnswerQuestionCodes,
  } satisfies CategoryScore;
}

function calculateCriticalDefectResult(
  questionSet: Question[],
  answerByQuestionCode: Map<string, Answer>,
): CriticalDefectResult {
  const failedQuestionCodes: string[] = [];
  const incompleteQuestionCodes: string[] = [];

  for (const question of questionSet) {
    const snapshot = getQuestionScoringSnapshot(question, answerByQuestionCode.get(question.code));
    if (!snapshot.isCritical) continue;

    if (snapshot.selectedValue === 0) {
      failedQuestionCodes.push(question.code);
      continue;
    }

    if (
      snapshot.selectedValue === null ||
      (snapshot.selectedValue === "NA" && !snapshot.isExcludable)
    ) {
      incompleteQuestionCodes.push(question.code);
    }
  }

  return {
    status: failedQuestionCodes.length
      ? "FAIL"
      : incompleteQuestionCodes.length
        ? "INCOMPLETE"
        : "PASS",
    failedQuestionCodes,
    incompleteQuestionCodes,
  };
}

/**
 * Calculates the same overall percentage as the legacy Google Sheet:
 * each completed category contributes an equal 20% of the overall score.
 *
 * Percentages retain full precision. Round only when presenting the result.
 * A critical question scored 0 fails the critical-defect gate regardless of
 * the overall percentage. This function intentionally does not apply an
 * overall pass threshold because no approved threshold is configured yet.
 */
export function calculateInspectionScore(
  answers: Answer[],
  questionSet: Question[] = questions,
  categorySet: Category[] = categories,
): InspectionScore {
  const answerByQuestionCode = new Map(answers.map((answer) => [answer.questionCode, answer]));
  const categoryScores = categorySet.map((category) =>
    calculateCategoryScore(
      category,
      questionSet.filter((question) => question.categoryCode === category.code),
      answerByQuestionCode,
    ),
  );
  const isComplete =
    categoryScores.length > 0 && categoryScores.every((category) => category.isComplete);
  const overallPercentage = isComplete
    ? categoryScores.reduce((sum, category) => sum + (category.percentage ?? 0), 0) /
      categoryScores.length
    : null;

  return {
    ruleVersion: SCORING_RULE_VERSION,
    isComplete,
    categories: categoryScores,
    overallPercentage,
    criticalDefect: calculateCriticalDefectResult(questionSet, answerByQuestionCode),
  };
}

export function roundScore(value: number, decimalPlaces = 2) {
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
