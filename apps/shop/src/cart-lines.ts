// Pure cart logic: lines in, lines out. Prices are in cents.

export type LineKey = { slug: string; size?: string };
export type Line = LineKey & { quantity: number };

export const SHIPPING = 495;
export const FREE_SHIPPING_FROM = 3000;

const sameLine = (a: LineKey, b: LineKey) => a.slug === b.slug && a.size === b.size;

export function addLine(lines: Line[], item: Line): Line[] {
  const existing = lines.find((line) => sameLine(line, item));
  if (!existing) return [...lines, item];
  return lines.map((line) => (line === existing ? { ...line, quantity: line.quantity + item.quantity } : line));
}

export function setQuantity(lines: Line[], key: LineKey, quantity: number): Line[] {
  if (quantity <= 0) return lines.filter((line) => !sameLine(line, key));
  return lines.map((line) => (sameLine(line, key) ? { ...line, quantity } : line));
}

export function totals(lines: Line[], priceOf: (line: Line) => number) {
  const count = lines.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = lines.reduce((sum, line) => sum + priceOf(line) * line.quantity, 0);
  const shipping = count === 0 || subtotal >= FREE_SHIPPING_FROM ? 0 : SHIPPING;
  return { count, subtotal, shipping, total: subtotal + shipping };
}
