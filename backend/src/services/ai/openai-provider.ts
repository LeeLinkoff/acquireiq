/**
 * OpenAI implementation of AcquireIQ's AI query-provider abstraction.
 *
 * This file is the only part of the AI-assisted search feature that needs
 * to know how OpenAI's API works.
 *
 * Relationship to the other AI files:
 *
 *   prompt.ts
 *     Contains the version-controlled instructions sent to the model.
 *
 *   types.ts
 *     Defines the structured provider output expected by AcquireIQ.
 *
 *   provider.ts
 *     Defines the provider-neutral AiQueryProvider interface implemented
 *     by this class.
 *
 *   service.ts
 *     Calls this provider, treats everything returned here as untrusted,
 *     and performs deterministic application validation before any filter
 *     can influence a database query.
 *
 * Overall flow:
 *
 *   service.ts
 *       |
 *       v
 *   OpenAiQueryProvider
 *       |
 *       v
 *   OpenAI Responses API
 *       |
 *       v
 *   structured JSON
 *       |
 *       v
 *   AiStructuredQuery
 *       |
 *       v
 *   service.ts validation
 *
 * SECURITY:
 *
 * Structured Outputs reduce the chance of malformed model responses, but
 * they are NOT AcquireIQ's security boundary. The provider's result remains
 * untrusted until service.ts independently validates its fields, operators,
 * values, and confidence.
 *
 * This provider never receives a database connection, never constructs SQL,
 * and never executes acquisition queries.
 */


import OpenAI from "openai";

/*
 * This project uses TypeScript with NodeNext/ESM. Local imports intentionally use .js extensions even though the source files are .ts.
 * TypeScript resolves them to the corresponding .ts source during development and preserves the .js paths for the compiled files that Node executes from dist/.
*/
import type { AiQueryProvider } from "./provider.js";
import { ACQUISITION_QUERY_SYSTEM_PROMPT } from "./prompt.js";
import type { AiStructuredQuery } from "./types.js";


/**
 * JSON Schema supplied to OpenAI's Structured Outputs feature.
 *
 * Notice that field and operator are intentionally represented as strings
 * here rather than using application allow-lists as the only protection.
 *
 * The model-facing schema helps control output shape, while service.ts remains
 * responsible for deciding whether a particular field/operator/value is
 * actually allowed by AcquireIQ.
 *
 * This preserves the important distinction between:
 *   structurally valid model output
 * and:
 *   trusted application data
 */
const ACQUISITION_QUERY_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    filters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: {
            type: "string"
          },
          operator: {
            type: "string"
          },

          /*
           * A filter value can currently be textual or numeric.
           *
           * service.ts performs the field-specific validation. For example,
           * status requires an allowed string while fiscalYear requires an
           * integer in the application's accepted range.
           */
          value: {
            anyOf: [
              { type: "string" },
              { type: "number" }
            ]
          }
        },
        required: [
          "field",
          "operator",
          "value"
        ],
        additionalProperties: false
      }
    },

    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1
    }
  },
  required: [
    "filters",
    "confidence"
  ],
  additionalProperties: false
} as const;


/**
 * OpenAI-backed implementation of AiQueryProvider.
 *
 * The class translates AcquireIQ's provider-neutral interpretQuery() call
 * into an OpenAI Responses API request.
 */
export class OpenAiQueryProvider implements AiQueryProvider
{
  private readonly client: OpenAI | null;
  private readonly model: string;

  /**
   * Creates an OpenAI provider.
   *
   * OPENAI_API_KEY is intentionally read from the environment rather than
   * being stored in source code.
   *
   * OPENAI_MODEL may optionally override the default model without requiring
   * an application-code change.
   */
  constructor() 
  {
    const apiKey = process.env.OPENAI_API_KEY;

    /*
     * A missing API key must not prevent the AcquireIQ server from starting.
     *
     * Provider configuration failures are surfaced when interpretQuery() is called so AiService can convert them into the explicit fallback response.
    */
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    this.model = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";
  }

  /**
   * Interprets one natural-language acquisition search.
   *
   * The Responses API is asked for JSON conforming to our structural schema.
   * That schema constrains the response format but does NOT make the result
   * trusted application data.
   *
   * Provider/API errors deliberately propagate to AiService, where they can
   * become AcquireIQ's explicit fallback response.
  */
  async interpretQuery(
    query: string
  ): Promise<AiStructuredQuery> {
  
   /*
   * Configuration failure occurs inside the provider call rather than during
   * application startup. AiService deliberately catches provider failures and
   * returns the API's explicit fallback state.
   */
   if (!this.client) {
    throw new Error(
      "OPENAI_API_KEY environment variable is required."
    );
   }

    const response = await this.client.responses.create({
      model: this.model,
      /*
       * System-level interpretation rules live in prompt.ts rather than being
       * embedded here so prompt changes remain easy to review and version.
       */
      instructions: ACQUISITION_QUERY_SYSTEM_PROMPT,
      /*
       * The provider receives only the user's natural-language search.
       *
       * It receives no database connection, SQL statement, table metadata,
       * or mechanism capable of executing a database operation.
       */
      input: query,
      /*
       * Structured Outputs asks OpenAI to produce JSON matching this schema.
       *
       * strict=true controls the model-facing output structure. AcquireIQ's
       * deterministic validator still establishes the actual trust boundary.
       */
      text: {
        format: {
          type: "json_schema",
          name: "acquisition_query",
          strict: true,
          schema: ACQUISITION_QUERY_RESPONSE_SCHEMA
        }
      }
    });

    /*
     * output_text is the SDK convenience property containing the textual
     * output produced by the response.
     *
     * An empty response is considered a provider failure. We do not invent
     * an empty filter result here because that would hide the distinction
     * between an intentional model interpretation and a provider failure.
     */
    const outputText = response.output_text;

    if (!outputText) {
      throw new Error(
        "OpenAI returned an empty structured response."
      );
    }

    /*
     * JSON.parse() returns an untrusted runtime value.
     *
     * The cast below tells TypeScript what this provider promises its caller;
     * it does NOT validate the data at runtime. AiService performs that
     * deterministic validation before database access.
     */
    return JSON.parse(outputText) as AiStructuredQuery;
  }
}