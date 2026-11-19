import {parse} from "parse5"
import {parseSheet} from "../lib/css.js"

export function htmlClasses(text, file) {
  const found = []
  function visit(node) {
    const loc = node.sourceCodeLocation
    const attr = loc?.attrs?.class
    if (attr) {
      const raw = text.slice(attr.startOffset, attr.endOffset)
      const prefix = raw.match(/^class\s*=\s*(["']?)/i)
      if (prefix) {
        const start = attr.startOffset + prefix[0].length
        const end = attr.endOffset - Number(Boolean(prefix[1]))
        for (const match of text.slice(start, end).matchAll(/\S+/g))
          found.push({name: match[0], start: start + match.index, length: match[0].length})
      }
    }
    if (node.tagName === "style" && loc?.endTag) {
      const start = loc.startTag.endOffset
      try {
        const sheet = parseSheet(text.slice(start, loc.endTag.startOffset), file)
        for (const [name, spans] of sheet.classes) {
          for (const span of spans) found.push({name, start: start + span.start, length: span.length, selector: true})
        }
      } catch { /* A style element may contain a different template language. */ }
    }
    for (const child of node.childNodes ?? []) visit(child)
    if (node.content) visit(node.content)
  }
  visit(parse(text, {sourceCodeLocationInfo: true}))
  return found
}
