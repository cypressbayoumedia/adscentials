
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";

const db = getFirestore();
const messaging = getMessaging();

async function sendNotification(userId: string, title: string, body: string, data?: any) {
    try {
        const userDoc = await db.collection("users").doc(userId).get();
        const userData = userDoc.data();

        if (!userData || !userData.fcmTokens || userData.fcmTokens.length === 0) {
            logger.info(`No FCM tokens found for user ${userId}`);
            return;
        }

        const tokens: string[] = userData.fcmTokens;

        // Remove duplicate tokens if any
        const uniqueTokens = [...new Set(tokens)];

        const message = {
            notification: {
                title,
                body,
                // Add icon here so default browser notification uses it
                icon: 'https://adscentials.web.app/assets/icons/icon-192x192.png'
            },
            data: data || {},
            tokens: uniqueTokens,
        };

        const response = await messaging.sendEachForMulticast(message);

        // Cleanup invalid tokens
        if (response.failureCount > 0) {
            const failedTokens: string[] = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    failedTokens.push(uniqueTokens[idx]);
                }
            });

            if (failedTokens.length > 0) {
                // Remove failed tokens
                await db.collection("users").doc(userId).update({
                    fcmTokens: userData.fcmTokens.filter((t: string) => !failedTokens.includes(t)) // Non-atomic for simplicity, atomic arrayRemove is better but tricky with list
                });
                logger.info(`Removed ${failedTokens.length} invalid tokens for user ${userId}`);
            }
        }

        logger.info(`Notification sent to user ${userId}: ${response.successCount} successful`);

    } catch (error) {
        logger.error("Error sending notification", error);
    }
}

export const onNewBooking = onDocumentCreated("bookings/{bookingId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const booking = snapshot.data();
    const creatorId = booking.creatorId;

    if (!creatorId) return;

    // Send notification to Creator
    await sendNotification(
        creatorId,
        "🎉 New Order Received!",
        `You have a new booking for your ad slot. Check your dashboard!`
    );
});

export const onBookingUpdate = onDocumentUpdated("bookings/{bookingId}", async (event) => {
    const change = event.data;
    if (!change) return;

    const newData = change.after.data();
    const oldData = change.before.data();

    const creatorId = newData.creatorId;

    // Notify on Status Change
    if (newData.status !== oldData.status && creatorId) {
        let title = "";
        let body = "";

        switch (newData.status) {
            case "confirmed":
                title = "✅ Order Confirmed";
                body = "Payment received! The order is now confirmed pending your approval.";
                break;
            case "completed":
                title = "🚀 Order Completed";
                body = "Great job! The order has been marked as completed.";
                break;
        }

        if (title) {
            await sendNotification(creatorId, title, body);
        }
    }

    // Notify on AI Vetting flag (if it wasn't flagged before or just appeared)
    if (newData.aiVetting && !oldData.aiVetting && newData.aiVetting.flagged) {
        await sendNotification(
            creatorId,
            "⚠️ AI Warning",
            "A new order has been flagged by AI. Please review the script delicately."
        );
    }
});
