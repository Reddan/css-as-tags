import type {ComponentPropsWithRef, ElementType, JSX, ReactElement} from "react"
import type {NativeElementName} from "./elements.js"

type Props<T extends ElementType> = Omit<ComponentPropsWithRef<T>, "as">
type ElementTags = {readonly [T in NativeElementName & keyof JSX.IntrinsicElements]: (props: Props<T>) => ReactElement | null}
export type Tag = ElementTags & (<T extends ElementType = "div">(props: {as?: T} & Props<NoInfer<T>>) => ReactElement | null)
export function createTag(cssClass: string): Tag
