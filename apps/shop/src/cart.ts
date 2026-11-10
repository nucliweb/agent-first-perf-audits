// The cart of the visitor, kept in localStorage and shared by every component.
import { useSyncExternalStore } from "react";
import { addLine, setQuantity, totals, type Line, type LineKey } from "./cart-lines.ts";
import { productBySlug, unitPrice } from "./products.ts";

const KEY = "perf-coffee-cart";
const listeners = new Set<() => void>();

function load(): Line[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

let lines = load();

function save(next: Line[]) {
  lines = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // Private mode or full storage: the cart lives in memory only
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useCartLines = () => useSyncExternalStore(subscribe, () => lines);

export const addToCart = (item: Line) => save(addLine(lines, item));
export const changeQuantity = (key: LineKey, quantity: number) => save(setQuantity(lines, key, quantity));

export const linePrice = (line: Line) => {
  const product = productBySlug(line.slug);
  return product ? unitPrice(product, line.size) : 0;
};

export const cartTotals = (current: Line[]) => totals(current, linePrice);
