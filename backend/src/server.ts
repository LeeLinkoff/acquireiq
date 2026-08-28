// server.ts
//
// AcquireIQ API entry point.
//
// This file remains a thin HTTP routing layer. Routes validate and translate
// HTTP input, call application services, and shape HTTP responses. Business
// and data-access logic remains in services/ rather than being implemented
// directly in route handlers.
//
// Currently implemented endpoints:
//   GET  /api/health    — liveness check
//   GET  /api/docs      — Swagger UI
//   GET  /requests      — acquisition request list/search
//   GET  /requests/:id  — acquisition request detail
//   POST /requests      — create acquisition request
//   PATCH /requests/:id/status — advance acquisition workflow status
//   GET  /dashboard     — acquisition pipeline summary


import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";

// This project uses TypeScript with NodeNext/ESM. Local imports intentionally
// use .js extensions even though the source files are .ts. TypeScript resolves
// them to the corresponding .ts source during development and preserves the
// .js paths for the compiled files that Node executes from dist/.
import { ApiError } from "./errors/api-error.js";
import { LOG_LEVEL, requestLogger } from "./logging/logger.js";
import {
  createRequest,
  getDashboard,
  getRequestById,
  getRequests,
  requestorExists,
  updateRequestStatus,
  type AcquisitionRequestStatus,
  type CreateAcquisitionRequest,
  type RequestFilters
} from "./services/requests.js";
import swaggerSpec from "./swagger-spec.js";

const app = express();
const PORT = process.env.PORT || 3002;

/*
 * Values accepted by the acquisition-request filtering API.
 *
 * These mirror the corresponding PostgreSQL domain constraints so invalid
 * filter values are rejected before reaching the data-access layer.
 */
const VALID_STATUSES = new Set([
  "draft",
  "submitted",
  "in_review",
  "approved",
  "awarded",
  "rejected"
]);

const VALID_PRIORITIES = new Set([
  "low",
  "medium",
  "high",
  "critical"
]);

// Global middleware is registered before the routes so request parsing,
// CORS handling, and configurable logging apply consistently to the API.
app.use(cors());
app.use(express.json());
app.use(requestLogger);

/**
 * GET /api/health
 *
 * Lightweight liveness check for the backend process.
 */
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    ok: true,
    service: "acquireiq-backend",
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/docs
 *
 * Existing Swagger UI provided by the backend template. The OpenAPI
 * specification is maintained separately in swagger-spec.ts.
 */
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * GET /requests
 *
 * Returns acquisition requests with optional status, priority, and fiscal-year
 * filtering. HTTP query parameters are validated here before being converted
 * to the typed filter object accepted by the service layer.
 */
app.get(
  "/requests",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters: RequestFilters = {};

      if (req.query.status !== undefined) {
        if (
          typeof req.query.status !== "string" ||
          !VALID_STATUSES.has(req.query.status)
        ) {
          throw new ApiError(400, "Invalid status filter.");
        }

        filters.status = req.query.status;
      }

      if (req.query.priority !== undefined) {
        if (
          typeof req.query.priority !== "string" ||
          !VALID_PRIORITIES.has(req.query.priority)
        ) {
          throw new ApiError(400, "Invalid priority filter.");
        }

        filters.priority = req.query.priority;
      }

      if (req.query.fiscalYear !== undefined) {
        if (
          typeof req.query.fiscalYear !== "string" ||
          !/^\d{4}$/.test(req.query.fiscalYear)
        ) {
          throw new ApiError(400, "Invalid fiscalYear filter.");
        }

        const fiscalYear = Number(req.query.fiscalYear);

        // Keep HTTP validation consistent with the database CHECK constraint.
        if (fiscalYear < 2000 || fiscalYear > 2200) {
          throw new ApiError(
            400,
            "fiscalYear must be between 2000 and 2200."
          );
        }

        filters.fiscalYear = fiscalYear;
      }

      const requests = await getRequests(filters);

      res.json(requests);
    } catch (error) {
      next(error);
    }
  }
);

// GET /requests/:id
//
// Returns one acquisition request by its numeric database identifier.
app.get(
  "/requests/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!/^\d+$/.test(req.params.id)) {
        throw new ApiError(400, "Request id must be a positive integer.");
      }

      const id = Number(req.params.id);

      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new ApiError(400, "Request id must be a positive integer.");
      }

      const request = await getRequestById(id);

      if (!request) {
        throw new ApiError(404, "Acquisition request not found.");
      }

      res.json(request);
    } catch (error) {
      next(error);
    }
  }
);

// POST /requests
//
// Creates a new acquisition request after validating all client-supplied
// values before passing them to the service layer.
app.post(
  "/requests",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const {
        title,
        description,
        requestorId,
        priority,
        budgetCeiling,
        fiscalYear
      } = req.body ?? {};

      // Reject missing or whitespace-only titles.
      if (typeof title !== "string" || title.trim().length === 0) {
        throw new ApiError(400, "title is required.");
      }

      // Reject missing or whitespace-only descriptions.
      if (
        typeof description !== "string" ||
        description.trim().length === 0
      ) {
        throw new ApiError(400, "description is required.");
      }

      // IDs must be positive integers before they are used in database lookups.
      if (
        typeof requestorId !== "number" ||
        !Number.isSafeInteger(requestorId) ||
        requestorId <= 0
      ) {
        throw new ApiError(
          400,
          "requestorId must be a positive integer."
        );
      }

      // A syntactically valid ID must also identify an existing user before
      // the acquisition request can be persisted.
      if (!(await requestorExists(requestorId))) {
        throw new ApiError(
          400,
          "requestorId does not identify an existing user."
        );
      }

      // Keep accepted priorities synchronized with the database constraint.
      if (
        typeof priority !== "string" ||
        !VALID_PRIORITIES.has(priority)
      ) {
        throw new ApiError(400, "Invalid priority.");
      }

      // Monetary values are accepted as decimal strings because PostgreSQL
      // NUMERIC values should not be passed through JavaScript floating point.
      if (
        typeof budgetCeiling !== "string" ||
        !/^\d+(\.\d{1,2})?$/.test(budgetCeiling) ||
        Number(budgetCeiling) < 0
      ) {
        throw new ApiError(
          400,
          "budgetCeiling must be a non-negative monetary value."
        );
      }

      // Keep fiscal-year validation synchronized with the database constraint.
      if (
        typeof fiscalYear !== "number" ||
        !Number.isInteger(fiscalYear) ||
        fiscalYear < 2000 ||
        fiscalYear > 2200
      ) {
        throw new ApiError(
          400,
          "fiscalYear must be an integer between 2000 and 2200."
        );
      }

      // Only client-controlled creation fields are passed to the service.
      // ID, status, and creation timestamp remain database-controlled.
      const input: CreateAcquisitionRequest = {
        title: title.trim(),
        description: description.trim(),
        requestorId,
        priority,
        budgetCeiling,
        fiscalYear
      };

      const created = await createRequest(input);

      // Return the persisted representation, including generated/default fields.
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  }
);


/**
 * PATCH /requests/:id/status
 *
 * Requests a workflow transition. The service owns the state machine and
 * performs validation while holding a PostgreSQL row lock so concurrent
 * updates cannot validate against stale request state.
 */
app.patch(
  "/requests/:id/status",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!/^\d+$/.test(req.params.id)) {
        throw new ApiError(400, "Request id must be a positive integer.");
      }

      const id = Number(req.params.id);

      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new ApiError(400, "Request id must be a positive integer.");
      }

      const status = req.body?.status;

      if (typeof status !== "string" || !VALID_STATUSES.has(status)) {
        throw new ApiError(400, "Invalid status.");
      }

      const result = await updateRequestStatus(
        id,
        status as AcquisitionRequestStatus
      );

      if (result.outcome === "not_found") {
        throw new ApiError(404, "Acquisition request not found.");
      }

      if (result.outcome === "invalid_transition") {
        throw new ApiError(
          422,
          `Invalid status transition from ${result.currentStatus} to ${result.requestedStatus}.`
        );
      }

      if (result.outcome === "approval_incomplete") {
        throw new ApiError(
          422,
          `Request cannot be approved while approvals remain incomplete or rejected. Pending: ${result.pendingCount}; rejected: ${result.rejectedCount}.`
        );
      }

      res.json(result.request);
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /dashboard
 *
 * Returns database-aggregated acquisition pipeline metrics including request
 * counts by status, total pipeline value, and requests with open protests.
 */
app.get(
  "/dashboard",
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const dashboard = await getDashboard();

      res.json(dashboard);
    } catch (error) {
      next(error);
    }
  }
);


/**
 * Central API error boundary.
 *
 * Expected application errors retain their intended HTTP status. Unexpected
 * failures return a generic response so internal implementation details are
 * not exposed to clients.
 *
 * Error middleware must remain after the route registrations.
 */
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