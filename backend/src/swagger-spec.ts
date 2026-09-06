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
    description: "Backend API for acquisition request management, workflow processing, dashboard reporting, and AI-assisted acquisition search."
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
    },
	{
      name: "AI Assistance",
      description:
      "Natural-language acquisition search using validated AI-produced filters"
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
        description: "Returns acquisition requests with optional status and priority filtering.",
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
		description: "Returns one acquisition request together with its derived current approval stage, ordered individual approval records, associated contract when present, and protest context. Approval-stage progression is independent of acquisition request status.",
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
				  $ref: "#/components/schemas/AcquisitionRequestDetail"
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
	  }
	},
    "/requests/{id}/status": {
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
			  description: "Requested transition violates the request status state machine.",
			  content: {
				"application/json": {
				  schema: {
					$ref: "#/components/schemas/ErrorResponse"
				  },
				  example: {
					ok: false,
					error: "Invalid status transition from draft to approved."
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
    "/requests/{requestId}/approvals/{approvalId}/decision": {
      patch: {
        tags: ["Acquisition Requests"],
        summary: "Record an approval decision",
        description: "Records an approved or rejected decision for one individual approval. Approval-stage progression and acquisition request status are derived or managed separately.",
        parameters: [
          {
            name: "requestId",
            in: "path",
            required: true,
            description: "Acquisition request ID",
            schema: {
              type: "integer",
              minimum: 1
            }
          },
          {
            name: "approvalId",
            in: "path",
            required: true,
            description: "Approval ID",
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
                $ref: "#/components/schemas/UpdateAcquisitionApproval"
              },
              example: {
                decision: "approved",
                notes: "Review completed."
              }
            }
          }
        },
        responses: {
		  "200": {
			  description: "Approval decision recorded",
			  content: {
				"application/json": {
				  schema: {
					type: "object",
					properties: {
					  approval: {
						$ref: "#/components/schemas/AcquisitionApproval"
					  }
					},
					required: ["approval"]
				  }
				}
			  }
		  },		
          "400": {
            description: "Invalid request ID, approval ID, decision, or notes",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            description: "Acquisition request or approval not found",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "422": {
            description: "Approval decision has already been recorded",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            description: "Unexpected server or database error",
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
    },
	"/assist/query": {
      post: {
        tags: ["AI Assistance"],
        summary: "Search acquisition requests using natural language",
        description: "Interprets a natural-language acquisition query using the configured AI provider. AI-produced structured filters are treated as untrusted input and deterministically validated before database access. Only validated filters are mapped to server-owned parameterized SQL. Malformed, invalid, or low-confidence AI output produces an explicit fallback response rather than an unrestricted database query.",

        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AssistQueryRequest"
              },
              example: {
                query: "show me high priority acquisition requests"
              }
            }
          }
        },

        responses: {
          "200": {
            description: "AI-assisted acquisition search result or explicit fallback response",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AssistQueryResponse"
                }
              }
            }
          },

          "400": {
            description: "Query is missing, empty, not a string, or JSON is malformed",
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ErrorResponse"
                }
              }
            }
          },

          "500": {
            description: "Unexpected server or database error",
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