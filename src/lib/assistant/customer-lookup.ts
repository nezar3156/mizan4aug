import { useStore, type Customer } from "../store";

/**
 * Single source of truth for customer search.
 * Used by: subscriber ledger, account statement, balance, bills, payments.
 * Supports: full name, partial name, first/last word, account number,
 * meter number (MSR-0004 / MSR0004 / 0004), phone — case-insensitive.
 *
 * Returns either a single match, or a disambiguation list when multiple
 * customers match.  Callers handle the two cases.
 */

export type LookupResult =
  | { kind: "single"; customer: Customer }
  | { kind: "multiple"; customers: Customer[] }
  | { kind: "none" };

/** Normalize Arabic text + lowercase for matching. */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Extract a meter number token from free text (MSR-0004, MSR0004, 0004). */
export function extractMeterToken(text: string): string | null {
  const m = text.match(/(MSR[-]?\d{3,5})/i);
  if (m) return m[1].toUpperCase().replace("MSR-", "MSR-");
  // bare 4-digit number that could be a meter suffix
  const bare = text.match(/\b(\d{4})\b/);
  return bare ? bare[1] : null;
}

/** Score how well a query matches a customer — higher = better. */
function scoreCustomer(c: Customer, q: string): number {
  const nq = norm(q);
  if (!nq) return 0;
  const name = norm(c.name);
  const nameParts = name.split(" ");
  const phone = (c.phone ?? "").replace(/\D/g, "");
  const payAccount = norm(c.pay_account ?? "");
  const meter = useStore.getState().meters.find((m) => m.customer_id === c.id);
  const meterNum = meter?.number.toLowerCase() ?? "";
  const meterDigits = meterNum.replace(/\D/g, "");

  // Exact meter match
  if (meterNum === nq) return 100;
  // Meter with dash normalization
  if (meterNum === nq.replace("-", "") || meterNum.replace("-", "") === nq) return 95;
  // Meter digits only
  if (meterDigits && meterDigits === nq) return 90;
  // Meter contains query (e.g. "0004" inside "msr-0004")
  if (meterDigits && meterDigits.endsWith(nq) && nq.length >= 3) return 85;
  // Exact name
  if (name === nq) return 80;
  // Name starts with query
  if (name.startsWith(nq)) return 70;
  // Query is first word of name
  if (nameParts[0] === nq) return 65;
  // Query is last word of name
  if (nameParts[nameParts.length - 1] === nq) return 60;
  // Name contains query
  if (name.includes(nq)) return 50;
  // Query contains full name
  if (nq.includes(name)) return 45;
  // Any name word matches query
  if (nameParts.some((p) => p === nq)) return 40;
  // Any name word starts with query
  if (nameParts.some((p) => p.startsWith(nq) && nq.length >= 2)) return 30;
  // Phone exact
  if (phone === nq.replace(/\D/g, "")) return 75;
  // Phone contains
  if (phone && phone.includes(nq.replace(/\D/g, "")) && nq.replace(/\D/g, "").length >= 6) return 55;
  // Pay account
  if (payAccount && payAccount.includes(nq)) return 35;
  // Customer ID
  if (String(c.id) === nq) return 60;

  return 0;
}

/** Memoization cache: query -> result (cleared on store hydration). */
let cacheVersion = 0;
let cachedResults: Map<string, LookupResult> = new Map();

/** Clear the lookup cache — called after hydration. */
export function clearLookupCache() {
  cachedResults = new Map();
  cacheVersion++;
}

// Auto-clear cache when store changes
let lastCustomerCount = -1;
function maybeClearCache() {
  const count = useStore.getState().customers.length;
  if (count !== lastCustomerCount) {
    lastCustomerCount = count;
    clearLookupCache();
  }
}

/**
 * Main lookup function.  Tries to extract a meter number or name from
 * the query string, scores all customers, and returns the result.
 */
export function lookupCustomer(query: string): LookupResult {
  maybeClearCache();

  const cached = cachedResults.get(query);
  if (cached) return cached;

  const s = useStore.getState();
  if (s.customers.length === 0) return { kind: "none" };

  // Try meter token extraction first
  const meterToken = extractMeterToken(query);
  let searchQuery = query;
  if (meterToken) {
    // If query IS just the meter token, use it directly
    if (norm(query) === norm(meterToken) || norm(query).replace(/\D/g, "") === meterToken.replace(/\D/g, "")) {
      searchQuery = meterToken;
    }
  }

  // Score all customers
  const scored = s.customers
    .map((c) => ({ c, score: scoreCustomer(c, searchQuery) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  let result: LookupResult;
  if (scored.length === 0) {
    result = { kind: "none" };
  } else if (scored.length === 1 || scored[0].score > scored[1].score + 10) {
    // Single match or clear winner (>10 point gap)
    result = { kind: "single", customer: scored[0].c };
  } else {
    // Multiple strong matches — disambiguate (max 8)
    result = { kind: "multiple", customers: scored.slice(0, 8).map((x) => x.c) };
  }

  cachedResults.set(query, result);
  return result;
}

/**
 * Lookup by name only (for follow-up questions that have a name
 * but no meter number).
 */
export function lookupByName(name: string): LookupResult {
  return lookupCustomer(name);
}
