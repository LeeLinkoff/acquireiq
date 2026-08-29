// server.ts
//
// AcquireIQ API entry point.
//
// This file is the AcquireIQ API composition root.
//
// It creates and configures the Express application, registers global
// middleware, mounts category routers, installs centralized error handling and starts the HTTP server.
//
// Endpoint-specific HTTP handling lives in routes/, while business and data-access logic lives in services/.


import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";

// This project uses TypeScript with NodeNext/ESM. Local imports intentionally
// use .js extensions even though the source files are .ts. TypeScript resolves
// them to the corresponding .ts source during development and preserves the
// .js paths for the compiled files that Node executes from dist/.
import { ApiError } from "./errors/api-error.js";
import { LOG_LEVEL, requestLogger } from "./logging/logger.js";
import apiRouter from "./routes/api-router.js";
import requestsRouter from "./routes/request-router.js";
import dashboardRouter from "./routes/dashboard-router.js";
import assistRouter from "./routes/assist-router.js";


const app = express();
const PORT = process.env.PORT || 3002;


// Global middleware is registered before the routes so request parsing,
// CORS handling, and configurable logging apply consistently to the API.
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Mount the routes 
app.use(apiRouter);        // The complete endpoint paths are defined inside api-router.ts.
app.use(requestsRouter);   // The complete endpoint paths are defined inside request-router.ts.
app.use(dashboardRouter);  // The complete endpoint paths are defined inside dashboard-router.ts.
app.use(assistRouter);     // The complete endpoint paths are defined inside assist-router.ts.

// Central API error boundary.
//
// Expected application errors retain their intended HTTP status.
// Unexpected failures return a generic response so internal implementation details are not exposed to clients.
//
// Error middleware must remain after the route registrations.
app.use(
  (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction ) => {
    if (error instanceof ApiError)
	{
      res.status(error.statusCode).json({
        ok: false,
        error: error.message
      });
      return;
    }

    // express.json() reports malformed JSON as a SyntaxError with
    // status 400 and type "entity.parse.failed".
    if (
      error instanceof SyntaxError &&
      "status" in error &&
      (error as { status?: number }).status === 400 &&
      "type" in error &&
      (error as { type?: string }).type === "entity.parse.failed"
    ) {
      res.status(400).json({
        ok: false,
        error: "Malformed JSON body."
      });
      return;
    }

    console.error(error);

    res.status(500).json({
      ok: false,
      error: "Internal server error."
    });
  }
);


app.listen(PORT, () => {
  console.log(`acquireiq-backend listening on port ${PORT}`);
  console.log(`acquireiq-backend health: http://localhost:${PORT}/api/health`);
  console.log(`Swagger docs: http://localhost:${PORT}/api/docs`);
  console.log(`Logging: ${LOG_LEVEL}`);
});