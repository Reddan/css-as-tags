# CSS as Tags

Write a class in a plain CSS file and import it as a component or a class name. The Vite plugin makes the import work in React, Solid, and plain JavaScript. The companion VS Code extension lets you jump from a use to its CSS rule, find the code that uses a selector, and rename the class on either side.

```css
/* styles.css */
:root { --accent: #267659; }
.empty-state { display: grid; gap: 0.5rem; }
.empty-hint { margin: 0; }
.empty-title { color: var(--accent); }
```

```jsx
import styles, { EmptyState, EmptyHint } from "./styles.css"

export function Bookmarks() {
  return (
    <EmptyState>
      <strong className={styles.emptyTitle}>No bookmarks yet</strong>
      <EmptyHint.p>Bookmark a page to find it here.</EmptyHint.p>
    </EmptyState>
  )
}
```

`<EmptyState>` renders a `<div class="empty-state">`. Inside it, `<EmptyHint.p>` renders a `<p class="empty-hint">`. In Solid, use `class={styles.emptyTitle}` on the `<strong>` element.

## Install

Run these commands from your Vite project to install the plugin and add the bundled extension to VS Code.

```sh
npm install -D css-as-tags
code --install-extension node_modules/css-as-tags/editor/css-as-tags.vsix
```

You can also select the same file with **Extensions: Install from VSIX…** in VS Code. Open the project folder so the extension can find its stylesheets and source files.

## Working with CSS in VS Code

| Start here | Command | Where it takes you |
| --- | --- | --- |
| `EmptyState` in the import or JSX tag | **Go to Definition** (F12) | The `.empty-state` selector in `styles.css`. |
| `styles.emptyTitle` or the word `empty-title` in `className="empty-title"` | **Go to Definition** (F12) | The `.empty-title` rule. This also works with Solid’s `class` and static `classList` keys. |
| `.empty-state` in CSS | **Find All References** (Shift+F12) | Other selectors containing that class and its uses in JS, TS, JSX, and HTML, including imports, tags, style properties, and literal class names. |

**Rename Symbol** (F2) works in both directions. Rename `.empty-state` to `empty-panel` in CSS, or rename `EmptyState` to `EmptyPanel` in JSX. Either rename changes `styles.emptyState` to `styles.emptyPanel` and `class="empty-state"` to `class="empty-panel"` along with the selector, named import, and JSX tags. The extension follows re-exports and preserves explicit local aliases. Since plain CSS classes are global, a rename also updates matching class selectors in other project stylesheets.

VS Code dims a class selector when it finds no static reference in the project's JavaScript, TypeScript, JSX, or HTML. For example, adding `class="empty-state"` in Solid brings `.empty-state` back to full brightness as you type. Repeating a selector in CSS doesn't count as a use. Before deleting a dimmed class, check whether your app builds its name at runtime or receives markup from outside the project.

## Use the Vite plugin

In a Solid project, add `cssAsTags` alongside the Solid plugin in your Vite config.

```js
// vite.config.js
import { defineConfig } from "vite"
import solid from "vite-plugin-solid"
import cssAsTags from "css-as-tags/vite"

export default defineConfig({
  plugins: [solid(), cssAsTags({ adapter: "solid" })],
})
```

In React, use `cssAsTags({ adapter: "react" })` alongside your React plugin. For plain JavaScript, use `cssAsTags()` and call the exported tag to create a DOM element.

```js
import { EmptyState, EmptyHint } from "./styles.css"

const hint = EmptyHint.p({ children: "Bookmark a page to find it here." })
document.body.append(EmptyState({ children: hint }))
```

### What a stylesheet exports

| Import expression | Value |
| --- | --- |
| `EmptyState` | A component for `.empty-state`. Its default element is a `div`. |
| `styles.emptyState` or `styles["empty-state"]` | The string `"empty-state"`. |
| `styles["--accent"]` | The string `"var(--accent)"`. F12 opens the custom property declaration. |

Use a dot to select a native HTML or SVG element, such as `EmptyHint.p` or `IconStroke.path` for an `.icon-stroke` class. Props and refs are typed for the selected element. The `as` prop accepts a dynamic element or component in React and Solid.

Each stylesheet exports its own classes and declared custom properties, including `@property` declarations. Classes whose names contain escaped punctuation or start with a digit remain accessible by their original spelling. If two classes would produce the same export, the plugin reports both names.

Importing a binding also loads the stylesheet through Vite. Selectors keep their original names, and Vite handles the cascade, `@import`, media queries, and URLs as usual. CSS Modules and queries such as `?inline` retain their Vite behavior.

### TypeScript

With TypeScript 5.4 or later, enable `allowArbitraryExtensions` in `tsconfig.json`. Vite generates a sibling declaration file such as `styles.d.css.ts` with mappings back to the CSS. To generate declarations before a standalone `tsc` run, use the same adapter as your Vite config.

```sh
npx css-as-tags types --adapter solid src/styles.css
```

Set `types: false` in the plugin options if the CLI manages your declarations.

### Custom adapters

To use another renderer, pass its module name as `adapter`. The module must export `createTag(cssClass)` and a TypeScript `Tag` type.
