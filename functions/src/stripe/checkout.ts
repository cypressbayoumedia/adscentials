import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { db } from "../init";
import { stripeSecret, getStripe } from "./config";

/**
 * 2. Create Checkout Session (Payment + Fee)
 */
export const createCheckoutSession = onCall({ secrets: [stripeSecret], cors: true }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    // Input: slotId, bookings details
    const { slotId, submission } = request.data;
    const sponsorId = request.auth.uid;
    const stripe = getStripe();

    try {
        // 1. Fetch Slot Details
        const slotRef = db.collection('adSlots').doc(slotId);
        const slotDoc = await slotRef.get();
        if (!slotDoc.exists) throw new HttpsError('not-found', 'Slot not found');

        const slot = slotDoc.data();
        if (slot?.status !== 'available') throw new HttpsError('failed-precondition', 'Slot is not available');

        // 2. Fetch Creator's Stripe Connection
        const creatorDoc = await db.collection('users').doc(slot.creatorId).get();
        const creatorData = creatorDoc.data();
        const connectedAccountId = creatorData?.stripeAccountId;

        if (!connectedAccountId) {
            throw new HttpsError('failed-precondition', 'Creator has not connected payouts.');
        }

        // 3. Calculate Fee (10%)
        const price = slot.price; // in cents
        const appFee = Math.round(price * 0.10);

        // 4. Create Booking Ref (so we can pass ID to Stripe)
        const bookingRef = db.collection('bookings').doc();

        // 5. Create Session
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    unit_amount: price,
                    product_data: {
                        name: slot.title || `${slot.platform.toUpperCase()} - ${slot.type} Ad`,
                    },
                },
                quantity: 1,
            }],
            payment_intent_data: {
                application_fee_amount: appFee,
                capture_method: 'manual', // Hold funds (Authorise only)
                transfer_data: {
                    destination: connectedAccountId,
                },
            },
            metadata: {
                bookingId: bookingRef.id,
                slotId: slotId,
                sponsorId: sponsorId
            },
            success_url: 'https://adscentials.web.app/dashboard', // Redirect to dashboard to see order
            cancel_url: `https://adscentials.web.app/${creatorData.handle || 'storefront'}`,
        });

        // 6. Reserve Slot & Create Pending Booking
        const batch = db.batch();
        // 15 Minutes from now
        const reservedUntil = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
        batch.update(slotRef, { status: 'pending', reservedUntil: reservedUntil });

        batch.set(bookingRef, {
            bookingId: bookingRef.id,
            slotId: slotId,
            creatorId: slot.creatorId,
            sponsorId: sponsorId,
            stripeSessionId: session.id,
            status: 'pending_payment',
            submission: submission,
            createdAt: FieldValue.serverTimestamp()
        });

        await batch.commit();

        return { sessionId: session.id, url: session.url };

    } catch (error: any) {
        logger.error("Checkout Create Error", error);
        throw new HttpsError('internal', error.message);
    }
});
