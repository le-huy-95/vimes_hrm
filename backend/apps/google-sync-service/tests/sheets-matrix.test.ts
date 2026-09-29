import { describe, expect, it } from "vitest";
import {
  filterWritablePatch,
  matrixHash,
  parseSheetValues,
  rowHash,
  rowsToValues,
  type SheetRow,
} from "../src/modules/sync/sheets-matrix.js";
import { isRealSpreadsheetId } from "../src/modules/sync/sheets-live.js";

const sample: SheetRow[] = [
  {
    code: "T-1",
    title: "A",
    status: "TODO",
    personal_note: "n",
    assignee_user_id: "u1",
  },
];

describe("sheets-matrix", () => {
  it("hashes stably", () => {
    expect(rowHash(sample[0]!)).toBe(rowHash(sample[0]!));
    expect(matrixHash(sample).length).toBe(64);
  });

  it("round-trips values", () => {
    const values = rowsToValues(sample);
    const { rows, hashes } = parseSheetValues(values);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.code).toBe("T-1");
    expect(hashes["T-1:u1"]).toBeTruthy();
  });

  it("filters protected title", () => {
    const patch = filterWritablePatch(
      { title: "hack", status: "DONE", personal_note: "x" },
      ["status", "personal_note"],
    );
    expect(patch).toEqual({ status: "DONE", personal_note: "x" });
    expect((patch as { title?: string }).title).toBeUndefined();
  });

  it("rejects local spreadsheet ids", () => {
    expect(isRealSpreadsheetId("local-sheet-abc")).toBe(false);
    expect(isRealSpreadsheetId(null)).toBe(false);
    expect(isRealSpreadsheetId("1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms")).toBe(true);
  });
});
