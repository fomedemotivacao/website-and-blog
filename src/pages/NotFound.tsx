import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: Rota inexistente acessada:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <>
      <Helmet>
        <title>Página não encontrada | Fome de Motivação</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="text-center px-6">
          <h1 className="mb-4 text-6xl font-bold text-accent">404</h1>
          <p className="mb-2 text-2xl font-semibold">Página não encontrada</p>
          <p className="mb-8 text-muted-foreground">
            O endereço{" "}
            <code className="text-sm bg-muted px-2 py-1 rounded">
              {location.pathname}
            </code>{" "}
            não existe neste site.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full px-6 py-3 bg-accent text-accent-foreground font-semibold hover:opacity-90 transition-opacity"
            >
              Ir para o início
            </Link>
            <Link
              to="/blog"
              className="inline-flex items-center justify-center rounded-full px-6 py-3 border border-border hover:bg-muted transition-colors"
            >
              Ver artigos do blog
            </Link>
          </div>
        </div>
      </div>
    </>
  );
};

export default NotFound;
