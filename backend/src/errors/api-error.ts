/**
 * Represents an expected application error that can safely cross the
 * service-to-HTTP boundary with a specific HTTP status code.
 *
 * This keeps services independent of Express while allowing the centralized
 * API error handler to distinguish expected failures from unexpected errors.
 */
export class ApiError extends Error
{
  constructor(public readonly statusCode: number, message: string) 
  {
    super(message);
    this.name = "ApiError";
  }
}