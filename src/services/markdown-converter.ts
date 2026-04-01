import TurndownService from "turndown"

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" })

export function toMarkdown(html: string): string {
  return turndown.turndown(html)
}
