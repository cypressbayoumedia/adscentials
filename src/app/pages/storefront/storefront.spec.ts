
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Storefront } from './storefront';
import { ActivatedRoute } from '@angular/router';
import { Firestore } from '@angular/fire/firestore';
import { Functions } from '@angular/fire/functions';
import { AuthService } from '../../core/auth';
import { InventoryService } from '../../core/inventory';
import { of } from 'rxjs';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('Storefront', () => {
    let component: Storefront;
    let fixture: ComponentFixture<Storefront>;

    const mockActivatedRoute = {
        paramMap: of(new Map([['handle', 'test_creator']]))
    };

    const mockFirestore = {
        type: 'firestore'
    };

    const mockInventory = {
        getSlots: vi.fn(),
        debugSeed: vi.fn()
    };

    const mockFunctions = {
        customDomain: null
    };

    const mockAuth = {
        currentUser: vi.fn(() => ({ uid: 'sponsor_123', displayName: 'Sponsor' }))
    };

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [Storefront],
            providers: [
                { provide: ActivatedRoute, useValue: mockActivatedRoute },
                { provide: Firestore, useValue: mockFirestore },
                { provide: InventoryService, useValue: mockInventory },
                { provide: Functions, useValue: mockFunctions },
                { provide: AuthService, useValue: mockAuth }
            ]
        }).compileComponents();

        const inventoryService = TestBed.inject(InventoryService);
        // @ts-ignore
        inventoryService.getSlots.mockReturnValue(of([]));

        fixture = TestBed.createComponent(Storefront);
        component = fixture.componentInstance;
        fixture.detectChanges();
    });

    it('should create', () => {
        expect(component).toBeTruthy();
    });

    it('should initialize with handle from route', () => {
        expect(component.handle()).toBe('test_creator');
    });

    it('should open checkout when item selected', () => {
        const mockSlot: any = { slotId: '1', price: 1000 };
        component.openCheckout(mockSlot);
        expect(component.selectedItem()).toEqual(mockSlot);
    });
});
