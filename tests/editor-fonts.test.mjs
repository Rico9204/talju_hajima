import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EDITOR_FONTS, POPULAR_FONT_PRESETS } from "../src/lib/editorFonts.ts";

test("DEFAULT_EDITOR_FONTS contains standard Korean and Latin fonts", () => {
  assert.ok(DEFAULT_EDITOR_FONTS.length >= 10);
  const ids = DEFAULT_EDITOR_FONTS.map((f) => f.id);
  assert.ok(ids.includes("batang"));
  assert.ok(ids.includes("gothic"));
  assert.ok(ids.includes("pretendard"));
  assert.ok(ids.includes("nanum-square"));
});

test("POPULAR_FONT_PRESETS includes recognizable Korean web fonts", () => {
  assert.ok(POPULAR_FONT_PRESETS.length >= 4);
  const names = POPULAR_FONT_PRESETS.map((p) => p.name);
  assert.ok(names.some((n) => n.includes("Gmarket")));
  assert.ok(names.some((n) => n.includes("CookieRun")));
});
