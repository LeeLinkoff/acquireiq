// NodeNext/ESM requires the runtime .js extension for local imports even though the corresponding source module is db/pool.ts.
import { pool } from "../db/pool.js";
import type { ValidatedAssistFilter } from "./ai/types.js";


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
 * One approval record in an acquisition request's approval chain.
 *
 * stageSequence determines workflow ordering. Multiple approvals may have the same stageSequence, which represents parallel approvers in that stage.
 *
 * @openapi
 */
export interface AcquisitionApproval {
  id: number;
  approverId: number;
  approverName: string;
  stageName: string;
  stageSequence: number;
  /*
   * Authoritative approval-stage state derived by PostgreSQL from the
   * acquisition request's approval records.
   *
   * This value is not stored as separate stage state and is not derived by
   * Node or React. PostgreSQL returns complete, current, or future according
   * to the approval-stage workflow represented by the authoritative approval
   * records.
  */
  stageState: "complete" | "current" | "future";
  decision: string | null;
  decidedAt: Date | null;
  notes: string | null;
}

/**
 * Client payload for recording an individual approver's decision.
 *
 * The approval row already determines the acquisition request, approver,
 * stage, and stage sequence. The client may therefore change only the
 * decision and optional notes associated with that specific approval.
 *
 * @openapi
 */
export interface UpdateAcquisitionApproval {
  decision: "approved" | "rejected";
  notes?: string | null;
}

/**
 * Contract associated with an awarded acquisition request.
 *
 * A request that has not been awarded normally has no contract, so the request-detail response represents this relationship as null.
 *
 * @openapi
 */
export interface AcquisitionContract {
  id: number;
  vendorId: number;
  vendorName: string;
  awardDate: Date;
  contractValue: string;
  periodOfPerformanceEnd: Date;
  status: string;
}

/**
 * Protest associated with an acquisition request.
 *
 * resolvedAt and resolution remain null while the protest is open.
 *
 * @openapi
 */
export interface AcquisitionProtest {
  id: number;
  filedAt: Date;
  resolvedAt: Date | null;
  resolution: string | null;
  reason: string;
}

/**
 * Complete representation returned by GET /requests/:id.
 *
 * The collection endpoints intentionally continue using AcquisitionRequest.
 * Only the detail endpoint expands the request with workflow and award
 * context required by the challenge.
 *
 * @openapi
 */
export interface AcquisitionRequestDetail extends AcquisitionRequest {
  /*
   * Current approval stage derived from the approval records by PostgreSQL.
   * null means no pending approval stage remains and the approval workflow
   * is complete.
   */
  currentApprovalStageSequence: number | null;
  approvals: AcquisitionApproval[];
  contract: AcquisitionContract | null;
  protests: AcquisitionProtest[];
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
 * Client payload for requesting a workflow status transition.
 *
 * @openapi
 */
export interface UpdateAcquisitionRequestStatus {
  status: "draft" | "submitted" | "in_review" | "approved" | "awarded" | "rejected";
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


export type AcquisitionRequestStatus = UpdateAcquisitionRequestStatus["status"];

/*
 * Describes every possible result of attempting to record an individual approval decision.
 *
 * The approval operation is separate from acquisition-request status. Approval-stage progression is derived by PostgreSQL from the authoritative approval records.
 * It records a decision only for the specified approval belonging to the specified acquisition request.
 *
 * Possible outcomes:
 *
 *   updated
 *     The individual approval decision was recorded successfully.
 *
 *   request_not_found
 *     The acquisition request associated with the operation does not exist.
 *
 *   approval_not_found
 *     The specified approval does not exist for the acquisition request.
 *
 *   already_decided
 *     The approval already contains a recorded decision and cannot be decided again by this operation.
 *
 *   stage_not_current
 *     The approval belongs to a stage that is not the current approval stage.
 *
 * A type alias is used because the operation can return one of several distinct result object shapes.
 */
export type ApprovalDecisionResult =
  | {
      outcome: "updated";
      approval: AcquisitionApproval;
    }
  | { outcome: "request_not_found" }
  | { outcome: "approval_not_found" }
  | { outcome: "already_decided" }
  | { outcome: "stage_not_current" };  //The approval belongs to a stage that is not the current approval stage
  
/*
 * Describes every possible result of attempting to move an acquisition request
 * through the workflow state machine.
 *
 * A transition either succeeds, fails because the request does not exist,
 * or is rejected because the requested transition is not allowed by the
 * AcquireIQ request status state machine.
 *
 * A type alias is used because the operation can return one of several distinct result object shapes.
 */
export type StatusTransitionResult =
  | { outcome: "updated"; request: AcquisitionRequest }
  | { outcome: "not_found" }
  | {
      outcome: "invalid_transition";
      currentStatus: AcquisitionRequestStatus;
      requestedStatus: AcquisitionRequestStatus;
    };


/**
 * Acquisition-request workflow state machine.
 *
 * In TypeScript terms, this uses the Record and Readonly utility types to define a strongly typed object whose keys and values are constrained to specified types. Used here as a map.
 *
 * PLAIN-ENGLISH EXPLANATION:
 *
 * This object is a lookup table that defines which status changes are legal.
 *
 * The key is the current state. The array is the list of states you're
 * allowed to go to next. Then .includes() checks whether the requested
 * next state is in that list.
 *
 * Think of each entry as:
 *   current status: [statuses it is allowed to change to]
 *
 * For example:
 *   submitted: ["in_review", "rejected"]
 *
 * means:
 *   "If the request is currently submitted, it may change to either
 *    in_review or rejected."
 *
 * The workflow code uses the current status as the key to retrieve the
 * array of allowed next statuses:
 *
 *   VALID_STATUS_TRANSITIONS[currentStatus]
 *
 * If currentStatus is "submitted", that lookup returns:
 *   ["in_review", "rejected"]
 *
 * The code then uses .includes(requestedStatus) to ask whether the requested
 * new status appears in that array:
 *   VALID_STATUS_TRANSITIONS[currentStatus].includes(requestedStatus)
 *
 * Examples:
 *
 *   submitted -> in_review
 *   ["in_review", "rejected"].includes("in_review")
 *   => true, so the transition is allowed
 *
 *   submitted -> approved
 *   ["in_review", "rejected"].includes("approved")
 *   => false, so the transition is rejected
 *
 * The TypeScript Record<> declaration adds compile-time protection around
 * the lookup table. It requires every AcquisitionRequestStatus to have an
 * entry, and each allowed destination must itself be a valid
 * AcquisitionRequestStatus.
 *
 * awarded and rejected map to empty arrays because they are terminal states:
 *   awarded: []
 *   rejected: []
 *
 * Therefore no requested status can pass .includes() for those states.
 *
 * This is a table-driven state machine rather than a switch/case state
 * machine. The transition table defines the legal workflow paths, while
 * updateRequestStatus() validates and applies the requested transition.
 */
const VALID_STATUS_TRANSITIONS: Readonly<Record<AcquisitionRequestStatus, readonly AcquisitionRequestStatus[]>
> = {
  draft: ["submitted"],
  submitted: ["in_review", "rejected"],
  in_review: ["approved", "rejected"],
  approved: ["awarded"],
  awarded: [],
  rejected: []
};


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

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

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
 * Loads the base API representation of one acquisition request.
 *
 * This shared loader keeps endpoints that need only the base request separate
 * from GET /requests/:id, which enriches that base request with approvals,
 * contract information, and protest context.
 *
 * The request ID is passed as a PostgreSQL parameter rather than interpolated
 * into the SQL string.
 */
async function getBaseRequestById(
  id: number
): Promise<AcquisitionRequest | null> {
  const result = await pool.query<AcquisitionRequest>(
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
      WHERE ar.id = $1
    `,
    [id]
  );

  return result.rows[0] ?? null;
}

/**
 * Returns a single acquisition request by its database ID together with the
 * detail context required by the request-detail endpoint.
 *
 * The base request query joins users so the response includes requestorName.
 * After confirming the request exists, the service also loads the ordered
 * approval chain, associated contract when present, and protest context.
 *
 * All database IDs are passed as PostgreSQL parameters rather than
 * interpolated into SQL strings.
 *
 * Returns null when no acquisition request exists with the supplied ID.
 */
export async function getRequestById(
  id: number
): Promise<AcquisitionRequestDetail | null> {
  /*
   * Load the base request first.
   *
   * Keeping this as the authoritative existence check lets us return null
   * immediately without running the related-detail queries for an ID that
   * does not exist.
   */
  const request = await getBaseRequestById(id);

  if (!request) {
    return null;
  }

  /*
   * The request now definitely exists, so its independent related datasets can be retrieved concurrently.
   *
   * Every query remains parameterized. The request ID is always supplied as a PostgreSQL bind value ($1), never interpolated into SQL text.
   */
  const [
    currentApprovalStageResult,
    approvalsResult,
    contractResult,
    protestsResult
  ] = await Promise.all([
	  pool.query<{ currentApprovalStageSequence: number | null }>(
	  `
		SELECT get_current_approval_stage_sequence($1)
		  AS "currentApprovalStageSequence"
	  `,
	  [id]
	),
    pool.query<AcquisitionApproval>(
      `
        SELECT
          a.id,
          a.approver_id AS "approverId",
          u.name AS "approverName",
          a.stage_name AS "stageName",
          a.stage_sequence AS "stageSequence",
		  /*
		   * PostgreSQL is the authoritative source for approval-stage state.
		   * The function derives complete/current/future directly from the
		   * acquisition request's authoritative approval records. Node returns
		   * that derived value without independently determining stage state.
		  */
		  public.get_approval_stage_state(a.acquisition_request_id,a.stage_sequence) AS "stageState",
          a.decision,
          a.decided_at AS "decidedAt",
          a.notes
        FROM approvals a
        JOIN users u
          ON u.id = a.approver_id
        WHERE a.acquisition_request_id = $1
        ORDER BY
          a.stage_sequence ASC,
          a.id ASC
      `,
      [id]
    ),

    pool.query<AcquisitionContract>(
      `
        SELECT
          c.id,
          c.vendor_id AS "vendorId",
          v.name AS "vendorName",
          c.award_date AS "awardDate",
          c.contract_value AS "contractValue",
          c.period_of_performance_end AS "periodOfPerformanceEnd",
          c.status
        FROM contracts c
        JOIN vendors v
          ON v.id = c.vendor_id
        WHERE c.acquisition_request_id = $1
        ORDER BY c.id ASC
        LIMIT 1
      `,
      [id]
    ),

    pool.query<AcquisitionProtest>(
      `
        SELECT
          p.id,
          p.filed_at AS "filedAt",
          p.resolved_at AS "resolvedAt",
          p.resolution,
          p.reason
        FROM protests p
        WHERE p.acquisition_request_id = $1
        ORDER BY
          p.filed_at ASC,
          p.id ASC
      `,
      [id]
    )
  ]);

   /*
    * The detail response includes:
    *
    * currentApprovalStageSequence -> lowest stage containing one or more pending
    *                                 individual approvals; null when no approvals
    *                                 are pending
    * approvals                    -> ordered individual approval records, each
    *                                 containing its PostgreSQL-derived stageState
    * contract                     -> null when no contract exists
    * protests                     -> [] when no protests exist
    *
    * Request status and approval-stage progression are separate.
    *
    * PostgreSQL is the authoritative source for approval-stage progression.
    * Approval records contain the underlying workflow data, and PostgreSQL derives
    * both currentApprovalStageSequence and each approval's stageState from those
    * authoritative records.
    *
    * stageState is not stored separately. PostgreSQL derives it as:
    *
    *   complete -> the stage precedes the current stage, or no pending stage remains
    *   current  -> the stage is the lowest stage containing a pending approval
    *   future   -> the stage follows the current stage
    *
    * Multiple approvals may belong to the same stage and therefore receive the
    * same derived stageState. Multiple earlier stages may simultaneously be
    * complete.
    *
    * Node does not independently determine approval-stage state. It exposes the
    * values derived by PostgreSQL so API consumers, including the frontend, do
    * not need to reproduce approval-stage workflow rules.
    *
    * This keeps the approval data and its authoritative workflow interpretation
    * at the database boundary while providing the frontend a stable response shape.
   */
   return {
	  ...request,
	  currentApprovalStageSequence: currentApprovalStageResult.rows[0].currentApprovalStageSequence,
	  approvals: approvalsResult.rows,
	  contract: contractResult.rows[0] ?? null,
	  protests: protestsResult.rows
   };
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

/**
 * Applies one acquisition-request status transition atomically.
 *
 * The request row is locked before the current status is inspected. Concurrent
 * callers therefore serialize on the same authoritative row and cannot both
 * validate against stale workflow state.
 *
 * The requested transition must be allowed by the AcquireIQ request status
 * state machine.
 */
export async function updateRequestStatus(
  id: number,
  requestedStatus: AcquisitionRequestStatus
): Promise<StatusTransitionResult> {
  const client = await pool.connect();

  try
  {
    await client.query("BEGIN");

    const locked = await client.query(
      `
        SELECT status
        FROM acquisition_requests
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );

    if (locked.rowCount === 0) {
      await client.query("ROLLBACK");
      return { outcome: "not_found" };
    }

    const currentStatus = locked.rows[0].status as AcquisitionRequestStatus;
    const allowedTargets = VALID_STATUS_TRANSITIONS[currentStatus];

    if (!allowedTargets.includes(requestedStatus)) {
      await client.query("ROLLBACK");
      return {
        outcome: "invalid_transition",
        currentStatus,
        requestedStatus
      };
    }



    const updated = await client.query(
      `
        UPDATE acquisition_requests
        SET status = $2
        WHERE id = $1
        RETURNING id
      `,
      [id, requestedStatus]
    );

    await client.query("COMMIT");

    const request = await getBaseRequestById(updated.rows[0].id as number);

    if (!request) {
      throw new Error("Updated acquisition request could not be reloaded.");
    }

    return { outcome: "updated", request };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Records one individual approver's decision.
 *
 * This operation is independent of acquisition-request status. PostgreSQL
 * records the decision only when the specified approval belongs to the
 * specified acquisition request, is still pending, and belongs to the
 * authoritative current approval stage.
 *
 * Approval-stage progression is derived from the authoritative approval
 * records rather than stored separately.
 */
export async function updateApprovalDecision(requestId: number, approvalId: number, input: UpdateAcquisitionApproval): Promise<ApprovalDecisionResult>
{
  /*
   * PostgreSQL owns authoritative enforcement of the approval-decision write.
   *
   * record_approval_decision() records the decision only when the approval:
   *
   *   - belongs to the specified acquisition request,
   *   - is still pending, and
   *   - belongs to the current approval stage.
   *
   * Current-stage determination is performed by PostgreSQL from the
   * authoritative approval records.
   */
  const updatedResult = await pool.query<AcquisitionApproval>(
    `
      WITH updated AS (
        SELECT *
        FROM public.record_approval_decision($1, $2, $3, $4)
      )
      SELECT
        updated.id,
        updated.approver_id AS "approverId",
        u.name AS "approverName",
        updated.stage_name AS "stageName",
        updated.stage_sequence AS "stageSequence",
        public.get_approval_stage_state(
          updated.acquisition_request_id,
          updated.stage_sequence
        ) AS "stageState",
        updated.decision,
        updated.decided_at AS "decidedAt",
        updated.notes
      FROM updated
      JOIN users u
        ON u.id = updated.approver_id
    `,
    [approvalId, requestId, input.decision, input.notes ?? null]
  );

  /*
   * A zero-row result means PostgreSQL rejected the write. 
   * Determine the application-level reason so the route can return the appropriate response.
   */
  if (updatedResult.rowCount === 0) 
  {
    const requestResult = await pool.query(
      `
        SELECT 1
        FROM acquisition_requests
        WHERE id = $1
      `,
      [requestId]
    );

    if (requestResult.rowCount === 0) 
	{
      return { outcome: "request_not_found" };
    }

    const approvalResult = await pool.query<{ decision: string }>(
      `
        SELECT decision
        FROM approvals
        WHERE id = $1
          AND acquisition_request_id = $2
      `,
      [approvalId, requestId]
    );

    if (approvalResult.rowCount === 0)
	{
      return { outcome: "approval_not_found" };
    }

    if (approvalResult.rows[0].decision !== "pending")
	{
      return { outcome: "already_decided" };
    }

    return { outcome: "stage_not_current" };
  }

  return {
    outcome: "updated",
    approval: updatedResult.rows[0]
  };
}


/**
 * Searches acquisition requests using filters that have already passed the
 * deterministic AI validation boundary.
 *
 * This function is intentionally part of the acquisition-request service
 * rather than the AI provider. The AI subsystem determines what the user
 * appears to be asking for, while this service remains responsible for
 * translating trusted application filters into database operations.
 *
 * Security boundary:
 *
 *   LLM output
 *       |
 *       v
 *   AI validation
 *       |
 *       v
 *   ValidatedAssistFilter[]
 *       |
 *       v
 *   searchRequestsByValidatedFilters()
 *       |
 *       v
 *   server-owned SQL + parameterized values
 *       |
 *       v
 *   PostgreSQL
 *
 * Neither field names nor SQL operators are copied from model output into
 * the SQL statement. Both are mapped through application-owned switch
 * statements below.
 *
 * Filter values are supplied separately through PostgreSQL parameters
 * ($1, $2, ...), preventing those values from becoming executable SQL.
 */
export async function searchRequestsByValidatedFilters(
  filters: readonly ValidatedAssistFilter[]
): Promise<AcquisitionRequest[]> {
     /*
   * Defense in depth:
   *
   * AiService already refuses to execute an AI search with zero validated
   * filters. This check protects the database boundary as well so a future
   * caller cannot accidentally interpret an empty filter array as
   * "SELECT every acquisition request."
   */
  if (filters.length === 0) {
    throw new Error(
      "AI-assisted acquisition search requires at least one validated filter."
    );
  }
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  /**
   * Maps the application's logical AI field names to database columns.
   *
   * This mapping is server-owned. Even though each filter has already been
   * validated, we still do not use filter.field directly as SQL text.
   */
  const columnForField = (
    field: ValidatedAssistFilter["field"]
  ): string => {
    switch (field) {
      case "status":
        return "ar.status";

      case "priority":
        return "ar.priority";

      case "fiscalYear":
        return "ar.fiscal_year";

      case "budgetCeiling":
        return "ar.budget_ceiling";
    }
  };

  /**
   * Maps logical comparison operations to SQL operators.
   *
   * As with field names, the SQL operator comes exclusively from
   * application-owned code rather than provider/model output.
   */
  const sqlOperatorFor = (
    operator: ValidatedAssistFilter["operator"]
  ): string => {
    switch (operator) {
      case "eq":
        return "=";

      case "gt":
        return ">";

      case "gte":
        return ">=";

      case "lt":
        return "<";

      case "lte":
        return "<=";
    }
  };

  for (const filter of filters) {
    //
    // Values are appended separately from the SQL text so PostgreSQL can
    // bind them as parameters rather than interpreting them as SQL.
    //
    values.push(filter.value);

    const parameterNumber = values.length;
    const column = columnForField(filter.field);
    const operator = sqlOperatorFor(filter.operator);

    //
    // column and operator originate only from the closed mappings above.
    // The actual filter value is represented only by a PostgreSQL parameter.
    //
    conditions.push(
      `${column} ${operator} $${parameterNumber}`
    );
  }

  /*
   * The SQL structure itself is completely application-owned.
   *
   * Empty filter arrays are rejected above, so every query reaching this point contains at least one validated filter.
   * The WHERE clause is built only from server-owned field/operator mappings and PostgreSQL-parameterized values.
  */
  const whereClause = `WHERE ${conditions.join(" AND ")}`;

  const result = await pool.query<AcquisitionRequest>(
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
		${whereClause}
		ORDER BY ar.created_at DESC, ar.id DESC
	  `,
	  values
	);

  return result.rows as AcquisitionRequest[];
}
