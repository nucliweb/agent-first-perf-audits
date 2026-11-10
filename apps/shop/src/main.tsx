import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { usePath } from "./router.tsx";
import { Footer, Header, PromoSlot } from "./components.tsx";
import { Cart, Home, NotFound, ProductPage, Shop } from "./pages.tsx";
import "./styles.css";

function Route() {
  const path = usePath();
  if (path === "/") return <Home />;
  if (path === "/shop") return <Shop />;
  if (path === "/cart") return <Cart />;
  const product = path.match(/^\/product\/([\w-]+)$/);
  if (product) return <ProductPage key={product[1]} slug={product[1]} />;
  return <NotFound />;
}

function App() {
  return (
    <>
      <Header />
      <PromoSlot />
      <main className="main">
        <Route />
      </main>
      <Footer />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
