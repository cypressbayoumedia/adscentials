
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './auth';
import { filter, map, take } from 'rxjs/operators';

export const onboardingGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    return authService.user$.pipe(
        // user$ might emit null if not logged in, or the UserProfile if logged in.
        // We filter for undefined just in case, but null is valid (not logged in).
        // If not logged in, we redirect to login.
        take(1),
        map(user => {
            if (!user) {
                return router.createUrlTree(['/entry/login']);
            }

            // If they are logged in, checkisOnboarded
            if (user.isOnboarded) {
                return true;
            } else {
                return router.createUrlTree(['/entry/onboarding']);
            }
        })
    );
};
