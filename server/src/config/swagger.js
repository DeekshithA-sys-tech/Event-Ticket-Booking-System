/**
 * @file swagger.js
 * @description Swagger / OpenAPI 3.0 configuration with complete component schemas.
 */

import swaggerJSDoc from 'swagger-jsdoc';
import { env } from './env.js';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Event Ticket Booking System — OpenAPI Specification',
      version: '1.0.0',
      description: `
## Event Ticket Booking System REST API

A production-ready ticketing platform API built with Node.js, Express, MongoDB, Redis, and BullMQ.

### Authentication
This API uses **JWT Bearer Token** authentication.
- Obtain an access token via \`POST /api/v1/auth/login\`
- Include it in the \`Authorization\` header: \`Bearer <token>\`
- Access tokens expire in **15 minutes**
- Use \`POST /api/v1/auth/refresh-token\` to get a new access token via httpOnly cookie

### Role-Based Access Control (RBAC)
| Role | Capabilities |
|------|-------------|
| **customer** | Browse events, lock seats, book tickets, manage profile, leave reviews |
| **organizer** | Create & manage own events, view event booking analytics & revenue |
| **admin** | Full platform management, user suspensions, force cancellation, audit logs |

### Security & Rate Limits
- **X-API-Version**: Enforced header (\`v1\`)
- **Global Limiter**: 100 requests / 15 mins
- **Auth Limiter**: 10 attempts / 15 mins
- **Seat Lock Limiter**: 20 locks / 15 mins
      `,
      contact: {
        name: 'API Engineering Team',
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
        url: 'https://api.eventbooking.com/api/v1',
        description: 'Production Server',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
      },
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
        User: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '66a1b2c3d4e5f6a7b8c9d0e1' },
            name: { type: 'string', example: 'Jane Doe' },
            email: { type: 'string', example: 'jane@example.com' },
            role: { type: 'string', enum: ['customer', 'organizer', 'admin'], example: 'customer' },
            phone: { type: 'string', example: '+919876543210' },
            avatar: { type: 'string', example: 'https://res.cloudinary.com/demo/image/upload/v1234/avatar.jpg' },
            isActive: { type: 'boolean', example: true },
            isEmailVerified: { type: 'boolean', example: true },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Category: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '66a1b2c3d4e5f6a7b8c9d0e2' },
            name: { type: 'string', example: 'Music Concerts' },
            slug: { type: 'string', example: 'music-concerts' },
            description: { type: 'string', example: 'Live music performances and festivals' },
            icon: { type: 'string', example: '🎵' },
            isActive: { type: 'boolean', example: true },
          },
        },
        Event: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '66a1b2c3d4e5f6a7b8c9d0e3' },
            title: { type: 'string', example: 'Grand Symphony Night 2026' },
            description: { type: 'string', example: 'An evening of classical orchestral music' },
            category: { $ref: '#/components/schemas/Category' },
            organizer: { $ref: '#/components/schemas/User' },
            venue: { type: 'string', example: 'Royal Concert Hall' },
            city: { type: 'string', example: 'Mumbai' },
            date: { type: 'string', format: 'date-time', example: '2026-12-15T19:00:00.000Z' },
            time: { type: 'string', example: '19:00' },
            ticketPrice: { type: 'number', example: 1500 },
            totalSeats: { type: 'integer', example: 500 },
            availableSeats: { type: 'integer', example: 450 },
            status: { type: 'string', enum: ['draft', 'published', 'cancelled', 'completed'], example: 'published' },
            banner: { type: 'string', example: 'https://res.cloudinary.com/demo/image/upload/v1234/banner.jpg' },
            averageRating: { type: 'number', example: 4.8 },
            totalReviews: { type: 'integer', example: 42 },
          },
        },
        Seat: {
          type: 'object',
          properties: {
            seatId: { type: 'string', example: 'A-15' },
            row: { type: 'string', example: 'A' },
            seatNumber: { type: 'integer', example: 15 },
            price: { type: 'number', example: 1500 },
            status: { type: 'string', enum: ['available', 'locked', 'booked'], example: 'available' },
          },
        },
        Booking: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '66a1b2c3d4e5f6a7b8c9d0e4' },
            bookingId: { type: 'string', example: 'TKT-20261215-X7K2M' },
            user: { $ref: '#/components/schemas/User' },
            event: { $ref: '#/components/schemas/Event' },
            seats: {
              type: 'array',
              items: { $ref: '#/components/schemas/Seat' },
            },
            totalAmount: { type: 'number', example: 3000 },
            status: { type: 'string', enum: ['confirmed', 'cancelled'], example: 'confirmed' },
            qrCode: { type: 'string', example: 'data:image/png;base64,iVBORw0KGgo...' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Review: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '66a1b2c3d4e5f6a7b8c9d0e5' },
            user: { $ref: '#/components/schemas/User' },
            event: { type: 'string', example: '66a1b2c3d4e5f6a7b8c9d0e3' },
            rating: { type: 'integer', minimum: 1, maximum: 5, example: 5 },
            comment: { type: 'string', example: 'Unforgettable musical experience!' },
            isFlagged: { type: 'boolean', example: false },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        AuditLog: {
          type: 'object',
          properties: {
            _id: { type: 'string', example: '66a1b2c3d4e5f6a7b8c9d0e6' },
            admin: { $ref: '#/components/schemas/User' },
            adminEmail: { type: 'string', example: 'admin@eventbooking.com' },
            action: { type: 'string', example: 'event.status_change' },
            targetModel: { type: 'string', enum: ['User', 'Event', 'Booking', 'Review'], example: 'Event' },
            targetId: { type: 'string', example: '66a1b2c3d4e5f6a7b8c9d0e3' },
            targetSummary: { type: 'string', example: 'Event: Grand Symphony Night 2026' },
            changes: { type: 'object' },
            reason: { type: 'string', example: 'Force cancelled due to venue maintenance' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
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
          description: 'Keyword search across name, title, venue, etc.',
          schema: { type: 'string' },
        },
      },
    },
    security: [{ BearerAuth: [] }],
  },
  apis: ['./src/routes/*.js', './src/controllers/*.js'],
};

export const swaggerSpec = swaggerJSDoc(options);
