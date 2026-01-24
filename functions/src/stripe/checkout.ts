import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { db } from "../init";
import { stripeSecret, getStripe } from "./config";

/**
 * 2. Create Checkout Session (Payment + Fee)
 */
export const createCheckoutSession = onCall({ secrets: [stripeSecret], cors: true }, async (request) => {
    // Input: slotId, bookings details
    const { slotId, submission } = request.data;
    const sponsorId = request.auth ? request.auth.uid : 'guest';
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

        // Extract passed sponsor details
        const providedSponsorName = submission?.sponsorName;
        const providedSponsorEmail = submission?.sponsorEmail;

        // Fetch Sponsor Details logic (overrides provided if logged in, or uses provided if guest)
        let sponsorName = 'Guest Sponsor';
        let sponsorEmail: string | undefined = undefined;

        if (sponsorId !== 'guest') {
            const sponsorDoc = await db.collection('users').doc(sponsorId).get();
            const sponsorData = sponsorDoc.data();
            sponsorName = sponsorData?.displayName || 'Sponsor';
            sponsorEmail = sponsorData?.email;
        } else {
            // Use provided details for guest
            if (providedSponsorName) sponsorName = providedSponsorName;
            if (providedSponsorEmail) sponsorEmail = providedSponsorEmail;
        }


        // 5. Create Session
        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: sponsorEmail, // Pre-fill email
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    unit_amount: price,
                    product_data: {
                        name: slot.title || `${slot.platform.toUpperCase()} - ${slot.type} Ad`,
                        description: slot.description,
                        metadata: {
                            slotId: slotId,
                            sponsorId: sponsorId,
                        },
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
            submit_type: 'book',
            custom_text: {
                submit: {
                    message: 'You won\'t be charged until the creator accepts your booking request.',
                },
            },
            metadata: {
                bookingId: bookingRef.id,
                slotId: slotId,
                sponsorId: sponsorId
            },
            success_url: 'https://adscentials.com/success?session_id={CHECKOUT_SESSION_ID}', // Redirect to success page
            cancel_url: `https://adscentials.com/${creatorData.handle || 'storefront'}`,
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
            creatorName: creatorData?.displayName || 'Creator', // Cache creator name
            sponsorId: sponsorId,
            sponsorName: sponsorName,
            sponsorEmail: sponsorEmail, // Now correctly filled for guests too
            productTitle: slot.title || `${slot.platform.toUpperCase()} - ${slot.type} Ad`, // Cache product title
            price: price, // Cache price
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
