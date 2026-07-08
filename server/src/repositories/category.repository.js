/**
 * @file category.repository.js
 * @description All MongoDB operations for the Category collection.
 */

import Category from '../models/category.model.js';

/**
 * Find all active categories.
 * @returns {Promise<Document[]>}
 */
export const findAllCategories = async () => {
  return Category.find({ isActive: true }).sort({ name: 1 }).exec();
};

/**
 * Find a category by its ObjectId.
 * @param {string} id
 * @returns {Promise<Document|null>}
 */
export const findCategoryById = async (id) => {
  return Category.findById(id).exec();
};

/**
 * Find a category by its slug (used in URL params).
 * @param {string} slug
 * @returns {Promise<Document|null>}
 */
export const findCategoryBySlug = async (slug) => {
  return Category.findOne({ slug, isActive: true }).exec();
};

/**
 * Find a category by name (case-insensitive) for duplicate check.
 * @param {string} name
 * @returns {Promise<Document|null>}
 */
export const findCategoryByName = async (name) => {
  return Category.findOne({ name: new RegExp(`^${name}$`, 'i') }).exec();
};

/**
 * Create a new category.
 * @param {object} data - { name, description, icon }
 * @returns {Promise<Document>}
 */
export const createCategory = async (data) => {
  return Category.create(data);
};

/**
 * Update a category by ID.
 * @param {string} id
 * @param {object} updates
 * @returns {Promise<Document|null>}
 */
export const updateCategoryById = async (id, updates) => {
  return Category.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  }).exec();
};

/**
 * Soft-delete a category (set isActive = false).
 * @param {string} id
 * @returns {Promise<Document|null>}
 */
export const deactivateCategoryById = async (id) => {
  return Category.findByIdAndUpdate(id, { isActive: false }, { new: true }).exec();
};
