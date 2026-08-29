/**
 * Dashboard HTTP routes.
 *
 * This file defines the HTTP endpoints associated with AcquireIQ dashboard
 * data and separates dashboard-specific HTTP handling from the application-
 * wide setup performed in server.ts.
 *
 * Relationship to the surrounding files:
 *
 *   server.ts
 *     Creates and configures the Express application, registers global
 *     middleware, mounts this router, installs centralized error handling,
 *     and starts the HTTP server.
 *
 *   dashboard-routes.ts
 *     Defines the complete public dashboard endpoint and translates service
 *     results into HTTP responses.
 *
 *   services/requests.ts
 *     Contains the database aggregation logic used to produce the dashboard
 *     data returned by this endpoint.
 *
 * Routing relationship:
 *
 *   server.ts
 *
 *       app.use(dashboardRouter)
 *                 |
 *                 v
 *       dashboard-routes.ts
 *
 *           router.get("/dashboard")
 *                 |
 *                 v
 *           GET /dashboard
 *
 * The complete public route is intentionally defined here rather than
 * splitting the URL between server.ts and this router. This keeps the actual
 * API endpoint visible when reading the route file.
 *
 * The router intentionally has no reference to the Express `app` object.
 * server.ts owns the application while this file owns the dashboard router.
 */


import {Router,type NextFunction,type Request,type Response} from "express";

import { getDashboard } from "../services/requests.js";


const router = Router();


// GET /dashboard
//
// Returns database-aggregated acquisition pipeline metrics including request counts by status, total pipeline value, and requests with open protests.
router.get(
  "/dashboard",
  async (
    _req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const dashboard =
        await getDashboard();

      res.json(dashboard);
    } catch (error) {
      /*
       * Route handlers do not create their own generic error responses.
       * Forward failures to the centralized error middleware in server.ts.
       */
      next(error);
    }
  }
);


export default router;