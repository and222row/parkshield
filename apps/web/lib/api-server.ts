import 'server-only';
import type { DecalTemplate } from '@parkshield/shared';
import { cookies } from 'next/headers';

const API = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

/** Server-side API call on behalf of the visitor (forwards their cookies; never cached). */
export async function serverApi<T>(path: string): Promise<{ status: number; data: T | null }> {
  const cookie = (await cookies()).toString();
  try {
    const res = await fetch(`${API}${path}`, {
      headers: cookie ? { cookie } : {},
      cache: 'no-store',
    });
    return { status: res.status, data: res.ok ? ((await res.json()) as T) : null };
  } catch {
    return { status: 503, data: null };
  }
}

export interface PushDevice {
  id: string;
  platform: 'ios' | 'android' | 'desktop' | null;
  label: string | null;
  createdAt: string;
  lastOkAt: string | null;
}

export type OrderableChannel = 'webpush' | 'email' | 'whatsapp';

export interface EmergencyContact {
  id: string;
  name: string;
  email: string;
  vehicleId: string | null;
  vehicleNickname: string | null;
  status: 'pending' | 'confirmed' | 'declined' | 'revoked';
  requestedAt: string;
  decidedAt: string | null;
  expiresAt: string | null;
}

export interface EmergencyContactList {
  limit: number;
  ownerName: string | null;
  contacts: EmergencyContact[];
}

export interface ChannelsOverview {
  order: OrderableChannel[];
  email: { address: string };
  push: { publicKey: string; devices: PushDevice[] };
  whatsapp: { phone: string; verifiedAt: string; enabled: boolean } | null;
}

export interface Me {
  email: string;
  preferredLang: 'de' | 'en';
  passkeys: { id: string; label: string | null; createdAt: string; lastUsedAt: string | null }[];
}

export interface SubscriptionSummary {
  plan: 'plus' | 'premium';
  status: 'active' | 'past_due';
  contractNo: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

export type TokenStatus = 'generated' | 'printed' | 'shipped' | 'active' | 'revoked';

export interface Vehicle {
  id: string;
  nickname: string;
  plate: string | null;
  makeModel: string | null;
  color: string | null;
  createdAt: string;
  decal: {
    tokenId: string;
    codeHint: string;
    status: TokenStatus;
    cta: string;
    template: DecalTemplate;
    activatedAt: string | null;
    lastTestAt: string | null;
    testWindowUntil: string | null;
  } | null;
}

export interface OrderSummary {
  id: string;
  status:
    | 'pending_payment'
    | 'paid'
    | 'in_production'
    | 'shipped'
    | 'delivered'
    | 'returned'
    | 'canceled'
    | 'refunded';
  included: boolean;
  trackingNumber: string | null;
  createdAt: string;
  product: string;
  vehicleId: string | null;
  nickname: string | null;
}

export interface InvoiceSummary {
  id: string;
  number: string;
  createdAt: string;
  totalCents: number;
  pdfUrl: string | null;
}
