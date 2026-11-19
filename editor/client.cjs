const {join} = require("node:path")
const vscode = require("vscode")
const {LanguageClient, TransportKind} = require("vscode-languageclient/node")

let client
exports.activate = async context => {
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{css,js,jsx,ts,tsx,mjs,mts,cjs,cts,json}", false, false, false)
  context.subscriptions.push(watcher)
  client = new LanguageClient("css-as-tags", "CSS as Tags",
    {module: join(context.extensionPath, "dist/server.cjs"), transport: TransportKind.stdio},
    {documentSelector: ["css", "javascript", "javascriptreact", "typescript", "typescriptreact"].map(language => ({scheme: "file", language})),
      synchronize: {fileEvents: watcher}})
  await client.start()
}
exports.deactivate = () => client?.stop()
