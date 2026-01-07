export interface User {
    // Standard Firebase Auth fields
    uid: string;
    email?: string | null;
    photoURL?: string | null;
    displayName?: string | null;
    emailVerified?: boolean;
  
    // Adscentials Specific Fields
    handle?: string;           // The unique username (e.g., 'bayou-conversations')
    stripeAccountId?: string;  // Connected Stripe Express Account ID for payouts
    isOnboarded?: boolean;     // Has completed the profile/handle setup
    
    // Optional: Role management if you plan to have Admins later
    roles?: {
      creator?: boolean;
      sponsor?: boolean;
      admin?: boolean;
    };
    
    // Metadata
    createdAt?: any; // Timestamp
    lastLogin?: any; // Timestamp
  }