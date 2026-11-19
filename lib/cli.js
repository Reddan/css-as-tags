#!/usr/bin/env node
import {readFileSync} from "node:fs"
import {parseSheet} from "./css.js"
import {writeTypes} from "./types.js"

const [command, ...args] = process.argv.slice(2)
let adapter = "dom"
if (args[0] === "--adapter") {
  args.shift()
  adapter = args.shift()
}
if (command !== "types" || !adapter || !args.length || args.some(path => !path.endsWith(".css"))) {
  console.error("Usage: css-as-tags types [--adapter dom|react|solid|module] file.css [...]")
  process.exit(1)
}
for (const file of args) writeTypes(file, parseSheet(readFileSync(file, "utf8"), file), adapter)
