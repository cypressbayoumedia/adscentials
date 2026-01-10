import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../core/auth';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormControl, Validators } from '@angular/forms';

@Component({
    selector: 'app-settings',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './settings.html',
    styleUrl: './settings.css'
})
export class Settings {
    auth = inject(AuthService);
    functions = inject(Functions);
    router = inject(Router);

    user = this.auth.currentUser;
    isLoadingStripe = signal(false);

    // Bio Form Control
    // Initialize with current bio or empty string
    bioControl = new FormControl('', [Validators.maxLength(160)]);
    isSavingBio = signal(false);
    bioMessage = signal<string | null>(null);

    constructor() {
        // Sync control with user data when it loads
        effect(() => {
            const bio = this.user()?.bio;
            if (bio !== undefined && !this.bioControl.dirty) {
                this.bioControl.setValue(bio || '');
            }
        });
    }

    async saveBio() {
        if (this.bioControl.invalid) return;

        this.isSavingBio.set(true);
        this.bioMessage.set(null);

        try {
            await this.auth.updateUserDoc({ bio: this.bioControl.value });
            this.bioMessage.set('Bio updated successfully!');

            // Clear success message after 3 seconds
            setTimeout(() => this.bioMessage.set(null), 3000);
        } catch (err) {
            console.error('Save Bio Error', err);
            this.bioMessage.set('Failed to save bio.');
        } finally {
            this.isSavingBio.set(false);
        }
    }

    async openStripePortal() {
        this.isLoadingStripe.set(true);
        const createStripeLoginLink = httpsCallable(this.functions, 'createStripeLoginLink');

        try {
            const result: any = await createStripeLoginLink({});
            if (result.data.url) {
                window.location.href = result.data.url;
            }
        } catch (err) {
            console.error('Stripe Portal Error', err);
            alert('Failed to open Stripe Portal. See console.');
        } finally {
            this.isLoadingStripe.set(false);
        }
    }

    goBack() {
        this.router.navigate(['/home']);
    }
}
