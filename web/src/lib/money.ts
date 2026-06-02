import { CURRENCY } from '../config/constants';

/** "1,000 🥛" / "972.93 🥛". Hides trailing zeros up to minorPlaces. */
export function formatMilk(amount: number, places = CURRENCY.minorPlaces): string {
  const n = amount.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: places,
  });
  return `${n} ${CURRENCY.symbol}`;
}

/** Whole-cent price, e.g. "58¢". */
export function formatCents(cents: number): string {
  return `${Math.round(cents)}¢`;
}

/** Probability reading of a cents price, e.g. "58%". */
export function formatPct(cents: number): string {
  return `${Math.round(cents)}%`;
}

/** Share counts, up to 2 dp. */
export function formatShares(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** Signed money for P&L, e.g. "+22.93 🥛" / "−4.00 🥛". */
export function formatSignedMilk(amount: number, places = CURRENCY.minorPlaces): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${formatMilk(Math.abs(amount), places)}`;
}
