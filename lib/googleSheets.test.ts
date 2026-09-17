import { describe, expect, it } from "vitest";

import { sheetHeaders } from "./googleSheets";

describe("Google Sheets summary columns", () => {
  it("appends overall and per-category score columns after the existing backup payload columns", () => {
    expect(sheetHeaders.slice(-21)).toEqual([
      "scoring_rule_version",
      "score_percent",
      "score_status",
      "critical_defect_status",
      "critical_defect_count",
      "critical_defect_codes",
      "category_1_earned",
      "category_1_full",
      "category_1_percent",
      "category_2_earned",
      "category_2_full",
      "category_2_percent",
      "category_3_earned",
      "category_3_full",
      "category_3_percent",
      "category_4_earned",
      "category_4_full",
      "category_4_percent",
      "category_5_earned",
      "category_5_full",
      "category_5_percent",
    ]);
    expect(sheetHeaders.at(-22)).toBe("deficiencies");
  });
});
