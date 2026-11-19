import type {ComponentProps, JSX, ValidComponent} from "solid-js"

export type Tag = <T extends ValidComponent = "div">(props: {as?: T, class?: string, className?: string} & Omit<ComponentProps<NoInfer<T>>, "as" | "class" | "className">) => JSX.Element
export function createTag(cssClass: string): Tag
