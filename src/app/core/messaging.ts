
import { Injectable, inject, signal } from '@angular/core';
import { Messaging, getToken, onMessage } from '@angular/fire/messaging';
import { AuthService } from './auth';
import { Firestore, doc, updateDoc, arrayUnion } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

@Injectable({
    providedIn: 'root'
})
export class MessagingService {
    private messaging = inject(Messaging);
    private auth = inject(AuthService);
    private firestore = inject(Firestore);

    currentMessage = signal<any>(null);

    constructor() {
        // Listen for foreground messages
        onMessage(this.messaging, (payload) => {
            console.log('Message received. ', payload);
            this.currentMessage.set(payload);
            // Optional: Show a toast/snackbar here since we are in foreground
        });
    }

    async requestPermission() {
        const user = this.auth.currentUser();
        if (!user) return;

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                // VAPID key is optional if using default setup, but good to have if issues arise.
                // For now, we'll try without explicit VAPID or use the one from console if needed.
                // Using correct service worker registration scope is important.

                const token = await getToken(this.messaging, {
                    // vapidKey: '<YOUR_PUBLIC_VAPID_KEY>', // Optional: Get from Project Settings > Cloud Messaging > Web configuration
                });

                if (token) {
                    console.log('FCM Token:', token);
                    await this.saveToken(user.uid, token);
                    return token;
                }
            } else {
                console.log('Notification permission denied');
            }
        } catch (error) {
            console.error('Unable to get permission to notify.', error);
        }
        return null;
    }

    private async saveToken(uid: string, token: string) {
        const userRef = doc(this.firestore, 'users', uid);
        await updateDoc(userRef, {
            fcmTokens: arrayUnion(token)
        });
    }
}
