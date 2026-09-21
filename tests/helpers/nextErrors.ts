import { isHTTPAccessFallbackError } from "next/dist/client/components/http-access-fallback/http-access-fallback";
import { isRedirectError } from "next/dist/client/components/redirect-error";

// notFound() and redirect() work by throwing; these say which one a thrown value is.
export const isNotFound = (err: unknown): boolean => isHTTPAccessFallbackError(err) && (err as { digest?: string }).digest?.endsWith("404") === true;
export const isRedirect = (err: unknown): boolean => isRedirectError(err);

/** The outcome of an async call: its value, or "not-found" / "redirect" / the error itself. */
export async function outcome<T>(run: () => Promise<T>): Promise<{ value: T } | "not-found" | "redirect" | { error: unknown }> {
  try {
    return { value: await run() };
  } catch (err) {
    if (isNotFound(err)) return "not-found";
    if (isRedirect(err)) return "redirect";
    return { error: err };
  }
}
