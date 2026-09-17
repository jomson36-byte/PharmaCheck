import { describe, expect, it } from "vitest";

import { sheetHeaders } from "./googleSheets";

describe("Google Sheets summary columns", () => {
  it("appends score columns after the existing backup payload columns", () => {
    expect(sheetHeaders.slice(-6)).toEqual([
      "scoring_rule_version",
      "score_percent",
      "score_status",
      "critical_defect_status",
      "critical_defect_count",
      "critical_defect_codes",
    ]);
    expect(sheetHeaders.at(-7)).toBe("deficiencies");
  });
});
