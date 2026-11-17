/**
 * @file notification.routes.js
 * @description In-app notification routes.
 */

import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = Router();

router.use(protect);

router.get('/', notificationController.getUserNotifications);
router.patch('/read-all', notificationController.markAllNotificationsRead);
router.patch('/:id/read', notificationController.markNotificationRead);

export default router;
