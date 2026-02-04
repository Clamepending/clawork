/** Display denomination for bounty amounts. App uses USDC everywhere in the UI. */
export function formatAmountLabel(amount: number, _chain?: string): string {
  return amount === 0 ? "Volunteer" : `${amount} USDC`;
}
