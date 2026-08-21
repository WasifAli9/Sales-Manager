/**
 * Static FX rates → GBP (approximate, update periodically)
 */
export const FX_TO_GBP: Record<string, number> = {
  GBP: 1,
  USD: 0.79,
  AED: 0.215,
}

export const CURRENCIES = [
  { value: "USD", label: "USD — US Dollar", symbol: "$" },
  { value: "GBP", label: "GBP — British Pound", symbol: "£" },
  { value: "AED", label: "AED — UAE Dirham", symbol: "AED" },
] as const

export type Currency = "USD" | "GBP" | "AED"

export function toGBP(amount: number, currency: string): number {
  const rate = FX_TO_GBP[currency] ?? 1
  return amount * rate
}

export function formatGBP(amount: number): string {
  return `£${Math.round(amount).toLocaleString("en-GB")}`
}

export function currencySymbol(currency: string): string {
  return CURRENCIES.find(c => c.value === currency)?.symbol ?? currency
}

export function formatInCurrency(amount: number, currency: string): string {
  const sym = currencySymbol(currency)
  const rounded = Math.round(amount).toLocaleString("en-GB")
  return currency === "AED" ? `${rounded} AED` : `${sym}${rounded}`
}
