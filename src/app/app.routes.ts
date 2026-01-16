import { inject } from '@angular/core';
import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { onboardingGuard } from './core/onboarding.guard';

import { canActivate, redirectLoggedInTo } from '@angular/fire/auth-guard';

const redirectLoggedInToDashboard = () => redirectLoggedInTo(['dashboard']);

export const routes: Routes = [
    {
        path: 'success',
        loadComponent: () => import('./pages/success/success').then(m => m.Success)
    },
    {
        path: '',
        loadComponent: () => import('./pages/landing/landing').then(m => m.Landing)
    },
    {
        path: 'entry',
        children: [
            {
                path: 'login',
                loadComponent: () => import('./entry/login/login').then(m => m.Login),
                ...canActivate(redirectLoggedInToDashboard)
            },
            {
                path: 'signup',
                loadComponent: () => import('./entry/signup/signup').then(m => m.Signup),
                ...canActivate(redirectLoggedInToDashboard)
            },
            {
                path: 'onboarding',
                canActivate: [authGuard],
                loadComponent: () => import('./entry/onboarding/onboarding').then(m => m.Onboarding)
            }
        ]
    },
    {
        path: 'home',
        canActivate: [onboardingGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard)
    },
    {
        path: 'dashboard',
        canActivate: [onboardingGuard],
        loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard)
    },
    {
        path: 'settings',
        canActivate: [onboardingGuard],
        loadComponent: () => import('./pages/settings/settings').then(m => m.Settings)
    },
    {
        path: 'legal',
        children: [
            {
                path: 'terms',
                loadComponent: () => import('./pages/legal/terms').then(m => m.Terms)
            },
            {
                path: 'privacy',
                loadComponent: () => import('./pages/legal/privacy').then(m => m.Privacy)
            }
        ]
    },
    {
        path: ':handle',
        loadComponent: () => import('./pages/storefront/storefront').then(m => m.Storefront)
    }
];
