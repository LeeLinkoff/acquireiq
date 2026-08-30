const API_BASE = import.meta.env.VITE_API_BASE ?? ''
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))


/*
* Lightweight health check used by the frontend to confirm that the Express
* backend is reachable before the user begins working with acquisition data.
*/
export function getHealth() {
  return request('/api/health')
}


/*
 * Shared HTTP request function used by the frontend API helpers.
 *
 * All API calls pass through this function so response parsing, error handling,
 * headers, and retry behavior remain consistent across the application.
 */
export async function request(path, options = {}, retries = 2, delayMs = 750)
{
  // API_BASE can be configured for deployment. During local development it is
  // normally empty because Vite proxies the relative API paths to the backend.
  const url = `${API_BASE}${path}`
  let lastError

  // Make the initial request plus the configured number of retry attempts.
  for (let attempt = 0; attempt <= retries; attempt += 1)
  {
    try
	{
      const response = await fetch(url, {
        ...options,
        headers: {
		  // Automatically identify request bodies as JSON while still allowing
          // the caller to supply or override headers when necessary.			
          ...(options.body ? { 'content-type': 'application/json' } : {}),
          ...options.headers,
        },
      })

      // Read the body as text first because some endpoints may legitimately
      // return an empty response or a response that is not JSON.
      const text = await response.text()
      let data = null

      if (text) {
        try {
		  // Most AcquireIQ endpoints return JSON, so parse it when possible.
          data = JSON.parse(text)
        } catch {
          // Preserve non-JSON response text rather than losing useful diagnostic
          // information when an upstream server returns an unexpected response.
          data = text
        }
      }

      if (!response.ok) {
        // Attach both the HTTP status and parsed response body so UI components
        // can show a simple message while retaining useful technical details.
        const error = new Error(`API request failed with status ${response.status}`)
        error.status = response.status
        error.details = data
        throw error
      }

      return data
    }
	catch (error)
	{
	 // Retain the most recent failure so it can be surfaced if all attempts fail.
      lastError = error
	  
      // Wait briefly before another attempt instead of immediately hammering the
      // backend when it may be temporarily unavailable.
      if (attempt < retries) await sleep(delayMs)
    }
  }

  // The caller decides how the final failure should be presented to the user.
  throw lastError
}


/*
* Retrieves the acquisition request summaries displayed in the pipeline list.
* Full approval, contract, and protest information is loaded separately only
* when the user opens an individual request.
*/
export function getRequests() {
  return request('/requests')
}

/*
 * Retrieves the complete detail for one acquisition request.
 *
 * Unlike the pipeline list response, the detail response includes the
 * approval chain, associated contract when awarded, and protest information.
 * The UI uses this endpoint only when the user chooses to view a request's
 * details, avoiding unnecessary detail requests for every pipeline card.
 */
export function getRequestById(id) {
  return request(`/requests/${id}`)
}
