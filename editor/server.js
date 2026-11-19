import {dirname} from "node:path"
import {fileURLToPath, pathToFileURL} from "node:url"
import {createConnection, TextDocuments, TextDocumentSyncKind} from "vscode-languageserver/node.js"
import {TextDocument} from "vscode-languageserver-textdocument"
import {createProject, projectLocation} from "./project.js"

const connection = createConnection()
const documents = new TextDocuments(TextDocument)
const buffers = new Map()
const projects = new Map()
let roots = []
connection.onInitialize(params => {
  roots = (params.workspaceFolders?.map(f => f.uri) ?? (params.rootUri ? [params.rootUri] : []))
    .filter(uri => uri.startsWith("file:")).map(uri => fileURLToPath(uri))
  return {capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental, definitionProvider: true, referencesProvider: true,
  }}
})
documents.onDidChangeContent(({document}) => buffers.set(fileURLToPath(document.uri), document))
documents.onDidClose(({document}) => buffers.delete(fileURLToPath(document.uri)))
connection.onDidChangeWatchedFiles(() => {
  for (const project of projects.values()) project.dispose()
  projects.clear()
})

function navigation(params, references) {
  const document = documents.get(params.textDocument.uri)
  if (!document) return []
  const file = fileURLToPath(document.uri)
  const location = projectLocation(file, roots.length ? roots : [dirname(file)])
  const key = location.config ?? location.root
  if (!projects.has(key)) projects.set(key, createProject(location, buffers))
  const project = projects.get(key)
  const symbols = project.definitions(file, document.offsetAt(params.position))
  const matches = symbols.flatMap(symbol => {
    if (references) return project.references(symbol, params.context.includeDeclaration)
    const {sheet, name} = symbol
    const first = (sheet.classes.get(name) ?? sheet.variables.get(name))?.[0]
    return first ? [{file: sheet.file, ...first}] : []
  })
  const hits = new Map(matches.map(hit => [JSON.stringify([hit.file, hit.start, hit.length]), hit]))
  const files = new Map(buffers)
  return [...hits.values()].map(hit => {
    const uri = pathToFileURL(hit.file).href
    if (!files.has(hit.file)) files.set(hit.file, TextDocument.create(uri, "", 0, project.read(hit.file)))
    const doc = files.get(hit.file)
    return {uri, range: {start: doc.positionAt(hit.start), end: doc.positionAt(hit.start + hit.length)}}
  })
}
connection.onDefinition(params => navigation(params, false))
connection.onReferences(params => navigation(params, true))
documents.listen(connection)
connection.listen()
