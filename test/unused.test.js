import assert from "node:assert/strict"
import {spawn} from "node:child_process"
import {once} from "node:events"
import {mkdtempSync, rmSync, writeFileSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
import test from "node:test"
import {fileURLToPath, pathToFileURL} from "node:url"
import {createProtocolConnection, DiagnosticSeverity, DiagnosticTag, StreamMessageReader, StreamMessageWriter} from "vscode-languageserver/node.js"

test("unused selector hints follow bindings and markup through live edits and file changes", {timeout: 20000}, async t => {
  const root = mkdtempSync(join(tmpdir(), "css-hints-"))
  const uri = file => pathToFileURL(join(root, file)).href
  const app = `import styles, { NamedTag as Tag } from "./style.css"
import * as tags from "./style.css"
import "./global.css"
const { destructured: local } = styles
let target
;({ assigned: target } = styles)
const view = <Tag.section class={styles.dotAccess} classList={{ solid: true }}/>
const raw = <tags.NamespaceTag className="jsx literal"/>
document.querySelector(".queried")
document.body.classList.add("added")
export const value = styles["bracket-access"]
const copy = { unrelated: 1 }
console.log(copy.unrelated, "unused", "runtime-" + suffix)`
  const classes = ["named-tag", "namespace-tag", "dot-access", "bracket-access", "destructured", "assigned", "solid", "jsx", "literal", "queried", "added", "from-html", "from-barrel", "cross-sheet", "unrelated", "runtime-class", "unused"]
  const css = classes.map(name => "." + name + " {}").join("\n") + "\n@media print { .unused:hover {} }\n:root { --color: red; }"
  const html = "<style>.unused { color: red }</style><div class=\"from-html\"></div>"
  for (const [file, content] of Object.entries({
    "style.css": css,
    "global.css": ".cross-sheet {}",
    "app.tsx": app,
    "index.html": html,
    "barrel.ts": "export { FromBarrel as Widget } from \"./style.css\"; export { CrossSheet } from \"./global.css\";",
  })) writeFileSync(join(root, file), content)

  const server = spawn(process.execPath, [fileURLToPath(new URL("../editor/server.js", import.meta.url)), "--stdio"], {stdio: ["pipe", "pipe", "inherit"]})
  const client = createProtocolConnection(new StreamMessageReader(server.stdout), new StreamMessageWriter(server.stdin))
  t.after(() => {
    client.dispose()
    server.kill()
    rmSync(root, {recursive: true, force: true})
  })
  client.listen()
  await client.sendRequest("initialize", {processId: process.pid, rootUri: pathToFileURL(root).href, capabilities: {}})
  await client.sendNotification("initialized", {})
  const cssUri = uri("style.css")
  function nextHints() {
    return new Promise(resolve => {
      const subscription = client.onNotification("textDocument/publishDiagnostics", params => {
        if (params.uri !== cssUri) return
        subscription.dispose()
        resolve(params)
      })
    })
  }
  function open(file, languageId, text) {
    return client.sendNotification("textDocument/didOpen", {textDocument: {uri: uri(file), languageId, version: 1, text}})
  }
  const pending = nextHints()
  await open("style.css", "css", css)
  const lines = css.split("\n")
  function selectors({diagnostics}) {
    return diagnostics.map(({range: {start, end}, severity, tags}) => {
      assert.equal(severity, DiagnosticSeverity.Hint)
      assert.deepEqual(tags, [DiagnosticTag.Unnecessary])
      assert.equal(start.line, end.line)
      return lines[start.line].slice(start.character, end.character)
    }).sort()
  }
  const initial = await pending
  assert.equal(initial.version, 1)
  const expected = [".runtime-class", ".unrelated", ".unused", ".unused"].sort()
  assert.deepEqual(selectors(initial), expected)

  const usedInBuffer = nextHints()
  await open("app.tsx", "typescriptreact", app + "\nconst live = <div class=\"unused\"/>")
  assert.deepEqual(selectors(await usedInBuffer), [".runtime-class", ".unrelated"])
  const reverted = nextHints()
  await client.sendNotification("textDocument/didChange", {textDocument: {uri: uri("app.tsx"), version: 2}, contentChanges: [{text: app}]})
  assert.deepEqual(selectors(await reverted), expected)
  const htmlBuffer = nextHints()
  await open("index.html", "html", html.replace("from-html", "unused"))
  assert.deepEqual(selectors(await htmlBuffer), [".from-html", ".runtime-class", ".unrelated"])
  const restored = nextHints()
  await client.sendNotification("textDocument/didClose", {textDocument: {uri: uri("index.html")}})
  assert.deepEqual(selectors(await restored), expected)

  const added = nextHints()
  writeFileSync(join(root, "new.html"), "<div class=\"unused\"></div>")
  await client.sendNotification("workspace/didChangeWatchedFiles", {changes: [{uri: uri("new.html"), type: 1}]})
  assert.deepEqual(selectors(await added), [".runtime-class", ".unrelated"])

  const editedSheet = nextHints()
  await client.sendNotification("textDocument/didChange", {textDocument: {uri: cssUri, version: 2}, contentChanges: [{text: ".unused, .new-rule {}"}]})
  const edited = await editedSheet
  assert.equal(edited.version, 2)
  assert.deepEqual(edited.diagnostics.map(hint => hint.range), [{start: {line: 0, character: 9}, end: {line: 0, character: 18}}])

  const cleared = nextHints()
  await client.sendNotification("textDocument/didClose", {textDocument: {uri: cssUri}})
  assert.deepEqual((await cleared).diagnostics, [])
  await client.sendRequest("shutdown")
  const exited = once(server, "exit")
  await client.sendNotification("exit")
  assert.equal((await exited)[0], 0)
})
