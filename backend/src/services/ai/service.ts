/**
 * AI-assisted acquisition search service.
 *
 * The AI feature is divided into three primary files:
 *
 *   types.ts
 *     Defines the shared contracts used by the AI subsystem, including
 *     provider output, supported filter fields/operators, validated filters,
 *     and the API response shape.
 *
 *   provider.ts
 *     Defines the provider-neutral AiQueryProvider interface. This keeps
 *     vendor-specific LLM implementations, such as OpenAI, replaceable
 *     without changing the orchestration or database-query logic.
 *
 *   service.ts
 *     Implements the application-level orchestration and trust boundary.
 *     It calls the configured AiQueryProvider, treats its structured output
 *     as untrusted input, validates that output against application-owned
 *     rules, and passes only validated filters toward the database layer.
 *
 * The relationship is:
 *
 *   HTTP POST /assist/query
 *             |
 *             v
 *        AiService              (service.ts)
 *             |
 *             v
 *      AiQueryProvider          (provider.ts)
 *             |
 *             v
 *   Provider implementation     (for example, OpenAI)
 *             |
 *             v
 *   AiStructuredQuery           (types.ts, untrusted)
 *             |
 *             v
 *        AiService
 *             |
 *             v
 *   ValidatedAssistQuery        (types.ts, trusted)
 *             |
 *             v
 *   Server-owned parameterized database query
 *
 * The provider is responsible only for interpreting natural language.
 * AiService owns validation and orchestration. Database access remains
 * application-controlled, and no LLM-generated SQL is ever executed.
 */


/*
 * This project uses TypeScript with NodeNext/ESM. Local imports intentionally use .js extensions even though the source files are .ts.
 * TypeScript resolves them to the corresponding .ts source during development and preserves the .js paths for the compiled files that Node executes from dist/.
*/
import { searchRequestsByValidatedFilters } from "../requests.js";
import type { AiQueryProvider } from "./provider.js";
import type {
  AiStructuredQuery,
  AssistFilterField,
  AssistFilterOperator,
  AssistQueryResponse,
  ValidatedAssistFilter,
  ValidatedAssistQuery
} from "./types.js";


/**
 * Minimum confidence required before an AI interpretation is allowed to
 * influence an acquisition search.
 *
 * Confidence is advisory metadata produced by the model, so it is not used
 * as a security control. Deterministic validation still validates every
 * field, operator, and value independently.
 *
 * A low-confidence interpretation is returned as an explicit fallback rather
 * than guessing what the user intended or executing a potentially misleading
 * search.
 */
const MIN_AI_CONFIDENCE = 0.60;

//
// These are application-owned allowlists.
//
// The LLM may suggest filters, but it cannot expand the set of fields,
// operators, statuses, or priorities that the application understands.
//

const VALID_FIELDS = new Set<AssistFilterField>([
  "status",
  "priority",
  "fiscalYear",
  "budgetCeiling"
]);

const VALID_OPERATORS = new Set<AssistFilterOperator>([
  "eq",
  "gt",
  "gte",
  "lt",
  "lte"
]);

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


/**
 * Coordinates AI-assisted acquisition search.
 *
 * AiService is the orchestration layer between the configured LLM provider,
 * deterministic application validation, and the acquisition query layer.
 *
 * Provider output is always treated as untrusted. Fields, operators, values,
 * and confidence must pass deterministic validation before they can influence
 * a database query.
 *
 * The LLM never receives a database connection and never constructs or
 * executes SQL. Only validated application-owned filters can reach the
 * database query layer.
 */
export class AiService
{
  constructor(private readonly provider: AiQueryProvider) {}

  /**
   * Executes one AI-assisted acquisition search.
   *
   * Provider failures, malformed output, invalid filters, empty filters, and
   * low-confidence interpretations produce an explicit fallback response.
   *
   * Database failures are deliberately NOT converted into AI fallback results.
   * Once provider output has passed validation, a database failure is an
   * application/infrastructure error and should propagate to the HTTP error
   * handling layer as such.
  */
  async query(query: string): Promise<AssistQueryResponse> 
  {
    let validated: ValidatedAssistQuery;

    /*
     * Only provider interpretation and deterministic validation belong inside
     * this try/catch.
     *
     * That distinction matters because an OpenAI failure is meaningfully
     * different from PostgreSQL being unavailable.
    */
    try
	{
      /*
       * The provider performs interpretation only. It receives natural language
       * and returns structured data, but has no database access.
       */
      const providerOutput = await this.provider.interpretQuery(query);

      /*
       * Provider output remains untrusted even when OpenAI Structured Outputs
       * successfully produced JSON matching the requested general shape.
       *
       * This validation step establishes AcquireIQ's actual trust boundary.
       */
      validated = this.validateProviderOutput(providerOutput);
    }
	catch (error)
	{
      /*
       * Provider failures and deterministic validation failures stop here.
       *
       * Most importantly, we never replace invalid AI output with an empty
       * unrestricted database search.
       */
      console.error("AI-assisted query interpretation failed:",error);

      return {query,mode: "fallback",confidence: null,filters: [],results: [],message:"AI-assisted search could not safely interpret the query."};
    }

    /*
     * A structurally valid interpretation with no supported filters is still
     * not useful enough to execute.
     *
     * Returning fallback here prevents [] from accidentally meaning
     * "return every acquisition request."
     */
    if (validated.filters.length === 0)
	{
      return {query,mode: "fallback",confidence: validated.confidence,filters: [],results: [],message:"AI interpretation did not produce any supported search filters."};
    }

    /*
     * Low confidence is made visible rather than silently executing a search
     * whose interpretation the model itself considers uncertain.
     */
    if (validated.confidence < MIN_AI_CONFIDENCE) 
	{
      return {query,mode: "fallback",confidence: validated.confidence,filters: validated.filters,results: [],message:"AI interpretation confidence was too low to execute the search."};
    }

    /*
     * This call intentionally sits OUTSIDE the provider/validation try/catch.
     *
     * If PostgreSQL fails here, the error propagates normally instead of being
     * incorrectly reported to the client as an AI interpretation problem.
     */
    const results = await searchRequestsByValidatedFilters(validated.filters);

    return {query,mode: "ai",confidence: validated.confidence,filters: validated.filters,results};
  }
  
  /**
   * Converts untrusted provider output into the application's trusted
   * internal filter representation.
   *
   * Validation is intentionally deterministic. The LLM cannot define new
   * fields, operators, enum values, or database behavior.
   */
  private validateProviderOutput(
    output: AiStructuredQuery
  ): ValidatedAssistQuery {
    //
    // First validate the top-level response shape.
    //
    // A provider response without a filters array cannot be safely
    // interpreted as an acquisition query.
    //
    if (
      typeof output !== "object" ||
      output === null ||
      !Array.isArray(output.filters)
    ) {
      throw new Error(
        "AI response does not contain a valid filters array."
      );
    }

    //
    // Confidence is normalized to the range 0.0 through 1.0.
    //
    // NaN and Infinity must also be rejected because both satisfy
    // JavaScript's typeof value === "number" check.
    //
    if (
      typeof output.confidence !== "number" ||
      !Number.isFinite(output.confidence) ||
      output.confidence < 0 ||
      output.confidence > 1
    ) {
      throw new Error(
        "AI response contains an invalid confidence value."
      );
    }

    //
    // Every individual filter must pass validation.
    //
    // One invalid filter invalidates the provider interpretation. We do not
    // silently discard unsupported filters because doing so could materially
    // change the meaning of the user's request.
    //
    const filters = output.filters.map((filter, index) =>
      this.validateFilter(filter, index)
    );

    //
    // Only this validated representation is allowed to continue toward the
    // database query layer.
    //
    return {
      filters,
      confidence: output.confidence
    };
  }

  /**
   * Validates one AI-produced filter.
   *
   * Provider filter objects are treated as unknown input even though the
   * provider interface describes the expected TypeScript shape. Runtime
   * provider responses are external data and therefore cannot be trusted
   * solely because TypeScript compiled successfully.
   */
  private validateFilter(
    filter: unknown,
    index: number
  ): ValidatedAssistFilter {
    //
    // Require the complete filter structure before inspecting individual
    // properties.
    //
    if (
      typeof filter !== "object" ||
      filter === null ||
      !("field" in filter) ||
      !("operator" in filter) ||
      !("value" in filter)
    ) {
      throw new Error(
        `AI filter ${index} has an invalid structure.`
      );
    }

    //
    // Narrow the external object only enough to validate its individual
    // properties. These values are still untrusted at this point.
    //
    const candidate = filter as {
      field: unknown;
      operator: unknown;
      value: unknown;
    };

    //
    // Never accept a database column name directly from the LLM.
    //
    // Only application-defined logical fields in VALID_FIELDS are allowed.
    // The later database layer will map these logical names to SQL owned by
    // the server.
    //
    if (
      typeof candidate.field !== "string" ||
      !VALID_FIELDS.has(candidate.field as AssistFilterField)
    ) {
      throw new Error(
        `AI filter ${index} contains unsupported field '${String(
          candidate.field
        )}'.`
      );
    }

    //
    // Operators are also application-owned values.
    //
    // The provider cannot inject arbitrary operators or SQL fragments such
    // as LIKE, OR, UNION, subqueries, or other executable expressions.
    //
    if (
      typeof candidate.operator !== "string" ||
      !VALID_OPERATORS.has(
        candidate.operator as AssistFilterOperator
      )
    ) {
      throw new Error(
        `AI filter ${index} contains unsupported operator '${String(
          candidate.operator
        )}'.`
      );
    }

    //
    // At this point field and operator have passed their allowlists and can
    // safely be narrowed to the corresponding application types.
    //
    const field = candidate.field as AssistFilterField;
    const operator =
      candidate.operator as AssistFilterOperator;

    //
    // Field-specific validation handles both the value and which operators
    // make semantic sense for that field.
    //
    return {
      field,
      operator,
      value: this.validateFilterValue(
        field,
        operator,
        candidate.value,
        index
      )
    };
  }

  /**
   * Validates the value and operator combination for a supported field.
   *
   * String enum fields permit equality comparisons only. Numeric fields may
   * use the comparison operators defined by AssistFilterOperator.
   */
  private validateFilterValue(
    field: AssistFilterField,
    operator: AssistFilterOperator,
    value: unknown,
    index: number
  ): string | number {
    switch (field) {
      case "status": {
        //
        // Ordering comparisons do not have meaningful acquisition-workflow
        // semantics, so status supports equality only.
        //
        if (operator !== "eq") {
          throw new Error(
            `AI filter ${index} may only use 'eq' with status.`
          );
        }

        //
        // The value must match one of the actual workflow states.
        //
        if (
          typeof value !== "string" ||
          !VALID_STATUSES.has(value)
        ) {
          throw new Error(
            `AI filter ${index} contains unsupported status '${String(
              value
            )}'.`
          );
        }

        return value;
      }

      case "priority": {
        //
        // Priority is treated as a categorical value rather than allowing
        // the LLM to invent an ordering between priority labels.
        //
        if (operator !== "eq") {
          throw new Error(
            `AI filter ${index} may only use 'eq' with priority.`
          );
        }

        //
        // Only priorities supported by the acquisition domain are accepted.
        //
        if (
          typeof value !== "string" ||
          !VALID_PRIORITIES.has(value)
        ) {
          throw new Error(
            `AI filter ${index} contains unsupported priority '${String(
              value
            )}'.`
          );
        }

        return value;
      }

      case "fiscalYear": {
        //
        // Fiscal year must be an integer in the application's supported
        // range. This prevents malformed or implausible model values from
        // reaching the query layer.
        //
        if (
          typeof value !== "number" ||
          !Number.isInteger(value) ||
          value < 2000 ||
          value > 2200
        ) {
          throw new Error(
            `AI filter ${index} contains an invalid fiscal year.`
          );
        }

        return value;
      }

      case "budgetCeiling": {
        //
        // Budget values must be finite, non-negative numbers. The eventual
        // SQL layer will bind this value as a query parameter rather than
        // interpolating it into SQL text.
        //
        if (
          typeof value !== "number" ||
          !Number.isFinite(value) ||
          value < 0
        ) {
          throw new Error(
            `AI filter ${index} contains an invalid budget ceiling.`
          );
        }

        return value;
      }
    }
  }
}