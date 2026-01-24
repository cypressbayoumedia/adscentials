
import { Timestamp } from '@angular/fire/firestore';

export interface Creator {
    uid: string;
    handle: string;
    displayName: string;
    stripeAccountId?: string;
    stripeConnected?: boolean;
    stripeRestricted?: boolean;
    bio?: string;
    profileImage?: string;
    settings?: {
        autoApprove: boolean;
        defaultCurrency: string;
    };
}

export type SlotStatus = 'available' | 'pending' | 'sold' | 'completed';

export interface SlotTemplate {
    templateId: string;
    creatorId: string;
    name: string;
    title: string;
    description?: string;
    price: number;
}

export interface AdSlot {
    slotId: string;
    creatorId: string;
    date: Timestamp;
    title: string;       // NEW: Custom title
    description?: string; // NEW: Custom description
    price: number; // in cents
    status: SlotStatus;
    reservedUntil?: Timestamp;
}

export type BookingStatus = 'pending_payment' | 'confirmed' | 'pending_approval' | 'approved' | 'rejected' | 'completed';

export interface BookingSubmission {
    script: string;
    targetUrl: string;
    logoUrl?: string;
    instructions?: string; // pronunciation, vibe, do's/don'ts
    attachments?: string[];
    sponsorName?: string;
}

export interface AIVettingResult {
    safetyScore: number;
    summary: string;
    flagged: boolean;
}

export interface Booking {
    bookingId: string;
    slotId: string;
    creatorId: string;
    creatorName?: string; // Cache: for emails
    creatorHandle?: string; // NEW: for links
    sponsorId: string;
    sponsorName?: string; // Cache: for emails
    sponsorEmail?: string; // NEW: For guest checkout
    productTitle?: string;// Cache: for emails
    price?: number;       // Cache: for emails
    status: BookingStatus;
    submission: BookingSubmission;
    aiVetting?: AIVettingResult;
    stripeSessionId?: string;
    verificationUrl?: string; // proof of post link
    createdAt: Timestamp;
}
