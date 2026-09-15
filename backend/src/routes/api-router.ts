/**
 * Infrastructure API routes.
 *
 * This file defines AcquireIQ's general API infrastructure endpoints that do
 * not belong to a specific application feature such as acquisition requests,
 * dashboard reporting, or AI-assisted search.
 *
 * Relationship to the surrounding files:
 *
 *   server.ts
 *     Creates and configures the Express application, registers global
 *     middleware, mounts this router along with the feature routers, installs
 *     centralized error handling, and starts the HTTP server.
 *
 *   api-router.ts
 *     Defines general API infrastructure endpoints such as backend health
 *     information and interactive API documentation.
 *
 *   swagger-spec.ts
 *     Builds the OpenAPI specification displayed by the Swagger UI.
 *
 * Routing relationship:
 *
 *   server.ts
 *
 *       app.use(apiRouter)
 *              |
 *              v
 *       api-router.ts
 *
 *           GET /api/health
 *           /api/docs
 *
 * The complete public endpoint paths are intentionally defined in this file.
 * server.ts therefore knows which category routers exist without containing
 * the implementation of any individual HTTP endpoint.
 */


import { Router } from "express";
import swaggerUi from "swagger-ui-express";

/*
 * This project uses TypeScript with NodeNext/ESM. Local imports intentionally use .js extensions even though the source files are .ts.
 * TypeScript resolves them to the corresponding .ts source during development and preserves the .js paths for the compiled files that Node executes from dist/.
*/
import swaggerSpec from "../swagger-spec.js";


const router = Router();


// GET /api/health
//
// Lightweight liveness check used to verify that the backend process is running and capable of handling HTTP requests.
router.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "acquireiq-backend",
    timestamp: new Date().toISOString()
  });
});


// /api/docs
//
// Swagger UI is registered with router.use() because it serves the documentation page and its supporting resources beneath /api/docs rather than representing a single GET endpoint.
router.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec)
);


export default router;