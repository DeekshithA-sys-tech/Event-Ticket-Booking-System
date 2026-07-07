/**
 * @file swagger.js
 * @description Swagger / OpenAPI 3.0 configuration.
 *
 * WHY SWAGGER?
 * ------------
 * Swagger serves as the living contract between frontend and backend.
 * Every API endpoint is documented here, which means:
 *  - Frontend developers know exactly what to send and what to expect.
 *  - QA can test APIs without writing code.
 *  - When you add AI integration later, the AI agent knows your API surface.
 *
 * HOW IT WORKS:
 * -------------
 * swagger-jsdoc reads JSDoc @swagger comments from route files and
 * combines them with this base definition to produce a complete OpenAPI spec.
 * swagger-ui-express then serves that spec as an interactive UI.
 *
 * The UI is available at: GET /api-docs
 */

import swaggerJSDoc from 'swagger-jsdoc';
import { env } from './env.js';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Event Ticket Booking System — API',
      version: '1.0.0',
      description: `
## Event Ticket Booking System REST API

A production-ready ticketing platform API built with Node.js, Express, and MongoDB.

### Authentication
This API uses **JWT Bearer Token** authentication.
- Obtain an access token via \`POST /api/v1/auth/login\`
- Include it in the \`Authorization\` header: \`Bearer <token>\`
- Access tokens expire in **15 minutes**
- Use \`POST /api/v1/auth/refresh-token\` to get a new access token

### Role-Based Access
| Role | Capabilities |
|------|-------------|
| **customer** | Browse events, book tickets, manage profile |
| **organizer** | Create & manage events, view bookings |
| **admin** | Full platform access |

### Standard Response Format
All responses follow a consistent structure:
\`\`\`json
{
  "success": true,
  "message": "Operation successful",
  "data": {}
}
\`\`\`
      `,
      contact: {
        name: 'API Support',
        email: 'support@eventbooking.com',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}/api/v1`,
        description: 'Development Server',
      },
      {
        url: 'https://your-production-api.onrender.com/api/v1',
        description: 'Production Server',
      },
    ],
    // ── Reusable Components ───────────────────────────────────────────────────
    components: {
      // Security scheme definition
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
      },
      // Reusable response schemas
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            message: { type: 'string', example: 'Operation successful' },
            data: { type: 'object' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Something went wrong' },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string', example: 'email' },
                  message: { type: 'string', example: 'Invalid email address' },
                },
              },
            },
          },
        },
        PaginationMeta: {
          type: 'object',
          properties: {
            total: { type: 'integer', example: 100 },
            totalPages: { type: 'integer', example: 10 },
            currentPage: { type: 'integer', example: 1 },
            pageSize: { type: 'integer', example: 10 },
          },
        },
      },
      // Reusable parameter definitions
      parameters: {
        PageParam: {
          name: 'page',
          in: 'query',
          description: 'Page number',
          schema: { type: 'integer', default: 1, minimum: 1 },
        },
        LimitParam: {
          name: 'limit',
          in: 'query',
          description: 'Items per page (max 50)',
          schema: { type: 'integer', default: 10, minimum: 1, maximum: 50 },
        },
        SortParam: {
          name: 'sort',
          in: 'query',
          description: 'Sort field, prefix with - for descending (e.g. -date)',
          schema: { type: 'string', example: '-date' },
        },
        SearchParam: {
          name: 'search',
          in: 'query',
          description: 'Keyword search',
          schema: { type: 'string' },
        },
      },
    },
    // Default security applied to all routes (can be overridden per endpoint)
    security: [{ BearerAuth: [] }],
  },
  // Glob patterns telling swagger-jsdoc where to find @swagger JSDoc comments
  apis: ['./src/routes/*.js', './src/controllers/*.js'],
};

export const swaggerSpec = swaggerJSDoc(options);
