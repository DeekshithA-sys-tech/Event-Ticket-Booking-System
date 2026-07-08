/**
 * @file event.controller.js
 * @description HTTP handlers for Event endpoints.
 *
 * NOTE ON req.file:
 * -----------------
 * The banner upload endpoint uses Multer middleware (uploadSingle).
 * After that middleware runs, the uploaded file is in req.file.buffer.
 * The controller extracts the buffer and passes it to the service.
 * The controller never interacts with Cloudinary directly.
 */

import * as eventService from '../services/event.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { ValidationError } from '../utils/ApiError.js';

/**
 * @swagger
 * tags:
 *   - name: Events
 *     description: Event browsing and management
 */

// ─── Public Endpoints ─────────────────────────────────────────────────────────


export const getEvents = asyncHandler(async (req, res) => {
  const { events, meta } = await eventService.getEvents(req.query);
  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.LIST_FETCHED, events, meta));
});


export const getEventById = asyncHandler(async (req, res) => {
  const event = await eventService.getEventById(req.params.eventId);
  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.FETCHED, event));
});

// ─── Organizer Endpoints ──────────────────────────────────────────────────────

/**
 * @swagger
 * /events/organizer/my-events:
 *   get:
 *     tags: [Events]
 *     summary: Get the organizer's own events
 *     responses:
 *       200:
 *         description: Events fetched successfully
 */
export const getMyEvents = asyncHandler(async (req, res) => {
  const { events, meta } = await eventService.getMyEvents(req.user._id, req.query);
  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.LIST_FETCHED, events, meta));
});

export const createEvent = asyncHandler(async (req, res) => {
  const event = await eventService.createEvent(req.body, req.user._id);
  return res
    .status(HTTP_STATUS.CREATED)
    .json(new ApiResponse(HTTP_STATUS.CREATED, MESSAGES.EVENT.CREATED, event));
});


export const updateEvent = asyncHandler(async (req, res) => {
  const event = await eventService.updateEvent(
    req.params.eventId,
    req.user._id,
    req.body
  );
  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.UPDATED, event));
});


export const uploadEventBanner = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ValidationError('Please upload an image file.');
  }

  const event = await eventService.uploadEventBanner(
    req.params.eventId,
    req.user._id,
    req.file.buffer
  );

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.BANNER_UPLOADED, event));
});


export const deleteEvent = asyncHandler(async (req, res) => {
  await eventService.deleteEvent(
    req.params.eventId,
    req.user._id,
    req.user.role
  );
  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.DELETED));
});

// ─── Admin Endpoints ──────────────────────────────────────────────────────────

/**
 * @swagger
 * /events/{eventId}/status:
 *   patch:
 *     tags: [Events]
 *     summary: Update event lifecycle status (admin only)
 *     parameters:
 *       - name: eventId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [published, cancelled, draft]
 *     responses:
 *       200:
 *         description: Event status updated
 */
export const updateEventStatus = asyncHandler(async (req, res) => {
  const event = await eventService.updateEventStatus(
    req.params.eventId,
    req.body.status
  );
  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.STATUS_UPDATED, event));
});
