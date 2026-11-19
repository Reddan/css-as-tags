import assert from "node:assert/strict"
import {mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import test from "node:test"
import {TextDocument} from "vscode-languageserver-textdocument"
import {createProject, projectLocation} from "../editor/project.js"

test("CSS, imported JSX, barrel exports and styles properties share source locations", t => {
  const root = mkdtempSync(join(tmpdir(), "css-navigation-"))
  t.after(() => rmSync(root, {recursive: true, force: true}))
  const files = {
    "style.css": "/* .toolbar-row */\r\n.toolbar-row:is(.toolbar-row) { --accent: red; color: var(--accent) }",
    "other.css": ".toolbar-row { color: black }",
    "barrel.ts": "export { ToolbarRow as Actions } from \"./style.css\"",
    "native.js": `import styles, { ToolbarRow } from "./style.css";
document.body.append(ToolbarRow());
document.body.className = styles.toolbarRow;
document.querySelector(".toolbar-row");
document.body.classList.add("toolbar-row");`,
    "app.tsx": `import styles, { ToolbarRow as Row } from "./style.css";
import { ToolbarRow as Other } from "./other.css";
import { Actions } from "./barrel";
const view = <Row class={styles.toolbarRow}><Actions/><Other/></Row>;
const raw = <div className="left toolbar-row right"/>;
const alternate = styles["toolbar-row"];
const accent = styles["--accent"];
function shadow(styles: { toolbarRow: number }) { return styles.toolbarRow; }`,
  }
  for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text)
  const buffers = new Map()
  const app = join(root, "app.tsx")
  const css = join(root, "style.css")
  const source = files["app.tsx"]
  const project = createProject(projectLocation(css, [root]), buffers)
  t.after(project.dispose)
  const position = (token, extra = 0) => source.indexOf(token) + extra
  for (const offset of [position("ToolbarRow"),
    position("as Row", 3),
    position("<Row", 1),
    position("<Actions", 1),
    position("styles.toolbarRow", 8),
    position("[\"toolbar-row\"]", 3)]) {
    const symbol = project.definition(app, offset)
    assert.equal(symbol?.sheet.file, css, "definition at " + source.slice(offset, offset + 10))
    assert.equal(symbol.name, "toolbar-row")
  }
  const symbol = project.definition(css, files["style.css"].indexOf(":is") - 2)
  const refs = project.references(symbol, true)
  const cssHits = refs.filter(r => r.file === css)
  assert.equal(cssHits.length, 2)
  assert.equal(refs.filter(r => r.file.endsWith("/native.js")).length, 5)
  const at = offset => refs.some(r => r.file === app && r.start === offset)
  for (const offset of [position("<Row", 1),
    position("</Row", 2),
    position("<Actions", 1),
    position("styles.toolbarRow", 7),
    position("left toolbar-row", 5),
    position("[\"toolbar-row\"]", 2)]) {
    assert.ok(at(offset), "reference at " + source.slice(offset, offset + 10))
  }
  assert.ok(!at(position("<Other", 1)))
  assert.ok(!at(source.lastIndexOf("toolbarRow")))
  assert.equal(project.definition(app, position("[\"--accent\"]", 3)).name, "--accent")
  const color = project.definition(css, files["style.css"].lastIndexOf("--accent"))
  assert.equal(project.references(color, true).length, 3)
  const unsaved = "\n\n" + files["style.css"]
  buffers.set(css, TextDocument.create("file:///style.css", "css", 2, unsaved))
  assert.equal(project.definition(app, position("<Row", 1)).sheet.classes.get("toolbar-row")[0].start,
    unsaved.indexOf(".toolbar-row:is"))
})
