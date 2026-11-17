/**
 * @file payment.routes.js
 * @description Routes for mock payment processing and transaction ledger.
 */

import { Router } from 'express';
import * as paymentController from '../controllers/payment.controller.js';
import { protect } from '../middlewares/auth.middleware.js';

const router = Router();

// All payment routes require authentication
router.use(protect);

router.post('/process', paymentController.processPayment);
router.get('/booking/:bookingId', paymentController.getPaymentByBookingId);
router.get('/:id', paymentController.getPaymentById);

export default router;
