/**
 * Make a user-typed search term safe to embed in a PostgREST `.or()` filter.
 *
 * `.or()` takes a comma-separated list of `column.operator.value` clauses, so
 * the term is being pasted into a tiny query language — commas, parentheses
 * and backslashes typed into a search box are parsed as filter syntax rather
 * than as text. `acme, inc` becomes:
 *
 *     full_name.ilike.%acme       <- valid
 *      inc%                       <- malformed, whole request 400s
 *     email.ilike.%acme           <- valid
 *      inc%                       <- malformed
 *
 * The leads board learned this and sanitized inline; the admin global search
 * was written later and did not, so any comma, bracket or apostrophe-adjacent
 * punctuation made it return nothing at all with no error shown. Keeping the
 * rule in one place is the point of this module — it is a property of
 * PostgREST, not of any one screen.
 *
 * Returns '' when nothing usable is left, which callers should treat as
 * "apply no search predicate" rather than "search for empty string".
 */
export function sanitizeOrFilterTerm(raw: string): string {
  return (raw || '').replace(/[\\,()]/g, ' ').trim();
}
