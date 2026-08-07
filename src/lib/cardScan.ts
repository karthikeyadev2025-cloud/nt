// Business-card OCR for field staff, using Tesseract.js loaded from a CDN
// at the moment it's actually needed — not bundled into the app, since
// the WASM OCR engine is multiple megabytes and only marketing executives
// ever use this feature.
declare global {
  interface Window {
    Tesseract?: {
      createWorker: (lang: string) => Promise<{
        recognize: (image: string) => Promise<{ data: { text: string } }>;
        terminate: () => Promise<void>;
      }>;
    };
  }
}

let loadPromise: Promise<void> | null = null;
function loadTesseract(): Promise<void> {
  if (window.Tesseract) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    script.onload = () => resolve();
    script.onerror = () => { loadPromise = null; reject(new Error('Could not load OCR engine — check your connection')); };
    document.head.appendChild(script);
  });
  return loadPromise;
}

export type CardExtract = { name: string; phone: string; email: string; rawText: string };

// Very deliberately a best-effort heuristic, not a real parser: OCR text
// from a business card has no reliable structure. Phone and email are
// found by pattern match (high confidence); "name" is just the first line
// that isn't a phone/email/URL, which is right often enough to save typing
// but is always shown to the user to confirm or fix, never applied silently.
export async function scanBusinessCard(imageDataUrl: string): Promise<CardExtract> {
  await loadTesseract();
  if (!window.Tesseract) throw new Error('OCR engine unavailable');
  const worker = await window.Tesseract.createWorker('eng');
  try {
    const { data } = await worker.recognize(imageDataUrl);
    const text = data.text || '';
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

    const phoneMatch = text.match(/(\+?\d[\d\s-]{8,14}\d)/);
    const emailMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    const nameLine = lines.find(l =>
      !/@/.test(l) && !/\d{5,}/.test(l) && !/^(www\.|http)/i.test(l) && l.length > 2 && l.length < 40
    ) || '';

    return {
      name: nameLine,
      phone: phoneMatch ? phoneMatch[1].replace(/[\s-]/g, '') : '',
      email: emailMatch ? emailMatch[0] : '',
      rawText: text,
    };
  } finally {
    await worker.terminate();
  }
}
