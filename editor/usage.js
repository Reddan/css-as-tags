import ts from "typescript"

// Resolve binding uses against the generated CSS declarations. A same-named
// property on an unrelated object should never keep a selector alive.
export function scriptClassUses(program, sheets, literals) {
  const used = new Set()
  const checker = program.getTypeChecker()
  const keys = new Set()
  for (const sheet of sheets.values()) {
    for (const key of sheet.components.keys()) keys.add(key)
    for (const key of sheet.properties.keys()) keys.add(key)
  }

  function record(symbol) {
    if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol)
    for (const decl of symbol?.declarations ?? []) {
      const source = decl.getSourceFile()
      const sheet = sheets.get(source)
      const entry = sheet && decl.name && sheet.positions.get(decl.name.getStart(source))
      if (entry && sheet.classes.has(entry.name)) used.add(entry.name)
    }
  }
  function property(receiver, key) {
    if (key && keys.has(key.text)) record(checker.getTypeAtLocation(receiver).getProperty(key.text))
  }
  function visit(node) {
    if (ts.isImportSpecifier(node) || ts.isExportSpecifier(node)) record(checker.getSymbolAtLocation(node.name))
    else if (ts.isPropertyAccessExpression(node) && keys.has(node.name.text)) record(checker.getSymbolAtLocation(node.name))
    else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression)) property(node.expression, node.argumentExpression)
    else if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) property(node.parent, node.propertyName ?? node.name)
    else if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isObjectLiteralExpression(node.left)) {
      for (const item of node.left.properties) property(node.right, item.name)
    }
    ts.forEachChild(node, visit)
  }
  for (const source of program.getSourceFiles()) {
    if (source.isDeclarationFile || program.isSourceFileFromExternalLibrary(source)) continue
    for (const token of literals(source)) used.add(token.name)
    if (sheets.size) visit(source)
  }
  return used
}
