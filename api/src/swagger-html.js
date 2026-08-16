export function swaggerHtml() {
  return `<!DOCTYPE html>
<html lang="es-CO">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Acopio Pereira API — Swagger</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" />
    <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js"></script>
    <script src="/api/docs/init.js"></script>
  </body>
</html>
`;
}

export function swaggerInitJs() {
  return `window.ui = SwaggerUIBundle({
  url: "/api/openapi.json",
  dom_id: "#swagger-ui",
  deepLinking: true,
  tryItOutEnabled: true,
  displayRequestDuration: true,
  filter: true,
  defaultModelsExpandDepth: 1,
  docExpansion: "list",
  persistAuthorization: false,
  syntaxHighlight: { activate: true, theme: "agate" }
});
`;
}
