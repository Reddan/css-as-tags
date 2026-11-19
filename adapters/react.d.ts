import type {ComponentPropsWithRef, ElementType, ReactElement} from "react"

export type Tag = <T extends ElementType = "div">(props: {as?: T} & Omit<ComponentPropsWithRef<NoInfer<T>>, "as">) => ReactElement | null
export function createTag(cssClass: string): Tag
