/**
 * Shared type definitions for AcquireIQ's AI-assisted acquisition search.
 *
 * This file defines the data contracts that connect the different parts of
 * the AI subsystem. It contains types only; it does not call an LLM, perform
 * validation, construct SQL, or access the database.
 *
 * The types in this file represent the data as it moves through the AI
 * search pipeline:
 *
 *   User natural-language query
 *              |
 *              v
 *      AssistQueryRequest
 *              |
 *              v
 *        AI provider
 *              |
 *              v
 *      AiStructuredQuery
 *      AiProducedFilter[]
 *        (UNTRUSTED)
 *              |
 *              v
 *         service.ts
 *     deterministic validation
 *              |
 *              v
 *    ValidatedAssistQuery
 *    ValidatedAssistFilter[]
 *         (TRUSTED)
 *              |
 *              v
 *    acquisition query layer
 *              |
 *              v
 *      AssistQueryResponse
 *
 * Relationship to the other AI files:
 *
 *   types.ts
 *     Defines the shared request, provider-output, validated-filter, and
 *     response contracts used throughout the AI subsystem.
 *
 *   provider.ts
 *     Defines the provider-neutral AiQueryProvider interface using the
 *     structured-query types declared here.
 *
 *   service.ts
 *     Uses these types while orchestrating provider calls, validating
 *     untrusted provider output, and passing only trusted filters toward
 *     the database query layer.
 *
 *   openai-provider.ts
 *     Implements AiQueryProvider for OpenAI and returns the structured
 *     provider output represented by the types defined here.
 *
 * An important distinction in this file is between AI-produced types and
 * validated application types. AiStructuredQuery and AiProducedFilter
 * represent external LLM output and must never be considered trusted merely
 * because they satisfy a TypeScript interface. ValidatedAssistQuery and
 * ValidatedAssistFilter represent data that has passed deterministic
 * application validation.
 *
 * These contracts help enforce the central AcquireIQ security rule:
 * the LLM interprets user intent, while the application retains authority
 * over validation, supported filters, SQL construction, and database access.
 */


import type { AcquisitionRequest } from "../requests.js";


/**
 * Client payload for an AI-assisted acquisition pipeline query.
 *
 * @openapi
 */
export interface AssistQueryRequest {
  query: string;
}

/**
 * Acquisition-request fields that AI-assisted search is permitted to filter.
 *
 * This is intentionally a closed application-owned set. The LLM cannot
 * introduce arbitrary database column names.
 */
export type AssistFilterField =
  | "status"
  | "priority"
  | "fiscalYear"
  | "budgetCeiling";

/**
 * Comparison operations supported by AI-assisted acquisition filtering.
 *
 * These are logical operations rather than SQL operators. The application
 * maps them to server-owned SQL only after validation.
 */
export type AssistFilterOperator =
  | "eq"
  | "gt"
  | "gte"
  | "lt"
  | "lte";

/**
 * One structured filter produced by an LLM provider.
 *
 * Provider output is always untrusted. Strings are deliberately used for
 * field and operator here because runtime validation must prove that the
 * provider returned supported values.
 */
export interface AiProducedFilter {
  field: string;
  operator: string;
  value: unknown;
}

/**
 * Structured interpretation returned by an LLM provider.
 *
 * This representation remains untrusted until deterministic application
 * validation succeeds.
 */
export interface AiStructuredQuery {
  filters: AiProducedFilter[];
  confidence: number;
}

/**
 * Filter representation accepted after deterministic validation.
 *
 * The field and operator are restricted to application-owned allowlists,
 * and the value has been reduced to a supported primitive type.
 */
export interface ValidatedAssistFilter {
  field: AssistFilterField;
  operator: AssistFilterOperator;
  value: string | number;
}

/**
 * Internal trusted representation of an AI-assisted query.
 */
export interface ValidatedAssistQuery {
  filters: ValidatedAssistFilter[];
  confidence: number;
}

/**
 * Indicates whether validated AI interpretation or deterministic fallback
 * behavior produced the search response.
 */
export type AssistQueryMode = "ai" | "fallback";

/**
 * API response for AI-assisted acquisition pipeline search.
 *
 * @openapi
 */
export interface AssistQueryResponse {
  query: string;
  mode: AssistQueryMode;
  confidence: number | null;
  filters: ValidatedAssistFilter[];
  results: AcquisitionRequest[];
  message?: string;
}