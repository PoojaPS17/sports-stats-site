import { isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ImageActions mounts its export card only once a visitor reaches for a button, so a static render of a page no
// longer contains it. This renders the page and then each `card` prop found in its element tree, appended in page
// order, so a test can still assert on what the share image will say.
function cardsIn(node: ReactNode, out: ReactNode[] = []): ReactNode[] {
  if (Array.isArray(node)) {
    for (const n of node) cardsIn(n, out);
  } else if (isValidElement(node)) {
    const props = (node as ReactElement<Record<string, unknown>>).props;
    if ("shareTitle" in props && props.card) out.push(props.card as ReactNode);
    for (const value of Object.values(props)) if (value && typeof value === "object") cardsIn(value as ReactNode, out);
  }
  return out;
}

export function renderWithCards(page: ReactNode): string {
  return renderToStaticMarkup(page as ReactElement) + cardsIn(page).map((c) => renderToStaticMarkup(c as ReactElement)).join("");
}
