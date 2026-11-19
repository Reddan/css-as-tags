import assert from "node:assert/strict"
import {mkdir, mkdtemp, readFile, rm, writeFile} from "node:fs/promises"
import {createServer as httpServer} from "node:http"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {chromium} from "playwright-core"
import {build, createServer} from "vite"
import cssAsTags from "../lib/vite.js"

const root = await mkdtemp(fileURLToPath(new URL("../.browser-", import.meta.url)))
const browser = await chromium.launch({channel: "chrome"})
try {
  const sheet = ".feedback-toolbar { display: flex; gap: 7px; --accent: green; color: var(--accent); }"
  const markup = "<link rel=\"icon\" href=\"data:,\"><div id=\"root\"></div><script type=\"module\" src=\"/main.js\"></script>"
  const common = `import styles, { FeedbackToolbar } from "./style.css";
    import * as css from "./style.css";
    import inline from "./inline.css?inline";
    window.css = css;
    window.inline = inline;
    const root = document.getElementById("root");
    const clicked = () => root.dataset.clicked = "yes";
    const pathProps = { d: "M1 2h7" };
    const rectProps = { x: "2", width: "6", height: "4" };`
  const samples = {
    dom: `root.append(
      FeedbackToolbar.button({ class: "extra", children: "Rate", onClick: clicked }),
      FeedbackToolbar.svg({ children: [FeedbackToolbar.path(pathProps), FeedbackToolbar.rect(rectProps)] }),
      FeedbackToolbar({ as: "output" })
    );`,
    react: `import { createElement as h, Fragment } from "react"; import { createRoot } from "react-dom/client";
      createRoot(root).render(h(Fragment, null,
        h(FeedbackToolbar.button, { className: "extra", onClick: clicked }, "Rate"),
        h(FeedbackToolbar.svg, null, h(FeedbackToolbar.path, { ...pathProps, ref: node => { window.pathRef = node; } }), h(FeedbackToolbar.rect, rectProps)),
        h(FeedbackToolbar, { as: "output" })
      ));`,
    solid: `import { render } from "solid-js/web"; import { createComponent as h, createSignal } from "solid-js";
      const [extra, setExtra] = createSignal("extra"); window.change = () => setExtra("changed");
      render(() => [
        h(FeedbackToolbar.button, { get class() { return extra() }, onClick: clicked, children: "Rate" }),
        h(FeedbackToolbar.svg, { get children() { return [h(FeedbackToolbar.path, { ...pathProps, ref: node => { window.pathRef = node; } }), h(FeedbackToolbar.rect, rectProps)] } }),
        h(FeedbackToolbar, { as: "output" })
      ], root);`,
  }
  for (const [adapter, app] of Object.entries(samples)) {
    const dir = join(root, adapter)
    await mkdir(dir)
    await writeFile(join(dir, "index.html"), markup)
    await writeFile(join(dir, "main.js"), common + "\n" + app)
    await writeFile(join(dir, "style.css"), sheet)
    await writeFile(join(dir, "inline.css"), sheet)
    const config = {root: dir, configFile: false, plugins: [cssAsTags({adapter})], logLevel: "warn"}
    const dev = await createServer({...config, server: {host: "127.0.0.1", port: 0}})
    await dev.listen()
    async function check(url) {
      const page = await browser.newPage()
      page.on("pageerror", error => console.error(error))
      page.on("console", msg => {
        if (msg.type() === "error") console.error(msg.text())
      })
      await page.goto(url)
      const button = page.locator("button.feedback-toolbar.extra")
      await button.waitFor({timeout: 10000})
      assert.equal(await button.innerText(), "Rate")
      assert.equal(await button.evaluate(node => getComputedStyle(node).gap), "7px")
      assert.deepEqual(await page.evaluate(() => [css.default.feedbackToolbar, css.default["--accent"], inline.includes("feedback-toolbar")]),
        ["feedback-toolbar", "var(--accent)", true])
      const path = page.locator("svg.feedback-toolbar > path.feedback-toolbar")
      assert.ok(await path.evaluate(node => node instanceof SVGPathElement && node.getAttribute("d") === "M1 2h7"))
      assert.ok(await page.locator("svg > rect.feedback-toolbar").evaluate(node => node instanceof SVGRectElement && node.width.baseVal.value === 6))
      if (adapter !== "dom") assert.ok(await path.evaluate(node => window.pathRef === node))
      assert.ok(await page.locator("output.feedback-toolbar").count() === 1)
      assert.ok(await page.evaluate(() => css.FeedbackToolbar.path === css.FeedbackToolbar.path))
      await button.click()
      assert.equal(await page.locator("#root").getAttribute("data-clicked"), "yes")
      if (adapter === "solid") {
        await page.evaluate(() => window.change())
        assert.equal(await page.locator("button").getAttribute("class"), "feedback-toolbar changed")
      }
      return page
    }
    try {
      const page = await check(dev.resolvedUrls.local[0])
      await page.evaluate(() => {
        window.originalButton = document.querySelector("button")
      })
      await writeFile(join(dir, "style.css"), sheet.replace("7px", "9px"))
      await page.waitForFunction(() => getComputedStyle(document.querySelector("button")).gap === "9px")
      assert.ok(await page.evaluate(() => window.originalButton === document.querySelector("button")))
      await writeFile(join(dir, "style.css"), sheet + "\n.new-class { display: block }")
      await page.waitForFunction(() => !!window.css.NewClass, undefined, {timeout: 10000})
      await page.close()
    } finally {
      await dev.close()
    }
    await build(config)
    const staticServer = httpServer(async (req, res) => {
      const path = req.url === "/" ? "/index.html" : req.url
      try {
        const body = await readFile(join(dir, "dist", path))
        res.writeHead(200, {"Content-Type": path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : "text/html"})
        res.end(body)
      } catch {
        res.writeHead(404).end()
      }
    })
    await new Promise(done => staticServer.listen(0, "127.0.0.1", done))
    try {
      await (await check("http://127.0.0.1:" + staticServer.address().port)).close()
    } finally {
      staticServer.close()
    }
    console.log(adapter + " passed development, CSS hot update and production rendering")
  }
} finally {
  await browser.close()
  await rm(root, {recursive: true, force: true})
}
