# agent-first-perf-audits

Repo del workshop "Multi-Agent Performance Audits". Lee `PLAN.md` antes de empezar: contiene las decisiones cerradas, la arquitectura, las versiones y lo pendiente.

## Convenciones

- Versiones exactas de herramientas y modelos, nunca `@latest`. La tabla de versiones de `PLAN.md` es la referencia.
- La documentación se escribe primero en castellano (`docs/src/content/docs/es/`) y después se traduce a catalán (`ca/`) e inglés (`en/`), con los mismos archivos y los mismos headings.
- Los README de la raíz son la excepción: el inglés es `README.md`, el castellano `README.es.md` y el catalán `README.ca.md`, con los mismos headings.
- Sin rayas largas (em dashes) ni emojis en la documentación.
- Cualquier cifra en la documentación tiene que poder reproducirse con un script o un test del repo, como `experiments/trace-engine-cli/`.
- Las reglas deciden el gate; el LLM solo explica.
- Antes de crear un servidor MCP, comprueba si una llamada directa a una CLI es suficiente (ver Learnings).
- Preguntar antes de decidir nombres o cambios de estructura.
