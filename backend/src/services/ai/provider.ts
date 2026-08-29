/**
 * Abstraction over an LLM provider used for natural-language acquisition
 * search.
 *
 * This interface defines the contract that any AI provider implementation
 * must satisfy. The AI service depends only on this abstraction and does
 * not need to know which LLM provider is being used.
 *
 * Provider-specific implementations, such as OpenAI, implement this
 * interface and are responsible for translating a natural-language query
 * into the structured AiStructuredQuery representation expected by the
 * application.
 *
 * Keeping the provider behind this interface allows the application to:
 *
 * - Replace the underlying LLM provider without changing service logic.
 * - Use mock or deterministic providers during automated testing.
 * - Keep provider-specific API configuration and SDK usage isolated.
 * - Keep validation, database access, and query execution outside the
 *   provider implementation.
 *
 * Provider output is always considered untrusted. Implementations do not
 * receive database connections, construct executable SQL, or execute
 * database operations. Structured output is validated by the application
 * before it can influence a database query.
 *
 * Typical dependency flow:
 *
 *   AI service
 *       |
 *       v
 *   AiQueryProvider
 *       ^
 *       |
 *   OpenAI provider
 *
 * Additional providers can implement the same interface without changing
 * the orchestration performed by the AI service.
 */


import type { AiStructuredQuery } from "./types.js";

 
export interface AiQueryProvider {
  interpretQuery(query: string): Promise<AiStructuredQuery>;
}
