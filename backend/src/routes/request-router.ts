/**
 * Acquisition-request HTTP routes.
 *
 * This file defines the HTTP endpoints associated with acquisition requests
 * and separates request-specific HTTP handling from the application-wide
 * setup performed in server.ts.
 *
 * Relationship to the surrounding files:
 *
 *   server.ts
 *     Creates and configures the Express application, registers global
 *     middleware, mounts this router, installs centralized error handling,
 *     and starts the HTTP server.
 *
 *   request-routes.ts
 *     Defines the acquisition-request HTTP endpoints. It reads and validates
 *     HTTP input, calls the appropriate request service functions, and
 *     translates service results into HTTP responses.
 *
 *   services/requests.ts
 *     Contains acquisition-request business logic and database operations,
 *     including request retrieval, creation, workflow transitions, approval
 *     checks, transactions, and concurrency control.
 *
 * Routing relationship:
 *
 *   server.ts
 *
 *       app.use(requestsRouter)
 *                 |
 *                 v
 *       request-routes.ts
 *
 *           router.get("/requests")
 *           router.get("/requests/:id")
 *           router.post("/requests")
 *           router.patch("/requests/:id/status")
 *
 * The complete public endpoint paths are intentionally defined in this file
 * rather than splitting the URLs between server.ts and this router. This
 * keeps the actual API endpoints visible when reading the route file.
 *
 * The router intentionally has no reference to the Express `app` object.
 * server.ts owns the application while this file owns the request router.
 *
 * Business rules and database access remain in the service layer so this
 * route layer stays focused on HTTP input validation and request/response
 * handling.
 */
 
 
import {Router,type NextFunction,type Request,type Response} from "express";

import { ApiError } from "../errors/api-error.js";
import {
  createRequest,
  getRequestById,
  getRequests,
  requestorExists,
  updateRequestStatus,
  type AcquisitionRequestStatus,
  type CreateAcquisitionRequest,
  type RequestFilters
} from "../services/requests.js";

/**
 * Acquisition-request status values accepted by the HTTP API.
 *
 * These mirror the supported acquisition workflow states so invalid client
 * input is rejected before reaching the service layer.
 */
const VALID_STATUSES = new Set([
  "draft",
  "submitted",
  "in_review",
  "approved",
  "awarded",
  "rejected"
]);


/**
 * Acquisition-request priority values accepted by the HTTP API.
 *
 * These mirror the corresponding application/database constraint.
 */
const VALID_PRIORITIES = new Set([
  "low",
  "medium",
  "high",
  "critical"
]);


const router = Router();


// GET /requests
//
// Returns acquisition requests with optional status, priority, and fiscal-year filtering. 
// HTTP query parameters are validated here before being converted to the typed filter object accepted by the service layer.
router.get(
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
router.get(
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
// Creates a new acquisition request after validating all client-supplied values before passing them to the service layer.
router.post(
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


// PATCH /requests/:id/status
//
// Requests a workflow transition. The service owns the state machine and performs validation while holding a PostgreSQL row lock so concurrent updates cannot validate against stale request state.
router.patch(
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


export default router;