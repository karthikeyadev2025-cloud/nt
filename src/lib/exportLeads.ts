import type { Lead } from './database.types';

// Lazy-imports xlsx (already a dependency, used for the bulk-upload import
// path) so this cost is only paid when someone actually exports, not on
// every page load.
export async function exportLeadsToExcel(leads: Lead[], filename: string, staffNameById?: Record<string, string>) {
  const XLSX = await import('xlsx');
  const rows = leads.map(l => ({
    'Customer Name': l.customer_name,
    'Phone': l.phone,
    'Alternate Phone': l.alternate_phone || '',
    'Email': l.email || '',
    'Segment': l.segment_slug,
    'Stage': l.stage,
    'Priority': l.priority || '',
    'Source': l.source || '',
    'Interested In': l.interested_in || '',
    'Address': l.address || '',
    'Assigned To': l.assigned_to ? (staffNameById?.[l.assigned_to] || l.assigned_to) : 'Unassigned',
    'Next Follow-up': l.next_followup_at ? new Date(l.next_followup_at).toLocaleString('en-IN') : '',
    'Callback At': l.callback_at ? new Date(l.callback_at).toLocaleString('en-IN') : '',
    'Appointment At': l.appointment_at ? new Date(l.appointment_at).toLocaleString('en-IN') : '',
    'Appointment Note': l.appointment_note || '',
    'Created': l.created_at ? new Date(l.created_at).toLocaleString('en-IN') : '',
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Leads');
  XLSX.writeFile(wb, filename);
}
