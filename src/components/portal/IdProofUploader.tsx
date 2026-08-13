import { useCallback, useEffect, useState } from 'react';
import { Upload, FileText, Trash2, CheckCircle2, Eye, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../lib/toast';
import { cardCls, btnCls, inputCls } from './shared';

// staff_id_proofs isn't in database.types.ts yet (generated file, no live
// DB access to regenerate it) — cast at the call boundary, same pattern
// used everywhere else in this codebase for tables/RPCs added via raw SQL
// migration rather than through Supabase's type generator.
type IdProofRow = {
  id: string; staff_user_id: string; doc_type: string; file_path: string; file_name: string;
  uploaded_by: string | null; uploaded_at: string; verified_at: string | null; verified_by: string | null; notes: string;
};

const DOC_TYPE_LABELS: Record<string, string> = {
  aadhaar: 'Aadhaar Card', pan: 'PAN Card', passport: 'Passport',
  driving_license: 'Driving License', voter_id: 'Voter ID', other: 'Other ID Proof',
};

export function IdProofUploader({ staffUserId, canManage }: { staffUserId: string; canManage: boolean }) {
  const { user } = useAuth();
  const toast = useToast();
  const [proofs, setProofs] = useState<IdProofRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [docType, setDocType] = useState('aadhaar');
  const [uploading, setUploading] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('staff_id_proofs' as never)
        .select('*').eq('staff_user_id', staffUserId).order('uploaded_at', { ascending: false }) as unknown as { data: IdProofRow[] | null; error: { message: string } | null };
      if (error) throw error;
      setProofs(data || []);
    } catch (err) {
      toast.error(`Couldn't load ID proofs: ${(err instanceof Error ? err.message : String(err))}`);
    } finally {
      setLoading(false);
    }
  }, [staffUserId]);
  useEffect(() => { load(); }, [load]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file || !user) return;
    if (file.size > 10 * 1024 * 1024) { toast.error('File is too large — 10MB max.'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${staffUserId}/${docType}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('id-proofs').upload(path, file, { contentType: file.type });
      if (upErr) { toast.error(`Upload failed: ${upErr.message}`); return; }
      const { error: dbErr } = await supabase.from('staff_id_proofs' as never).insert({
        staff_user_id: staffUserId, doc_type: docType, file_path: path, file_name: file.name, uploaded_by: user.id,
      } as never);
      if (dbErr) { toast.error(`Saved the file but couldn't record it: ${dbErr.message}`); return; }
      toast.success(`${DOC_TYPE_LABELS[docType]} uploaded`);
      load();
    } finally {
      setUploading(false);
    }
  }

  async function view(proof: IdProofRow) {
    if (signedUrls[proof.id]) { window.open(signedUrls[proof.id], '_blank'); return; }
    const { data, error } = await supabase.storage.from('id-proofs').createSignedUrl(proof.file_path, 300);
    if (error || !data) { toast.error("Couldn't open file"); return; }
    setSignedUrls(prev => ({ ...prev, [proof.id]: data.signedUrl }));
    window.open(data.signedUrl, '_blank');
  }

  async function remove(proof: IdProofRow) {
    if (!window.confirm(`Delete ${proof.file_name || DOC_TYPE_LABELS[proof.doc_type]}? This can't be undone.`)) return;
    const { error: sErr } = await supabase.storage.from('id-proofs').remove([proof.file_path]);
    if (sErr) { toast.error(`Couldn't delete file: ${sErr.message}`); return; }
    const { error: dErr } = await supabase.from('staff_id_proofs' as never).delete().eq('id', proof.id);
    if (dErr) { toast.error(`Couldn't remove record: ${dErr.message}`); return; }
    toast.success('Deleted');
    load();
  }

  async function verify(proof: IdProofRow) {
    if (!user) return;
    const { error } = await supabase.from('staff_id_proofs' as never)
      .update({ verified_at: new Date().toISOString(), verified_by: user.id } as never).eq('id', proof.id);
    if (error) { toast.error(`Couldn't verify: ${error.message}`); return; }
    toast.success('Marked verified');
    load();
  }

  return (
    <div className={cardCls}>
      <h3 className="text-nikki-navy font-bold text-sm mb-1">ID Proof Documents</h3>
      <p className="text-stone-700 text-xs mb-3">Aadhaar, PAN, passport, or other government ID — {canManage ? 'upload for this staff member' : 'upload your own'}.</p>

      <div className="flex gap-2 mb-4">
        <select className={inputCls + ' flex-1'} value={docType} onChange={e => setDocType(e.target.value)}>
          {Object.entries(DOC_TYPE_LABELS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        <label className={btnCls + ' cursor-pointer flex items-center gap-1.5 shrink-0'}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {uploading ? 'Uploading...' : 'Upload'}
          <input type="file" accept="image/*,.pdf" className="hidden" disabled={uploading} onChange={handleFile} />
        </label>
      </div>

      {loading ? (
        <p className="text-stone-500 text-xs text-center py-4">Loading...</p>
      ) : proofs.length === 0 ? (
        <p className="text-stone-500 text-xs text-center py-4">No ID proof uploaded yet.</p>
      ) : (
        <div className="space-y-2">
          {proofs.map(p => (
            <div key={p.id} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-stone-50 border border-nikki-border">
              <FileText className="w-4 h-4 text-stone-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-nikki-navy text-xs font-semibold truncate">{DOC_TYPE_LABELS[p.doc_type] || p.doc_type}</p>
                <p className="text-stone-500 text-[11px] truncate">{p.file_name} • {new Date(p.uploaded_at).toLocaleDateString('en-IN')}</p>
              </div>
              {p.verified_at && (
                <span className="flex items-center gap-1 text-emerald-700 text-[11px] font-bold shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /> Verified</span>
              )}
              <button onClick={() => view(p)} className="p-1.5 rounded-lg hover:bg-nikki-border text-stone-600 shrink-0" title="View"><Eye className="w-3.5 h-3.5" /></button>
              {canManage && !p.verified_at && (
                <button onClick={() => verify(p)} className="text-[11px] font-bold text-nikki-blue shrink-0">Verify</button>
              )}
              <button onClick={() => remove(p)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 shrink-0" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
