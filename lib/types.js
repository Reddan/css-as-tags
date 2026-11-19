import {existsSync, readFileSync, writeFileSync} from "node:fs"
import {basename} from "node:path"
import {SourceMapGenerator} from "source-map-js"
import {declarations} from "./module.js"

export function writeTypes(file, sheet, adapter) {
  const target = file.replace(/\.css$/, ".d.css.ts")
  const decl = declarations(sheet, adapter)
  const map = new SourceMapGenerator({file: basename(target)})
  const lines = decl.text.split("\n")
  let line = 0
  let lineStart = 0
  for (const [start, {name, length}] of decl.positions) {
    while (start > lineStart + lines[line].length) lineStart += lines[line++].length + 1
    const source = (sheet.classes.get(name) ?? sheet.variables.get(name))[0]
    // TS also maps the enclosing declaration for its preview range. Keep both
    // ranges on the same selector so VS Code presents a single F12 destination.
    const keyColumn = start - lineStart
    for (const [column, end] of [
      [0, false],
      [lines[line].length - lines[line].trimStart().length, false],
      [keyColumn, false],
      [keyColumn + length, true],
      [lines[line].length, true],
    ]) {
      const {line: cssLine, col} = sheet.positionAt(source.start + (end ? source.length : 0))
      map.addMapping({
        source: basename(file),
        original: {line: cssLine, column: col - 1},
        generated: {line: line + 1, column},
      })
    }
  }
  const text = decl.text + "//# sourceMappingURL=data:application/json;charset=utf-8;base64," + Buffer.from(map.toString()).toString("base64") + "\n"
  if (!existsSync(target) || readFileSync(target, "utf8") !== text) writeFileSync(target, text)
}
