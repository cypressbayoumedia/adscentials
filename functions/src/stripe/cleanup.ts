import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import { Timestamp } from "firebase-admin/firestore";
import { db } from "../init";

/**
 * Cleanup Expired Slots
 * Runs every 15 minutes.
 * Checks for slots that are 'pending' AND reservedUntil < now.
 * Resets them to 'available'.
 */
export const cleanupExpiredSlots = onSchedule("every 15 minutes", async (event) => {
    try {
        const now = Timestamp.now();

        // Query for expired pending slots
        const snapshot = await db.collection('adSlots')
            .where('status', '==', 'pending')
            .where('reservedUntil', '<', now)
            .get();

        if (snapshot.empty) {
            logger.info("No expired slots found to cleanup.");
            return;
        }

        const batch = db.batch();
        let count = 0;

        snapshot.forEach(doc => {
            batch.update(doc.ref, {
                status: 'available',
                reservedUntil: null
            });
            count++;
        });

        await batch.commit();
        logger.info(`Cleaned up ${count} expired slots.`);

    } catch (error) {
        logger.error("Error cleaning up expired slots", error);
    }
});
