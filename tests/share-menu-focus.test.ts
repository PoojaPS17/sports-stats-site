import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { ShareMenu } from "../src/components/ShareMenu";

// Opening the Share menu from the keyboard must move focus into it, so the arrow keys work. The menu is
// visibility:hidden until it has been placed, and a hidden element cannot take focus in a browser (jsdom is
// laxer, so the test records what the element looked like at the moment focus() was called).
test("the first open focuses the first menu item only once the menu is visible", async () => {
  const dom = new JSDOM("<!doctype html><body><div id='root'></div></body>", { pretendToBeVisual: true });
  const g = globalThis as Record<string, unknown>;
  const saved = { window: g.window, document: g.document, HTMLElement: g.HTMLElement, getComputedStyle: g.getComputedStyle, IS_REACT_ACT_ENVIRONMENT: g.IS_REACT_ACT_ENVIRONMENT };
  Object.assign(g, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true });
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  const focused: { role: string | null; visibility: string }[] = [];
  const realFocus = dom.window.HTMLElement.prototype.focus;
  dom.window.HTMLElement.prototype.focus = function (this: HTMLElement, ...args: Parameters<HTMLElement["focus"]>) {
    focused.push({ role: this.getAttribute("role"), visibility: dom.window.getComputedStyle(this.closest("[role=menu]") ?? this).visibility });
    return realFocus.apply(this, args);
  };
  try {
    const root = createRoot(dom.window.document.getElementById("root")!);
    await act(async () => {
      root.render(
        createElement(ShareMenu, {
          section: "Playing XI",
          filename: "x",
          shareTitle: "t",
          caption: "c",
          link: "https://example.com/m",
          league: "cricket",
          variants: [{ id: "card", label: "Image", width: 860 }],
          card: () => null,
        }),
      );
    });
    const trigger = dom.window.document.querySelector<HTMLButtonElement>("button[aria-haspopup=menu]")!;
    await act(async () => {
      trigger.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    assert.ok(dom.window.document.querySelector("[role=menu]"), "the menu is open");
    const intoMenu = focused.filter((f) => f.role === "menuitem" || f.role === "menuitemradio");
    assert.ok(intoMenu.length > 0, "focus moved to a menu item on the first open");
    assert.ok(intoMenu.every((f) => f.visibility === "visible"), "and the menu was visible when it did");
    assert.equal(dom.window.document.activeElement?.getAttribute("role"), "menuitem");
    await act(async () => root.unmount());
  } finally {
    Object.assign(g, saved);
    if (savedNavigator) Object.defineProperty(globalThis, "navigator", savedNavigator);
    else delete g.navigator;
    dom.window.close();
  }
});

// On phones the button is icon-only. The status label ("Preparing…", "Saved") must stay hidden there too, so the
// button keeps its 40px width and the heading beside it does not re-wrap; the icon swap and the sr-only live
// region carry the feedback.
test("the button label is hidden on phones whatever the status", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/components/ShareMenu.tsx", import.meta.url), "utf8");
  const m = src.match(/<span className=("[^"]*"|\{`[^`]*`\}) data-share-label>/);
  assert.ok(m, "label span found");
  assert.ok(m[1].includes("max-sm:hidden") && !m[1].includes("${"), "label is hidden below sm unconditionally");
});
