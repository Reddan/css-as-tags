import {dirname, join, relative, resolve, sep} from "node:path"
import ts from "typescript"
import {parseSheet, visitClasses} from "../lib/css.js"
import {declarations} from "../lib/module.js"

export function projectLocation(file, folders) {
  const folder = folders.filter(root => file.startsWith(root + sep)).sort((a, b) => b.length - a.length)[0] ?? dirname(file)
  for (let dir = dirname(file); ; dir = dirname(dir)) {
    for (const name of ["tsconfig.json", "jsconfig.json"]) {
      const config = join(dir, name)
      if (ts.sys.fileExists(config)) return {root: dir, config}
    }
    if (dir === folder || dir === dirname(dir)) break
  }
  return {root: folder}
}

const declarationFile = file => file.replace(/\.css$/, ".d.css.ts")
const stylesheet = file => file.replace(/\.d\.css\.ts$/, ".css")

export function createProject({root, config}, buffers) {
  const json = config ? ts.readConfigFile(config, ts.sys.readFile).config : {}
  const parsed = ts.parseJsonConfigFileContent(json ?? {}, ts.sys, root, {allowJs: true, allowArbitraryExtensions: true}, config)
  const options = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    jsx: ts.JsxEmit.Preserve,
    ...parsed.options,
  }
  const sheets = new Map()
  const read = file => buffers.get(file)?.getText() ?? ts.sys.readFile(file)
  const version = file => String(buffers.get(file)?.version ?? ts.sys.getModifiedTime(file)?.getTime() ?? 0)

  function sheetAt(file) {
    if (file.endsWith(".module.css")) return
    const current = version(file)
    if (sheets.get(file)?.version === current) return sheets.get(file)
    const css = read(file)
    if (css === undefined) return
    let sheet
    try {
      sheet = parseSheet(css, file)
    } catch {
      return
    } // A selector can be incomplete while the user types.
    const result = {...sheet, ...declarations(sheet), css, version: current, file}
    sheets.set(file, result)
    return result
  }

  const host = {
    ...ts.sys,
    getCompilationSettings: () => options,
    getScriptFileNames: () => [...new Set([...parsed.fileNames, ...Array.from(buffers.keys()).filter(file => !relative(root, file).startsWith("..") && /\.[cm]?[jt]sx?$/.test(file))])],
    getCurrentDirectory: () => root,
    getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
    fileExists: file => buffers.has(file) || ts.sys.fileExists(file)
      || (file.endsWith(".d.css.ts") && (buffers.has(stylesheet(file)) || ts.sys.fileExists(stylesheet(file)))),
    getScriptVersion: file => version(file.endsWith(".d.css.ts") ? stylesheet(file) : file),
    getScriptSnapshot(file) {
      const text = (file.endsWith(".d.css.ts") ? sheetAt(stylesheet(file))?.text : undefined) ?? read(file)
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
    },
  }
  const service = ts.createLanguageService(host)
  const literalCache = new WeakMap()
  function literals(source) {
    if (!literalCache.has(source)) literalCache.set(source, literalClasses(source))
    return literalCache.get(source)
  }
  let cssFiles
  function literalDefinitions(source, name) {
    const matching = files => [...new Set(files)].flatMap(file => {
      const sheet = sheetAt(file)
      return sheet?.classes.has(name) ? [{sheet, name}] : []
    })
    const direct = matching(source.statements.flatMap(node => {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) return []
      const path = node.moduleSpecifier.text.split("?")[0]
      return path.startsWith(".") && path.endsWith(".css") ? [resolve(dirname(source.fileName), path)] : []
    }))
    if (direct.length) return direct
    cssFiles ??= ts.sys.readDirectory(root, [".css"], ["**/node_modules/**", "**/dist/**", "**/build/**", ...(json?.exclude ?? [])], ["**/*"])
    return matching([...cssFiles, ...[...buffers.keys()].filter(f => f.startsWith(root + sep) && f.endsWith(".css"))])
  }

  function definitions(file, offset) {
    if (file.endsWith(".css")) {
      const sheet = sheetAt(file)
      if (!sheet) return []
      for (const group of [sheet.classes, sheet.variables, sheet.uses]) {
        for (const [name, spans] of group) {
          if (spans.some(span => span.start <= offset && offset < span.start + span.length)) return [{sheet, name}]
        }
      }
      return []
    }
    const source = service.getProgram()?.getSourceFile(file)
    if (!source) return []
    const literal = literals(source).find(span => span.start <= offset && offset < span.start + span.length)
    if (literal) return literalDefinitions(source, literal.name)
    for (const def of service.getDefinitionAtPosition(file, offset) ?? []) {
      if (!def.fileName.endsWith(".d.css.ts")) continue
      const sheet = sheetAt(stylesheet(def.fileName))
      if (!sheet) continue
      for (const [start, entry] of sheet.positions) {
        if (start <= def.textSpan.start && def.textSpan.start < start + entry.length) return [{sheet, name: entry.name}]
      }
    }
    return []
  }

  function references({sheet, name}, includeDeclaration) {
    const declarations = sheet.classes.get(name) ?? sheet.variables.get(name) ?? []
    const result = [...(includeDeclaration ? declarations : declarations.slice(1)), ...(sheet.uses.get(name) ?? [])]
      .map(span => ({file: sheet.file, ...span}))
    const file = declarationFile(sheet.file)
    const program = service.getProgram()
    if (program?.getSourceFile(file)) {
      for (const [start, entry] of sheet.positions) {
        if (entry.name !== name) continue
        const location = start + (sheet.text[start] === "\"" ? 1 : 0)
        for (const ref of service.getReferencesAtPosition(file, location) ?? []) {
          if (!ref.fileName.endsWith(".d.css.ts")) result.push({file: ref.fileName, ...ref.textSpan})
        }
      }
    }
    if (sheet.classes.has(name)) {
      for (const source of program?.getSourceFiles() ?? []) {
        if (source.isDeclarationFile || source.fileName.includes("/node_modules/") || !source.text.includes(name)) continue
        for (const span of literals(source)) {
          if (span.name === name) result.push({file: source.fileName, ...span})
        }
      }
    }
    return [...new Map(result.map(hit => [JSON.stringify([hit.file, hit.start, hit.length]), hit])).values()]
  }
  return {definitions, references, read, dispose: () => service.dispose()}
}

// Global CSS also applies to unbound markup. Match complete tokens only in
// class-bearing expressions, so labels, comments and unrelated strings stay out.
function literalClasses(source) {
  const found = []
  function addLiterals(node) {
    if (ts.isStringLiteralLike(node)) {
      const content = node.getText(source).slice(1, -1)
      for (const m of content.matchAll(/\S+/g)) {
        found.push({name: m[0], start: node.getStart(source) + 1 + m.index, length: m[0].length})
      }
    } else if (ts.isJsxExpression(node) && node.expression) addLiterals(node.expression)
    else if (ts.isConditionalExpression(node)) {
      addLiterals(node.whenTrue)
      addLiterals(node.whenFalse)
    } else if (ts.isTemplateExpression(node)) {
      for (const chunk of [node.head, ...node.templateSpans.map(span => span.literal)]) {
        const raw = chunk.getText(source)
        const first = chunk === node.head
        const last = chunk.kind === ts.SyntaxKind.TemplateTail
        const content = raw.slice(1, last ? -1 : -2)
        for (const m of content.matchAll(/\S+/g)) {
          if ((first || m.index > 0) && (last || m.index + m[0].length < content.length))
            found.push({name: m[0], start: chunk.getStart(source) + 1 + m.index, length: m[0].length})
        }
      }
    }
  }
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.initializer) {
      const attr = node.name.getText(source)
      if (attr === "class" || attr === "className") addLiterals(node.initializer)
      if (attr === "classList" && ts.isJsxExpression(node.initializer) && ts.isObjectLiteralExpression(node.initializer.expression ?? node)) {
        for (const item of node.initializer.expression.properties) {
          if (item.name && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name))) {
            found.push({name: item.name.text, start: item.name.getStart(source) + (ts.isStringLiteral(item.name) ? 1 : 0), length: item.name.text.length})
          }
        }
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isPropertyAccessExpression(node.left) && node.left.name.text === "className") addLiterals(node.right)
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const call = node.expression
      const [arg, value] = node.arguments
      if (call.name.text === "setAttribute" && arg?.text === "class" && value) addLiterals(value)
      if (call.name.text === "getElementsByClassName" && arg) addLiterals(arg)
      if (["querySelector", "querySelectorAll", "matches", "closest"].includes(call.name.text) && arg && ts.isStringLiteralLike(arg)) {
        try {
          visitClasses(arg.getText(source).slice(1, -1), (cssName, start, length) => {
            found.push({name: cssName, start: arg.getStart(source) + 1 + start, length})
          })
        } catch { /* An incomplete selector has no navigable range. */ }
      }
      if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "classList"
        && ["add", "remove", "toggle", "contains", "replace"].includes(call.name.text)) node.arguments.forEach(addLiterals)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}
