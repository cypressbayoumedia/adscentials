
import { Injectable, inject } from '@angular/core';
import { Firestore, collection, doc, setDoc, deleteDoc, query, where, getDocs, orderBy, Timestamp, addDoc, onSnapshot, writeBatch } from '@angular/fire/firestore';
import { Observable, from, map } from 'rxjs';
import { AdSlot, SlotTemplate, Booking } from './models';

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
            orderBy('date', 'desc')
        );
        // Using snapshot listener for consistency
        return new Observable<AdSlot[]>(observer => {
            return onSnapshot(q, (snap) => {
                const slots = snap.docs.map(doc => doc.data() as AdSlot);
                observer.next(slots);
            }, (error: unknown) => observer.error(error));
        });
    }

    async createSlot(slot: Omit<Partial<AdSlot>, 'date'> & { date: any }) {
        const slotsRef = collection(this.firestore, 'adSlots');
        const newDocRef = doc(slotsRef);

        let finalDate: Timestamp;
        if (typeof slot.date === 'string') {
            finalDate = Timestamp.fromDate(new Date(slot.date));
        } else if (slot.date instanceof Date) {
            finalDate = Timestamp.fromDate(slot.date);
        } else {
            finalDate = slot.date;
        }

        await setDoc(newDocRef, { ...slot, date: finalDate, slotId: newDocRef.id });
        return newDocRef.id;
    }

    async batchCreateSlots(slots: (Omit<Partial<AdSlot>, 'date'> & { date: any })[]) {
        const batchOp = writeBatch(this.firestore);

        slots.forEach(slot => {
            const slotsRef = collection(this.firestore, 'adSlots');
            const newDocRef = doc(slotsRef);

            let finalDate: Timestamp;
            if (typeof slot.date === 'string') {
                finalDate = Timestamp.fromDate(new Date(slot.date));
            } else if (slot.date instanceof Date) {
                finalDate = Timestamp.fromDate(slot.date);
            } else {
                finalDate = slot.date;
            }

            batchOp.set(newDocRef, { ...slot, date: finalDate, slotId: newDocRef.id });
        });

        await batchOp.commit();
    }

    async updateSlot(slotId: string, data: Omit<Partial<AdSlot>, 'date'> & { date?: any }) {
        const slotRef = doc(this.firestore, 'adSlots', slotId);

        const updateData: Record<string, any> = { ...data };
        if (updateData['date']) {
            if (typeof updateData['date'] === 'string') {
                updateData['date'] = Timestamp.fromDate(new Date(updateData['date']));
            } else if (updateData['date'] instanceof Date) {
                updateData['date'] = Timestamp.fromDate(updateData['date']);
            }
        }

        await setDoc(slotRef, updateData, { merge: true });
    }

    async deleteSlot(slotId: string) {
        const slotRef = doc(this.firestore, 'adSlots', slotId);
        await deleteDoc(slotRef);
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
            }, (error: unknown) => observer.error(error));
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
            }, (error: unknown) => observer.error(error));
        });
    }

    async createTemplate(template: Partial<SlotTemplate>) {
        const ref = collection(this.firestore, 'slotTemplates');
        const newDocRef = doc(ref);
        // We set templateId in the data for redundancy, but the query populates it from doc.id too
        await setDoc(newDocRef, { ...template, templateId: newDocRef.id });
        return newDocRef.id;
    }

    async updateTemplate(templateId: string, data: Partial<SlotTemplate>) {
        const ref = doc(this.firestore, 'slotTemplates', templateId);
        await setDoc(ref, data, { merge: true });
    }

    async deleteTemplate(templateId: string) {
        const ref = doc(this.firestore, 'slotTemplates', templateId);
        await deleteDoc(ref);
    }


}
