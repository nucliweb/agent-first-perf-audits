import { useEffect, type ReactNode } from "react";
import { Link } from "./router.tsx";
import { cartTotals, useCartLines } from "./cart.ts";
import { formatPrice, productSrc, productSrcSet, type Product } from "./products.ts";

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | Perf Coffee` : "Perf Coffee";
  }, [title]);
}

export function Header() {
  const { count } = cartTotals(useCartLines());
  return (
    <header className="header">
      <div className="header__inner">
        <Link to="/" className="logo" aria-label="Perf Coffee, home">
          Perf Coffee
        </Link>
        <nav className="nav" aria-label="Main">
          <Link to="/shop">Shop</Link>
          <Link to="/cart" className="cart-link" aria-label={`Cart, ${count} ${count === 1 ? "item" : "items"}`}>
            Cart <span className="cart-link__count">{count}</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

// The promo banner of a third party goes here. The slot keeps its height before the banner
// arrives, so the page does not move when it does.
export function PromoSlot() {
  return <div className="promo-slot" data-promo-slot="" />;
}

export function Footer() {
  return (
    <footer className="footer">
      <p>Perf Coffee is a demo shop for the Multi-Agent Performance Audits workshop. Nothing here is for sale.</p>
      <p>Photos from Unsplash, see CREDITS.md.</p>
    </footer>
  );
}

export function ProductCard({ product }: { product: Product }) {
  return (
    <article className="card">
      <Link to={`/product/${product.slug}`} className="card__link">
        <img
          className="card__image"
          src={productSrc(product.slug, 400)}
          srcSet={productSrcSet(product.slug)}
          sizes="(min-width: 960px) 25vw, 50vw"
          width={800}
          height={800}
          loading="lazy"
          decoding="async"
          alt=""
        />
        <h3 className="card__name">{product.name}</h3>
      </Link>
      <p className="card__summary">{product.summary}</p>
      <p className="card__price">
        {product.category === "coffee" ? "From " : ""}
        {formatPrice(product.price)}
      </p>
    </article>
  );
}

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid">
      {products.map((product) => (
        <ProductCard key={product.slug} product={product} />
      ))}
    </div>
  );
}

export function Stepper({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(value - 1)} aria-label="Decrease">
        −
      </button>
      <output aria-live="polite">{value}</output>
      <button type="button" onClick={() => onChange(value + 1)} aria-label="Increase">
        +
      </button>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="section">
      <h2 className="section__title">{title}</h2>
      {children}
    </section>
  );
}
