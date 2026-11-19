import assert from "node:assert/strict"
import {mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import test from "node:test"
import {TextDocument} from "vscode-languageserver-textdocument"
import {createProject} from "../editor/project.js"

test("one class rename updates CSS, component bindings and literal tokens using their own spelling", t => {
  const root = mkdtempSync(join(tmpdir(), "plain-css-rename-"))
  t.after(() => rmSync(root, {recursive: true, force: true}))
  const source = {
    "main.css": "/* .feedback-toolbar */\r\n@scope (.feedback-toolbar) { .feedback-toolbar:hover {} }\n.rating-group {}",
    "replay.css": ".replay .feedback-toolbar > span {}",
    "isolated.module.css": ".feedback-toolbar {}",
    "barrel.ts": "export { FeedbackToolbar, FeedbackToolbar as Toolbar } from \"./main.css\";",
    "page.tsx": `import styles from "./main.css";
import { FeedbackToolbar, Toolbar } from "./barrel";
export const view = <FeedbackToolbar class={styles.feedbackToolbar}><Toolbar class="feedback-toolbar"/>
  <div classList={{ "feedback-toolbar": enabled }} class={styles["feedback-toolbar"]}/>
</FeedbackToolbar>;
const state = { FeedbackToolbar };
const LocalComponent = 1;
export const literal = <p className="new feedback-toolbar feedback-toolbar-extra" title="feedback-toolbar"/>;
function other(styles) { return styles.feedbackToolbar; }`,
    "namespace.tsx": "import * as tags from \"./main.css\"; const { FeedbackToolbar } = tags; export const node = <FeedbackToolbar/>;",
    "native.js": "document.querySelector(\".feedback-toolbar:hover\").classList.remove(\"feedback-toolbar\");",
    "page.html": "<!-- class=\"feedback-toolbar\" --><style>.feedback-toolbar:hover{}</style><div CLASS=\"one feedback-toolbar\" title=\"feedback-toolbar\"></div>",
  }
  for (const [file, content] of Object.entries(source)) writeFileSync(join(root, file), content)
  const buffers = new Map()
  const jsx = join(root, "page.tsx")
  const dirty = source["page.tsx"] + "\nconst pending = <i class=\"feedback-toolbar\"/>;"
  buffers.set(jsx, TextDocument.create("file://" + jsx, "typescriptreact", 3, dirty))
  const project = createProject({root}, buffers)
  t.after(project.dispose)

  const expected = {
    "main.css": "/* .feedback-toolbar */\r\n@scope (.review-actions) { .review-actions:hover {} }\n.rating-group {}",
    "replay.css": ".replay .review-actions > span {}",
    "barrel.ts": "export { ReviewActions, ReviewActions as Toolbar } from \"./main.css\";",
    "page.tsx": dirty.replace("FeedbackToolbar, Toolbar", "ReviewActions, Toolbar")
      .replaceAll("<FeedbackToolbar", "<ReviewActions").replace("</FeedbackToolbar>", "</ReviewActions>")
      .replace("class={styles.feedbackToolbar}", "class={styles.reviewActions}")
      .replaceAll("class=\"feedback-toolbar\"", "class=\"review-actions\"")
      .replace("\"feedback-toolbar\": enabled", "\"review-actions\": enabled")
      .replace("styles[\"feedback-toolbar\"]", "styles[\"review-actions\"]")
      .replace("{ FeedbackToolbar }", "{ FeedbackToolbar: ReviewActions }")
      .replace("new feedback-toolbar feedback-toolbar-extra", "new review-actions feedback-toolbar-extra"),
    "namespace.tsx": "import * as tags from \"./main.css\"; const { ReviewActions } = tags; export const node = <ReviewActions/>;",
    "native.js": "document.querySelector(\".review-actions:hover\").classList.remove(\"review-actions\");",
    "page.html": "<!-- class=\"feedback-toolbar\" --><style>.review-actions:hover{}</style><div CLASS=\"one review-actions\" title=\"feedback-toolbar\"></div>",
  }
  const origins = [
    ["main.css", ".feedback-toolbar:hover", "review-actions"],
    ["page.tsx", "<FeedbackToolbar", "ReviewActions"],
    ["page.tsx", "styles.feedbackToolbar", "reviewActions", 8],
    ["page.tsx", "new feedback-toolbar", "review-actions", 5],
    ["page.html", "one feedback-toolbar", "review-actions", 5],
  ]
  for (const [file, word, input, inside = 2] of origins) {
    const path = join(root, file)
    const offset = project.read(path).indexOf(word) + inside
    const byFile = new Map()
    for (const edit of project.rename(path, offset, input)) {
      if (!byFile.has(edit.file)) byFile.set(edit.file, [])
      byFile.get(edit.file).push(edit)
    }
    assert.deepEqual([...byFile.keys()].sort(), Object.keys(expected).map(f => join(root, f)).sort())
    for (const [file, value] of Object.entries(expected)) {
      const path = join(root, file)
      let text = project.read(path)
      for (const {start, length, newText} of byFile.get(path).sort((a, b) => b.start - a.start))
        text = text.slice(0, start) + newText + text.slice(start + length)
      assert.equal(text, value, file + " from " + word)
    }
  }
  const start = dirty.indexOf("<FeedbackToolbar") + 1
  assert.throws(() => project.rename(jsx, start, "RatingGroup"), /already exists/)
  assert.throws(() => project.rename(jsx, start, "LocalComponent"), /already in scope/)
  assert.equal(project.prepareRename(jsx, dirty.indexOf("<Toolbar") + 1), undefined)
})

test("renaming a single-word class preserves bindings used in object shorthand", t => {
  const root = mkdtempSync(join(tmpdir(), "plain-css-rename-"))
  t.after(() => rmSync(root, {recursive: true, force: true}))
  const css = join(root, "status.css")
  const app = join(root, "status.tsx")
  writeFileSync(css, ".active {}")
  const source = `import styles from "./status.css";
const { active } = styles;
const view = <div classList={{active, other: true}}/>;
const list = [styles.active, styles["active"], active];`
  writeFileSync(app, source)
  const project = createProject({root}, new Map())
  t.after(project.dispose)
  let text = source
  for (const edit of project.rename(css, 2, "is-active").filter(edit => edit.file === app).sort((a, b) => b.start - a.start)) {
    text = text.slice(0, edit.start) + edit.newText + text.slice(edit.start + edit.length)
  }
  assert.equal(text, `import styles from "./status.css";
const { isActive: active } = styles;
const view = <div classList={{"is-active": active, other: true}}/>;
const list = [styles.isActive, styles["is-active"], active];`)
})
