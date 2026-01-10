
import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from './auth';
import { toObservable } from '@angular/core/rxjs-interop';
import { map, take, filter, switchMap } from 'rxjs/operators';
import { interval, of, timer } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    // We need to wait for the auth state to resolve. 
    // utilizing the user$ observable is safer than auth.currentUser directly on load
    return authService.user$.pipe(
        // We might get null initially if it's still loading, but user$ in auth.ts 
        // is piped from authState(auth), which emits null if not logged in.
        // However, the initial emission of authState might take a tick.
        take(1),
        map(user => {
            const isAuth = !!user;
            if (isAuth) {
                return true;
            } else {
                return router.createUrlTree(['/entry/login']);
            }
        })
    );
};
