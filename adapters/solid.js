import {createComponent, mergeProps, splitProps} from "solid-js"
import {Dynamic} from "solid-js/web"
import {withElements} from "./elements.js"

export function createTag(cssClass) {
  return withElements(element => props => {
    const [local, rest] = splitProps(props, ["as", "class", "className"])
    return createComponent(Dynamic, mergeProps(rest, {
      get component() {
        return element ?? local.as ?? "div"
      },
      get class() {
        return [cssClass, local.class, local.className].filter(Boolean).join(" ")
      },
    }))
  })
}
