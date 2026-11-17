/**
 * @file category.controller.js
 * @description Category Controller with auto-seeding for default categories.
 */

import * as categoryRepo from '../repositories/category.repository.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { ConflictError, NotFoundError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('CategoryController');

const DEFAULT_CATEGORIES = [
  { name: 'Music', description: 'Live concerts & musical performances', icon: 'music' },
  { name: 'Sports', description: 'Stadium matches & tournaments', icon: 'activity' },
  { name: 'Arts & Theater', description: 'Drama, plays, and art exhibitions', icon: 'film' },
  { name: 'Comedy', description: 'Stand-up comedy shows and open mics', icon: 'smile' },
  { name: 'Workshops', description: 'Educational classes and bootcamps', icon: 'book' },
  { name: 'Conferences', description: 'Tech summits, business meets & expos', icon: 'briefcase' },
];

export const getAllCategories = asyncHandler(async (_req, res) => {
  let categories = await categoryRepo.findAllCategories();

  // Ensure default categories exist
  if (!categories || categories.length < DEFAULT_CATEGORIES.length) {
    for (const d of DEFAULT_CATEGORIES) {
      const existing = await categoryRepo.findCategoryByName(d.name);
      if (!existing) {
        await categoryRepo.createCategory(d).catch(() => {});
      }
    }
    categories = await categoryRepo.findAllCategories();
  }

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.CATEGORY.LIST_FETCHED, categories));
});

export const createCategory = asyncHandler(async (req, res) => {
  const { name, description, icon } = req.body;
  const existing = await categoryRepo.findCategoryByName(name);

  if (existing) {
    return res
      .status(HTTP_STATUS.OK)
      .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.CATEGORY.CREATED, existing));
  }

  const category = await categoryRepo.createCategory({ name, description, icon });
  logger.info(`Category created: ${category.name} (slug: ${category.slug})`);

  return res
    .status(HTTP_STATUS.CREATED)
    .json(new ApiResponse(HTTP_STATUS.CREATED, MESSAGES.CATEGORY.CREATED, category));
});

export const updateCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const category = await categoryRepo.findCategoryById(categoryId);

  if (!category) {
    throw new NotFoundError(MESSAGES.CATEGORY.NOT_FOUND);
  }

  if (req.body.name && req.body.name.toLowerCase() !== category.name.toLowerCase()) {
    const existing = await categoryRepo.findCategoryByName(req.body.name);
    if (existing) {
      throw new ConflictError(MESSAGES.CATEGORY.NAME_TAKEN);
    }
  }

  const updated = await categoryRepo.updateCategoryById(categoryId, req.body);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.CATEGORY.UPDATED, updated));
});

export const deleteCategory = asyncHandler(async (req, res) => {
  const { categoryId } = req.params;
  const category = await categoryRepo.findCategoryById(categoryId);

  if (!category) {
    throw new NotFoundError(MESSAGES.CATEGORY.NOT_FOUND);
  }

  await categoryRepo.deactivateCategoryById(categoryId);
  logger.info(`Category deactivated: ${category.name}`);

  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.CATEGORY.DELETED));
});
