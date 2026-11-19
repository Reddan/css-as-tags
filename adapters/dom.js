export function createTag(cssClass) {
  return ({as = "div", class: extra, className, children, ...props} = {}) => {
    const element = document.createElement(as)
    element.className = [cssClass, extra, className].filter(Boolean).join(" ")
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith("on") && typeof value === "function") element.addEventListener(key.slice(2).toLowerCase(), value)
      else if (key === "style" && value && typeof value === "object") Object.assign(element.style, value)
      else if (key in element) element[key] = value
      else if (value != null) element.setAttribute(key, String(value))
    }
    function append(child) {
      if (Array.isArray(child)) child.forEach(append)
      else if (child != null && typeof child !== "boolean") element.append(child)
    }
    append(children)
    return element
  }
}
