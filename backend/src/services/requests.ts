// NodeNext/ESM requires the runtime .js extension for local imports even though the corresponding source module is db/pool.ts.
import { pool } from "../db/pool.js";


/**
 * API-facing representation of an acquisition request.
 * Database column names are mapped to camelCase at the SQL boundary so the
 * rest of the TypeScript application does not depend on PostgreSQL naming.
 *
 * @openapi
 */
export interface AcquisitionRequest
{
  id: number;
  title: string;
  description: string;
  requestorId: number;
  requestorName: string;
  status: string;
  priority: string;
  budgetCeiling: string;
  fiscalYear: number;
  createdAt: Date;
}

/**
 * Supported filters for acquisition-request searches.
 * Additional filtering can be added here without exposing arbitrary SQL
 * fields or expressions to callers.
 */
export interface RequestFilters
{
  status?: string;
  priority?: string;
  fiscalYear?: number;
}

/**
 * Values required to create an acquisition request.
 *
 * @openapi
 */
export interface CreateAcquisitionRequest {
  title: string;
  description: string;
  requestorId: number;
  priority: string;
  budgetCeiling: string;
  fiscalYear: number;
}

/**
 * Aggregate values returned by the acquisition dashboard endpoint.
 *
 * @openapi
 */
export interface DashboardSummary {
  countsByStatus: {
    draft: number;
    submitted: number;
    in_review: number;
    approved: number;
    awarded: number;
    rejected: number;
  };
  totalPipelineValue: string;
  openProtestCount: number;
}


/**
 * Returns acquisition requests matching the supplied filters.
 *
 * SQL is assembled only from application-controlled fragments. Filter values
 * are always passed separately as PostgreSQL parameters rather than being
 * interpolated into the query string.
 */
export async function getRequests(
  filters: RequestFilters = {}
): Promise<AcquisitionRequest[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  // Build parameter positions dynamically so any combination of optional
  // filters can use the same query without sacrificing parameterization.
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`ar.status = $${values.length}`);
  }

  if (filters.priority) {
    values.push(filters.priority);
    conditions.push(`ar.priority = $${values.length}`);
  }

  if (filters.fiscalYear !== undefined) {
    values.push(filters.fiscalYear);
    conditions.push(`ar.fiscal_year = $${values.length}`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
      SELECT
        ar.id,
        ar.title,
        ar.description,
        ar.requestor_id AS "requestorId",
        u.name AS "requestorName",
        ar.status,
        ar.priority,
        ar.budget_ceiling AS "budgetCeiling",
        ar.fiscal_year AS "fiscalYear",
        ar.created_at AS "createdAt"
      FROM acquisition_requests ar
      JOIN users u ON u.id = ar.requestor_id
      ${where}
      ORDER BY ar.created_at DESC, ar.id DESC
    `,
    values
  );

  return result.rows as AcquisitionRequest[];
}


/**
 * Returns a single acquisition request by its database ID.
 *
 * The query joins users so the API response includes requestorName in the same
 * shape used by the acquisition-request list endpoint.
 *
 * The ID is passed as a PostgreSQL parameter rather than interpolated into the
 * SQL string.
 *
 * Returns null when no acquisition request exists with the supplied ID.
 */
export async function getRequestById(
  id: number
): Promise<AcquisitionRequest | null> {
  const result = await pool.query(
    `
      SELECT
        ar.id,
        ar.title,
        ar.description,
        ar.requestor_id AS "requestorId",
        u.name AS "requestorName",
        ar.status,
        ar.priority,
        ar.budget_ceiling AS "budgetCeiling",
        ar.fiscal_year AS "fiscalYear",
        ar.created_at AS "createdAt"
      FROM acquisition_requests ar

      -- Join to users so the API does not need a second query to resolve
      -- the human-readable requestor name.
      JOIN users u ON u.id = ar.requestor_id

      -- The request ID remains parameterized to avoid constructing SQL from
      -- caller-controlled input.
      WHERE ar.id = $1
    `,
    [id]
  );

  // Absence is represented as null so the HTTP layer can convert it cleanly
  // into a 404 response without exposing database-specific behavior.
  return (result.rows[0] as AcquisitionRequest | undefined) ?? null;
}

/**
 * Creates a new acquisition request and returns its API-facing representation.
 *
 * Status is intentionally omitted from the input so PostgreSQL applies the
 * database default of "draft" for every newly created request.
 *
 * The INSERT values are passed separately as PostgreSQL parameters rather
 * than interpolated into the SQL string.
 */
export async function createRequest(
  input: CreateAcquisitionRequest
): Promise<AcquisitionRequest> {
  const result = await pool.query(
    `
      -- Insert the request first so PostgreSQL owns generated/default values
      -- such as the request ID, draft status, and creation timestamp.
      WITH inserted AS (
        INSERT INTO acquisition_requests (
          title,
          description,
          requestor_id,
          priority,
          budget_ceiling,
          fiscal_year
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      )

      -- Join the inserted row to users so the returned representation has
      -- the same shape as GET /requests and GET /requests/:id.
      SELECT
        i.id,
        i.title,
        i.description,
        i.requestor_id AS "requestorId",
        u.name AS "requestorName",
        i.status,
        i.priority,
        i.budget_ceiling AS "budgetCeiling",
        i.fiscal_year AS "fiscalYear",
        i.created_at AS "createdAt"
      FROM inserted i
      JOIN users u ON u.id = i.requestor_id
    `,
    [
      // Values remain separate from the SQL text to preserve parameterization.
      input.title,
      input.description,
      input.requestorId,
      input.priority,
      input.budgetCeiling,
      input.fiscalYear
    ]
  );

  return result.rows[0] as AcquisitionRequest;
}

/**
 * Returns whether a user exists with the supplied database ID.
 *
 * This allows request creation to validate the requestor relationship before
 * attempting the INSERT and producing a database foreign-key violation.
 */
export async function requestorExists(id: number): Promise<boolean> {
  const result = await pool.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM users
        WHERE id = $1
      ) AS "exists"
    `,
    [id]
  );

  return result.rows[0].exists as boolean;
}

/**
 * Returns aggregate acquisition-pipeline values for the dashboard.
 *
 * Aggregation is performed by PostgreSQL rather than loading acquisition
 * records into the application and calculating dashboard values in memory.
 */
export async function getDashboard(): Promise<DashboardSummary> {
  const result = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'draft')::int AS "draft",
        COUNT(*) FILTER (WHERE status = 'submitted')::int AS "submitted",
        COUNT(*) FILTER (WHERE status = 'in_review')::int AS "in_review",
        COUNT(*) FILTER (WHERE status = 'approved')::int AS "approved",
        COUNT(*) FILTER (WHERE status = 'awarded')::int AS "awarded",
        COUNT(*) FILTER (WHERE status = 'rejected')::int AS "rejected",

        -- PostgreSQL performs the monetary aggregation so the dashboard does
        -- not need to load acquisition rows and calculate totals in memory.
        COALESCE(SUM(budget_ceiling), 0)::numeric(14,2)::text
          AS "totalPipelineValue",

        -- Count acquisition requests that currently have at least one
        -- unresolved protest without joining protests into the main aggregate
        -- and accidentally multiplying acquisition budget values.
        (
          SELECT COUNT(DISTINCT acquisition_request_id)::int
          FROM protests
          WHERE resolved_at IS NULL
        ) AS "openProtestCount"
      FROM acquisition_requests
    `
  );

  const row = result.rows[0];

  return {
    countsByStatus: {
      draft: row.draft,
      submitted: row.submitted,
      in_review: row.in_review,
      approved: row.approved,
      awarded: row.awarded,
      rejected: row.rejected
    },
    totalPipelineValue: row.totalPipelineValue,
    openProtestCount: row.openProtestCount
  };
}