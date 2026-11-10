import { test } from "node:test";
import assert from "node:assert/strict";
import { addLine, setQuantity, totals, FREE_SHIPPING_FROM, SHIPPING } from "./cart-lines.ts";

test("adding a product creates a line", () => {
  assert.deepEqual(addLine([], { slug: "chemex", quantity: 1 }), [{ slug: "chemex", quantity: 1 }]);
});

test("adding the same product and size again increases its quantity", () => {
  const lines = addLine([{ slug: "kenya-aa", size: "250g", quantity: 1 }], { slug: "kenya-aa", size: "250g", quantity: 2 });
  assert.deepEqual(lines, [{ slug: "kenya-aa", size: "250g", quantity: 3 }]);
});

test("another size of the same coffee is another line", () => {
  const lines = addLine([{ slug: "kenya-aa", size: "250g", quantity: 1 }], { slug: "kenya-aa", size: "1kg", quantity: 1 });
  assert.equal(lines.length, 2);
});

test("a quantity of zero removes the line", () => {
  const lines = setQuantity([{ slug: "chemex", quantity: 2 }], { slug: "chemex" }, 0);
  assert.deepEqual(lines, []);
});

test("totals add the shipping below the free-shipping threshold", () => {
  const price = () => 1200;
  const { subtotal, shipping, total, count } = totals([{ slug: "a", quantity: 2 }], price);
  assert.equal(count, 2);
  assert.equal(subtotal, 2400);
  assert.equal(shipping, SHIPPING);
  assert.equal(total, 2400 + SHIPPING);
});

test("shipping is free from the threshold", () => {
  const { shipping } = totals([{ slug: "a", quantity: 1 }], () => FREE_SHIPPING_FROM);
  assert.equal(shipping, 0);
});

test("an empty cart has no shipping", () => {
  assert.equal(totals([], () => 0).total, 0);
});
