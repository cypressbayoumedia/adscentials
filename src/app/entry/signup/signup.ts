
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './signup.html',
  styleUrl: './signup.css',
})
export class Signup {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: this.passwordMatchValidator });

  errorMessage = signal<string | null>(null);
  isLoading = signal(false);

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    return password === confirmPassword ? null : { mismatch: true };
  }

  async signup() {
    if (this.form.invalid) return;
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.form.getRawValue();

    try {
      await this.auth.signup(email, password);
      // Redirect to onboarding after signup
      this.router.navigate(['/entry/onboarding']);
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Signup failed.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async googleParams() {
    try {
      await this.auth.googleSignin();
      this.router.navigate(['/entry/onboarding']);
    } catch (err: any) {
      this.errorMessage.set(err.message);
    }
  }
}
