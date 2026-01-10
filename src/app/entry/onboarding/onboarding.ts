
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, FormControl } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth';
import { Firestore, doc, getDoc, setDoc, writeBatch } from '@angular/fire/firestore';
import { debounceTime, distinctUntilChanged, switchMap, filter, takeUntil, tap } from 'rxjs/operators';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { of, timer } from 'rxjs';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.css',
})
export class Onboarding {
  private fb = inject(FormBuilder);
  public auth = inject(AuthService);
  private router = inject(Router);
  private firestore = inject(Firestore);


  // Prefill with existing data if available
  currentUser = this.auth.currentUser;

  // Form Control with strict validation
  // Merging user's handle logic with existing form
  form = this.fb.group({
    displayName: [this.currentUser()?.displayName || '', [Validators.required, Validators.minLength(2), Validators.maxLength(50)]],
    bio: [this.currentUser()?.bio || '', [Validators.maxLength(160)]],
    handle: ['', {
      validators: [
        Validators.required,
        Validators.minLength(3),
        Validators.pattern(/^[a-z0-9-]+$/)
      ]
    }],
    photoURL: [this.currentUser()?.photoURL || '']
  });

  get handleControl() {
    return this.form.get('handle') as FormControl;
  }

  // Signals for UI State
  isLoading = signal(false);
  errorMessage = signal<string | null>(null);
  isChecking = signal(false);
  handleAvailable = signal<boolean | null>(null);

  constructor() {
    // Handle Availability Checker
    this.handleControl.valueChanges.pipe(
      debounceTime(500),
      distinctUntilChanged(),
      tap(() => {
        // Reset status on change before checking
        this.handleAvailable.set(null);
        this.errorMessage.set(null);
      }),
      filter(value => this.handleControl.valid && !!value),
      tap(() => this.isChecking.set(true)),
      switchMap(handle => {
        const handleRef = doc(this.firestore, 'handles', handle);
        return getDoc(handleRef);
      }),
      takeUntilDestroyed()
    ).subscribe({
      next: (docSnap) => {
        this.isChecking.set(false);
        this.handleAvailable.set(!docSnap.exists());
      },
      error: (err) => {
        console.error('Check failed', err);
        this.isChecking.set(false);
        this.handleAvailable.set(false);
      }
    });

    // If handle becomes invalid, reset availability
    this.handleControl.statusChanges.pipe(takeUntilDestroyed()).subscribe(status => {
      if (status === 'INVALID') {
        this.handleAvailable.set(null);
      }
    });
  }

  async submit() {
    if (this.form.invalid) return;

    // Check specific handle availability one last time? 
    // Usually rely on the validator or the signal. 
    // If handleAvailable is false, block.
    if (this.handleAvailable() === false) {
      this.errorMessage.set('Handle is already taken.');
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    const { displayName, photoURL, handle, bio } = this.form.getRawValue();
    const uid = this.currentUser()?.uid;

    try {
      if (!handle || !uid) throw new Error('Handle and UID are required');

      // 1. Auth Update (DisplayName & PhotoURL)
      const updateData: any = {
        displayName: displayName || null,
        photoURL: photoURL || null
      };
      await this.auth.updateProfile(updateData);

      // 2. Atomic Firestore Update (Claim Handle & Update User Profile)
      const batch = writeBatch(this.firestore);

      const handleRef = doc(this.firestore, 'handles', handle);
      batch.set(handleRef, { uid });

      const userRef = doc(this.firestore, `users/${uid}`);
      batch.set(userRef, {
        handle,
        displayName: displayName || null,
        photoURL: photoURL || null,
        bio: bio || null,
        isOnboarded: true
      }, { merge: true });

      await batch.commit();

      // Navigate to dashboard immediately
      this.router.navigate(['/home']);
    } catch (err: any) {
      console.error('Onboarding Error:', err);
      this.errorMessage.set(err.message || 'Failed to setup profile');
    } finally {
      this.router.navigate(['/home']);
      this.isLoading.set(false);
    }
  }
}
