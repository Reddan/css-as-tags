import postcss from "postcss"
import selectorParser from "postcss-selector-parser"
import valueParser from "postcss-value-parser"

function pascal(name) {
  return name.split(/[-_]+/u).filter(Boolean).map(part => part[0].toUpperCase() + part.slice(1)).join("")
}

// All offsets refer to the original text, in UTF-16 code units as used by LSP.
export function visitClasses(selector, visit) {
  selectorParser(tree => tree.walkClasses(node => {
    visit(node.value, node.sourceIndex, (node.raws?.value ?? node.value).length + 1)
  })).processSync(selector)
}

export function parseSheet(text, file) {
  const root = postcss.parse(text, {from: file})
  const classes = new Map()
  const variables = new Map()
  const uses = new Map()
  function record(map, name, start, length) {
    if (!map.has(name)) map.set(name, [])
    map.get(name).push({start, length})
  }
  function selectors(raw, offset) {
    visitClasses(raw, (name, start, length) => record(classes, name, offset + start, length))
  }
  root.walkRules(rule => {
    selectors(rule.raws.selector?.raw ?? rule.selector, rule.source.start.offset)
  })
  root.walkAtRules(/^(scope|supports)$/, rule => {
    const params = rule.raws.params?.raw ?? rule.params
    const start = rule.source.start.offset + 1 + rule.name.length + (rule.raws.afterName ?? "").length
    valueParser(params).walk(node => {
      if (node.type !== "function") return
      if ((rule.name === "scope" && !node.value) || node.value === "selector") {
        const from = node.sourceIndex + node.value.length + 1
        selectors(params.slice(from, node.sourceEndIndex - 1), start + from)
        return false
      }
    })
  })
  root.walkAtRules("property", rule => {
    const offset = rule.source.start.offset + 1 + rule.name.length + rule.raws.afterName.length
    record(variables, rule.params, offset, rule.params.length)
  })
  root.walkDecls(decl => {
    const start = decl.source.start.offset
    if (decl.prop.startsWith("--")) record(variables, decl.prop, start, decl.prop.length)
    const value = decl.raws.value?.raw ?? decl.value
    if (!value.includes("var(")) return
    const offset = start + decl.prop.length + decl.raws.between.length
    valueParser(value).walk(node => {
      if (node.type !== "function" || node.value !== "var") return
      const prop = node.nodes.find(child => child.type === "word")
      if (prop?.value.startsWith("--")) record(uses, prop.value, offset + prop.sourceIndex, prop.value.length)
    })
  })

  const components = new Map()
  const properties = new Map()
  const add = (map, key, name) => {
    if (map.has(key) && map.get(key) !== name) throw new Error(`${file}: ${key} is ambiguous between ${map.get(key)} and ${name}`)
    map.set(key, name)
  }
  for (const name of classes.keys()) {
    const tag = pascal(name)
    add(properties, name, name)
    if (/^\p{Lu}[\p{ID_Continue}$]*$/u.test(tag)) {
      add(components, tag, name)
      add(properties, tag[0].toLowerCase() + tag.slice(1), name)
    }
  }
  for (const name of variables.keys()) {
    if (classes.has(name)) throw new Error(`${file}: class and custom property share the name ${name}`)
    properties.set(name, name)
  }
  return {classes, variables, uses, components, properties, positionAt: offset => root.source.input.fromOffset(offset)}
}

export function cssValue(sheet, name) {
  return sheet.variables.has(name) ? `var(${name})` : name
}
