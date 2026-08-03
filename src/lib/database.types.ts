export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_pinned: boolean | null
          segment_slug: string | null
          title: string
        }
        Insert: {
          body: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean | null
          segment_slug?: string | null
          title: string
        }
        Update: {
          body?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean | null
          segment_slug?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      app_users: {
        Row: {
          bank_details: Json
          blood_group: string | null
          created_at: string | null
          created_by: string | null
          date_of_birth: string | null
          designation: string | null
          email: string
          employment_type: string | null
          exit_date: string | null
          exit_note: string | null
          exit_reason: string | null
          full_name: string
          id: string
          id_proof_number: string | null
          is_active: boolean | null
          joining_date: string | null
          must_change_password: boolean
          permission_overrides: Json
          phone: string | null
          profile_photo_url: string | null
          reporting_time: string | null
          reports_to: string | null
          role: string
          salary_structure: Json
          segments: string[]
          staff_code: string | null
          updated_at: string | null
        }
        Insert: {
          bank_details?: Json
          blood_group?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          designation?: string | null
          email: string
          employment_type?: string | null
          exit_date?: string | null
          exit_note?: string | null
          exit_reason?: string | null
          full_name?: string
          id: string
          id_proof_number?: string | null
          is_active?: boolean | null
          joining_date?: string | null
          must_change_password?: boolean
          permission_overrides?: Json
          phone?: string | null
          profile_photo_url?: string | null
          reporting_time?: string | null
          reports_to?: string | null
          role?: string
          salary_structure?: Json
          segments?: string[]
          staff_code?: string | null
          updated_at?: string | null
        }
        Update: {
          bank_details?: Json
          blood_group?: string | null
          created_at?: string | null
          created_by?: string | null
          date_of_birth?: string | null
          designation?: string | null
          email?: string
          employment_type?: string | null
          exit_date?: string | null
          exit_note?: string | null
          exit_reason?: string | null
          full_name?: string
          id?: string
          id_proof_number?: string | null
          is_active?: boolean | null
          joining_date?: string | null
          must_change_password?: boolean
          permission_overrides?: Json
          phone?: string | null
          profile_photo_url?: string | null
          reporting_time?: string | null
          reports_to?: string | null
          role?: string
          salary_structure?: Json
          segments?: string[]
          staff_code?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_users_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          attendance_date: string
          auto_closed: boolean
          check_in_at: string | null
          check_in_lat: number | null
          check_in_lng: number | null
          check_in_selfie_url: string | null
          check_out_at: string | null
          check_out_lat: number | null
          check_out_lng: number | null
          check_out_selfie_url: string | null
          created_at: string | null
          id: string
          is_late: boolean
          minutes_late: number
          shift_id: string | null
          staff_user_id: string
          status: string | null
          work_mode: string
        }
        Insert: {
          attendance_date?: string
          auto_closed?: boolean
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_selfie_url?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_selfie_url?: string | null
          created_at?: string | null
          id?: string
          is_late?: boolean
          minutes_late?: number
          shift_id?: string | null
          staff_user_id: string
          status?: string | null
          work_mode?: string
        }
        Update: {
          attendance_date?: string
          auto_closed?: boolean
          check_in_at?: string | null
          check_in_lat?: number | null
          check_in_lng?: number | null
          check_in_selfie_url?: string | null
          check_out_at?: string | null
          check_out_lat?: number | null
          check_out_lng?: number | null
          check_out_selfie_url?: string | null
          created_at?: string | null
          id?: string
          is_late?: boolean
          minutes_late?: number
          shift_id?: string | null
          staff_user_id?: string
          status?: string | null
          work_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_regularizations: {
        Row: {
          attendance_date: string
          created_at: string | null
          id: string
          reason: string
          requested_check_in: string | null
          requested_check_out: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_user_id: string
          status: string
        }
        Insert: {
          attendance_date: string
          created_at?: string | null
          id?: string
          reason: string
          requested_check_in?: string | null
          requested_check_out?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_user_id: string
          status?: string
        }
        Update: {
          attendance_date?: string
          created_at?: string | null
          id?: string
          reason?: string
          requested_check_in?: string | null
          requested_check_out?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_regularizations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_regularizations_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_change_requests: {
        Row: {
          created_at: string | null
          id: string
          previous_details: Json
          requested_details: Json
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_user_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          previous_details?: Json
          requested_details: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_user_id: string
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          previous_details?: Json
          requested_details?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_change_requests_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      career_applications: {
        Row: {
          created_at: string | null
          email: string | null
          experience: string | null
          id: string
          job_posting_id: string | null
          message: string | null
          name: string
          phone: string
          photo_url: string | null
          position: string | null
          question_answers: Json
          resume_url: string | null
          review_note: string | null
          reviewed_by: string | null
          segment_slug: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          experience?: string | null
          id?: string
          job_posting_id?: string | null
          message?: string | null
          name: string
          phone: string
          photo_url?: string | null
          position?: string | null
          question_answers?: Json
          resume_url?: string | null
          review_note?: string | null
          reviewed_by?: string | null
          segment_slug?: string | null
          status?: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          experience?: string | null
          id?: string
          job_posting_id?: string | null
          message?: string | null
          name?: string
          phone?: string
          photo_url?: string | null
          position?: string | null
          question_answers?: Json
          resume_url?: string | null
          review_note?: string | null
          reviewed_by?: string | null
          segment_slug?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_applications_job_posting_id_fkey"
            columns: ["job_posting_id"]
            isOneToOne: false
            referencedRelation: "job_postings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_applications_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_applications_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      client_logos: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          logo_url: string
          name: string
          order_index: number | null
          segment_slug: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          logo_url: string
          name: string
          order_index?: number | null
          segment_slug?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          logo_url?: string
          name?: string
          order_index?: number | null
          segment_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_logos_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          message: string | null
          name: string
          phone: string
          segment_slug: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          message?: string | null
          name: string
          phone: string
          segment_slug?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          message?: string | null
          name?: string
          phone?: string
          segment_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_messages_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      document_templates: {
        Row: {
          active: boolean | null
          body: string
          created_at: string | null
          doc_type: string
          id: string
          requires_signature: boolean
          segment_slug: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          body?: string
          created_at?: string | null
          doc_type: string
          id?: string
          requires_signature?: boolean
          segment_slug?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          body?: string
          created_at?: string | null
          doc_type?: string
          id?: string
          requires_signature?: boolean
          segment_slug?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_templates_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      employee_documents: {
        Row: {
          acknowledged_at: string | null
          content: string
          doc_type: string
          id: string
          issued_at: string | null
          issued_by: string | null
          requires_signature: boolean
          signature_data_url: string | null
          signed_name: string | null
          staff_user_id: string
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          content: string
          doc_type: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          requires_signature?: boolean
          signature_data_url?: string | null
          signed_name?: string | null
          staff_user_id: string
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          content?: string
          doc_type?: string
          id?: string
          issued_at?: string | null
          issued_by?: string | null
          requires_signature?: boolean
          signature_data_url?: string | null
          signed_name?: string | null
          staff_user_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_documents_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_documents_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      gallery_items: {
        Row: {
          active: boolean | null
          created_at: string | null
          id: string
          image_url: string
          media_type: string | null
          order_index: number | null
          segment_slug: string | null
          title: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          image_url: string
          media_type?: string | null
          order_index?: number | null
          segment_slug?: string | null
          title?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          id?: string
          image_url?: string
          media_type?: string | null
          order_index?: number | null
          segment_slug?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gallery_items_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      holidays: {
        Row: {
          created_at: string | null
          holiday_date: string
          id: string
          is_optional: boolean | null
          name: string
          segment_slug: string | null
        }
        Insert: {
          created_at?: string | null
          holiday_date: string
          id?: string
          is_optional?: boolean | null
          name: string
          segment_slug?: string | null
        }
        Update: {
          created_at?: string | null
          holiday_date?: string
          id?: string
          is_optional?: boolean | null
          name?: string
          segment_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holidays_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      job_postings: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string
          employment_type: string
          id: string
          location: string | null
          positions_open: number | null
          questions: Json
          requirements: string | null
          segment_slug: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string
          employment_type?: string
          id?: string
          location?: string | null
          positions_open?: number | null
          questions?: Json
          requirements?: string | null
          segment_slug?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string
          employment_type?: string
          id?: string
          location?: string | null
          positions_open?: number | null
          questions?: Json
          requirements?: string | null
          segment_slug?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_postings_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      lead_remarks: {
        Row: {
          address: string | null
          author_name: string | null
          author_staff_code: string | null
          call_type: string | null
          client_ref: string | null
          created_at: string | null
          id: string
          latitude: number | null
          lead_id: string
          longitude: number | null
          occurred_at: string | null
          photo_url: string | null
          remark: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          author_name?: string | null
          author_staff_code?: string | null
          call_type?: string | null
          client_ref?: string | null
          created_at?: string | null
          id?: string
          latitude?: number | null
          lead_id: string
          longitude?: number | null
          occurred_at?: string | null
          photo_url?: string | null
          remark: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          author_name?: string | null
          author_staff_code?: string | null
          call_type?: string | null
          client_ref?: string | null
          created_at?: string | null
          id?: string
          latitude?: number | null
          lead_id?: string
          longitude?: number | null
          occurred_at?: string | null
          photo_url?: string | null
          remark?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_remarks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "marketing_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_remarks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policies: {
        Row: {
          annual_days: number
          created_at: string | null
          id: string
          is_unlimited: boolean
          leave_type: string
          role_name: string | null
        }
        Insert: {
          annual_days?: number
          created_at?: string | null
          id?: string
          is_unlimited?: boolean
          leave_type: string
          role_name?: string | null
        }
        Update: {
          annual_days?: number
          created_at?: string | null
          id?: string
          is_unlimited?: boolean
          leave_type?: string
          role_name?: string | null
        }
        Relationships: []
      }
      leave_requests: {
        Row: {
          created_at: string | null
          from_date: string
          half_day_period: string | null
          id: string
          is_half_day: boolean
          leave_type: string | null
          override_balance: boolean
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_user_id: string
          status: string
          to_date: string
        }
        Insert: {
          created_at?: string | null
          from_date: string
          half_day_period?: string | null
          id?: string
          is_half_day?: boolean
          leave_type?: string | null
          override_balance?: boolean
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_user_id: string
          status?: string
          to_date: string
        }
        Update: {
          created_at?: string | null
          from_date?: string
          half_day_period?: string | null
          id?: string
          is_half_day?: boolean
          leave_type?: string | null
          override_balance?: boolean
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_user_id?: string
          status?: string
          to_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_leads: {
        Row: {
          address: string | null
          alternate_phone: string | null
          appointment_at: string | null
          appointment_note: string | null
          appointment_reminder_sent_at: string | null
          appointment_set_by: string | null
          assigned_to: string | null
          callback_at: string | null
          created_at: string | null
          created_by: string | null
          customer_name: string
          email: string | null
          estimated_value: number | null
          followup_reminder_sent_at: string | null
          id: string
          interested_in: string | null
          invoice_amount: number | null
          invoice_no: string | null
          latitude: number | null
          longitude: number | null
          next_followup_at: string | null
          pending_transfer_to: string | null
          phone: string
          photo_url: string | null
          priority: string
          product_slug: string | null
          segment_slug: string
          source: string | null
          stage: string
          transfer_note: string | null
          transfer_requested_by: string | null
          transfer_status: string
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          alternate_phone?: string | null
          appointment_at?: string | null
          appointment_note?: string | null
          appointment_reminder_sent_at?: string | null
          appointment_set_by?: string | null
          assigned_to?: string | null
          callback_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_name: string
          email?: string | null
          estimated_value?: number | null
          followup_reminder_sent_at?: string | null
          id?: string
          interested_in?: string | null
          invoice_amount?: number | null
          invoice_no?: string | null
          latitude?: number | null
          longitude?: number | null
          next_followup_at?: string | null
          pending_transfer_to?: string | null
          phone: string
          photo_url?: string | null
          priority?: string
          product_slug?: string | null
          segment_slug: string
          source?: string | null
          stage?: string
          transfer_note?: string | null
          transfer_requested_by?: string | null
          transfer_status?: string
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          alternate_phone?: string | null
          appointment_at?: string | null
          appointment_note?: string | null
          appointment_reminder_sent_at?: string | null
          appointment_set_by?: string | null
          assigned_to?: string | null
          callback_at?: string | null
          created_at?: string | null
          created_by?: string | null
          customer_name?: string
          email?: string | null
          estimated_value?: number | null
          followup_reminder_sent_at?: string | null
          id?: string
          interested_in?: string | null
          invoice_amount?: number | null
          invoice_no?: string | null
          latitude?: number | null
          longitude?: number | null
          next_followup_at?: string | null
          pending_transfer_to?: string | null
          phone?: string
          photo_url?: string | null
          priority?: string
          product_slug?: string | null
          segment_slug?: string
          source?: string | null
          stage?: string
          transfer_note?: string | null
          transfer_requested_by?: string | null
          transfer_status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_leads_appointment_set_by_fkey"
            columns: ["appointment_set_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_leads_pending_transfer_to_fkey"
            columns: ["pending_transfer_to"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_leads_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
          {
            foreignKeyName: "marketing_leads_transfer_requested_by_fkey"
            columns: ["transfer_requested_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      office_tasks: {
        Row: {
          assigned_to: string | null
          category: string | null
          completed_at: string | null
          completion_note: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          overdue_reminder_sent_at: string | null
          priority: string
          segment_slug: string | null
          status: string
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string | null
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          overdue_reminder_sent_at?: string | null
          priority?: string
          segment_slug?: string | null
          status?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string | null
          completed_at?: string | null
          completion_note?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          overdue_reminder_sent_at?: string | null
          priority?: string
          segment_slug?: string | null
          status?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "office_tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_tasks_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      payslips: {
        Row: {
          absent_days: number
          amount_paid: number
          base_salary: number
          generated_at: string
          generated_by: string | null
          id: string
          incentives: number
          last_paid_at: string | null
          late_days: number
          late_fine: number
          net_pay: number
          other_deductions: number
          paid_leave_days: number
          payment_status: string
          performance_bonus: number
          period_month: number
          period_year: number
          present_days: number
          staff_user_id: string
          unpaid_leave_days: number
          working_days: number
        }
        Insert: {
          absent_days?: number
          amount_paid?: number
          base_salary?: number
          generated_at?: string
          generated_by?: string | null
          id?: string
          incentives?: number
          last_paid_at?: string | null
          late_days?: number
          late_fine?: number
          net_pay?: number
          other_deductions?: number
          paid_leave_days?: number
          payment_status?: string
          performance_bonus?: number
          period_month: number
          period_year: number
          present_days?: number
          staff_user_id: string
          unpaid_leave_days?: number
          working_days?: number
        }
        Update: {
          absent_days?: number
          amount_paid?: number
          base_salary?: number
          generated_at?: string
          generated_by?: string | null
          id?: string
          incentives?: number
          last_paid_at?: string | null
          late_days?: number
          late_fine?: number
          net_pay?: number
          other_deductions?: number
          paid_leave_days?: number
          payment_status?: string
          performance_bonus?: number
          period_month?: number
          period_year?: number
          present_days?: number
          staff_user_id?: string
          unpaid_leave_days?: number
          working_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "payslips_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_change_requests: {
        Row: {
          created_at: string | null
          id: string
          requested_photo_url: string
          reviewed_at: string | null
          reviewed_by: string | null
          staff_user_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          requested_photo_url: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_user_id: string
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          requested_photo_url?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_change_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_change_requests_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          demo_cta: string | null
          description: string | null
          external_url: string | null
          features: Json | null
          id: string
          logo_url: string | null
          name: string
          order_index: number | null
          screenshots: Json | null
          segment_slug: string
          slug: string
          status: string
          tagline: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          demo_cta?: string | null
          description?: string | null
          external_url?: string | null
          features?: Json | null
          id?: string
          logo_url?: string | null
          name: string
          order_index?: number | null
          screenshots?: Json | null
          segment_slug?: string
          slug: string
          status?: string
          tagline?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          demo_cta?: string | null
          description?: string | null
          external_url?: string | null
          features?: Json | null
          id?: string
          logo_url?: string | null
          name?: string
          order_index?: number | null
          screenshots?: Json | null
          segment_slug?: string
          slug?: string
          status?: string
          tagline?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      promotions: {
        Row: {
          created_at: string | null
          created_by: string | null
          effective_date: string
          id: string
          new_ctc: number | null
          new_designation: string | null
          note: string | null
          previous_ctc: number | null
          previous_designation: string | null
          staff_user_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          effective_date?: string
          id?: string
          new_ctc?: number | null
          new_designation?: string | null
          note?: string | null
          previous_ctc?: number | null
          previous_designation?: string | null
          staff_user_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          effective_date?: string
          id?: string
          new_ctc?: number | null
          new_designation?: string | null
          note?: string | null
          previous_ctc?: number | null
          previous_designation?: string | null
          staff_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_log: {
        Row: {
          bucket: string
          created_at: string
          id: number
          identifier: string
        }
        Insert: {
          bucket: string
          created_at?: string
          id?: number
          identifier: string
        }
        Update: {
          bucket?: string
          created_at?: string
          id?: number
          identifier?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean | null
          permissions: Json
          role_name: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          permissions?: Json
          role_name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          permissions?: Json
          role_name?: string
        }
        Relationships: []
      }
      salary_advance_requests: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          staff_user_id: string
          status: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_user_id: string
          status?: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_advance_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_advance_requests_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_payments: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          method: string
          note: string | null
          paid_at: string
          paid_by: string | null
          payslip_id: string
          reference: string | null
          staff_user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
          paid_by?: string | null
          payslip_id: string
          reference?: string | null
          staff_user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          method?: string
          note?: string | null
          paid_at?: string
          paid_by?: string | null
          payslip_id?: string
          reference?: string | null
          staff_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_payments_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_payslip_id_fkey"
            columns: ["payslip_id"]
            isOneToOne: false
            referencedRelation: "payslips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_logs: {
        Row: {
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          ip_hint: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
          ip_hint?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          ip_hint?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      segments: {
        Row: {
          active: boolean | null
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          order_index: number | null
          slug: string
          tagline: string | null
          ticket_prefix: string
        }
        Insert: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          order_index?: number | null
          slug: string
          tagline?: string | null
          ticket_prefix: string
        }
        Update: {
          active?: boolean | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          order_index?: number | null
          slug?: string
          tagline?: string | null
          ticket_prefix?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          active: boolean | null
          created_at: string | null
          description: string
          icon: string
          id: string
          order_index: number | null
          segment_slug: string
          title: string
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          description?: string
          icon?: string
          id?: string
          order_index?: number | null
          segment_slug: string
          title: string
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          description?: string
          icon?: string
          id?: string
          order_index?: number | null
          segment_slug?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "services_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      shift_swap_requests: {
        Row: {
          created_at: string | null
          id: string
          reason: string | null
          requester_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          shift_date: string
          status: string
          target_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          reason?: string | null
          requester_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_date: string
          status?: string
          target_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          reason?: string | null
          requester_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          shift_date?: string
          status?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_swap_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_swap_requests_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      shifts: {
        Row: {
          break_minutes: number | null
          created_at: string | null
          end_time: string
          grace_minutes: number
          half_day_after_minutes: number
          id: string
          is_active: boolean
          late_fine_amount: number
          late_fine_type: string
          name: string
          segment_slug: string | null
          start_time: string
          working_days: number[] | null
        }
        Insert: {
          break_minutes?: number | null
          created_at?: string | null
          end_time: string
          grace_minutes?: number
          half_day_after_minutes?: number
          id?: string
          is_active?: boolean
          late_fine_amount?: number
          late_fine_type?: string
          name: string
          segment_slug?: string | null
          start_time: string
          working_days?: number[] | null
        }
        Update: {
          break_minutes?: number | null
          created_at?: string | null
          end_time?: string
          grace_minutes?: number
          half_day_after_minutes?: number
          id?: string
          is_active?: boolean
          late_fine_amount?: number
          late_fine_type?: string
          name?: string
          segment_slug?: string | null
          start_time?: string
          working_days?: number[] | null
        }
        Relationships: [
          {
            foreignKeyName: "shifts_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      site_content: {
        Row: {
          id: string
          key: string
          section: string
          type: string
          updated_at: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          section: string
          type?: string
          updated_at?: string | null
          value?: string
        }
        Update: {
          id?: string
          key?: string
          section?: string
          type?: string
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      staff_shifts: {
        Row: {
          created_at: string | null
          effective_from: string
          effective_to: string | null
          id: string
          shift_id: string
          staff_user_id: string
        }
        Insert: {
          created_at?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          shift_id: string
          staff_user_id: string
        }
        Update: {
          created_at?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          shift_id?: string
          staff_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_shifts_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_shifts_staff_user_id_fkey"
            columns: ["staff_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string
          description: string
          id: string
          priority: string
          product_slug: string | null
          resolved_at: string | null
          segment_slug: string
          status: string
          subject: string
          ticket_no: string
          ticket_type: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          description?: string
          id?: string
          priority?: string
          product_slug?: string | null
          resolved_at?: string | null
          segment_slug: string
          status?: string
          subject: string
          ticket_no?: string
          ticket_type?: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          description?: string
          id?: string
          priority?: string
          product_slug?: string | null
          resolved_at?: string | null
          segment_slug?: string
          status?: string
          subject?: string
          ticket_no?: string
          ticket_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      team_members: {
        Row: {
          active: boolean | null
          created_at: string | null
          designation: string | null
          id: string
          name: string
          order_index: number | null
          photo_url: string | null
          segment_slug: string | null
        }
        Insert: {
          active?: boolean | null
          created_at?: string | null
          designation?: string | null
          id?: string
          name: string
          order_index?: number | null
          photo_url?: string | null
          segment_slug?: string | null
        }
        Update: {
          active?: boolean | null
          created_at?: string | null
          designation?: string | null
          id?: string
          name?: string
          order_index?: number | null
          photo_url?: string | null
          segment_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      testimonials: {
        Row: {
          active: boolean | null
          content: string
          created_at: string | null
          customer_name: string
          id: string
          order_index: number | null
          photo_url: string | null
          rating: number | null
          segment_slug: string | null
        }
        Insert: {
          active?: boolean | null
          content: string
          created_at?: string | null
          customer_name: string
          id?: string
          order_index?: number | null
          photo_url?: string | null
          rating?: number | null
          segment_slug?: string | null
        }
        Update: {
          active?: boolean | null
          content?: string
          created_at?: string | null
          customer_name?: string
          id?: string
          order_index?: number | null
          photo_url?: string | null
          rating?: number | null
          segment_slug?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "testimonials_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      ticket_replies: {
        Row: {
          author_name: string
          author_user_id: string | null
          created_at: string | null
          id: string
          is_staff: boolean | null
          message: string
          ticket_id: string
        }
        Insert: {
          author_name?: string
          author_user_id?: string | null
          created_at?: string | null
          id?: string
          is_staff?: boolean | null
          message: string
          ticket_id: string
        }
        Update: {
          author_name?: string
          author_user_id?: string | null
          created_at?: string | null
          id?: string
          is_staff?: boolean | null
          message?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_replies_author_user_id_fkey"
            columns: ["author_user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_replies_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_sla_policies: {
        Row: {
          id: string
          priority: string
          resolution_hours: number
          response_hours: number
        }
        Insert: {
          id?: string
          priority: string
          resolution_hours: number
          response_hours: number
        }
        Update: {
          id?: string
          priority?: string
          resolution_hours?: number
          response_hours?: number
        }
        Relationships: []
      }
      ticket_types: {
        Row: {
          active: boolean | null
          id: string
          name: string
          order_index: number | null
          segment_slug: string
        }
        Insert: {
          active?: boolean | null
          id?: string
          name: string
          order_index?: number | null
          segment_slug: string
        }
        Update: {
          active?: boolean | null
          id?: string
          name?: string
          order_index?: number | null
          segment_slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_types_segment_slug_fkey"
            columns: ["segment_slug"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["slug"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string
          device_label: string
          id: string
          last_seen_at: string
          platform_hint: string | null
          revoked_at: string | null
          revoked_by: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string
          id?: string
          last_seen_at?: string
          platform_hint?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string
          id?: string
          last_seen_at?: string
          platform_hint?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_segment: { Args: { seg: string }; Returns: boolean }
      can_access_staff: { Args: { target_id: string }; Returns: boolean }
      check_rate_limit: {
        Args: {
          p_bucket: string
          p_identifier: string
          p_max: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      close_dangling_checkin: {
        Args: { _check_out?: string; _record_id: string }
        Returns: undefined
      }
      count_working_days: {
        Args: { _from: string; _segment_slug?: string; _to: string }
        Returns: number
      }
      daily_attendance_trend: {
        Args: { _days?: number; _segment_slug?: string }
        Returns: {
          absent_count: number
          attendance_date: string
          present_count: number
          total_staff: number
        }[]
      }
      find_duplicate_leads: {
        Args: { _phone: string; _segment_slug: string }
        Returns: {
          assigned_to: string
          assignee_name: string
          created_at: string
          customer_name: string
          id: string
          stage: string
        }[]
      }
      get_dashboard_counts: { Args: { p_user_id?: string }; Returns: Json }
      get_leave_balances: {
        Args: { _staff_user_id: string; _year?: number }
        Returns: {
          entitled: number
          is_unlimited: boolean
          leave_type: string
          pending: number
          remaining: number
          used: number
        }[]
      }
      get_my_role: { Args: never; Returns: string }
      get_my_segments: { Args: never; Returns: string[] }
      get_segment_summary: { Args: never; Returns: Json }
      has_permission: { Args: { perm: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      lead_phone_exists: {
        Args: { _phone: string; _segment_slug: string }
        Returns: boolean
      }
      leave_working_days: {
        Args: { _from: string; _staff_user_id: string; _to: string }
        Returns: number
      }
      list_dangling_checkins: {
        Args: never
        Returns: {
          attendance_date: string
          check_in_at: string
          days_open: number
          full_name: string
          id: string
          staff_user_id: string
        }[]
      }
      list_overdue_tickets: {
        Args: { _segment_slug?: string }
        Returns: {
          created_at: string
          customer_name: string
          hours_open: number
          id: string
          priority: string
          segment_slug: string
          status: string
          subject: string
          target_hours: number
          ticket_no: string
        }[]
      }
      notify_user: {
        Args: {
          p_body: string
          p_kind: string
          p_link?: string
          p_title: string
          p_user_id: string
        }
        Returns: undefined
      }
      prune_rate_limit_log: { Args: never; Returns: undefined }
      remind_due_followups: { Args: never; Returns: number }
      remind_overdue_tasks: { Args: never; Returns: number }
      remind_unassigned_appointments: { Args: never; Returns: number }
      staff_attendance_summary: {
        Args: { _days?: number; _segment_slug?: string }
        Returns: {
          attendance_pct: number
          days_absent: number
          days_on_leave: number
          days_present: number
          full_name: string
          role: string
          staff_user_id: string
        }[]
      }
      staff_covers_segment: {
        Args: { _segment_slug: string; _user_id: string }
        Returns: boolean
      }
      staff_working_days_in_month: {
        Args: { _month: number; _staff_user_id: string; _year: number }
        Returns: number
      }
      track_ticket: {
        Args: { _phone: string; _ticket_no: string }
        Returns: {
          created_at: string
          priority: string
          resolved_at: string
          status: string
          subject: string
          ticket_no: string
          updated_at: string
        }[]
      }
      working_days_between: {
        Args: {
          _from: string
          _segment_slug?: string
          _staff_user_id?: string
          _to: string
        }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

// ═══════════════════════════════════════════════════════════════
// Legacy hand-written interfaces — re-exported as aliases of the
// generated Row types so existing imports keep working. The generated
// types are the source of truth; where a caller wants a narrower type
// (e.g. `features` as `{ title, description, icon }[]` rather than
// `Json`), it should cast at the point of use.
// ═══════════════════════════════════════════════════════════════

export type SegmentSlug = string;

export type Segment       = Tables<'segments'>;
export type Product       = Tables<'products'>;
export type SupportTicket = Tables<'support_tickets'>;
export type Lead          = Tables<'marketing_leads'>;

// Narrow shape for Product.features cast at read time.
export type ProductFeature = { title: string; description: string; icon: string };
