import { inject } from '@angular/core';
import { Routes, Router } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { onboardingGuard } from './core/onboarding.guard';

import { canActivate, redirectLoggedInTo } from '@angular/fire/auth-guard';

const redirectLoggedInToDashboard = () => redirectLoggedInTo(['dashboard']);

export const routes: Routes = [
    {
        path: 'success',
        title: 'Order Success',
        loadComponent: () => import('./pages/success/success').then(m => m.Success)
    },
    {
        path: '',
        title: 'Sell Ad Inventory',
        loadComponent: () => import('./pages/landing/landing').then(m => m.Landing)
    },
    {
        path: 'entry',
        children: [
            {
                path: 'login',
                title: 'Login',
                loadComponent: () => import('./entry/login/login').then(m => m.Login),
                ...canActivate(redirectLoggedInToDashboard)
            },
            {
                path: 'signup',
                title: 'Start Selling',
                loadComponent: () => import('./entry/signup/signup').then(m => m.Signup),
                ...canActivate(redirectLoggedInToDashboard)
            },
            {
                path: 'onboarding',
                title: 'Setup Profile',
                canActivate: [authGuard],
                loadComponent: () => import('./entry/onboarding/onboarding').then(m => m.Onboarding)
            }
        ]
    },
    {
        path: 'home',
        redirectTo: 'dashboard',
        pathMatch: 'full'
    },
    {
        path: 'dashboard',
        title: 'Dashboard',
        canActivate: [onboardingGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard)
    },
    {
        path: 'settings',
        title: 'Account Settings',
        canActivate: [onboardingGuard],
        loadComponent: () => import('./pages/settings/settings').then(m => m.Settings)
    },

    {
        path: 'orders',
        canActivate: [() => inject(Router).createUrlTree(['/dashboard'], { queryParams: { tab: 'orders' } })],
        loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard)
    },

    {
        path: 'legal',
        children: [
            {
                path: 'terms',
                title: 'Terms of Service',
                loadComponent: () => import('./pages/legal/terms').then(m => m.Terms)
            },
            {
                path: 'privacy',
                title: 'Privacy Policy',
                loadComponent: () => import('./pages/legal/privacy').then(m => m.Privacy)
            }
        ]
    },
    {
        path: ':handle',
        title: 'Creator Storefront',
        loadComponent: () => import('./pages/storefront/storefront').then(m => m.Storefront)
    }
];
