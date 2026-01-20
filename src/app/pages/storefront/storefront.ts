
import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';
import { UserProfile } from '../../core/auth';
import { InventoryService } from '../../core/inventory';
import { AdSlot } from '../../core/models';
import { FormsModule } from '@angular/forms';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AuthService } from '../../core/auth';

@Component({
  selector: 'app-storefront',
  imports: [CommonModule, FormsModule],
  templateUrl: './storefront.html',
  styleUrl: './storefront.css',
})
export class Storefront implements OnInit {
  private route = inject(ActivatedRoute);
  private firestore = inject(Firestore);
  private inventory = inject(InventoryService);
  private functions = inject(Functions);
  private auth = inject(AuthService);
  private titleService = inject(Title);
  private metaService = inject(Meta);

  isLoading = signal(true);
  error = signal<string | null>(null);

  // Checkout State
  isProcessing = signal(false);
  checkoutForm = {
    targetUrl: '',
    script: '',
    logoUrl: '',
    instructions: ''
  };

  // The handle from the URL
  handle = signal<string | null>(null);

  // The resolved user profile
  userProfile = signal<UserProfile | null>(null);

  // Loaded Ad Slots
  slots = signal<AdSlot[]>([]);

  // UI State for Drawer
  selectedItem = signal<AdSlot | null>(null);

  // Computed
  availableSlotsCount = computed(() => this.slots().filter(s => s.status === 'available').length);

  tickerText = computed(() => {
    const count = this.availableSlotsCount();
    const date = new Date();
    const month = date.toLocaleString('default', { month: 'long' }).toUpperCase();

    if (count === 0) {
      return `SOLD OUT FOR ${month} • CHECK BACK SOON • JOIN WAITLIST •`;
    }

    return `${count} SLOTS REMAINING FOR ${month} • SECURE YOUR SPOT NOW • LIMITED AVAILABILITY •`;
  });

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const handle = params.get('handle');
      if (handle) {
        this.handle.set(handle);
        this.loadProfile(handle);
      } else {
        this.error.set('No handle provided');
        this.isLoading.set(false);
      }
    });
  }

  async loadProfile(handle: string) {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      // 1. Get UID from handles collection
      const handleRef = doc(this.firestore, 'handles', handle);
      const handleSnap = await getDoc(handleRef);

      if (!handleSnap.exists()) {
        this.error.set('Storefront not found');
        return;
      }

      const { uid } = handleSnap.data();

      // 2. Get User Profile
      const userRef = doc(this.firestore, 'users', uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const userData = userSnap.data() as UserProfile;
        this.userProfile.set(userData);
        // Load slots for this creator
        this.loadSlots(uid);

        // Update SEO
        this.updateMetaTags(userData);
      } else {
        this.error.set('User profile not found');
        this.isLoading.set(false);
      }

    } catch (err: unknown) {
      console.error('Error loading profile:', err);
      this.error.set('Failed to load storefront');
      this.isLoading.set(false);
    }
  }

  loadSlots(creatorId: string) {
    this.inventory.getSlots(creatorId).subscribe({
      next: (slots: AdSlot[]) => {
        this.slots.set(slots);
        this.isLoading.set(false);
      },
      error: (err: unknown) => {
        console.error('Error loading slots:', err);
        this.isLoading.set(false);
      }
    });
  }

  openCheckout(item: AdSlot) {
    this.selectedItem.set(item);
  }

  closeCheckout() {
    this.selectedItem.set(null);
    this.checkoutForm = { targetUrl: '', script: '', logoUrl: '', instructions: '' };
  }

  async purchase() {
    const item = this.selectedItem();
    const currentUser = this.auth.currentUser();

    if (!item) return;
    if (!currentUser) {
      alert('Please login to purchase slot');
      return;
    }

    this.isProcessing.set(true);

    const createCheckoutSession = httpsCallable(this.functions, 'createCheckoutSession');

    try {
      const result = await createCheckoutSession({
        slotId: item.slotId,
        submission: {
          targetUrl: this.checkoutForm.targetUrl,
          script: this.checkoutForm.script,
          logoUrl: this.checkoutForm.logoUrl,
          instructions: this.checkoutForm.instructions
        }
      }) as { data: { url: string } };

      if (result.data.url) {
        window.location.href = result.data.url;
      }

    } catch (err: unknown) {
      console.error("Checkout Error", err);
      alert('Checkout failed. Please try again.');
      this.isProcessing.set(false);
    }
  }

  updateMetaTags(user: UserProfile) {
    const name = user.displayName || 'Adscentials Creator';
    const month = new Date().toLocaleString('default', { month: 'long' });
    const title = `${month} Ad Slots | ${name}`;
    const description = `Purchase ad inventory directly from ${name}. Limited spots available for ${month}. Secure your placement today.`;
    const image = user.photoURL || 'https://adscentials.com/assets/icons/icon-512x512.png';

    // Set Title
    this.titleService.setTitle(title);

    // Set Meta Tags
    this.metaService.updateTag({ name: 'description', content: description });

    // Open Graph
    this.metaService.updateTag({ property: 'og:title', content: title });
    this.metaService.updateTag({ property: 'og:description', content: description });
    this.metaService.updateTag({ property: 'og:image', content: image });
    this.metaService.updateTag({ property: 'og:url', content: window.location.href });
    this.metaService.updateTag({ property: 'og:type', content: 'website' });

    // Twitter
    this.metaService.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.metaService.updateTag({ name: 'twitter:title', content: title });
    this.metaService.updateTag({ name: 'twitter:description', content: description });
    this.metaService.updateTag({ name: 'twitter:image', content: image });
  }
}

