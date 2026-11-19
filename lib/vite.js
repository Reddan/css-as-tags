import {init, parse} from "es-module-lexer"
import MagicString from "magic-string"
import {readFile} from "node:fs/promises"
import {basename} from "node:path"
import {parseSheet} from "./css.js"
import {generateModule} from "./module.js"
import {writeTypes} from "./types.js"

const marker = "?css-as-tags"
const suffix = ".css-as-tags.js"

export default function cssAsTags({adapter = "dom", types = true} = {}) {
  const modulesByFile = new Map()
  function compile(text, file) {
    const sheet = parseSheet(text, file)
    if (types) writeTypes(file, sheet, adapter)
    return generateModule(sheet, "./" + basename(file), adapter)
  }
  return {
    name: "css-as-tags",
    // Vite and framework plugins have already converted JSX/TS into JavaScript.
    async transform(code, id) {
      if (id.endsWith(suffix) || !/\.[cm]?[jt]sx?(?:\?|$)/.test(id) || !code.includes(".css")) return
      await init
      const [imports] = parse(code)
      const edit = new MagicString(code)
      for (const {n: path, s, e, ss, d} of imports) {
        if (!path?.endsWith(".css") || path.endsWith(".module.css")) continue
        if (d === -1) {
          if (code.slice(ss, s - 1).replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "").trim() === "import") continue
          edit.appendLeft(e, marker)
        } else if (d >= 0) {
          edit.overwrite(s, e, JSON.stringify(path + marker))
        }
      }
      if (edit.hasChanged()) return {code: edit.toString(), map: edit.generateMap({hires: true})}
    },
    resolveId: {
      order: "pre",
      async handler(source, importer) {
        if (!source.endsWith(marker)) return
        const css = await this.resolve(source.slice(0, -marker.length), importer, {skipSelf: true})
        if (css && !css.external) return css.id + suffix
      },
    },
    async load(id) {
      if (!id.endsWith(suffix)) return
      const file = id.slice(0, -suffix.length)
      this.addWatchFile(file)
      const code = compile(await readFile(file, "utf8"), file)
      modulesByFile.set(file, code)
      return code
    },
    async handleHotUpdate({file, read, modules, server}) {
      const bindings = server.moduleGraph.getModuleById(file + suffix)
      if (!bindings) return
      if (compile(await read(), file) === modulesByFile.get(file)) return modules.filter(mod => mod !== bindings)
      return [...new Set([...modules, bindings])]
    },
  }
}
