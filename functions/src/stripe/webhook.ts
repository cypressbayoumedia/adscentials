import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { Timestamp } from "firebase-admin/firestore";
import Stripe from "stripe";
import { db } from "../init";
import { stripeSecret, stripeWebhookSecret, getStripe } from "./config";
import { vetScript, geminiApiKey } from "../ai/vetting";

/**
 * 3. Stripe Webhook
 * Listens for checkout.session.completed to fulfill order
 */
export const stripeWebhook = onRequest({ secrets: [stripeSecret, stripeWebhookSecret, geminiApiKey] }, async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const endpointSecret = stripeWebhookSecret.value();
    const stripe = getStripe();

    let event;

    try {
        if (!sig || !endpointSecret) throw new Error('Missing signature or secret');
        event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    } catch (err: any) {
        logger.error(`Webhook Error: ${err.message}`);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // Handle the event
    switch (event.type) {
        case 'account.updated': {
            const account = event.data.object as Stripe.Account;
            const uid = account.metadata?.firebaseUid;

            // If setup is complete (charges_enabled or details_submitted depending on preference)
            // details_submitted is usually enough to say "onboarding done"
            if (uid && account.details_submitted) {
                const isRestricted = !account.payouts_enabled || !account.charges_enabled;
                try {
                    await db.collection('users').doc(uid).update({
                        stripeConnected: true,
                        stripeRestricted: isRestricted,
                        stripeAccountId: account.id
                    });
                    logger.info(`Updated user ${uid} stripeConnected status`);
                } catch (err) {
                    logger.error(`Error updating user ${uid} for account.updated`, err);
                }
            }
            break;
        }

        case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;

            // Fulfill the purchase...
            const bookingId = session.metadata?.bookingId;
            const slotId = session.metadata?.slotId;

            if (bookingId && slotId) {
                try {
                    const batch = db.batch();
                    const bookingRef = db.collection('bookings').doc(bookingId);
                    const slotRef = db.collection('adSlots').doc(slotId);

                    // Update Booking
                    batch.update(bookingRef, { status: 'confirmed', paidAt: Timestamp.now() });

                    // Update Slot
                    batch.update(slotRef, { status: 'sold' });

                    await batch.commit();

                    logger.info(`Fulfilling booking ${bookingId} for slot ${slotId}`);

                    // ---------------------------------------------------------
                    // AI VETTING (Post-Commit to ensure Booking exists/is confirm)
                    // ---------------------------------------------------------
                    try {
                        // refetch to get the script
                        const bookingSnap = await bookingRef.get();
                        const bookingData = bookingSnap.data();

                        if (bookingData && bookingData.submission && bookingData.submission.script) {
                            logger.info(`Starting AI Vetting for ${bookingId}`);
                            const vettingResult = await vetScript(bookingData.submission.script);

                            // Update the doc with AI result
                            await bookingRef.update({
                                aiVetting: vettingResult
                            });
                            logger.info(`AI Vetting Completed for ${bookingId}: Score ${vettingResult.safetyScore}`);
                        }
                    } catch (aiErr) {
                        logger.error('Error during AI Vetting', aiErr);
                        // Don't fail the webhook response, just log it.
                    }
                } catch (error) {
                    logger.error('Error updating Firestore in Webhook', error);
                    res.status(500).send('Firestore Error');
                    return;
                }
            }
        }
    }

    res.json({ received: true });
});
