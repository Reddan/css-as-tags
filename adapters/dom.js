import {svg, withElements} from "./elements.js"

export function createTag(cssClass) {
  return withElements(tag => ({as = "div", class: extra, className, children, ...props} = {}) => {
    const name = tag ?? as
    const isSvg = svg.has(name)
    const element = isSvg ? document.createElementNS("http://www.w3.org/2000/svg", name) : document.createElement(name)
    element.setAttribute("class", [cssClass, extra, className].filter(Boolean).join(" "))
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith("on") && typeof value === "function") element.addEventListener(key.slice(2).toLowerCase(), value)
      else if (key === "style" && value && typeof value === "object") Object.assign(element.style, value)
      else if (!isSvg && key in element) element[key] = value
      else if (value != null) element.setAttribute(key, String(value))
    }
    function append(child) {
      if (Array.isArray(child)) child.forEach(append)
      else if (child != null && typeof child !== "boolean") element.append(child)
    }
    append(children)
    return element
  })
}
