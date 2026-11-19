import {createElement, forwardRef} from "react"

export function createTag(cssClass) {
  const Tag = forwardRef(({as = "div", className, children, ...props}, ref) => createElement(as, {...props, ref, className: className ? cssClass + " " + className : cssClass}, children))
  Tag.displayName = cssClass
  return Tag
}
