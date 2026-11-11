import assert from "node:assert/strict";
import test from "node:test";
import { resolveCoverVariables } from "./coverVariables";

const date = new Date(2026, 9, 17, 12);

test("formats English and Spanish cover dates", () => {
  assert.equal(resolveCoverVariables("[DATE] / [FECHA]", date), "October 17, 2026 / 17 de octubre de 2026");
});

test("replaces every occurrence without changing other tokens or markup", () => {
  assert.equal(resolveCoverVariables("<p>[FECHA] [FECHA] [OTHER] [date]</p>", date),
    "<p>17 de octubre de 2026 17 de octubre de 2026 [OTHER] [date]</p>");
});

test("uses the supplied local calendar date across year boundaries", () => {
  assert.equal(resolveCoverVariables("[FECHA]", new Date(2027, 0, 1)), "1 de enero de 2027");
});

test("leaves covers without date tokens unchanged", () => {
  assert.equal(resolveCoverVariables("# Cover\nA fixed date", date), "# Cover\nA fixed date");
});
