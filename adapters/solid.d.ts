import type {ComponentProps, JSX, ValidComponent} from "solid-js"
import type {NativeElementName} from "./elements.js"

type Props<T extends ValidComponent> = {class?: string, className?: string} & Omit<ComponentProps<T>, "as" | "class" | "className">
type ElementTags = {readonly [T in NativeElementName & keyof JSX.IntrinsicElements]: (props: Props<T>) => JSX.Element}
export type Tag = ElementTags & (<T extends ValidComponent = "div">(props: {as?: T} & Props<NoInfer<T>>) => JSX.Element)
export function createTag(cssClass: string): Tag
