type Child = Node | string | number | boolean | null | undefined | readonly Child[]
type Props<T extends keyof HTMLElementTagNameMap> = {
  as?: T
  class?: string
  className?: string
  children?: Child
  style?: string | Partial<CSSStyleDeclaration>
} & {[K in keyof HTMLElementEventMap as `on${Capitalize<K>}`]?: (event: HTMLElementEventMap[K]) => void}
& Omit<Partial<HTMLElementTagNameMap[NoInfer<T>]>, "className" | "children" | "style">
& {[key: `data-${string}` | `aria-${string}`]: string | number | boolean}
export type Tag = <T extends keyof HTMLElementTagNameMap = "div">(props?: Props<T>) => HTMLElementTagNameMap[T]
export function createTag(cssClass: string): Tag
