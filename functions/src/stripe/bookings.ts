
import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../init";
import { stripeSecret, getStripe } from "./config";

/**
 * Approve a booking and CAPTURE the funds.
 */
export const approveBooking = onCall({ secrets: [stripeSecret] }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const { bookingId } = request.data;
    const uid = request.auth.uid;
    const stripe = getStripe();

    try {
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingDoc = await bookingRef.get();

        if (!bookingDoc.exists) throw new HttpsError('not-found', 'Booking not found');
        const booking = bookingDoc.data();

        if (booking?.creatorId !== uid) {
            throw new HttpsError('permission-denied', 'You do not have permission to approve this booking.');
        }

        if (booking?.status !== 'confirmed') {
            throw new HttpsError('failed-precondition', 'Booking is not in a confirmable state.');
        }

        // CAPTURE FUNDS
        if (booking.stripeSessionId) {
            const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId);
            const paymentIntentId = session.payment_intent as string;

            if (paymentIntentId) {
                await stripe.paymentIntents.capture(paymentIntentId);
            }
        }

        // Update Firestore
        await bookingRef.update({ status: 'approved' });

        return { success: true };

    } catch (error: any) {
        logger.error("Approve Booking Error", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Decline a booking and VOID the authorization (release funds).
 */
export const declineBooking = onCall({ secrets: [stripeSecret] }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const { bookingId } = request.data;
    const uid = request.auth.uid;
    const stripe = getStripe();

    try {
        // 1. Fetch Booking
        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingDoc = await bookingRef.get();

        if (!bookingDoc.exists) throw new HttpsError('not-found', 'Booking not found');
        const booking = bookingDoc.data();

        // 2. Verify Ownership
        if (booking?.creatorId !== uid) {
            throw new HttpsError('permission-denied', 'You do not have permission to decline this booking.');
        }

        if (booking?.status === 'rejected' || booking?.status === 'refunded') {
            throw new HttpsError('failed-precondition', 'Booking is already rejected/refunded.');
        }

        // 3. Process Void or Refund
        if (booking?.stripeSessionId) {
            const session = await stripe.checkout.sessions.retrieve(booking.stripeSessionId);
            const paymentIntentId = session.payment_intent as string;

            if (paymentIntentId) {
                const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

                if (pi.status === 'requires_capture') {
                    // Auth only, so cancel it (VOID)
                    await stripe.paymentIntents.cancel(paymentIntentId, {
                        cancellation_reason: 'requested_by_customer'
                    });
                    logger.info(`Voided authorization for ${bookingId}`);
                } else if (pi.status === 'succeeded') {
                    // Already captured, must refund (and reverse transfer)
                    await stripe.refunds.create({
                        payment_intent: paymentIntentId,
                        reverse_transfer: true, // IMPORTANT: Pulls money back from Connected Account
                        reason: 'requested_by_customer'
                    });
                    logger.info(`Refunded matched payment for ${bookingId}`);
                }
            }
        }

        // 4. Update Firestore
        const slotRef = db.collection('adSlots').doc(booking.slotId);
        const batch = db.batch();

        batch.update(bookingRef, { status: 'rejected' });
        batch.update(slotRef, {
            status: 'available',
            reservedUntil: null
        });

        await batch.commit();

        return { success: true };

    } catch (error: any) {
        logger.error("Decline Booking Error", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * Fetch booking details by Stripe Session ID.
 * This acts as a secure way for the success page to show order details without requiring login.
 */
export const getBookingBySession = onCall(async (request) => {
    const { sessionId } = request.data;
    if (!sessionId) {
        throw new HttpsError('invalid-argument', 'Session ID is required.');
    }

    try {
        const bookingsRef = db.collection('bookings');
        const snapshot = await bookingsRef.where('stripeSessionId', '==', sessionId).limit(1).get();

        if (snapshot.empty) {
            throw new HttpsError('not-found', 'Booking not found for this session.');
        }

        const booking = snapshot.docs[0].data();

        // 2. Fetch Creator Handler
        let creatorHandle = booking.creatorId;
        try {
            const creatorDoc = await db.collection('users').doc(booking.creatorId).get();
            if (creatorDoc.exists) {
                creatorHandle = creatorDoc.data()?.handle || booking.creatorId;
            }
        } catch (e) {
            logger.warn('Could not fetch creator handle', e);
        }

        // Return only safe, necessary data
        return {
            bookingId: booking.bookingId,
            status: booking.status,
            productTitle: booking.productTitle,
            price: booking.price,
            creatorName: booking.creatorName,
            creatorId: booking.creatorId,
            creatorHandle: creatorHandle, // NEW
            createdAt: booking.createdAt?.toMillis() || Date.now()
        };

    } catch (error: any) {
        logger.error("Get Booking By Session Error", error);
        throw new HttpsError('internal', error.message);
    }
});
