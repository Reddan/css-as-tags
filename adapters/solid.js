import {createComponent, mergeProps, splitProps} from "solid-js"
import {Dynamic} from "solid-js/web"

export function createTag(cssClass) {
  return props => {
    const [local, rest] = splitProps(props, ["as", "class", "className"])
    return createComponent(Dynamic, mergeProps(rest, {
      get component() {
        return local.as ?? "div"
      },
      get class() {
        return [cssClass, local.class, local.className].filter(Boolean).join(" ")
      },
    }))
  }
}
