/**
 * @file category.controller.js
 * @description HTTP handlers for Category endpoints.
 */

import * as categoryService from '../services/category.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { MESSAGES } from '../constants/messages.js';


export const getAllCategories = asyncHandler(async (_req, res) => {
  const categories = await categoryService.getAllCategories();
  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.CATEGORY.LIST_FETCHED, categories));
});


export const createCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.createCategory(req.body);
  return res
    .status(HTTP_STATUS.CREATED)
    .json(new ApiResponse(HTTP_STATUS.CREATED, MESSAGES.CATEGORY.CREATED, category));
});


export const updateCategory = asyncHandler(async (req, res) => {
  const category = await categoryService.updateCategory(req.params.categoryId, req.body);
  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.CATEGORY.UPDATED, category));
});


export const deleteCategory = asyncHandler(async (req, res) => {
  await categoryService.deleteCategory(req.params.categoryId);
  return res
    .status(HTTP_STATUS.OK)
    .json(new ApiResponse(HTTP_STATUS.OK, MESSAGES.CATEGORY.DELETED));
});
