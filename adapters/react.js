import {createElement, forwardRef} from "react"
import {withElements} from "./elements.js"

export function createTag(cssClass) {
  return withElements(element => {
    const Tag = forwardRef(({as = "div", className, children, ...props}, ref) => createElement(element ?? as, {...props, ref, className: className ? cssClass + " " + className : cssClass}, children))
    Tag.displayName = element ? cssClass + "." + element : cssClass
    return Tag
  })
}
