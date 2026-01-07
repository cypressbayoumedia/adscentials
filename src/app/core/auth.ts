import { Injectable, inject, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { 
  Auth, 
  authState, 
  signOut, 
  user, 
  updateProfile, 
  updateEmail, 
  deleteUser, 
  EmailAuthProvider, 
  linkWithCredential 
} from '@angular/fire/auth';
import { 
  Firestore, 
  doc, 
  docData, 
  setDoc, 
  updateDoc 
} from '@angular/fire/firestore';
import { switchMap, of, catchError } from 'rxjs';
//import { Snacks } from './snacks'; // Assuming path
import { User } from './user'; // Keeping your import

// Define a stricter type for what we save to Firestore
export interface UserProfile extends User {
  uid: string;
  photoURL?: string | null;
  email?: string | null;
  createdAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // 1. Modern Injection
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly router = inject(Router);
  //private readonly snack = inject(Snacks);

  // 2. State Management via Signals
  // 'user' from @angular/fire/auth returns an observable of the auth state
  private readonly authUser$ = user(this.auth);

  // Combine Auth State with Firestore Data
  // We explicitly type the Observable stream to ensure safety
  readonly user$ = this.authUser$.pipe(
    switchMap((firebaseUser) => {
      if (!firebaseUser) return of(null);
      
      // Real-time listener to the Firestore user document
      return docData(doc(this.firestore, 'users', firebaseUser.uid)) as any; 
      // Note: Cast as 'any' or your specific 'User' type if docData infers incorrectly
    }),
    catchError((err) => {
      console.error('Auth Error:', err);
      return of(null);
    })
  );

  // Convert Observable to Signal for easy template usage: {{ auth.currentUser()?.displayName }}
  readonly currentUser = toSignal<UserProfile | null>(this.user$, { initialValue: null });

  // Computed signals for specific properties (replaces your manual signals)
  readonly userId = computed(() => this.currentUser()?.uid ?? null);
  readonly photoUrl = computed(() => this.currentUser()?.photoURL ?? null);
  readonly joinedAt = computed(() => this.auth.currentUser?.metadata.creationTime ?? null);

  // 3. Actions using Async/Await

  async setUserData(firebaseUser: any): Promise<void> {
    if (!firebaseUser) return;

    const userRef = doc(this.firestore, `users/${firebaseUser.uid}`);
    
    const userData: UserProfile = {
      uid: firebaseUser.uid,
      photoURL: firebaseUser.photoURL,
      email: firebaseUser.email,
      // Add other default fields here
    };

    try {
      await setDoc(userRef, userData, { merge: true });
    } catch (error) {
      console.error('Error setting user data:', error);
    //  this.snack.show_message('Failed to save user data.');
    }
  }

  async updatePhoto(photoURL: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      // 1. Update Auth Profile (so it shows up immediately in some auth contexts)
      await updateProfile(user, { photoURL });
      
      // 2. Update Firestore Document (so it persists in your DB)
      const userRef = doc(this.firestore, 'users', user.uid);
      await updateDoc(userRef, { photoURL });

     // this.snack.show_message('pfp Saved!');
      // Best practice: Don't force navigation in service unless necessary
      // this.router.navigate(['/home']); 
    } catch (error) {
      console.error(error);
    //  this.snack.show_message("Can't save pfp");
    }
  }

  async updateEmailAddress(newEmail: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      await updateEmail(user, newEmail);
     // this.snack.show_message('Email Updated!');
    } catch (error) {
      console.error(error);
    //  this.snack.show_message("Can't update email. You may need to re-login.");
    }
  }

  async signOut(): Promise<void> {
    try {
      await signOut(this.auth);
     // this.snack.show_message('Signed out');
      this.router.navigate(['/']);
    } catch (error) {
     // this.snack.show_message("Can't sign out");
    }
  }

  // Legacy Re-auth logic updated
  async reauthenticate(email: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      const credential = EmailAuthProvider.credentialWithLink(email, window.location.href);
      await linkWithCredential(user, credential);
      //this.snack.show_message('Account linked successfully');
    } catch (error) {
      console.error(error);
      //this.snack.show_message('Re-authentication failed');
    }
  }

  async deleteProfile(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    // Note: 'confirm' blocks the thread. Consider using a custom UI dialog.
    if (!confirm('Are you sure you want to delete your account? This cannot be undone.')) {
      return;
    }

    try {
      // Optional: Delete Firestore data first if security rules allow
      // await deleteDoc(doc(this.firestore, 'users', user.uid));
      
      await deleteUser(user);
     // this.snack.show_message('Account deleted');
      this.router.navigate(['/']);
    } catch (error) {
      console.error(error);
      //this.snack.show_message('Delete failed. You may need to re-login first.');
    }
  }

  // Helper Checks
  isAuthenticated(): boolean {
    return !!this.auth.currentUser;
  }

  isOwner(uid: string): boolean {
    return this.auth.currentUser?.uid === uid;
  }
}