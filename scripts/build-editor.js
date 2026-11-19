import {build} from "esbuild"
import {cpSync, mkdirSync} from "node:fs"
import {createRequire} from "node:module"
import {dirname, join} from "node:path"
const require = createRequire(import.meta.url)
const options = {bundle: true, platform: "node", format: "cjs", target: "node18", minify: true}
await build({...options, entryPoints: ["editor/client.cjs"], outfile: "editor/dist/client.cjs", external: ["vscode"]})
await build({...options, entryPoints: ["editor/server.js"], outfile: "editor/dist/server.cjs", external: ["typescript"]})
// TypeScript resolves its standard library declarations next to its JS file.
const target = "editor/dist/node_modules/typescript"
mkdirSync(target, {recursive: true})
const ts = dirname(require.resolve("typescript/package.json"))
cpSync(join(ts, "package.json"), join(target, "package.json"))
cpSync(join(ts, "LICENSE.txt"), join(target, "LICENSE.txt"))
cpSync(join(ts, "lib"), join(target, "lib"), {
  recursive: true, filter: path => path === join(ts, "lib") || /\/(typescript\.js|lib\..*\.d\.ts|lib\.d\.ts)$/.test(path),
})
