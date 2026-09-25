import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCardText } from "../src/utils/cardText.ts";

test("marketplace quotes and escaped line breaks remain readable without changing rules", () => {
  const pasted = String.raw`Play this with COST [Energy Blast (3)] if you have a """Demon Stealth Dragon, Shiranui ""Oboro"""" crest!\r\nChoose a unit with \"Stealth\" and call it to (RC).`;
  assert.equal(
    normalizeCardText(pasted),
    'Play this with COST [Energy Blast (3)] if you have a "Demon Stealth Dragon, Shiranui "Oboro" crest!\nChoose a unit with "Stealth" and call it to (RC).',
  );
});

test("copied formatting becomes plain text with meaningful paragraph breaks", () => {
  const pasted =
    "<div><b>[AUTO](VC):</b>&nbsp;Draw&nbsp;&nbsp;a card.<br />COST [Counter Blast (1)].</div><p>[CONT](RC): &quot;Name&quot; gets +5000 &amp; &#9733;.</p>";
  assert.equal(
    normalizeCardText(pasted),
    '[AUTO](VC): Draw a card.\nCOST [Counter Blast (1)].\n\n[CONT](RC): "Name" gets +5000 & ★.',
  );
});

test("encoded formatting and mixed-case attributes preserve card comparisons", () => {
  const pasted =
    '&lt;DIV&gt;<SPAN class="ability"><STRONG>[CONT]</STRONG></SPAN>: Power &lt; 5000 &amp; grade &gt; 1.<BR/>&lt;plain text&gt;&lt;/DIV&gt;';
  assert.equal(
    normalizeCardText(pasted),
    "[CONT]: Power < 5000 & grade > 1.\n<plain text>",
  );
});

test("nested formatting is fully removed before text is saved again", () => {
  const pasted =
    "<b<b>>[AUTO]</b</b>>: Draw a card.<di<b>v>Next ability.</div>";
  const cleaned = "[AUTO]: Draw a card.\nNext ability.";
  assert.equal(normalizeCardText(pasted), cleaned);
  assert.equal(normalizeCardText(cleaned), cleaned);
});

test("unknown markup remains literal text for React to escape", () => {
  const text = '<iframe title="card notes">Power < 5000</iframe>';
  assert.equal(normalizeCardText(text), text);
});

test("cleans whitespace while preserving ability punctuation, Unicode and paragraphs", () => {
  const text =
    " \u200b[AUTO](VC):  COST [Soul Blast (1)], draw a card.\r\n\r\n\r\n  [1/Turn] “Name” gets +10000/★+1.\t\n";
  const cleaned =
    "[AUTO](VC): COST [Soul Blast (1)], draw a card.\n\n[1/Turn] “Name” gets +10000/★+1.";
  assert.equal(normalizeCardText(text), cleaned);
  assert.equal(normalizeCardText(cleaned), cleaned);
});

test("empty, invalid entities and literal comparisons do not break text rendering", () => {
  for (const empty of [null, undefined, "", "\n \t\u00a0"])
    assert.equal(normalizeCardText(empty), "");
  const text =
    "[CONT]: Power < 5000 & grade > 1; <plain text> &#x110000; &#0; &unknown;";
  assert.equal(normalizeCardText(text), text);
  assert.equal(normalizeCardText("&#x1F31F; &#xD800;"), "🌟 &#xD800;");
});
