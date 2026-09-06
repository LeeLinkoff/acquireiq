/**
 * AI-assisted acquisition-search HTTP routes.
 *
 * This file defines the HTTP endpoints associated with AcquireIQ's
 * natural-language acquisition search capability.
 *
 * Relationship to the surrounding files:
 *
 *   server.ts
 *     Creates and configures the Express application, registers global
 *     middleware, mounts this router, installs centralized error handling,
 *     and starts the HTTP server.
 *
 *   assist-router.ts
 *     Defines the HTTP boundary for AI-assisted search. It validates
 *     client-supplied HTTP input, delegates processing to the AI service,
 *     and translates the service result into an HTTP response.
 *
 *   services/ai/service.ts
 *     Orchestrates the AI-assisted search pipeline. It asks the configured
 *     AI provider to interpret natural language, deterministically validates
 *     the provider output, and allows only validated filters to reach the
 *     acquisition query layer.
 *
 *   services/ai/provider.ts
 *     Defines the provider-neutral interface used by the AI service.
 *
 *   services/ai/openai-provider.ts
 *     Implements the provider interface using OpenAI.
 *
 * Routing relationship:
 *
 *   server.ts
 *       app.use(assistRouter)
 *                |
 *                v
 *       assist-router.ts
 *           router.post("/assist/query")
 *
 * This route intentionally contains no LLM-specific logic, filter-to-SQL
 * mapping, or database access. Those responsibilities remain behind the
 * service boundary.
 */


import {Router,type NextFunction,type Request,type Response} from "express";

/*
 * This project uses TypeScript with NodeNext/ESM. Local imports intentionally use .js extensions even though the source files are .ts.
 * TypeScript resolves them to the corresponding .ts source during development and preserves the .js paths for the compiled files that Node executes from dist/.
*/
import { ApiError } from "../errors/api-error.js";
import { AiService } from "../services/ai/service.js";
import { OpenAiQueryProvider } from "../services/ai/openai-provider.js";


const router = Router();

/*
 * Create one provider and service instance for this router.
 *
 * The HTTP layer depends on AiService rather than communicating with OpenAI
 * directly, preserving the provider abstraction.
 */
const aiProvider = new OpenAiQueryProvider();
const aiService = new AiService(aiProvider);


// POST /assist/query
//
// Accepts a natural-language acquisition search and delegates its interpretation and execution to the AI-assisted search service.
router.post(
  "/assist/query",
  async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const query = req.body?.query;

      /*
       * Validate the HTTP contract before invoking any AI provider.
       *
       * Whitespace-only input is rejected because it contains no search
       * intent for the AI service to interpret.
       */
      if (typeof query !== "string" || query.trim().length === 0)
	  {
        throw new ApiError(400,"query is required and must be a non-empty string.");
      }

	  /*
	   * Normalize the user's text before passing it into the AI orchestration layer. AiService owns interpretation, deterministic validation, fallback handling, and the trusted handoff to the acquisition query layer.
	  */
	  const result = await aiService.query(query.trim());

	  res.status(200).json(result);
    } catch (error) {
      // Forward both expected API errors and unexpected runtime failures to
      // the centralized error middleware in server.ts.
      next(error);
    }
  }
);


export default router;