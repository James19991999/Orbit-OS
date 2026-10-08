import { CURRENCIES, isCurrency, type Currency } from '@/lib/format';

/**
 * Currencies IntaSend card checkout is enabled for on this account. Defaults to all four;
 * set INTASEND_CARD_CURRENCIES (e.g. "KES,USD") if your IntaSend account can't take some of them.
 * Server-side only (reads a non-public env var) — pass the result to client components as a prop.
 */
export function cardCurrencies(): Currency[] {
  const raw = process.env.INTASEND_CARD_CURRENCIES;
  if (!raw) return [...CURRENCIES];
  const list = raw.split(',').map((c) => c.trim().toUpperCase()).filter(isCurrency);
  return list.length ? list : ['KES'];
}

/** Currency a plan is charged in by card: the workspace's own if enabled, else USD, else KES. */
export function cardCurrencyFor(workspace: Currency, enabled: Currency[] = cardCurrencies()): Currency {
  if (enabled.includes(workspace)) return workspace;
  return enabled.includes('USD') ? 'USD' : enabled[0] ?? 'KES';
}
