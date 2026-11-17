/**
 * @file payment.controller.js
 * @description Mock Payment Gateway & Transaction Processing Controller.
 */

import Payment, { PAYMENT_METHODS, PAYMENT_GATEWAY_STATUS } from '../models/payment.model.js';
import * as bookingRepo from '../repositories/booking.repository.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { NotFoundError, ValidationError, AuthorizationError } from '../utils/ApiError.js';
import { HTTP_STATUS } from '../constants/httpStatus.js';
import { PAYMENT_STATUS } from '../constants/eventStatus.js';
import { createModuleLogger } from '../utils/logger.js';

const logger = createModuleLogger('PaymentController');

/**
 * Generates a clean mock transaction reference.
 */
const generateTransactionId = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `TXN-${timestamp}-${random}`;
};

/**
 * @desc Process a mock payment transaction for a booking
 * @route POST /api/v1/payments/process
 * @access Private
 */
export const processPayment = asyncHandler(async (req, res) => {
  const { bookingId, paymentMethod = PAYMENT_METHODS.MOCK, simulateFailure = false, gatewayMetadata = {} } = req.body;

  if (!bookingId) {
    throw new ValidationError('Booking ID is required to process payment.');
  }

  // Find booking
  const booking = await bookingRepo.findBookingByBookingId(bookingId);
  if (!booking) {
    throw new NotFoundError('Booking record not found.');
  }

  // Verify ownership
  const bookingUserId = booking.user?._id ? booking.user._id.toString() : booking.user.toString();
  if (req.user.role !== 'admin' && bookingUserId !== req.user._id.toString()) {
    throw new AuthorizationError('You do not have permission to pay for this booking.');
  }

  // Simulate payment failure if requested (e.g. testing declined card)
  if (simulateFailure === true) {
    const failedPayment = await Payment.create({
      booking: booking._id,
      user: req.user._id,
      amount: booking.totalAmount,
      currency: 'INR',
      paymentMethod,
      status: PAYMENT_GATEWAY_STATUS.FAILED,
      transactionId: generateTransactionId(),
      gatewayResponse: {
        gateway: 'MockPaymentGateway',
        responseCode: 'CARD_DECLINED',
        message: 'Transaction declined by issuer. Insufficient funds or invalid card details.',
      },
    });

    logger.warn(`[Payment] Simulated failure for booking ${bookingId}`);
    return res.status(HTTP_STATUS.BAD_REQUEST).json(
      new ApiResponse(HTTP_STATUS.BAD_REQUEST, failedPayment, 'Payment transaction declined.')
    );
  }

  // Successful Payment Processing
  const transactionId = generateTransactionId();
  const payment = await Payment.create({
    booking: booking._id,
    user: req.user._id,
    amount: booking.totalAmount,
    currency: 'INR',
    paymentMethod,
    status: PAYMENT_GATEWAY_STATUS.SUCCESSFUL,
    transactionId,
    gatewayResponse: {
      gateway: 'MockPaymentGateway',
      responseCode: 'SUCCESS',
      paidAt: new Date().toISOString(),
      ...gatewayMetadata,
    },
  });

  // Ensure booking paymentStatus is updated
  await bookingRepo.updateBookingById(booking._id, {
    paymentStatus: PAYMENT_STATUS.PAID,
  });

  logger.info(`[Payment] Successfully processed payment ${transactionId} for booking ${bookingId} (₹${booking.totalAmount})`);

  return res.status(HTTP_STATUS.OK).json(
    new ApiResponse(
      HTTP_STATUS.OK,
      {
        paymentId: payment._id,
        transactionId: payment.transactionId,
        bookingId: booking.bookingId,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        paymentMethod: payment.paymentMethod,
        paidAt: payment.createdAt,
      },
      'Payment processed successfully.'
    )
  );
});

/**
 * @desc Get payment transaction details by booking ID
 * @route GET /api/v1/payments/booking/:bookingId
 * @access Private
 */
export const getPaymentByBookingId = asyncHandler(async (req, res) => {
  const { bookingId } = req.params;

  const booking = await bookingRepo.findBookingByBookingId(bookingId);
  if (!booking) {
    throw new NotFoundError('Booking record not found.');
  }

  const bookingUserId = booking.user?._id ? booking.user._id.toString() : booking.user.toString();
  if (req.user.role !== 'admin' && bookingUserId !== req.user._id.toString()) {
    throw new AuthorizationError('You do not have permission to view payment details for this booking.');
  }

  const payments = await Payment.find({ booking: booking._id }).sort({ createdAt: -1 });

  return res.status(HTTP_STATUS.OK).json(
    new ApiResponse(HTTP_STATUS.OK, payments, 'Payment history retrieved.')
  );
});

/**
 * @desc Get payment transaction by transaction ID
 * @route GET /api/v1/payments/:id
 * @access Private
 */
export const getPaymentById = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id).populate('booking', 'bookingId totalAmount status');
  if (!payment) {
    throw new NotFoundError('Payment transaction record not found.');
  }

  const paymentUserId = payment.user.toString();
  if (req.user.role !== 'admin' && paymentUserId !== req.user._id.toString()) {
    throw new AuthorizationError('You do not have permission to view this payment.');
  }

  return res.status(HTTP_STATUS.OK).json(
    new ApiResponse(HTTP_STATUS.OK, payment, 'Payment record retrieved.')
  );
});
