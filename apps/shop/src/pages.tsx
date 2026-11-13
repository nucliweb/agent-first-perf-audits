import { useState } from "react";
import { Link } from "./router.tsx";
import { addToCart, changeQuantity, cartTotals, linePrice, useCartLines } from "./cart.ts";
import { FREE_SHIPPING_FROM } from "./cart-lines.ts";
import { recommendFor } from "./recommendations.ts";
import { ProductGrid, Section, Stepper, useTitle } from "./components.tsx";
import {
  HERO_SIZES,
  PRODUCTS,
  PRODUCT_PAGE_SIZES,
  SIZES,
  formatPrice,
  heroSrcSet,
  productBySlug,
  productSrc,
  productSrcSet,
  unitPrice,
  type Category,
} from "./products.ts";

export function Home() {
  useTitle("");
  return (
    <>
      <section className="hero">
        <img
          className="hero__image"
          data-lcp="hero"
          src="/images/hero-1200.webp"
          srcSet={heroSrcSet()}
          sizes={HERO_SIZES}
          width={1600}
          height={900}
          fetchPriority="high"
          alt="Freshly brewed specialty coffee"
        />
        <div className="hero__text">
          <h1 className="hero__title">Roasted on Monday. In your cup by Thursday.</h1>
          <p className="hero__lead">Single origins and blends from farms we know, roasted in small batches every week.</p>
          <Link to="/shop" className="button">
            Browse the coffee
          </Link>
        </div>
      </section>
      <Section title="This week's roasts">
        <ProductGrid products={PRODUCTS.filter((p) => p.category === "coffee")} />
      </Section>
      <Section title="Brew it better">
        <ProductGrid products={PRODUCTS.filter((p) => p.category === "gear")} />
      </Section>
    </>
  );
}

const FILTERS: { id: Category | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "coffee", label: "Coffee" },
  { id: "gear", label: "Gear" },
];

export function Shop() {
  useTitle("Shop");
  const [filter, setFilter] = useState<Category | "all">("all");
  const products = filter === "all" ? PRODUCTS : PRODUCTS.filter((p) => p.category === filter);
  return (
    <div className="page">
      <h1 className="page__title">Shop</h1>
      <div className="filters" role="group" aria-label="Filter products">
        {FILTERS.map(({ id, label }) => (
          <button key={id} type="button" className="chip" aria-pressed={filter === id} onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      <ProductGrid products={products} />
    </div>
  );
}

export function ProductPage({ slug }: { slug: string }) {
  const product = productBySlug(slug);
  useTitle(product?.name ?? "Not found");
  const [size, setSize] = useState<string>(SIZES[0].id);
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(0);
  const [recommended, setRecommended] = useState<string[]>([]);
  if (!product) return <NotFound />;

  const isCoffee = product.category === "coffee";
  const lineSize = isCoffee ? size : undefined;

  const onAdd = () => {
    addToCart({ slug: product.slug, size: lineSize, quantity });
    setAdded((n) => n + 1);
    setRecommended(recommendFor(product.slug));
  };

  return (
    <div className="page">
      <div className="product">
        <img
          className="product__image"
          data-lcp="product"
          src={productSrc(product.slug, 800)}
          srcSet={productSrcSet(product.slug)}
          sizes={PRODUCT_PAGE_SIZES}
          width={800}
          height={800}
          fetchPriority="high"
          alt={product.summary}
        />
        <div className="product__info">
          <h1 className="product__name">{product.name}</h1>
          {product.origin && <p className="product__origin">{product.origin}</p>}
          <p className="product__price">{formatPrice(unitPrice(product, lineSize) * quantity)}</p>
          <p>{product.description}</p>
          {product.notes && (
            <ul className="notes" aria-label="Tasting notes">
              {product.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
          {isCoffee && (
            <fieldset className="sizes">
              <legend>Size</legend>
              {SIZES.map((s) => (
                <label key={s.id} className="chip">
                  <input type="radio" name="size" value={s.id} checked={size === s.id} onChange={() => setSize(s.id)} />
                  {s.label}
                </label>
              ))}
            </fieldset>
          )}
          <div className="buy">
            <Stepper label="Quantity" value={quantity} onChange={(n) => setQuantity(Math.max(1, n))} />
            <button type="button" className="button" onClick={onAdd}>
              Add to cart
            </button>
          </div>
          <p className="status" role="status">
            {added > 0 ? `Added to your cart. Goes well with ${recommended.map((s) => productBySlug(s)?.name).join(" and ")}.` : ""}
          </p>
        </div>
      </div>
      <Section title="You may also like">
        <ProductGrid products={PRODUCTS.filter((p) => p.category === product.category && p.slug !== product.slug)} />
      </Section>
    </div>
  );
}

export function Cart() {
  useTitle("Cart");
  const lines = useCartLines();
  const { subtotal, shipping, total } = cartTotals(lines);
  const [checkedOut, setCheckedOut] = useState(false);

  if (lines.length === 0) {
    return (
      <div className="page">
        <h1 className="page__title">Your cart</h1>
        <p>Your cart is empty.</p>
        <Link to="/shop" className="button">
          Browse the shop
        </Link>
      </div>
    );
  }

  return (
    <div className="page">
      <h1 className="page__title">Your cart</h1>
      <ul className="lines">
        {lines.map((line) => {
          const product = productBySlug(line.slug);
          if (!product) return null;
          const size = SIZES.find((s) => s.id === line.size);
          return (
            <li key={`${line.slug}-${line.size ?? ""}`} className="line">
              <img src={productSrc(product.slug, 400)} width={80} height={80} alt="" loading="lazy" />
              <div className="line__info">
                <h2 className="line__name">{product.name}</h2>
                {size && <p className="line__size">{size.label}</p>}
                <Stepper
                  label={`Quantity of ${product.name}`}
                  value={line.quantity}
                  onChange={(n) => changeQuantity(line, n)}
                />
              </div>
              <p className="line__price">{formatPrice(linePrice(line) * line.quantity)}</p>
            </li>
          );
        })}
      </ul>
      <dl className="summary">
        <dt>Subtotal</dt>
        <dd>{formatPrice(subtotal)}</dd>
        <dt>Shipping</dt>
        <dd>{shipping === 0 ? "Free" : formatPrice(shipping)}</dd>
        <dt>Total</dt>
        <dd className="summary__total">{formatPrice(total)}</dd>
      </dl>
      {shipping > 0 && <p className="hint">Free shipping from {formatPrice(FREE_SHIPPING_FROM)}.</p>}
      <button type="button" className="button" onClick={() => setCheckedOut(true)}>
        Checkout
      </button>
      <p className="status" role="status">
        {checkedOut ? "This is a demo shop: nothing was charged." : ""}
      </p>
    </div>
  );
}

export function NotFound() {
  useTitle("Not found");
  return (
    <div className="page">
      <h1 className="page__title">Page not found</h1>
      <Link to="/" className="button">
        Back to the home page
      </Link>
    </div>
  );
}
