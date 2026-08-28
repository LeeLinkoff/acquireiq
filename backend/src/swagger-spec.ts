// swagger-spec.ts
//
// OpenAPI 3.0 specification for the AcquireIQ backend.
//
// TypeScript API models tagged with @openapi are generated into
// schemas.generated.ts. HTTP-specific metadata remains here because routes,
// parameters, status codes, and descriptions are concerns of the API layer.
//
//
// OpenAPI relationship:
//
// The data schemas used here are generated automatically from TypeScript
// interfaces and types by generate-openapi-schemas.ts.
//
// This file does NOT manually define those data models. It defines the HTTP
// endpoint information, such as routes, HTTP methods, query parameters, and
// response codes, and references the generated schemas where needed.
//
// Swagger UI displays the combined result.


// NodeNext/ESM uses the compiled .js path even though the source module is .ts.
import { generatedSchemas } from "./schemas.generated.js";

const swaggerSpec = {
  openapi: "3.0.3",

  info: {
    title: "AcquireIQ API",
    version: "1.0.0",
    description:
      "Backend API for acquisition request management, workflow processing, " +
      "dashboard reporting, and AI-assisted acquisition search."
  },

  servers: [
    {
      url: "/",
      description: "AcquireIQ backend"
    }
  ],

  tags: [
    {
      name: "Diagnostics",
      description: "Backend health and status endpoints"
    },
    {
      name: "Acquisition Requests",
      description: "Acquisition request retrieval and filtering"
    },
	{
    name: "Dashboard",
    description: "Acquisition pipeline summary and reporting"
    }
  ],

  components: {
    schemas: {
      ...generatedSchemas,

      ErrorResponse: {
        type: "object",
        properties: {
          ok: {
            type: "boolean",
            example: false
          },
          error: {
            type: "string"
          }
        },
        required: ["ok", "error"]
      }
    }
  },

  paths: {
    "/api/health": {
      get: {
        tags: ["Diagnostics"],
        summary: "Health check",
        description:
          "Confirms that the AcquireIQ backend process is reachable and responding.",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ok: {
                      type: "boolean",
                      example: true
                    },
                    service: {
                      type: "string",
                      example: "acquireiq-backend"
                    },
                    timestamp: {
                      type: "string",
                      format: "date-time"
                    }
                  },
                  required: ["ok", "service", "timestamp"]
                }
              }
            }
          }
        }
      }
    },
    "/requests": {
      get: {
        tags: ["Acquisition Requests"],
        summary: "List acquisition requests",
        description:
          "Returns acquisition requests with optional status, priority, and fiscal-year filtering.",

        parameters: [
          {
            name: "status",
            in: "query",
            required: false,
            description: "Filter by acquisition request status.",
            schema: {
              type: "string",
              enum: [
                "draft",
                "submitted",
                "in_review",
                "approved",
                "awarded",
                "rejected"
              ]
            }
          },
          {
            name: "priority",
            in: "query",
            required: false,
            description: "Filter by acquisition request priority.",
            schema: {
              type: "string",
              enum: [
                "low",
                "medium",
                "high",
                "critical"
              ]
            }
          },
          {
            name: "fiscalYear",
            in: "query",
            required: false,
            description: "Filter by four-digit fiscal year.",
            schema: {
              type: "integer",
              minimum: 2000,
              maximum: 2200,
              example: 2026
            }
          }
        ],

        responses: {
          "200": {
            description: "Acquisition request collection",
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/AcquisitionRequest"
                  }
                }
              }
            }
          },

          "400": {
            description: "Invalid filter value",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },

          "500": {
            description: "Unexpected server error",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      },
      post: {
        tags: ["Acquisition Requests"],
        summary: "Create an acquisition request",
        description:
          "Creates a new acquisition request. New requests begin in draft status.",

        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateAcquisitionRequest"
              }
            }
          }
        },

        responses: {
          "201": {
            description: "Acquisition request created",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AcquisitionRequest"
                }
              }
            }
          },

          "400": {
            description: "Invalid acquisition request",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },

          "500": {
            description: "Unexpected server error",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/requests/{id}": {
		get: {
		tags: ["Acquisition Requests"],
		summary: "Get an acquisition request by ID",
		description: "Returns one acquisition request identified by its numeric ID.",
		parameters: [
		  {
			name: "id",
			in: "path",
			required: true,
			description: "Acquisition request ID",
			schema: {
			  type: "integer",
			  minimum: 1
			}
		  }
		],
		responses: {
		  "200": {
			description: "Acquisition request",
			content: {
			  "application/json": {
				schema: {
				  $ref: "#/components/schemas/AcquisitionRequest"
				}
			  }
			}
		  },
		  "400": {
			description: "Invalid request ID",
			content: {
			  "application/json": {
				schema: {
				  $ref: "#/components/schemas/ErrorResponse"
				}
			  }
			}
		  },
		  "404": {
			description: "Acquisition request not found",
			content: {
			  "application/json": {
				schema: {
				  $ref: "#/components/schemas/ErrorResponse"
				}
			  }
			}
		  },
		  "500": {
			description: "Unexpected server error",
			content: {
			  "application/json": {
				schema: {
				  $ref: "#/components/schemas/ErrorResponse"
				}
			  }
			}
		  }
		}
	  },

      patch: {
        tags: ["Acquisition Requests"],
        summary: "Advance acquisition request status",
        description:
          "Requests a fixed workflow transition. The server validates the current state and applies the update transactionally with a PostgreSQL row lock.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Acquisition request ID",
            schema: {
              type: "integer",
              minimum: 1
            }
          }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/UpdateAcquisitionRequestStatus"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Status transition applied",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AcquisitionRequest"
                }
              }
            }
          },
          "400": {
            description: "Invalid request ID or status value",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Acquisition request not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "422": {
            description:
              "Requested transition violates the workflow state machine or approval requirements",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            description: "Unexpected server error",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
	"/dashboard": {
      get: {
        tags: ["Dashboard"],
        summary: "Get acquisition pipeline dashboard",
        description:
          "Returns database-aggregated request counts by status, total pipeline value, and the number of requests with open protests.",
        responses: {
          "200": {
            description: "Acquisition pipeline dashboard",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/DashboardSummary"
                }
              }
            }
          },
          "500": {
            description: "Unexpected server error",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    }
  }
};

export default swaggerSpec;