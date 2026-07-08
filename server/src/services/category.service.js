/**
 * @file category.service.js
 * @description Category business logic.
 */

import * as categoryRepo from '../repositories/category.repository.js';
import { ConflictError, NotFoundError } from '../utils/ApiError.js';
import { MESSAGES } from '../constants/messages.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('CategoryService');

/**
 * Get all active categories (public).
 * @returns {Promise<Document[]>}
 */
export const getAllCategories = async () => {
  return categoryRepo.findAllCategories();
};

/**
 * Create a new category (admin only).
 * Business rule: Category names must be unique (case-insensitive).
 *
 * @param {{ name, description?, icon? }} data
 * @returns {Promise<Document>}
 */
export const createCategory = async ({ name, description, icon }) => {
  const existing = await categoryRepo.findCategoryByName(name);
  if (existing) {
    throw new ConflictError(MESSAGES.CATEGORY.NAME_TAKEN);
  }

  const category = await categoryRepo.createCategory({ name, description, icon });
  logger.info(`Category created: ${category.name} (slug: ${category.slug})`);
  return category;
};

/**
 * Update an existing category (admin only).
 * If name is being changed, check for duplicate names.
 *
 * @param {string} categoryId
 * @param {object} updates
 * @returns {Promise<Document>}
 */
export const updateCategory = async (categoryId, updates) => {
  const category = await categoryRepo.findCategoryById(categoryId);
  if (!category) {
    throw new NotFoundError(MESSAGES.CATEGORY.NOT_FOUND);
  }

  // If renaming, check uniqueness
  if (updates.name && updates.name.toLowerCase() !== category.name.toLowerCase()) {
    const existing = await categoryRepo.findCategoryByName(updates.name);
    if (existing) {
      throw new ConflictError(MESSAGES.CATEGORY.NAME_TAKEN);
    }
  }

  const updated = await categoryRepo.updateCategoryById(categoryId, updates);
  return updated;
};

/**
 * Soft-delete a category (admin only).
 * Sets isActive = false instead of hard deleting.
 *
 * @param {string} categoryId
 * @returns {Promise<void>}
 */
export const deleteCategory = async (categoryId) => {
  const category = await categoryRepo.findCategoryById(categoryId);
  if (!category) {
    throw new NotFoundError(MESSAGES.CATEGORY.NOT_FOUND);
  }
  await categoryRepo.deactivateCategoryById(categoryId);
  logger.info(`Category deactivated: ${category.name}`);
};
