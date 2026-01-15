import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InventoryService } from '../../core/inventory';
import { AuthService } from '../../core/auth';
import { Firestore, collection, doc, setDoc, Timestamp } from '@angular/fire/firestore';
import { MessagingService } from '../../core/messaging';
import { AdSlot, SlotTemplate, Booking } from '../../core/models';
import { Router, ActivatedRoute } from '@angular/router'; // Added ActivatedRoute
import { Functions, httpsCallable } from '@angular/fire/functions';

import { RouterModule } from '@angular/router';
import { OrdersComponent } from './orders/orders';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, ReactiveFormsModule, RouterModule, OrdersComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Dashboard implements OnInit {
  private inventory = inject(InventoryService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private functions = inject(Functions);
  private firestore = inject(Firestore);
  private messaging = inject(MessagingService);

  // Toast State
  toastMessage = signal<{ title: string; body: string } | null>(null);

  constructor() {
    effect(() => {
      const msg = this.messaging.currentMessage();
      if (msg && msg.notification) {
        this.toastMessage.set({
          title: msg.notification.title || 'New Notification',
          body: msg.notification.body || ''
        });

        // Auto hide after 5 seconds
        setTimeout(() => {
          this.toastMessage.set(null);
        }, 5000);
      }
    });
  }

  user = this.auth.currentUser;
  slots = signal<AdSlot[]>([]);
  templates = signal<SlotTemplate[]>([]);
  bookings = signal<Booking[]>([]);

  // UI State
  showAddSlotDrawer = signal(false);
  activeTab = signal<'slots' | 'templates' | 'orders'>('slots');
  linkCopied = signal(false);
  isLoadingStripe = signal(false);
  isProcessing = signal(false);

  // Forms
  addSlotForm = this.fb.group({
    title: ['', Validators.required],
    description: [''],
    price: [null as number | null, [Validators.required, Validators.min(5)]],
    date: [new Date().toISOString().split('T')[0], Validators.required],
    saveAsTemplate: [false],
    templateName: ['']
  });

  ngOnInit() {
    // We need the user to be loaded
    const currentUser = this.user();
    if (currentUser) {
      this.loadData(currentUser.uid);
      // Auto-request notification permissions
      this.messaging.requestPermission();
    }

    // Check for success param
    this.route.queryParams.subscribe(async params => {
      if (params['stripe_connect'] === 'success') {
        // Manually verify status as failsafe for webhook
        try {
          const verifyFn = httpsCallable(this.functions, 'verifyStripeConnection');
          await verifyFn();
          // Reload user data to get new claims/status
          await this.auth.reloadUser();
        } catch (err) {
          console.error('Verification failed', err);
        }

        // Clean URL
        this.router.navigate([], { relativeTo: this.route, queryParams: { stripe_connect: null }, queryParamsHandling: 'merge' });
      }
    });
  }

  loadData(uid: string) {
    this.inventory.getSlots(uid).subscribe(slots => this.slots.set(slots));
    this.inventory.getTemplates(uid).subscribe(templates => {
      console.log('Loaded Templates:', templates);
      this.templates.set(templates);
    });
    this.inventory.getBookings(uid).subscribe(bookings => this.bookings.set(bookings));
  }

  openAddSlot() {
    if (!this.user()?.stripeConnected) {
      alert('You must connect your payouts before adding inventory.');
      return;
    }

    this.addSlotForm.reset({
      price: 50
    });
    this.showAddSlotDrawer.set(true);
  }

  async saveSlot() {
    if (this.addSlotForm.invalid) return;

    const val = this.addSlotForm.value;
    const uid = this.user()?.uid;

    if (!uid || !val.date) return;

    try {
      // Use logic from InventoryService which saves to 'adSlots' collection
      await this.inventory.createSlot({
        creatorId: uid,
        date: new Date(val.date), // Pass Date object, service handles it
        title: val.title!,
        description: val.description || undefined,
        price: Math.round(val.price! * 100),
        status: 'available'
      });

      if (val.saveAsTemplate && val.templateName) {
        await this.inventory.createTemplate({
          creatorId: uid,
          name: val.templateName,
          title: val.title!,
          description: val.description || undefined,
          price: Math.round(val.price! * 100),
        });
      }

      this.closeAddSlot();
      // No need to manually reload, loadData subscriptions are real-time
      // But we can call it if we want to be sure? 
      // Actually loadData sets up subscriptions. We don't need to call it again.
      // The subscriptions from ngOnInit/loadData will catch the new slot.
    } catch (err) {
      console.error('Error saving slot', err);
    }
  }

  closeAddSlot() {
    this.showAddSlotDrawer.set(false);
  }

  applyTemplate(template: SlotTemplate) {
    this.addSlotForm.patchValue({
      title: template.title,
      description: template.description,
      price: template.price / 100
    });
    // Optionally switch to add slot view directly?
    // For now just notify or assume they go to add slot.
    // Better: Open add slot drawer with these values.
    this.openAddSlot();
    // Patch again because openAddSlot resets form
    this.addSlotForm.patchValue({
      title: template.title,
      description: template.description,
      price: template.price / 100
    });
  }

  async deleteTemplate(templateId: string) {
    if (!confirm('Delete this template?')) return;
    await this.inventory.deleteTemplate(templateId);
    const uid = this.user()?.uid;
    if (uid) {
      this.inventory.getTemplates(uid).subscribe(t => this.templates.set(t));
    }
  }

  toggleTab(tab: 'slots' | 'templates' | 'orders') {
    this.activeTab.set(tab);
  }

  async connectStripe() {
    this.isLoadingStripe.set(true);
    const createStripeAccountLink = httpsCallable(this.functions, 'createStripeAccountLink');
    try {
      const result: any = await createStripeAccountLink({});
      if (result.data.url) {
        window.location.href = result.data.url;
      }
    } catch (err) {
      console.error("Stripe Connect Error", err);
      alert('Failed to connect Stripe. See console.');
    } finally {
      this.isLoadingStripe.set(false);
    }
  }

  async signOut() {
    await this.auth.signOut();
    this.router.navigate(['/entry/login']);
  }

  copyLink() {
    const handle = this.user()?.handle;
    if (!handle) return;

    const url = `${window.location.origin}/${handle}`;
    navigator.clipboard.writeText(url).then(() => {
      this.linkCopied.set(true);
      setTimeout(() => this.linkCopied.set(false), 2000);
    });
  }
}
