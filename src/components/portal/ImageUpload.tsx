import React, { useRef, useState } from 'react';
import { UploadCloud, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';

export function ImageUpload({ 
  value, 
  onChange, 
  bucket = 'site-photos',
  placeholder = "Upload Image",
  className = ""
}: { 
  value: string; 
  onChange: (url: string) => void;
  bucket?: string;
  placeholder?: string;
  className?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setUploading(true);

    try {
      // 1. Read file and create an image element
      const img = document.createElement('img');
      const objectUrl = URL.createObjectURL(file);
      
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = objectUrl;
      });

      URL.revokeObjectURL(objectUrl);

      // 2. Setup canvas for resizing
      const MAX_SIZE = 1024;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_SIZE) {
          height = Math.round((height * MAX_SIZE) / width);
          width = MAX_SIZE;
        }
      } else {
        if (height > MAX_SIZE) {
          width = Math.round((width * MAX_SIZE) / height);
          height = MAX_SIZE;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      
      ctx?.drawImage(img, 0, 0, width, height);

      // 3. Compress to WebP
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/webp', 0.85);
      });

      if (!blob) throw new Error('Failed to compress image');

      // 4. Upload to Supabase
      const ext = 'webp';
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${ext}`;
      const filePath = `${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from(bucket)
        .upload(filePath, blob, {
          contentType: 'image/webp',
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      // 5. Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(data.path);

      onChange(publicUrl);
      toast.success('Image uploaded successfully');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error((err instanceof Error ? err.message : String(err)) || 'Failed to upload image');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const clearImage = () => {
    onChange('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={`relative flex items-center gap-3 ${className}`}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleUpload}
        accept="image/*"
        className="hidden"
      />
      
      {value ? (
        <div className="relative group w-20 h-20 shrink-0">
          <img 
            src={value} 
            alt="Uploaded" 
            className="w-full h-full object-cover rounded-xl border border-nikki-border shadow-sm"
          />
          <button 
            type="button"
            onClick={clearImage}
            className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
            title="Remove Image"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="w-20 h-20 shrink-0 flex flex-col items-center justify-center gap-1 border-2 border-dashed border-stone-300 rounded-xl bg-stone-50 hover:bg-stone-100 hover:border-stone-400 text-stone-500 transition-colors disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="w-5 h-5 animate-spin text-nikki-royal" />
          ) : (
            <ImageIcon className="w-5 h-5" />
          )}
          <span className="text-[10px] font-medium">{uploading ? 'Uploading' : 'Upload'}</span>
        </button>
      )}

      <div className="flex-1 flex flex-col items-start justify-center">
        {!value && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-sm font-semibold text-nikki-blue hover:text-nikki-navy flex items-center gap-2 px-3 py-1.5 bg-nikki-surface-blue hover:bg-nikki-surface-blue rounded-lg transition-colors"
          >
            <UploadCloud className="w-4 h-4" />
            {placeholder}
          </button>
        )}
        {value && (
          <p className="text-xs text-stone-500 max-w-[200px] truncate" title={value}>
            {value}
          </p>
        )}
      </div>
    </div>
  );
}
