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
  linkWithCredential,
  signInWithPopup,
  signInAnonymously,
  linkWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  User as FireUser
} from '@angular/fire/auth';
import {
  Firestore,
  doc,
  onSnapshot,
  setDoc,
  updateDoc
} from '@angular/fire/firestore';
import { switchMap, of, catchError, Observable } from 'rxjs';

import { User } from './user'; // Keeping your import

// Define a stricter type for what we save to Firestore
export interface UserProfile extends User {
  uid: string;
  photoURL?: string | null;
  displayName?: string | null;
  email?: string | null;
  stripeConnected?: boolean;
  stripeRestricted?: boolean;
  createdAt?: string;
  bio?: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // 1. Modern Injection
  private readonly auth = inject(Auth);
  private readonly firestore = inject(Firestore);
  private readonly router = inject(Router);


  // 2. State Management via Signals
  // 'user' from @angular/fire/auth returns an observable of the auth state
  private readonly authUser$ = user(this.auth);

  // Combine Auth State with Firestore Data
  // We explicitly type the Observable stream to ensure safety
  readonly user$: Observable<UserProfile | null> = this.authUser$.pipe(
    switchMap((firebaseUser) => {
      if (!firebaseUser) return of(null);

      // Real-time listener to the Firestore user document
      // Using direct onSnapshot to avoid issues with docData helper
      return new Observable<UserProfile>((observer) => {
        const ref = doc(this.firestore, 'users', firebaseUser.uid);
        const unsubscribe = onSnapshot(ref, {
          next: (snap) => observer.next(snap.data() as UserProfile),
          error: (err) => observer.error(err)
        });
        return unsubscribe; // Cleanup on unsubscribe
      });
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

  async login(email: string, pass: string): Promise<void> {
    const credential = await signInWithEmailAndPassword(this.auth, email, pass);
    await this.setUserData(credential.user);
    // No explicit navigation needed if used in component that handles it, 
    // but consistent behavior suggests we might want to let component handle routing or do it here.
    // My LoginComponent handles routing. I'll just return void.
  }

  async signup(email: string, pass: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(this.auth, email, pass);
    await this.setUserData(credential.user);
    // Signup usually redirects to onboarding or home. Component will handle.
  }

  async googleSignin(): Promise<void> {
    const provider = new GoogleAuthProvider();
    try {
      const credential = await signInWithPopup(this.auth, provider);
      await this.setUserData(credential.user);
      // Removed automatic navigation
    } catch (error) {
      console.error('Google Sign-In Error:', error);
    }
  }

  async anonymousLogin(): Promise<void> {
    try {
      const credential = await signInAnonymously(this.auth);
      await this.setUserData(credential.user);
      // Removed automatic navigation
    } catch (error) {
      console.error('Anonymous Login Error:', error);
    }
  }

  async upgradeToGoogle(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    const provider = new GoogleAuthProvider();

    try {
      const credential = await linkWithPopup(user, provider);
      await this.setUserData(credential.user);
      // No navigation needed, staying on same context usually
    } catch (error) {
      console.error('Error linking Google account:', error);
    }
  }

  async upgradeToEmail(email: string, password: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      const credential = EmailAuthProvider.credential(email, password);
      await linkWithCredential(user, credential);
      await this.setUserData(user);
    } catch (error) {
      console.error('Error linking Email account:', error);
    }
  }

  async setUserData(firebaseUser: FireUser): Promise<void> {
    if (!firebaseUser) return;

    const userRef = doc(this.firestore, `users/${firebaseUser.uid}`);

    const userData: UserProfile = {
      uid: firebaseUser.uid,
      photoURL: firebaseUser.photoURL,
      displayName: firebaseUser.displayName,
      email: firebaseUser.email,
      // Add other default fields here
    };

    try {
      await setDoc(userRef, userData, { merge: true });
    } catch (error) {
      console.error('Error setting user data:', error);
    }
  }

  async updateUserDoc(data: Partial<UserProfile>): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      const userRef = doc(this.firestore, `users/${user.uid}`);
      await updateDoc(userRef, data);
    } catch (error) {
      console.error('Error updating user doc:', error);
      throw error;
    }
  }

  async updateProfile(data: { displayName?: string; photoURL?: string }): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      await updateProfile(user, data);
      // Refresh user data from the auth state to ensure we have the latest properties
      if (this.auth.currentUser) {
        await this.setUserData(this.auth.currentUser);
      }

      const userRef = doc(this.firestore, `users/${user.uid}`);
      await updateDoc(userRef, data);
    } catch (error) {
      console.error('Update Profile Error:', error);
      throw error;
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
    } catch (error) {
      console.error(error);
    }
  }

  async updateEmailAddress(newEmail: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      await updateEmail(user, newEmail);
    } catch (error) {
      console.error(error);
    }
  }

  async signOut(): Promise<void> {
    try {
      await signOut(this.auth);
      this.router.navigate(['/entry/login']);
    } catch (error) {
      console.error(error);
    }
  }

  // Legacy Re-auth logic updated
  async reauthenticate(email: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      const credential = EmailAuthProvider.credentialWithLink(email, window.location.href);
      await linkWithCredential(user, credential);
    } catch (error) {
      console.error(error);
    }
  }

  async deleteProfile(): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) return;

    try {
      // Optional: Delete Firestore data first if security rules allow
      // await deleteDoc(doc(this.firestore, 'users', user.uid));

      await deleteUser(user);
      this.router.navigate(['/entry/login']);
    } catch (error) {
      console.error(error);
    }
  }


  async reloadUser(): Promise<void> {
    const user = this.auth.currentUser;
    if (user) {
      await user.reload();
      // Force update our local signal/stream if needed, though onSnapshot handles Firestore part.
      // This is mainly to get fresh claims/token if needed.
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