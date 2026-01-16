import { defineSecret } from "firebase-functions/params";
import Stripe from "stripe";

export const stripeSecret = defineSecret("STRIPE_SECRET");
export const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

export const getStripe = () => {
    return new Stripe(stripeSecret.value(), {
        apiVersion: '2025-12-15.clover' as any,
    });
};
