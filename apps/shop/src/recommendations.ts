// Picks the products to suggest after an add to cart, from the products bought together
// in past orders.
import { PRODUCTS } from "./products.ts";

const ORDERS = Array.from({ length: 3000 }, (_, i) => PRODUCTS[(i * 7) % PRODUCTS.length].slug);

export function recommendFor(slug: string) {
  const scores = new Map<string, number>();
  for (let i = 0; i < ORDERS.length; i++) {
    for (let j = 0; j < ORDERS.length; j++) {
      if (ORDERS[i] === slug && ORDERS[j] !== slug) {
        scores.set(ORDERS[j], (scores.get(ORDERS[j]) ?? 0) + 1 / (1 + Math.abs(i - j)));
      }
    }
  }
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([s]) => s);
}
