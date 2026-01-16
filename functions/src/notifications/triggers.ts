
import { onDocumentCreated, onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as functions from "firebase-functions/v1"; // Explicitly use v1 for auth triggers
import { getMessaging } from "firebase-admin/messaging";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { MailService, mailgunKey } from "../services/mail";
import { UserRecord } from "firebase-admin/auth";

const db = getFirestore();
const messaging = getMessaging();
const mailService = new MailService();

export const sendWelcomeEmail = functions.runWith({ secrets: [mailgunKey] }).auth.user().onCreate(async (user: UserRecord) => {
    const email = user.email;
    const displayName = user.displayName || 'Creator';
    if (email) {
        await mailService.sendWelcomeEmail(email, displayName);
    }
});

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
                body
            },
            webpush: {
                notification: {
                    icon: 'https://adscentials.com/icons/maskable_icon_x192.png'
                }
            },
            data: data || {},
            tokens: uniqueTokens,
        };

        const response = await messaging.sendEachForMulticast(message);

        // Cleanup invalid tokens
        if (response.failureCount > 0) {
            const failedTokens: string[] = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success && resp.error) {
                    const errorCode = resp.error.code;
                    if (errorCode === 'messaging/registration-token-not-registered' || errorCode === 'messaging/invalid-registration-token') {
                        logger.info(`Invalid token found: ${uniqueTokens[idx]} (Error: ${errorCode})`);
                        failedTokens.push(uniqueTokens[idx]);
                    } else {
                        logger.warn(`Transient FCM error for token ${uniqueTokens[idx]}: ${errorCode} - ${resp.error.message}`);
                    }
                }
            });

            if (failedTokens.length > 0) {
                // Remove failed tokens
                await db.collection("users").doc(userId).update({
                    fcmTokens: userData.fcmTokens.filter((t: string) => !failedTokens.includes(t))
                });
                logger.info(`Removed ${failedTokens.length} invalid tokens for user ${userId}`);
            }
        }

        logger.info(`Notification sent to user ${userId}: ${response.successCount} successful`);

    } catch (error) {
        logger.error("Error sending notification", error);
    }
}

// Note: We don't send emails here anymore because the booking starts as 'pending_payment'.
// We wait for status to become 'confirmed' in onBookingUpdate.
export const onNewBooking = onDocumentCreated("bookings/{bookingId}", async (event) => {
    logger.info(`New booking created: ${event.params.bookingId}`);
});


export const onBookingUpdate = onDocumentUpdated({
    document: "bookings/{bookingId}",
    secrets: [mailgunKey]
}, async (event) => {
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
                const amount = newData.price ? `$${(newData.price / 100).toFixed(2)}` : 'New Order';
                const sponsor = newData.sponsorName || 'A Sponsor';
                title = `💰 ${amount} from ${sponsor}!`;
                body = "You just got paid! 💸 Tap to review the script.";
                break;
            case "completed":
                title = `🚀 Order Completed for ${newData.sponsorName || 'Client'}`;
                body = "Great job! The order has been marked as completed. Keep up the momentum!";
                break;
        }

        if (title) {
            await sendNotification(creatorId, title, body);
        }

        // Send Email on Confirmation (Payment Successful)
        if (newData.status === 'confirmed') {
            // 1. Notify Creator
            const creatorUser = await db.collection("users").doc(creatorId).get();
            const creatorData = creatorUser.data();
            if (creatorData && creatorData.email) {
                await mailService.sendNewOrderEmailToCreator(creatorData.email, {
                    sponsorName: newData.sponsorName || 'A Sponsor',
                    productName: newData.productTitle || 'Product',
                    price: newData.price / 100,
                });
            }

            // 2. Notify Sponsor (Guest or User)
            let sponsorEmail = newData.sponsorEmail;
            if (!sponsorEmail && newData.sponsorId && newData.sponsorId !== 'guest') {
                // Fallback to fetching user if not on booking doc
                const sponsorUser = await db.collection("users").doc(newData.sponsorId).get();
                const sponsorData = sponsorUser.data();
                sponsorEmail = sponsorData?.email;
            }

            if (sponsorEmail) {
                await mailService.sendOrderThankYouEmailToSponsor(sponsorEmail, {
                    creatorName: newData.creatorName || 'Creator',
                    orderId: event.params.bookingId
                });
            }
        }

        // Send Email on Approval
        if (newData.status === 'approved' && newData.status !== oldData.status) {
            let sponsorEmail = newData.sponsorEmail;
            if (!sponsorEmail && newData.sponsorId && newData.sponsorId !== 'guest') {
                const sponsorUser = await db.collection("users").doc(newData.sponsorId).get();
                const sponsorData = sponsorUser.data();
                sponsorEmail = sponsorData?.email;
            }

            if (sponsorEmail) {
                await mailService.sendOrderApprovedEmail(sponsorEmail, {
                    creatorName: newData.creatorName || 'Creator',
                    orderId: event.params.bookingId
                });
            }
        }

        // Send Email on Rejection
        if (newData.status === 'rejected' && newData.status !== oldData.status) {
            let sponsorEmail = newData.sponsorEmail;
            if (!sponsorEmail && newData.sponsorId && newData.sponsorId !== 'guest') {
                const sponsorUser = await db.collection("users").doc(newData.sponsorId).get();
                const sponsorData = sponsorUser.data();
                sponsorEmail = sponsorData?.email;
            }

            if (sponsorEmail) {
                await mailService.sendOrderRejectedEmail(sponsorEmail, {
                    creatorName: newData.creatorName || 'Creator',
                    orderId: event.params.bookingId
                });
            }
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

    // Check for Proof of Post
    if (newData.verificationUrl && !oldData.verificationUrl && newData.sponsorId) {
        let emailToSendTo = newData.sponsorEmail;

        if (!emailToSendTo && newData.sponsorId !== 'guest') {
            const sponsorUser = await db.collection("users").doc(newData.sponsorId).get();
            const sponsorData = sponsorUser.data();
            emailToSendTo = sponsorData?.email;
        }

        if (emailToSendTo) {
            await mailService.sendProofOfPostEmail(emailToSendTo, {
                link: newData.verificationUrl
            });
        }
    }
});
