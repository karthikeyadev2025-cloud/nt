export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// Loose typing: tables are validated by RLS + runtime; regenerate strict types
// via `supabase gen types typescript` once the project is live.
export interface Database {
  public: {
    Tables: { [table: string]: { Row: any; Insert: any; Update: any } };
    Views: { [view: string]: { Row: any } };
    Functions: { [fn: string]: { Args: any; Returns: any } };
  };
}

export type SegmentSlug = string;

export interface Segment {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  color: string;
  ticket_prefix: string;
  order_index: number;
  active: boolean;
}

export interface Product {
  id: string;
  segment_slug: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  logo_url: string | null;
  screenshots: Json;
  features: { title: string; description: string; icon: string }[];
  external_url: string | null;
  demo_cta: string;
  status: 'active' | 'coming_soon' | 'hidden';
  order_index: number;
}

export interface SupportTicket {
  id: string;
  ticket_no: string;
  segment_slug: string;
  ticket_type: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_customer' | 'resolved' | 'closed';
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  product_slug: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface Lead {
  id: string;
  segment_slug: string;
  customer_name: string;
  phone: string;
  email: string;
  address: string;
  interested_in: string;
  product_slug: string | null;
  source: string;
  stage: 'new' | 'contacted' | 'qualified' | 'quoted' | 'won' | 'lost' | 'not_answered';
  estimated_value: number;
  invoice_no: string | null;
  invoice_amount: number | null;
  assigned_to: string | null;
  created_by: string | null;
  next_followup_at: string | null;
  created_at: string;
}
