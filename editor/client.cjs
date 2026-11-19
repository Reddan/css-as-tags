const {join} = require("node:path")
const vscode = require("vscode")
const {LanguageClient, TransportKind, LSPErrorCodes} = require("vscode-languageclient/node")

let client
exports.activate = async context => {
  const watcher = vscode.workspace.createFileSystemWatcher("**/*.{css,html,js,jsx,ts,tsx,mjs,mts,cjs,cts,json}", false, false, false)
  context.subscriptions.push(watcher)
  client = new LanguageClient("css-as-tags", "CSS as Tags",
    {module: join(context.extensionPath, "dist/server.cjs"), transport: TransportKind.stdio},
    {documentSelector: ["css", "html", "javascript", "javascriptreact", "typescript", "typescriptreact"].map(language => ({scheme: "file", language})),
      middleware: {
        async provideRenameEdits(document, position, newName, token, next) {
          try {
            return await next(document, position, newName, token)
          } catch (error) {
            if (error.code !== LSPErrorCodes.RequestFailed) throw error
            // A rejected class rename must not fall through to a JS-only edit.
            void vscode.window.showWarningMessage(error.message)
            return new vscode.WorkspaceEdit()
          }
        },
      },
      synchronize: {fileEvents: watcher}})
  await client.start()
}
exports.deactivate = () => client?.stop()
