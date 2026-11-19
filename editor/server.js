import {dirname} from "node:path"
import {fileURLToPath, pathToFileURL} from "node:url"
import {createConnection, DiagnosticSeverity, DiagnosticTag, LSPErrorCodes, ResponseError, TextDocuments, TextDocumentSyncKind} from "vscode-languageserver/node.js"
import {TextDocument} from "vscode-languageserver-textdocument"
import {createProject, projectLocation} from "./project.js"

const connection = createConnection()
const documents = new TextDocuments(TextDocument)
const buffers = new Map()
const projects = new Map()
let roots = []
let versionedEdits
connection.onInitialize(params => {
  versionedEdits = params.capabilities.workspace?.workspaceEdit?.documentChanges
  roots = (params.workspaceFolders?.map(f => f.uri) ?? (params.rootUri ? [params.rootUri] : []))
    .filter(uri => uri.startsWith("file:")).map(uri => fileURLToPath(uri))
  return {capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    definitionProvider: true,
    referencesProvider: true,
    renameProvider: {prepareProvider: true},
  }}
})
documents.onDidChangeContent(({document}) => {
  buffers.set(fileURLToPath(document.uri), document)
  scheduleDiagnostics()
})
documents.onDidClose(({document}) => {
  buffers.delete(fileURLToPath(document.uri))
  if (document.languageId === "css") connection.sendDiagnostics({uri: document.uri, diagnostics: []})
  scheduleDiagnostics()
})
connection.onDidChangeWatchedFiles(() => {
  for (const project of projects.values()) project.dispose()
  projects.clear()
  scheduleDiagnostics()
})

function projectFor(file) {
  const location = projectLocation(file, roots.length ? roots : [dirname(file)])
  const key = location.config ?? location.root
  if (!projects.has(key)) projects.set(key, createProject(location, buffers))
  return projects.get(key)
}

function contextAt(params) {
  const document = documents.get(params.textDocument.uri)
  if (!document) return
  const file = fileURLToPath(document.uri)
  return {project: projectFor(file), document, file, offset: document.offsetAt(params.position)}
}

const rangeAt = (doc, span) => ({start: doc.positionAt(span.start), end: doc.positionAt(span.start + span.length)})

let diagnosticsTimer
function scheduleDiagnostics() {
  clearTimeout(diagnosticsTimer)
  diagnosticsTimer = setTimeout(() => {
    const groups = new Map()
    for (const [file, doc] of buffers) {
      if (doc.languageId !== "css" || !file.endsWith(".css") || file.endsWith(".module.css")) continue
      const project = projectFor(file)
      if (!groups.has(project)) groups.set(project, [])
      groups.get(project).push(file)
    }
    for (const [project, files] of groups) {
      for (const [file, spans] of project.unusedClasses(files)) {
        const doc = buffers.get(file)
        const diagnostics = spans.map(span => ({
          range: rangeAt(doc, span),
          severity: DiagnosticSeverity.Hint,
          tags: [DiagnosticTag.Unnecessary],
          source: "css-as-tags",
          code: "unused-class",
          message: `No static project reference to .${span.name}.`,
        }))
        connection.sendDiagnostics({uri: doc.uri, version: doc.version, diagnostics})
      }
    }
  }, 200)
}

function locations(project) {
  const files = new Map(buffers)
  return hit => {
    const uri = pathToFileURL(hit.file).href
    if (!files.has(hit.file)) files.set(hit.file, TextDocument.create(uri, "", 0, project.read(hit.file)))
    return {uri, range: rangeAt(files.get(hit.file), hit)}
  }
}

function navigation(params, references) {
  const ctx = contextAt(params)
  if (!ctx) return []
  const {project, file, offset} = ctx
  const symbols = project.definitions(file, offset)
  const matches = symbols.flatMap(symbol => {
    if (references) return project.references(symbol, params.context.includeDeclaration)
    const {sheet, name} = symbol
    const first = (sheet.classes.get(name) ?? sheet.variables.get(name))?.[0]
    return first ? [{file: sheet.file, ...first}] : []
  })
  const hits = new Map(matches.map(hit => [JSON.stringify([hit.file, hit.start, hit.length]), hit]))
  return [...hits.values()].map(locations(project))
}
connection.onDefinition(params => navigation(params, false))
connection.onReferences(params => navigation(params, true))
connection.onPrepareRename(params => {
  const ctx = contextAt(params)
  if (!ctx) return null
  const target = ctx.project.prepareRename(ctx.file, ctx.offset)
  return target ? rangeAt(ctx.document, target) : null
})
connection.onRenameRequest(params => {
  const ctx = contextAt(params)
  if (!ctx) return null
  let edits
  try {
    edits = ctx.project.rename(ctx.file, ctx.offset, params.newName)
  } catch (error) {
    throw new ResponseError(LSPErrorCodes.RequestFailed, error.message)
  }
  if (!edits) return null
  const location = locations(ctx.project)
  const changes = {}
  for (const edit of edits) {
    const {uri, range} = location(edit);
    (changes[uri] ??= []).push({range, newText: edit.newText})
  }
  return versionedEdits ? {documentChanges: Object.entries(changes).map(([uri, edits]) => ({
    textDocument: {uri, version: documents.get(uri)?.version ?? null}, edits,
  }))} : {changes}
})
documents.listen(connection)
connection.listen()
