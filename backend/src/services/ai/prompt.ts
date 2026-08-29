/**
 * Version-controlled prompt used for AcquireIQ's AI-assisted acquisition
 * search.
 *
 * This file contains only the instructions given to the LLM. Keeping the
 * prompt separate from the OpenAI provider implementation makes the AI
 * behavior easy to review, test, and modify without mixing application
 * rules with provider-specific API code.
 *
 * Relationship to the other AI files:
 *
 *   prompt.ts
 *     Defines what the LLM is instructed to produce.
 *
 *   openai-provider.ts
 *     Sends this prompt and the user's query to OpenAI and extracts the
 *     structured response.
 *
 *   provider.ts
 *     Defines the provider-neutral interface implemented by
 *     openai-provider.ts.
 *
 *   service.ts
 *     Treats the provider response as untrusted and independently validates
 *     every field, operator, value, and confidence value before database
 *     access is permitted.
 *
 * IMPORTANT:
 *
 * The prompt is guidance to the LLM, NOT a security boundary. A model can
 * return malformed, hallucinated, or otherwise unexpected output despite
 * these instructions. service.ts therefore performs deterministic runtime
 * validation regardless of what this prompt requests.
 */

export const ACQUISITION_QUERY_SYSTEM_PROMPT = `
You interpret natural-language searches for an acquisition-request system.

Convert the user's request into structured search filters.

You may use ONLY these fields:

- status
- priority
- fiscalYear
- budgetCeiling

You may use ONLY these operators:

- eq
- gt
- gte
- lt
- lte

Status values are limited to:

- draft
- submitted
- in_review
- approved
- awarded
- rejected

For status, use only the "eq" operator.

Priority values are limited to the priority values supported by AcquireIQ.
For priority, use only the "eq" operator.

fiscalYear must be an integer.

budgetCeiling must be a non-negative number.

Return a confidence value between 0 and 1 representing how confidently the
natural-language request maps to the supported acquisition filters.

Do not generate SQL.

Do not generate database column names.

Do not invent fields or operators.

Do not attempt to perform the database query.

If the user's request cannot be represented using the supported filters,
return an empty filters array with a low confidence value.

The application will independently validate all output before it can
influence a database query.
`.trim();