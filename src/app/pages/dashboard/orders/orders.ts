
import { Component, computed, inject, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Firestore, doc, updateDoc } from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AdSlot, Booking } from '../../../core/models';

import { CdkAccordionModule } from '@angular/cdk/accordion';
import { ClipboardModule } from '@angular/cdk/clipboard';

@Component({
  selector: 'app-orders',
  imports: [CommonModule, CdkAccordionModule, ClipboardModule],
  templateUrl: './orders.html',
  styleUrls: ['./orders.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Orders {
  private firestore = inject(Firestore);
  private functions = inject(Functions);

  // Inputs
  bookings = input.required<Booking[]>();
  slots = input.required<AdSlot[]>();

  // Outputs
  refreshData = output<void>();

  // State
  activeTab = signal<'active' | 'completed' | 'rejected'>('active');
  processingAction = signal<{ id: string, type: 'approve' | 'decline' | 'verify' } | null>(null);

  // Computed
  bookingsView = computed(() => {
    const slots = this.slots();
    return this.bookings().map(booking => {
      const slot = slots.find(s => s.slotId === booking.slotId);
      return {
        ...booking,
        displayPrice: slot ? slot.price / 100 : null
      };
    });
  });

  activeOrders = computed(() => {
    return this.bookingsView().filter(b => ['confirmed', 'approved', 'pending_approval'].includes(b.status));
  });

  completedOrders = computed(() => {
    return this.bookingsView().filter(b => b.status === 'completed');
  });

  rejectedOrders = computed(() => {
    return this.bookingsView().filter(b => b.status === 'rejected');
  });

  // Actions
  toggleTab(tab: 'active' | 'completed' | 'rejected') {
    this.activeTab.set(tab);
  }

  async approveBooking(bookingId: string) {
    if (this.processingAction()) return;

    try {
      this.processingAction.set({ id: bookingId, type: 'approve' });
      const approveFn = httpsCallable(this.functions, 'approveBooking');
      await approveFn({ bookingId });
      alert('Order approved and payment captured!');
      this.refreshData.emit();
    } catch (err: any) {
      console.error('Error approving booking', err);
      alert('Failed to approve booking: ' + (err.message || 'Unknown error'));
    } finally {
      this.processingAction.set(null);
    }
  }

  async declineBooking(booking: Booking) {
    if (this.processingAction()) return;

    if (!confirm('Are you sure you want to decline this booking? This will refund the sponsor 100% and release the slot back to the market.')) return;

    this.processingAction.set({ id: booking.bookingId, type: 'decline' });
    const declineFn = httpsCallable(this.functions, 'declineBooking');

    try {
      await declineFn({ bookingId: booking.bookingId });
      alert('Booking declined and refunded.');
      this.refreshData.emit();
    } catch (err: any) {
      console.error('Decline error', err);
      alert('Failed to decline booking: ' + err.message);
    } finally {
      this.processingAction.set(null);
    }
  }

  async saveVerification(bookingId: string, url: string) {
    if (!url || this.processingAction()) return;

    try {
      this.processingAction.set({ id: bookingId, type: 'verify' });
      const bookingRef = doc(this.firestore, 'bookings', bookingId);
      await updateDoc(bookingRef, {
        verificationUrl: url,
        status: 'completed'
      });
      alert('Verification link saved and order completed!');
      this.refreshData.emit();
    } catch (err) {
      console.error('Error saving verification', err);
      alert('Failed to save link.');
    } finally {
      this.processingAction.set(null);
    }
  }

  onScriptCopied(success: boolean) {
    if (success) {
      alert('Script copied to clipboard!');
    } else {
      alert('Failed to copy script.');
    }
  }

  async downloadImage(url: string) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = 'brand-logo'; // Default filename, browser might detect extension
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      console.error('Download failed', err);
      // Fallback to opening in new tab
      window.open(url, '_blank');
    }
  }

  getExpiryStatus(createdAt: any) {
    if (!createdAt) return null;

    const created = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
    const now = new Date();
    const expiresAt = new Date(created.getTime() + (7 * 24 * 60 * 60 * 1000));
    const diffMs = expiresAt.getTime() - now.getTime();

    if (diffMs <= 0) {
      return { expired: true, text: 'EXPIRED', isUrgent: true };
    }

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    let text = '';
    if (days > 0) {
      text = `Expires in ${days} day${days === 1 ? '' : 's'}`;
    } else {
      text = `Expires in ${hours} hour${hours === 1 ? '' : 's'}`;
    }

    return {
      expired: false,
      text,
      isUrgent: days < 2
    };
  }
}
