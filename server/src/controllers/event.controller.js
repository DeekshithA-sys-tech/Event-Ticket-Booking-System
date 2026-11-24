/**
 * @file event.controller.js
 * @description Event Controller (Browsing, Creation, Modification, Banner Uploads, Status Moderation).
 */

import * as eventRepo from '../repositories/event.repository.js';
import * as categoryRepo from '../repositories/category.repository.js';
import { uploadImage, deleteImage } from '../utils/uploadToCloudinary.js';
import {
  parsePaginationParams,
  buildTextSearch,
  buildPriceFilter,
  buildDateFilter,
} from '../utils/pagination.js';
import { buildPaginationMeta } from '../utils/ApiResponse.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import {
  NotFoundError,
  AuthorizationError,
  ConflictError,
  ValidationError,
} from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { EVENT_STATUS } from '../constants/eventStatus.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('EventController');

/**
 * Converts seat layout input into the DB grid schema format and computes totalSeats.
 */
const processSeatLayout = (seatLayout, targetTotalSeats = 50) => {
  if (!seatLayout || !Array.isArray(seatLayout) || seatLayout.length === 0) {
    const seatsPerRow = 10;
    const countToGenerate = targetTotalSeats > 0 ? targetTotalSeats : 50;
    const numRows = Math.ceil(countToGenerate / seatsPerRow);
    const rowLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const layout = [];
    let seatCounter = 0;

    for (let r = 0; r < numRows && seatCounter < countToGenerate; r++) {
      const rowLabel = rowLabels[r % rowLabels.length];
      const seatsInThisRow = Math.min(seatsPerRow, countToGenerate - seatCounter);
      const seats = [];

      for (let s = 1; s <= seatsInThisRow; s++) {
        seatCounter++;
        seats.push({
          seatId: `${rowLabel}-${s}`,
          seatNumber: s,
          status: 'available',
          lockedBy: null,
          lockedAt: null,
        });
      }

      layout.push({ row: rowLabel, seats });
    }

    return { layout, totalSeats: seatCounter };
  }

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

// ─── Public Endpoints ─────────────────────────────────────────────────────────

export const getEvents = asyncHandler(async (req, res) => {
  const queryParams = req.query;
  const { page, limit, skip, sortObj } = parsePaginationParams(queryParams, {
    defaultSort: 'date',
  });

  const filter = { status: EVENT_STATUS.PUBLISHED };

  if (queryParams.city) {
    filter.city = new RegExp(queryParams.city, 'i');
  }

  if (queryParams.category) {
    const categoryDoc =
      (await categoryRepo.findCategoryBySlug(queryParams.category.toLowerCase())) ||
      (await categoryRepo.findCategoryById(queryParams.category).catch(() => null));

    if (categoryDoc) {
      filter.category = categoryDoc._id;
    }
  }

  if (queryParams.status) {
    if (queryParams.status === 'all') {
      delete filter.status; // Return all statuses for admin moderation
    } else {
      filter.status = queryParams.status;
    }
  }

  const searchFilter = buildTextSearch(queryParams.search, ['title', 'venue']);
  if (searchFilter) Object.assign(filter, searchFilter);

  const priceFilter = buildPriceFilter(queryParams.minPrice, queryParams.maxPrice);
  if (priceFilter) filter.ticketPrice = priceFilter;

  const dateFilter = buildDateFilter(queryParams.startDate, queryParams.endDate);
  if (dateFilter) filter.date = dateFilter;

  const { events, total } = await eventRepo.findAllEvents(filter, { skip, limit, sortObj });
  const meta = buildPaginationMeta(total, page, limit);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.LIST_FETCHED, events, meta));
});

export const getEventById = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const event = await eventRepo.findEventById(eventId);

  if (!event) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.FETCHED, event));
});

// ─── Organizer Endpoints ──────────────────────────────────────────────────────

export const getMyEvents = asyncHandler(async (req, res) => {
  const organizerId = req.user._id;
  const { page, limit, skip, sortObj } = parsePaginationParams(req.query);

  const { events, total } = await eventRepo.findEventsByOrganizer(organizerId, {
    skip,
    limit,
    sortObj,
  });

  const meta = buildPaginationMeta(total, page, limit);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.LIST_FETCHED, events, meta));
});

export const createEvent = asyncHandler(async (req, res) => {
  const organizerId = req.user._id;
  const eventData = req.body;

  let category = null;
  const rawCat = eventData.category ? eventData.category.toString().trim() : '';

  if (rawCat) {
    if (rawCat.match(/^[0-9a-fA-F]{24}$/)) {
      category = await categoryRepo.findCategoryById(rawCat);
    }
    if (!category) {
      category =
        (await categoryRepo.findCategoryByName(rawCat)) ||
        (await categoryRepo.findCategoryBySlug(rawCat.toLowerCase()));
    }
    if (!category) {
      category = await categoryRepo.createCategory({
        name: rawCat,
        description: `${rawCat} Events & Shows`,
        icon: 'sparkles',
      }).catch(() => null);
    }
  }

  if (!category) {
    category = (await categoryRepo.findCategoryByName('Music')) || (await categoryRepo.findAllCategories())[0];
  }

  const { layout, totalSeats } = processSeatLayout(
    eventData.seatLayout,
    eventData.totalSeats || 50
  );

  // Organizers must submit events for Admin review (status: draft).
  // Only platform Admins can directly create and publish an event immediately.
  const eventStatus =
    req.user?.role === 'admin'
      ? eventData.status || EVENT_STATUS.PUBLISHED
      : EVENT_STATUS.DRAFT;

  const event = await eventRepo.createEvent({
    ...eventData,
    category: category._id,
    date: new Date(eventData.date),
    organizer: organizerId,
    seatLayout: layout,
    totalSeats,
    availableSeats: totalSeats,
    status: eventStatus,
  });

  logger.info(`Event created: "${event.title}" by organizer ${organizerId}`);

  return res
    .status(HTTP_STATUS.CREATED)
    .json(new ApiResponse(HTTP_STATUS.CREATED, MESSAGES.EVENT.CREATED, event));
});

export const updateEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const organizerId = req.user._id;
  const updates = req.body;

  let event;
  if (req.user.role === 'admin') {
    event = await eventRepo.findEventById(eventId);
  } else {
    event = await eventRepo.findEventByIdAndOrganizer(eventId, organizerId);
  }

  if (!event) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  if ([EVENT_STATUS.CANCELLED, EVENT_STATUS.COMPLETED].includes(event.status)) {
    throw new ValidationError(`Cannot update a ${event.status} event.`);
  }

  if (updates.date) updates.date = new Date(updates.date);

  const updated = await eventRepo.updateEventById(eventId, updates);
  logger.info(`Event updated: ${eventId}`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.UPDATED, updated));
});

export const uploadEventBanner = asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ValidationError('Please upload an image file.');
  }

  const { eventId } = req.params;
  const organizerId = req.user._id;
  const userRole = req.user.role;

  let event;
  if (userRole === 'admin') {
    event = await eventRepo.findEventById(eventId);
  } else {
    event = await eventRepo.findEventByIdAndOrganizer(eventId, organizerId);
  }

  if (!event) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  if (event.banner?.publicId) {
    await deleteImage(event.banner.publicId);
  }

  const { url, publicId } = await uploadImage(req.file.buffer, {
    folder: 'event-banners',
    width: 1200,
    height: 630,
  });

  const updated = await eventRepo.updateEventBanner(eventId, { url, publicId });
  logger.info(`Banner uploaded for event ${eventId}: ${url}`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.BANNER_UPLOADED, updated));
});

export const deleteEvent = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const organizerId = req.user._id;
  const userRole = req.user.role;

  let event;
  if (userRole === 'admin') {
    event = await eventRepo.findEventById(eventId);
  } else {
    event = await eventRepo.findEventByIdAndOrganizer(eventId, organizerId);
  }

  if (!event) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  if (userRole !== 'admin') {
    const hasBookings = await eventRepo.eventHasConfirmedBookings(eventId);
    if (hasBookings) {
      throw new ConflictError(MESSAGES.EVENT.HAS_BOOKINGS);
    }
  }

  if (event.banner?.publicId) {
    await deleteImage(event.banner.publicId);
  }

  await eventRepo.deleteEventById(eventId);
  logger.info(`Event deleted: ${eventId} ("${event.title}")`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.DELETED));
});

// ─── Admin Endpoints ──────────────────────────────────────────────────────────

export const updateEventStatus = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { status: newStatus } = req.body;

  const event = await eventRepo.findEventById(eventId);
  if (!event) {
    throw new NotFoundError(MESSAGES.EVENT.NOT_FOUND);
  }

  if (event.status === EVENT_STATUS.COMPLETED) {
    throw new ValidationError('Cannot change status of a completed event.');
  }

  const updated = await eventRepo.updateEventStatus(eventId, newStatus);
  logger.info(`Event ${eventId} status changed: ${event.status} → ${newStatus}`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.EVENT.STATUS_UPDATED, updated));
});
