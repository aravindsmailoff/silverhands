export interface User {
  id: string;
  name: string;
  phone: string;
  role: 'senior' | 'buyer' | 'guardian';
  language_pref: string;
}

export interface GuardianLink {
  id: string;
  senior_user_id: string;
  guardian_user_id: string;
  relationship: string;
  approval_threshold_amount: number;
}

export interface Listing {
  id: string;
  owner_user_id: string;
  owner_name?: string;
  owner_phone?: string;
  type: 'skill' | 'product';
  title: string;
  description: string;
  price: number;
  unit: 'session' | 'item';
  lat: number;
  lng: number;
  locality_label: string;
  status: 'draft' | 'pending_guardian' | 'live';
  category?: string;
  distance?: number;
  created_at?: string;
}

export interface RequestItem {
  id: string;
  listing_id: string;
  listing_title?: string;
  listing_type?: 'skill' | 'product';
  listing_price?: number;
  listing_unit?: 'session' | 'item';
  buyer_user_id: string;
  buyer_name?: string;
  buyer_phone?: string;
  senior_name?: string;
  type: 'learn_request' | 'buy_order';
  status: 'pending' | 'guardian_approved' | 'rejected' | 'completed';
  created_at: string;
  scheduled_time?: string;
  notes?: string;
}

export interface Payment {
  id: string;
  request_id: string;
  amount: number;
  razorpay_link_id: string | null;
  status: 'created' | 'paid' | 'failed';
}

export interface Rating {
  id: string;
  request_id: string;
  stars: number;
  comment: string;
  moderation_status: 'pending' | 'approved' | 'hidden';
}
