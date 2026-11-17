/**
 * @file search.repository.js
 * @description MongoDB aggregation pipelines for Search & Discovery features.
 */

import mongoose from 'mongoose';
import Event from '../models/event.model.js';
import Booking from '../models/booking.model.js';
import { EVENT_STATUS } from '../constants/eventStatus.js';

// ─── Full-Text Event Search ───────────────────────────────────────────────────

export const searchEvents = async (filters = {}, { skip = 0, limit = 10, sortObj = { date: 1 } } = {}) => {
  const {
    search,
    city,
    categorySlug,
    minPrice,
    maxPrice,
    startDate,
    endDate,
    hasAvailableSeats,
    status,
  } = filters;

  const matchStage = {
    status: status || EVENT_STATUS.PUBLISHED,
  };

  if (city) {
    matchStage.city = new RegExp(city.trim(), 'i');
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    matchStage.ticketPrice = {};
    if (minPrice !== undefined) matchStage.ticketPrice.$gte = parseFloat(minPrice);
    if (maxPrice !== undefined) matchStage.ticketPrice.$lte = parseFloat(maxPrice);
  }

  if (startDate || endDate) {
    matchStage.date = {};
    if (startDate) matchStage.date.$gte = new Date(startDate);
    if (endDate) matchStage.date.$lte = new Date(endDate);
  }

  if (hasAvailableSeats === 'true' || hasAvailableSeats === true) {
    matchStage.availableSeats = { $gt: 0 };
  }

  if (search && search.trim()) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    matchStage.$or = [
      { title: regex },
      { venue: regex },
      { description: regex },
    ];
  }

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryData',
      },
    },
    { $unwind: { path: '$categoryData', preserveNullAndEmptyArrays: true } },
  ];

  if (categorySlug) {
    pipeline.push({
      $match: { 'categoryData.slug': categorySlug.toLowerCase() },
    });
  }

  pipeline.push({
    $facet: {
      data: [
        { $sort: sortObj },
        { $skip: skip },
        { $limit: limit },
        {
          $addFields: {
            category: {
              _id: '$categoryData._id',
              name: '$categoryData.name',
              slug: '$categoryData.slug',
              icon: '$categoryData.icon',
            },
          },
        },
        {
          $project: {
            seatLayout: 0,
            categoryData: 0,
            __v: 0,
          },
        },
      ],
      total: [{ $count: 'count' }],
    },
  });

  const [result] = await Event.aggregate(pipeline);

  return {
    events: result.data,
    total: result.total[0]?.count || 0,
  };
};

// ─── Trending Events ──────────────────────────────────────────────────────────

export const getTrendingEvents = async (days = 7, limit = 10) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const trending = await Booking.aggregate([
    {
      $match: {
        status: 'confirmed',
        createdAt: { $gte: since },
      },
    },
    {
      $group: {
        _id: '$event',
        bookingCount: { $sum: 1 },
        totalSeatsBooked: { $sum: { $size: '$seats' } },
      },
    },
    { $sort: { bookingCount: -1 } },
    { $limit: limit * 2 },
    {
      $lookup: {
        from: 'events',
        localField: '_id',
        foreignField: '_id',
        as: 'event',
      },
    },
    { $unwind: '$event' },
    {
      $match: {
        'event.status': EVENT_STATUS.PUBLISHED,
        'event.date': { $gt: new Date() },
      },
    },
    { $limit: limit },
    {
      $lookup: {
        from: 'categories',
        localField: 'event.category',
        foreignField: '_id',
        as: 'categoryData',
      },
    },
    { $unwind: { path: '$categoryData', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: '$event._id',
        title: '$event.title',
        date: '$event.date',
        time: '$event.time',
        venue: '$event.venue',
        city: '$event.city',
        ticketPrice: '$event.ticketPrice',
        availableSeats: '$event.availableSeats',
        banner: '$event.banner',
        status: '$event.status',
        category: {
          _id: '$categoryData._id',
          name: '$categoryData.name',
          slug: '$categoryData.slug',
          icon: '$categoryData.icon',
        },
        bookingCount: 1,
        totalSeatsBooked: 1,
      },
    },
  ]);

  return trending;
};

// ─── City Autocomplete ────────────────────────────────────────────────────────

export const getDistinctCities = async (query = '', limit = 10) => {
  const matchStage = { status: EVENT_STATUS.PUBLISHED };

  if (query && query.trim()) {
    const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    matchStage.city = new RegExp(`^${escaped}`, 'i');
  }

  const cities = await Event.aggregate([
    { $match: matchStage },
    { $group: { _id: '$city', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: limit },
    { $project: { _id: 0, city: '$_id', eventCount: '$count' } },
  ]);

  return cities;
};

// ─── Category Counts ──────────────────────────────────────────────────────────

export const getCategoryEventCounts = async () => {
  const counts = await Event.aggregate([
    {
      $match: {
        status: EVENT_STATUS.PUBLISHED,
        date: { $gt: new Date() },
      },
    },
    { $group: { _id: '$category', eventCount: { $sum: 1 } } },
    {
      $lookup: {
        from: 'categories',
        localField: '_id',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: '$category' },
    { $match: { 'category.isActive': true } },
    { $sort: { eventCount: -1 } },
    {
      $project: {
        _id: 0,
        categoryId: '$_id',
        name: '$category.name',
        slug: '$category.slug',
        icon: '$category.icon',
        eventCount: 1,
      },
    },
  ]);

  return counts;
};

// ─── Related Events ───────────────────────────────────────────────────────────

export const getRelatedEvents = async (eventId, categoryId, eventDate, limit = 4) => {
  const eventObjectId = new mongoose.Types.ObjectId(eventId);
  const dateWindow = 30;

  const windowStart = new Date(eventDate);
  windowStart.setDate(windowStart.getDate() - dateWindow);
  const windowEnd = new Date(eventDate);
  windowEnd.setDate(windowEnd.getDate() + dateWindow);

  const related = await Event.aggregate([
    {
      $match: {
        _id: { $ne: eventObjectId },
        category: new mongoose.Types.ObjectId(categoryId),
        status: EVENT_STATUS.PUBLISHED,
        date: { $gte: new Date(), $lte: windowEnd },
      },
    },
    {
      $addFields: {
        dateDiff: {
          $abs: { $subtract: ['$date', eventDate] },
        },
      },
    },
    { $sort: { dateDiff: 1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'categories',
        localField: 'category',
        foreignField: '_id',
        as: 'categoryData',
      },
    },
    { $unwind: { path: '$categoryData', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        category: {
          _id: '$categoryData._id',
          name: '$categoryData.name',
          slug: '$categoryData.slug',
        },
      },
    },
    {
      $project: {
        seatLayout: 0,
        __v: 0,
        dateDiff: 0,
        categoryData: 0,
      },
    },
  ]);

  return related;
};

// ─── Seat Availability ────────────────────────────────────────────────────────

export const getSeatAvailability = async (eventId) => {
  const result = await Event.findById(eventId)
    .select('seatLayout availableSeats totalSeats title date status')
    .lean()
    .exec();

  if (!result) return null;

  const cleanLayout = (result.seatLayout || []).map((row) => ({
    row: row.row,
    seats: (row.seats || []).map((seat) => ({
      seatId: seat.seatId,
      seatNumber: seat.seatNumber,
      status: seat.status,
    })),
  }));

  return {
    eventId: result._id,
    title: result.title,
    date: result.date,
    status: result.status,
    totalSeats: result.totalSeats,
    availableSeats: result.availableSeats,
    seatLayout: cleanLayout,
  };
};
