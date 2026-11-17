/**
 * @file payment.model.js
 * @description Mongoose schema for the Payment collection (Mock Gateway & Transaction Ledger).
 */

import mongoose from 'mongoose';

export const PAYMENT_METHODS = Object.freeze({
  CARD: 'card',
  UPI: 'upi',
  NETBANKING: 'netbanking',
  WALLET: 'wallet',
  MOCK: 'mock',
});

export const PAYMENT_GATEWAY_STATUS = Object.freeze({
  PENDING: 'pending',
  SUCCESSFUL: 'successful',
  FAILED: 'failed',
  REFUNDED: 'refunded',
});

const paymentSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: [true, 'Booking reference is required'],
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User reference is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0, 'Payment amount cannot be negative'],
    },
    currency: {
      type: String,
      default: 'INR',
      uppercase: true,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PAYMENT_METHODS),
      default: PAYMENT_METHODS.MOCK,
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_GATEWAY_STATUS),
      default: PAYMENT_GATEWAY_STATUS.PENDING,
      index: true,
    },
    transactionId: {
      type: String,
      required: [true, 'Transaction ID is required'],
      unique: true,
      index: true,
    },
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    refund: {
      refundId: { type: String, default: null },
      amount: { type: Number, default: 0 },
      reason: { type: String, default: null },
      refundedAt: { type: Date, default: null },
      status: { type: String, enum: ['pending', 'processed', 'completed'], default: null },
    },
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model('Payment', paymentSchema);
export default Payment;
