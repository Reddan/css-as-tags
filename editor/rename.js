import {sep} from "node:path"
import ts from "typescript"
import {parseSheet} from "../lib/css.js"
import {declarationText} from "../lib/types.js"

const contains = (span, offset) => span.start <= offset && offset < span.start + span.length

// A selector range includes its dot for navigation. F2 replaces only the name.
function classToken(span, selector) {
  const skip = selector ? 1 : 0
  return {start: span.start + skip, length: span.length - skip}
}

function namesForInput(input, format) {
  let css = input.replace(/^\./, "")
  if (format !== "class" && !input.startsWith(".") && !/[-_]/u.test(css)) {
    css = css.replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1-$2")
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1-$2").toLowerCase()
  }
  if (!/^(?:--|-?[\p{L}_])[\p{L}\p{M}\p{N}_-]*$/u.test(css))
    throw new Error("Enter one CSS class name or its component name.")

  // Ask the export generator for the exact JS spellings it will produce.
  const sheet = parseSheet(`.${css} {}`, "rename.css")
  const [component] = sheet.components.keys()
  const property = component && component[0].toLowerCase() + component.slice(1)
  return {css, component, property}
}

function referenceText(node, name, next, component, checker) {
  const parent = node.parent
  const rawKey = ts.isStringLiteralLike(node) && node.text === name
  const replacement = component ? next.component : rawKey ? next.css : next.property
  if (!replacement) throw new Error("Choose a class name that can produce a JavaScript identifier for its existing imports.")
  if (component && replacement !== node.text) {
    const local = !(ts.isPropertyAccessExpression(parent) && parent.name === node)
      && !ts.isQualifiedName(parent) && !ts.isExportSpecifier(parent)
      && !(ts.isImportSpecifier(parent) && parent.propertyName)
    if (local && checker.resolveName(replacement, node, ts.SymbolFlags.Value | ts.SymbolFlags.Alias, true))
      throw new Error(`${replacement} is already in scope in ${node.getSourceFile().fileName}.`)
    if (ts.isExportSpecifier(parent) && !parent.propertyName
      && checker.getExportsOfModule(node.getSourceFile().symbol).some(symbol => symbol.name === replacement))
      throw new Error(`${replacement} is already exported by ${node.getSourceFile().fileName}.`)
  }
  if (!component && ts.isBindingElement(parent) && !parent.propertyName && parent.name === node)
    return replacement + ": " + node.text
  if (ts.isShorthandPropertyAssignment(parent)) return node.text + ": " + replacement
  return replacement
}

export function classRename({root, service, filesWith, sheetAt, htmlAt, definitions, literals, read, declarationFile}) {
  function editable(file) {
    return file.startsWith(root + sep) && !file.includes(sep + "node_modules" + sep)
  }

  function prepareRename(file, offset) {
    if (!editable(file) || file.endsWith(".d.css.ts")) return
    const [symbol] = definitions(file, offset)
    if (!symbol?.sheet.classes.has(symbol.name) || !editable(symbol.sheet.file)) return
    const {sheet, name} = symbol
    if (file.endsWith(".css")) {
      const span = sheet.classes.get(name).find(span => contains(span, offset))
      return {name, format: "class", ...classToken(span, true)}
    }
    const source = service.getProgram().getSourceFile(file)
    const tokens = file.endsWith(".html") ? htmlAt(file) : literals(source)
    const literal = tokens.find(span => contains(span, offset))
    if (literal) return {name, format: "class", ...classToken(literal, literal.selector)}

    const token = ts.getTokenAtPosition(source, offset)
    const quoted = ts.isStringLiteralLike(token)
    const key = token.text
    let format
    if (sheet.components.get(key) === name) format = "component"
    else if (sheet.properties.get(key) === name) format = quoted && key === name ? "class" : "property"
    else return // Explicit local aliases use the editor's normal symbol rename.
    return {name, format, start: token.getStart(source) + Number(quoted), length: token.getWidth(source) - 2 * Number(quoted)}
  }

  function rename(file, offset, input) {
    const target = prepareRename(file, offset)
    if (!target) return
    const {name, format, start, length} = target
    if (read(file).slice(start, start + length) === input) return []
    const next = namesForInput(input, format)
    if (next.css === name) return []
    const edits = new Map()
    function add(file, span, newText) {
      const {start, length} = span
      edits.set(JSON.stringify([file, start, length]), {file, start, length, newText})
    }

    const program = service.getProgram()
    for (const cssFile of filesWith(".css")) {
      if (!editable(cssFile)) continue
      const sheet = sheetAt(cssFile)
      const spans = sheet?.classes.get(name)
      if (sheet?.classes.has(next.css)) throw new Error(`.${next.css} already exists in ${cssFile}.`)
      if (!spans) continue
      let css = sheet.css
      for (const hit of [...spans].sort((a, b) => b.start - a.start)) {
        const span = classToken(hit, true)
        add(cssFile, span, next.css)
        css = css.slice(0, span.start) + next.css + css.slice(span.start + span.length)
      }
      // Validate generated export collisions before returning any workspace edit.
      const updated = parseSheet(css, cssFile)
      const decl = declarationFile(cssFile)
      const generated = read(decl)
      const header = generated?.match(/^\/\/ Generated by css-as-tags\.\r?\nimport type \{ Tag as _Tag \} from ("(?:[^"\\]|\\.)*");/)
      if (header) add(decl, {start: 0, length: generated.length}, declarationText(cssFile, updated, JSON.parse(header[1])))
      if (!program.getSourceFile(decl)) continue

      for (const [position, entry] of sheet.positions) {
        if (entry.name !== name) continue
        const component = sheet.text[position] !== "\""
        // Follow unaliased component re-exports. For styles, stop at local destructuring bindings.
        const refs = service.findRenameLocations(decl, position + Number(!component), false, false, !component) ?? []
        for (const ref of refs) {
          const source = program.getSourceFile(ref.fileName)
          if (!source || source.isDeclarationFile || !editable(source.fileName)) continue
          const node = ts.getTokenAtPosition(source, ref.textSpan.start)
          add(source.fileName, ref.textSpan, referenceText(node, name, next, component, program.getTypeChecker()))
        }
      }
    }

    for (const file of filesWith(".html")) {
      for (const hit of htmlAt(file)) {
        if (hit.name === name) add(file, classToken(hit, hit.selector), next.css)
      }
    }
    for (const source of program.getSourceFiles()) {
      if (source.isDeclarationFile || !editable(source.fileName)) continue
      for (const hit of literals(source)) {
        if (hit.name !== name) continue
        let replacement = next.css
        if (hit.key && !ts.isIdentifierText(replacement, ts.ScriptTarget.Latest)) replacement = JSON.stringify(replacement)
        if (hit.key === "shorthand") replacement += ": " + name
        add(source.fileName, classToken(hit, hit.selector), replacement)
      }
    }
    return [...edits.values()]
  }
  return {prepareRename, rename}
}
