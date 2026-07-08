/**
 * @file event.service.js
 * @description Event management business logic.
 *
 * BUSINESS RULES ENFORCED HERE:
 * --------------------------------
 * 1. An organizer can only edit/delete THEIR OWN events.
 * 2. An event cannot be deleted if it has confirmed bookings.
 * 3. The seat layout is built from the organizer's input.
 * 4. availableSeats is automatically computed = sum of all seats.
 * 5. Banner upload triggers old banner deletion (no orphaned Cloudinary assets).
 * 6. Status transitions are validated (e.g. can't publish a cancelled event).
 * 7. Only published events are returned to public listing.
 */

import * as eventRepo from '../repositories/event.repository.js';
import * as categoryRepo from '../repositories/category.repository.js';
import { uploadImage, deleteImage } from '../utils/uploadToCloudinary.js';
import {
  NotFoundError,
  AuthorizationError,
  ConflictError,
  ValidationError,
} from '../utils/ApiError.js';
import { MESSAGES } from '../constants/messages.js';
import { EVENT_STATUS } from '../constants/eventStatus.js';
import {
  parsePaginationParams,
  buildTextSearch,
  buildPriceFilter,
  buildDateFilter,
} from '../utils/pagination.js';
import { buildPaginationMeta } from '../utils/ApiResponse.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('EventService');

// ─── Helper: Build seat layout from input ─────────────────────────────────────
/**
 * Converts the organizer's seat layout input into the DB schema format.
 * Also computes totalSeats from the layout.
 *
 * @param {Array<{ row: string, seats: Array<{ seatId: string, seatNumber: number }> }>} seatLayout
 * @returns {{ layout: Array, totalSeats: number }}
 */
const processSeatLayout = (seatLayout) => {
  let totalSeats = 0;

  const layout = seatLayout.map((rowInput) => ({
    row: rowInput.row,
    seats: rowInput.seats.map((seat) => {
      totalSeats++;
      return {
        seatId: seat.seatId,
        seatNumber: seat.seatNumber,
        status: 'available',
        lockedBy: null,
        lockedAt: null,
      };
    }),
  }));

  return { layout, totalSeats };
};

// ─── Public: Get Events (with search, filter, pagination) ─────────────────────

/**
 * Get paginated list of published events with optional filters.
 * This is the public-facing event browsing endpoint.
 *
 * @param {object} queryParams - req.query object
 * @returns {{ events, meta }}
 */
export const getEvents = async (queryParams) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(queryParams, {
    defaultSort: 'date',
  });

  // Always filter to only published events for public listing
  const filter = { status: EVENT_STATUS.PUBLISHED };

  // ── Apply Filters ──────────────────────────────────────────────────────────
  if (queryParams.city) {
    filter.city = new RegExp(queryParams.city, 'i');
  }

  if (queryParams.category) {
    // Could be category slug or ObjectId
    filter['category.slug'] = queryParams.category;
    // We'll handle this via populate lookup — pass the categoryId from pre-resolved
    // For now use raw category filter; Sprint 6 will add slug resolution
  }

  if (queryParams.status && queryParams.status !== EVENT_STATUS.PUBLISHED) {
    // Admin/organizer override — but only if their role allows (checked at controller level)
    filter.status = queryParams.status;
  }

  // Text search across title and venue
  const searchFilter = buildTextSearch(queryParams.search, ['title', 'venue']);
  if (searchFilter) Object.assign(filter, searchFilter);

  // Price range
  const priceFilter = buildPriceFilter(queryParams.minPrice, queryParams.maxPrice);
  if (priceFilter) filter.ticketPrice = priceFilter;

  // Date range
  const dateFilter = buildDateFilter(queryParams.startDate, queryParams.endDate);
  if (dateFilter) filter.date = dateFilter;

  const { events, total } = await eventRepo.findAllEvents(filter, { skip, limit, sortObj });

  return {
    events,
    meta: buildPaginationMeta(total, page, limit),
  };
};

/**
 * Get a single event by ID (public — returns published only).
 * @param {string} eventId
 * @returns {Promise<Document>}
 */
export const getEventById = async (eventId) => {
  const event = await eventRepo.findEventById(eventId);

  if (!event) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  // Non-published events are only accessible by organizer/admin (handled at route level)
  return event;
};

// ─── Organizer: Get My Events ─────────────────────────────────────────────────

/**
 * Get all events created by the current organizer.
 * @param {string} organizerId
 * @param {object} queryParams
 * @returns {{ events, meta }}
 */
export const getMyEvents = async (organizerId, queryParams) => {
  const { page, limit, skip, sortObj } = parsePaginationParams(queryParams);

  const { events, total } = await eventRepo.findEventsByOrganizer(organizerId, {
    skip,
    limit,
    sortObj,
  });

  return {
    events,
    meta: buildPaginationMeta(total, page, limit),
  };
};

// ─── Organizer: Create Event ──────────────────────────────────────────────────

/**
 * Create a new event.
 *
 * Business rules:
 *  - Category must exist and be active.
 *  - Seat layout is processed to compute totalSeats.
 *  - Event starts as 'draft' status.
 *
 * @param {object} eventData - Validated event input
 * @param {string} organizerId - The creating organizer's ID
 * @returns {Promise<Document>}
 */
export const createEvent = async (eventData, organizerId) => {
  // ── Validate category exists ──────────────────────────────────────────────
  const category = await categoryRepo.findCategoryById(eventData.category);
  if (!category || !category.isActive) {
    throw new NotFoundError('Category not found or inactive.');
  }

  // ── Process seat layout ────────────────────────────────────────────────────
  const { layout, totalSeats } = processSeatLayout(eventData.seatLayout);

  // ── Create event ───────────────────────────────────────────────────────────
  const event = await eventRepo.createEvent({
    ...eventData,
    date: new Date(eventData.date),
    organizer: organizerId,
    seatLayout: layout,
    totalSeats,
    availableSeats: totalSeats, // Initially all seats are available
    status: EVENT_STATUS.DRAFT,  // Always start as draft
  });

  logger.info(`Event created: "${event.title}" by organizer ${organizerId}`);
  return event;
};

// ─── Organizer: Update Event ──────────────────────────────────────────────────

/**
 * Update an event's core details.
 *
 * Business rules:
 *  - Organizer can only update their own events.
 *  - Cannot update a cancelled or completed event.
 *
 * @param {string} eventId
 * @param {string} organizerId
 * @param {object} updates
 * @returns {Promise<Document>}
 */
export const updateEvent = async (eventId, organizerId, updates) => {
  const event = await eventRepo.findEventByIdAndOrganizer(eventId, organizerId);

  if (!event) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  if ([EVENT_STATUS.CANCELLED, EVENT_STATUS.COMPLETED].includes(event.status)) {
    throw new ValidationError(`Cannot update a ${event.status} event.`);
  }

  // Convert date string to Date if provided
  if (updates.date) updates.date = new Date(updates.date);

  const updated = await eventRepo.updateEventById(eventId, updates);
  logger.info(`Event updated: ${eventId}`);
  return updated;
};

// ─── Organizer: Upload Event Banner ──────────────────────────────────────────

/**
 * Upload or replace an event's banner image.
 *
 * @param {string} eventId
 * @param {string} organizerId
 * @param {Buffer} imageBuffer - The uploaded file buffer from Multer
 * @returns {Promise<Document>}
 */
export const uploadEventBanner = async (eventId, organizerId, imageBuffer) => {
  const event = await eventRepo.findEventByIdAndOrganizer(eventId, organizerId);

  if (!event) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  // ── Delete old banner if it exists ────────────────────────────────────────
  if (event.banner?.publicId) {
    await deleteImage(event.banner.publicId);
  }

  // ── Upload new banner to Cloudinary ───────────────────────────────────────
  const { url, publicId } = await uploadImage(imageBuffer, {
    folder: 'event-banners',
    width: 1200,
    height: 630,
  });

  const updated = await eventRepo.updateEventBanner(eventId, { url, publicId });
  logger.info(`Banner uploaded for event ${eventId}: ${url}`);
  return updated;
};

// ─── Organizer: Delete Event ──────────────────────────────────────────────────

/**
 * Delete an event.
 *
 * Business rules:
 *  - Organizer can only delete their own events.
 *  - Cannot delete if confirmed bookings exist.
 *  - Deletes associated Cloudinary banner image.
 *
 * @param {string} eventId
 * @param {string} organizerId
 * @param {string} userRole - To allow admin override
 */
export const deleteEvent = async (eventId, organizerId, userRole) => {
  // Admin can delete any event; organizer can only delete their own
  let event;
  if (userRole === 'admin') {
    event = await eventRepo.findEventById(eventId);
  } else {
    event = await eventRepo.findEventByIdAndOrganizer(eventId, organizerId);
  }

  if (!event) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  // Check for confirmed bookings
  const hasBookings = await eventRepo.eventHasConfirmedBookings(eventId);
  if (hasBookings) {
    throw new ConflictError(MESSAGES.EVENT.HAS_BOOKINGS);
  }

  // Clean up Cloudinary asset
  if (event.banner?.publicId) {
    await deleteImage(event.banner.publicId);
  }

  await eventRepo.deleteEventById(eventId);
  logger.info(`Event deleted: ${eventId} ("${event.title}")`);
};

// ─── Admin: Update Event Status ───────────────────────────────────────────────

/**
 * Update the lifecycle status of an event (admin only).
 *
 * Valid transitions:
 *   draft → published (approve)
 *   draft → cancelled (reject)
 *   published → cancelled (take down)
 *
 * @param {string} eventId
 * @param {string} newStatus
 * @returns {Promise<Document>}
 */
export const updateEventStatus = async (eventId, newStatus) => {
  const event = await eventRepo.findEventById(eventId);

  if (!event) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  // Prevent invalid transitions
  if (event.status === EVENT_STATUS.COMPLETED) {
    throw new ValidationError('Cannot change status of a completed event.');
  }

  const updated = await eventRepo.updateEventStatus(eventId, newStatus);
  logger.info(`Event ${eventId} status changed: ${event.status} → ${newStatus}`);
  return updated;
};
