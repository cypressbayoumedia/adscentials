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

  editingSlot = signal<AdSlot | null>(null);
  editingTemplate = signal<SlotTemplate | null>(null);

  openAddSlot(slot?: AdSlot) {
    if (!this.user()?.stripeConnected) {
      alert('You must connect your payouts before adding inventory.');
      return;
    }

    this.editingTemplate.set(null); // Ensure template edit is cleared

    if (slot) {
      this.editingSlot.set(slot);
      const dateStr = slot.date.toDate().toISOString().split('T')[0];

      this.addSlotForm.patchValue({
        title: slot.title,
        description: slot.description || '',
        price: slot.price / 100,
        date: dateStr,
        saveAsTemplate: false,
        templateName: ''
      });
      // Date is required for slots
      this.addSlotForm.get('date')?.enable();
    } else {
      this.editingSlot.set(null);
      this.addSlotForm.reset({
        price: 50,
        date: new Date().toISOString().split('T')[0]
      });
      this.addSlotForm.get('date')?.enable();
    }

    this.showAddSlotDrawer.set(true);
  }

  openEditTemplate(template: SlotTemplate) {
    this.editingTemplate.set(template);
    this.editingSlot.set(null);

    this.addSlotForm.patchValue({
      title: template.title,
      description: template.description || '',
      price: template.price / 100,
      templateName: template.name,
      date: new Date().toISOString().split('T')[0] // Dummy date to satisfy validator if needed, or disable validator
    });

    // key: We are editing a template, so date is irrelevant.
    this.addSlotForm.get('date')?.disable();

    this.showAddSlotDrawer.set(true);
  }

  async saveSlot() {
    // If we are editing a template, date is disabled so form might be invalid if we don't handle it.
    // If date is disabled, it is excluded from validation in some angular versions, but let's be safe.
    if (this.addSlotForm.invalid && !this.editingTemplate()) return;
    // If editing template, check validity excluding date? Or just ensure date is present if form requires it.
    // Actually, if control is disabled, it shouldn't trigger validation failure for required.

    const val = this.addSlotForm.getRawValue(); // Get all values including disabled
    const uid = this.user()?.uid;
    const editingSlotId = this.editingSlot()?.slotId;
    const editingTemplateId = this.editingTemplate()?.templateId;

    if (!uid) return;

    try {
      // 1. EDITING EXISTING TEMPLATE
      if (editingTemplateId) {
        if (!val.templateName || !val.title || !val.price) return; // Custom validation

        await this.inventory.updateTemplate(editingTemplateId, {
          name: val.templateName,
          title: val.title,
          description: val.description || undefined,
          price: Math.round(val.price * 100),
          creatorId: uid
        });
      }
      // 2. SAVING/UPDATING SLOT
      else {
        if (!val.date) return;

        const slotData = {
          date: new Date(val.date),
          title: val.title!,
          description: val.description || undefined,
          price: Math.round(val.price! * 100),
        };

        if (editingSlotId) {
          // Type cast existing
          await this.inventory.updateSlot(editingSlotId, slotData as any);
        } else {
          await this.inventory.createSlot({
            creatorId: uid,
            ...slotData,
            status: 'available'
          });
        }

        // 3. IF SAVING AS NEW TEMPLATE (During slot creation)
        if (val.saveAsTemplate && val.templateName) {
          await this.inventory.createTemplate({
            creatorId: uid,
            name: val.templateName,
            title: val.title!,
            description: val.description || undefined,
            price: Math.round(val.price! * 100),
          });
        }
      }

      this.closeAddSlot();

    } catch (err) {
      console.error('Error saving', err);
    }
  }

  closeAddSlot() {
    this.showAddSlotDrawer.set(false);
    this.editingSlot.set(null);
    this.editingTemplate.set(null);
    this.addSlotForm.reset();
    this.addSlotForm.get('date')?.enable();
  }

  async deleteSlot(slotId: string) {
    if (!confirm('Are you sure you want to delete this slot? This action cannot be undone.')) return;

    try {
      await this.inventory.deleteSlot(slotId);
    } catch (err) {
      console.error('Error deleting slot:', err);
      alert('Failed to delete slot');
    }
  }

  applyTemplate(template: SlotTemplate) {
    this.addSlotForm.patchValue({
      title: template.title,
      description: template.description,
      price: template.price / 100
    });

    this.openAddSlot();

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
