
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);

  form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  errorMessage = signal<string | null>(null);
  isLoading = signal(false);

  async login() {
    if (this.form.invalid) return;
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.form.getRawValue();

    try {

      await this.auth.login(email, password); // This will error until I fix AuthService
      this.router.navigate(['/home']);
    } catch (err: any) {
      this.errorMessage.set(err.message || 'Login failed.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async googleParams() {
    try {
      await this.auth.googleSignin();
      this.router.navigate(['/home']);
    } catch (err: any) {
      this.errorMessage.set(err.message);
    }
  }

  async anonLogin() {
    try {
      await this.auth.anonymousLogin();
      this.router.navigate(['/home']);
    } catch (err: any) {
      this.errorMessage.set(err.message);
    }
  }
}
