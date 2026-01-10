import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { db } from "../init";
import { stripeSecret, getStripe } from "./config";

/**
 * 1. Onboard Creator: Create Stripe Express Account & Get Link
 */
export const createStripeAccountLink = onCall({ secrets: [stripeSecret] }, async (request) => {
    // 1. Auth Check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
    }
    const uid = request.auth.uid;
    const stripe = getStripe();

    // Get origin for dynamic URLs
    const origin = request.rawRequest.headers.origin || 'https://adscentials.web.app';

    try {
        // 2. Check if user already has a stripeAccountId
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();
        const userData = userDoc.data();
        let accountId = userData?.stripeAccountId;

        // 3. Create Express Account if doesn't exist
        if (!accountId) {
            const account = await stripe.accounts.create({
                type: 'express',
                country: 'US', // Default to US for MVP
                email: userData?.email,
                metadata: { firebaseUid: uid },
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
            });
            accountId = account.id;
            // Save to Firestore
            await userRef.set({ stripeAccountId: accountId }, { merge: true });
        }

        // 4. Create Account Link (for onboarding flow)
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: `${origin}/dashboard`,
            return_url: `${origin}/dashboard?stripe_connect=success`,
            type: 'account_onboarding',
        });

        return { url: accountLink.url };

    } catch (error: any) {
        logger.error("Stripe Onboarding Error", error);
        throw new HttpsError('internal', error.message);
    }
});
/**
 * 2. Verify Stripe Connection (Failsafe)
 * Call this when returning from Stripe to manually update status if webhook is slow
 */
export const verifyStripeConnection = onCall({ secrets: [stripeSecret] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in.');

    const uid = request.auth.uid;
    const stripe = getStripe();

    try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();
        const accountId = userDoc.data()?.stripeAccountId;

        if (!accountId) throw new HttpsError('failed-precondition', 'No Stripe account found.');

        const account = await stripe.accounts.retrieve(accountId);

        const isRestricted = !account.payouts_enabled || !account.charges_enabled;

        if (account.details_submitted) {
            await userRef.update({
                stripeConnected: true,
                stripeRestricted: isRestricted
            });
            return { connected: true, restricted: isRestricted };
        }

        return { connected: false };

    } catch (error: any) {
        logger.error("Verify Stripe Error", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * 3. Create Stripe Login Link
 * Generates a single-use login link for the user's Stripe Express Dashboard
 */
export const createStripeLoginLink = onCall({ secrets: [stripeSecret] }, async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'User must be logged in.');

    const uid = request.auth.uid;
    const stripe = getStripe();

    try {
        const userRef = db.collection('users').doc(uid);
        const userDoc = await userRef.get();
        const accountId = userDoc.data()?.stripeAccountId;

        if (!accountId) throw new HttpsError('failed-precondition', 'No Stripe account found.');

        const loginLink = await stripe.accounts.createLoginLink(accountId);

        return { url: loginLink.url };

    } catch (error: any) {
        logger.error("Login Link Error", error);
        throw new HttpsError('internal', error.message);
    }
});
