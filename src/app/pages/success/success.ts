import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Booking } from '../../core/models';

@Component({
    selector: 'app-success',
    imports: [CommonModule, RouterLink],
    styleUrls: ['./success.css'],
    template: `
    <div class="success-container">
      <div class="success-card">
        
        <!-- Icon -->
        <div class="success-icon">
          <span class="material-symbols-rounded text-3xl">check</span>
        </div>

        <h1 class="title">Payment Successful!</h1>
        <p class="subtitle">Your order has been placed and is waiting for approval.</p>

        @if (loading()) {
            <div class="loading-skeleton">
                <div class="skeleton-bar-lg"></div>
                <div class="skeleton-bar-md"></div>
            </div>
        } @else if (error()) {
            <div class="error-box">
                {{ error() }}
            </div>
            <a routerLink="/" class="btn-primary">
                Return Home
            </a>
        } @else if (booking(); as b) {
            <div class="order-details-box">
                <div class="detail-row">
                    <span class="detail-label">ORDER ID</span>
                    <span class="detail-value-mono">#{{ b.bookingId.slice(0, 8) }}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">PRODUCT</span>
                    <span class="detail-value">{{ b.productTitle }}</span>
                </div>
                 <div class="detail-row">
                    <span class="detail-label">CREATOR</span>
                    <span class="detail-value">{{ b.creatorName }}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">AMOUNT</span>
                    @if (b.price) {
                        <span class="detail-value">{{ b.price / 100 | currency }}</span>
                    }
                </div>
                
                     <span class="status-badge">
                        {{ getStatusLabel(b.status) }}
                     </span>
            </div>

            <div class="actions">
                <a [routerLink]="['/u', b.creatorId]" class="btn-primary">
                   Shop More from {{ b.creatorName }}
                </a>
                
                <a routerLink="/" class="btn-secondary">
                    Return to Home
                </a>
            </div>
        }
      </div>
    </div>
  `
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
}
