import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Booking } from '../../core/models';

@Component({
    selector: 'app-success',
    imports: [CommonModule, RouterLink],
    styleUrls: ['./success.css'],
    templateUrl: './success.html'
})
export class Success implements OnInit {
    private route = inject(ActivatedRoute);
    private functions = inject(Functions);

    loading = signal(true);
    error = signal<string | null>(null);
    booking = signal<Booking | null>(null);

    async ngOnInit() {
        const sessionId = this.route.snapshot.queryParamMap.get('session_id');

        if (!sessionId) {
            this.error.set('No session ID found.');
            this.loading.set(false);
            return;
        }

        try {
            const getBooking = httpsCallable(this.functions, 'getBookingBySession');
            const result = await getBooking({ sessionId }) as { data: Booking };
            this.booking.set(result.data);
        } catch (err: unknown) {
            console.error(err);
            this.error.set('Unable to load order details.');
        } finally {
            this.loading.set(false);
        }
    }

    getStatusLabel(status: string): string {
        if (status === 'confirmed') return 'PENDING APPROVAL';
        return status.toUpperCase().replace('_', ' ');
    }

    toDate(val: any): Date | null {
        if (!val) return null;
        if (val.toDate) return val.toDate();
        if (val._seconds) return new Date(val._seconds * 1000);
        return new Date(val);
    }

    printReceipt() {
        window.print();
    }
}
