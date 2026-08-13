import { supabase } from '../../lib/supabase';

// Pure helpers used by the Documents & Onboarding module — split out of
// documents.tsx specifically because it also exports React components,
// and mixing the two defeats Vite's fast-refresh (an edit to a plain
// function here would force a full reload of every component in
// documents.tsx too, not just the one that changed).

export const DOC_TYPE_LABELS: Record<string, string> = {
  offer_letter: 'Offer Letter',
  appointment_letter: 'Appointment Letter',
  welcome_letter: 'Welcome Letter',
  roles_responsibilities: 'Roles & Responsibilities',
  job_description: 'Job Description',
  confirmation_letter: 'Confirmation Letter',
  nda: 'Confidentiality Agreement (NDA)',
  code_of_conduct: 'Code of Conduct',
  posh_policy: 'POSH Policy',
  it_asset_policy: 'IT & Asset Policy',
  leave_policy: 'Leave Policy',
  salary_certificate: 'Salary Certificate',
  increment_letter: 'Increment / Promotion Letter',
  warning_letter: 'Warning Letter',
  experience_letter: 'Experience Letter',
  relieving_letter: 'Relieving Letter',
  internship_certificate: 'Internship Certificate',
  policy: 'Policy',
  other: 'Document',
};

export function renderTemplate(body: string, vars: Record<string, string>) {
  return Object.entries(vars).reduce(
    (text, [key, val]) => text.split(`{{${key}}}`).join(val || '—'),
    body
  );
}

export function buildOnboardingVars(user: {
  full_name: string; designation: string | null; role: string; segmentName: string;
  joining_date: string | null; salary_structure: { ctc?: number } | null; employment_type: string | null;
  reporting_time?: string | null; staff_code?: string | null; exit_date?: string | null;
}) {
  return {
    name: user.full_name,
    designation: user.designation || user.role,
    role: user.role,
    segment: user.segmentName,
    joining_date: user.joining_date ? new Date(user.joining_date ?? '').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—',
    ctc: user.salary_structure?.ctc ? Number(user.salary_structure.ctc).toLocaleString('en-IN') : '—',
    employment_type: (user.employment_type || 'full_time').replace('_', ' '),
    reporting_time: user.reporting_time || '9:30 AM – 6:30 PM, Monday to Saturday',
    staff_code: user.staff_code || '—',
    // Exit-document templates (experience, relieving, internship certificate)
    exit_date: user.exit_date
      ? new Date(user.exit_date ?? '').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
      : '—',
    // Issue date, used as the letterhead date on every document
    today: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
    company: 'Nikki Technologies',
  };
}

// Stamp the issuing user's saved signature onto a batch of newly-issued
// document rows, if they have one saved. Best-effort — a document still
// issues fine without a saved signature, just without the auto-stamp.
export async function stampCompanySignature(userId: string, docIds: string[]) {
  if (docIds.length === 0) return;
  const { data } = await supabase.from('app_users').select('signature_data_url').eq('id', userId).maybeSingle();
  const sig = (data as { signature_data_url?: string } | null)?.signature_data_url;
  if (!sig) return;
  await supabase.from('employee_documents').update({
    company_signature_data_url: sig, company_signed_by: userId, company_signed_at: new Date().toISOString(),
  } as never).in('id', docIds);
}
