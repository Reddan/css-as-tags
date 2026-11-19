# CSS as Tags

Go to Definition on an imported CSS component or a member of the default styles object to open its selector or custom property. Find All References on a CSS class includes nested CSS selectors, TypeScript and JavaScript imports, JSX usages, and literal class attributes in the project. Open the application folder or its enclosing workspace in VS Code.

The extension bundles its language server. Other LSP clients can launch `node dist/server.cjs --stdio` from the built extension. Named exports and default styles come from the companion css-as-tags Vite plugin.

F12 also works on individual names in literal JSX `class`, `className` and Solid `classList` attributes. Matching directly imported stylesheets take precedence. For global styles loaded elsewhere, the editor offers matching project stylesheets.

F2 on a class selector, imported component, styles property or JSX class token renames it across the project. Enter `review-actions` in CSS or `ReviewActions` on a JSX component. The edit updates selectors in plain CSS files, named exports and imports, JSX tags, styles properties, JSX and HTML class tokens, and existing generated declarations. Explicit local aliases retain their own names.

In plain CSS, a dimmed class selector has no static reference in the project's JavaScript, TypeScript, JSX, or HTML. The hints update as you edit. Check for names assembled at runtime or used by external markup before removing a class.
