import assert from "node:assert/strict"
import {mkdtempSync, readFileSync, rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import test from "node:test"
import {SourceMapConsumer} from "source-map-js"
import {parseSheet} from "../lib/css.js"
import {generateModule} from "../lib/module.js"
import {writeTypes} from "../lib/types.js"

test("exports use real selectors, including nested and escaped class names", () => {
  const text = String.raw`/* .ignored */ @media (width > 0px) { .feedback-toolbar:not([title=".no"]) { & > .rating\:group { content: '.absent'; } } }
@property --brand { syntax: "<color>"; inherits: false; initial-value: red }
:root { color: var( --brand ); }`
  const sheet = parseSheet(text, "styles.css")
  assert.deepEqual([...sheet.classes.keys()], ["feedback-toolbar", "rating:group"])
  assert.deepEqual([...sheet.components], [["FeedbackToolbar", "feedback-toolbar"]])
  const escaped = sheet.classes.get("rating:group")[0]
  assert.equal(text.slice(escaped.start, escaped.start + escaped.length), String.raw`.rating\:group`)
  for (const {start, length} of [...sheet.variables.get("--brand"), ...sheet.uses.get("--brand")])
    assert.equal(text.slice(start, start + length), "--brand")
  assert.match(generateModule(sheet, "./styles.css", "solid"), /var\(--brand\)/)
  assert.throws(() => parseSheet(".a-b,.a_b {}", "ambiguous.css"), /ambiguous/)
})

test("F12 maps the full TypeScript declaration and its name to the same CSS range", t => {
  const dir = mkdtempSync(join(tmpdir(), "css-maps-"))
  t.after(() => rmSync(dir, {recursive: true, force: true}))
  const file = join(dir, "style.css")
  const sheet = parseSheet(".first {}\n@scope (.panel) { .save-button {} }", file)
  writeTypes(file, sheet, "react")
  const text = readFileSync(join(dir, "style.d.css.ts"), "utf8")
  const encoded = text.match(/sourceMappingURL=data:application\/json;charset=utf-8;base64,(\S+)/)[1]
  const map = new SourceMapConsumer(JSON.parse(Buffer.from(encoded, "base64").toString()))
  for (const spelling of ["SaveButton", "\"saveButton\""]) {
    const lines = text.split("\n")
    const index = lines.findIndex(line => line.includes(spelling))
    const line = lines[index]
    for (const [column, cssColumn] of [[line.search(/\S/), 18],
      [line.indexOf(spelling), 18],
      [line.indexOf(spelling) + spelling.length, 30],
      [line.length, 30]]) {
      const result = map.originalPositionFor({line: index + 1, column})
      assert.deepEqual([result.source, result.line, result.column], ["style.css", 2, cssColumn])
    }
  }
  assert.deepEqual([...sheet.classes.keys()].sort(), ["first", "panel", "save-button"])
})
