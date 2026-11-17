import { lockSeats, verifyLocks, releaseSeats } from '../src/utils/seatLock.js';

describe('Seat Locking & Concurrency Control', () => {
  const eventId = 'event-test-seatlock-101';
  const userA = 'user-alice-01';
  const userB = 'user-bob-02';
  const seatsToLock = ['A-1', 'A-2'];

  afterEach(async () => {
    await releaseSeats(eventId, seatsToLock, userA);
    await releaseSeats(eventId, seatsToLock, userB);
  });

  it('User A should successfully acquire lock on available seats', async () => {
    const result = await lockSeats(eventId, seatsToLock, userA);
    expect(result.success).toBe(true);
    expect(result.lockedSeats).toEqual(expect.arrayContaining(seatsToLock));
  });

  it('User B should fail to lock seats already held by User A', async () => {
    // User A locks first
    await lockSeats(eventId, seatsToLock, userA);

    // User B tries to lock the same seats
    const resultB = await lockSeats(eventId, seatsToLock, userB);
    expect(resultB.success).toBe(false);
    expect(resultB.failedSeat).toBeDefined();
    expect(seatsToLock).toContain(resultB.failedSeat);
  });

  it('User A can verify that their acquired locks are still active', async () => {
    await lockSeats(eventId, seatsToLock, userA);

    const verification = await verifyLocks(eventId, seatsToLock, userA);
    expect(verification.valid).toBe(true);
  });

  it('User B cannot verify locks that belong to User A', async () => {
    await lockSeats(eventId, seatsToLock, userA);

    const verificationB = await verifyLocks(eventId, seatsToLock, userB);
    expect(verificationB.valid).toBe(false);
  });

  it('Releasing seats should allow User B to acquire them', async () => {
    await lockSeats(eventId, seatsToLock, userA);
    await releaseSeats(eventId, seatsToLock, userA);

    const resultB = await lockSeats(eventId, seatsToLock, userB);
    expect(resultB.success).toBe(true);
  });
});
