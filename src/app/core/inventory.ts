
import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, setDoc, deleteDoc, query, where, getDocs, orderBy, Timestamp, addDoc, onSnapshot } from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';
import { AdSlot, SlotPlatform, SlotType, SlotTemplate, Booking } from './models';

@Injectable({
    providedIn: 'root'
})
export class InventoryService {
    private firestore = inject(Firestore);

    getSlots(creatorId: string): Observable<AdSlot[]> {
        const slotsRef = collection(this.firestore, 'adSlots');
        const q = query(
            slotsRef,
            where('creatorId', '==', creatorId),
            orderBy('date', 'asc')
        );
        // Using snapshot listener for consistency
        return new Observable<AdSlot[]>(observer => {
            return onSnapshot(q, (snap) => {
                const slots = snap.docs.map(doc => doc.data() as AdSlot);
                observer.next(slots);
            }, (error) => observer.error(error));
        });
    }

    async createSlot(slot: any) {
        const slotsRef = collection(this.firestore, 'adSlots');
        const newDocRef = doc(slotsRef);

        // Ensure date is a Date object (Firestore handles usage of Date)
        let finalDate = slot.date;
        if (typeof slot.date === 'string') {
            finalDate = new Date(slot.date);
        }

        await setDoc(newDocRef, { ...slot, date: finalDate, slotId: newDocRef.id });
        return newDocRef.id;
    }

    // Templates
    getTemplates(creatorId: string): Observable<SlotTemplate[]> {
        const templatesRef = collection(this.firestore, 'slotTemplates');
        const q = query(templatesRef, where('creatorId', '==', creatorId));

        return new Observable<SlotTemplate[]>(observer => {
            return onSnapshot(q, (snap) => {
                const templates = snap.docs.map(doc => ({
                    ...doc.data(),
                    templateId: doc.id
                })) as SlotTemplate[];
                observer.next(templates);
            }, (error) => observer.error(error));
        });
    }

    getBookings(creatorId: string): Observable<Booking[]> {
        const bookingsRef = collection(this.firestore, 'bookings');
        const q = query(bookingsRef, where('creatorId', '==', creatorId), orderBy('createdAt', 'desc'));

        return new Observable<Booking[]>(observer => {
            return onSnapshot(q, (snap) => {
                const bookings = snap.docs.map(doc => ({
                    ...doc.data(),
                    bookingId: doc.id
                })) as Booking[];
                observer.next(bookings);
            }, (error) => observer.error(error));
        });
    }

    async createTemplate(template: Partial<SlotTemplate>) {
        const ref = collection(this.firestore, 'slotTemplates');
        const newDocRef = doc(ref);
        // We set templateId in the data for redundancy, but the query populates it from doc.id too
        await setDoc(newDocRef, { ...template, templateId: newDocRef.id });
        return newDocRef.id;
    }

    async deleteTemplate(templateId: string) {
        const ref = doc(this.firestore, 'slotTemplates', templateId);
        await deleteDoc(ref);
    }


}
