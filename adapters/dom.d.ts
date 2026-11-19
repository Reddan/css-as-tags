import type {NativeElementName} from "./elements.js"

type Child = Node | string | number | boolean | null | undefined | readonly Child[]
type Elements = HTMLElementTagNameMap & Omit<SVGElementTagNameMap, keyof HTMLElementTagNameMap>
type Attributes<T extends NativeElementName> = T extends keyof HTMLElementTagNameMap
  ? Omit<Partial<HTMLElementTagNameMap[T]>, "className" | "children" | "style" | "as">
  : Record<string, unknown>
type Props<T extends NativeElementName> = {
  class?: string
  className?: string
  children?: Child
  style?: string | Partial<CSSStyleDeclaration>
} & {[K in keyof HTMLElementEventMap as `on${Capitalize<K>}`]?: (event: HTMLElementEventMap[K]) => void}
& Attributes<T>
& {[key: `data-${string}` | `aria-${string}`]: string | number | boolean}
type ElementTags = {readonly [T in NativeElementName]: (props?: Props<T>) => Elements[T]}
export type Tag = ElementTags & (<T extends NativeElementName = "div">(props?: {as?: T} & Props<NoInfer<T>>) => Elements[T])
export function createTag(cssClass: string): Tag
