import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import NotFound from "../src/app/not-found";
import ErrorPage from "../src/app/error";

// A dead end must offer a way out: home, search and every sport's front door, as plain links.
const WAYS_OUT = ["/", "/search", "/epl", "/laliga", "/bundesliga", "/seriea", "/ucl", "/nfl", "/nba", "/cricket/series", "/tennis", "/f1"];

function hrefs(html: string): Set<string> {
  return new Set([...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]));
}

test("the 404 page says so and links home, to search and to every sport", () => {
  const html = renderToStaticMarkup(createElement(NotFound));
  assert.match(html, /<h1[^>]*>We could not find that page/);
  const found = hrefs(html);
  for (const href of WAYS_OUT) assert.ok(found.has(href), `404 page links ${href}`);
});

test("the error page has a retry button and the same ways out", () => {
  const html = renderToStaticMarkup(createElement(ErrorPage, { error: new Error("boom"), retry: () => {} }));
  assert.match(html, /<button[^>]*>Try again<\/button>/);
  const found = hrefs(html);
  for (const href of WAYS_OUT) assert.ok(found.has(href), `error page links ${href}`);
  assert.doesNotMatch(html, /boom/, "the error text is never shown to visitors");
});
