import { useEffect, useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function WhatsAppButton() {
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [showPopup, setShowPopup] = useState(false);

  useEffect(() => {
    loadWhatsAppSettings();
  }, []);

  async function loadWhatsAppSettings() {
    const { data } = await supabase
      .from('site_content')
      .select('value')
      .eq('section', 'contact')
      .eq('key', 'whatsapp')
      .maybeSingle();

    if (data?.value) {
      setWhatsappNumber(data.value);
    }
  }

  const handleWhatsAppClick = () => {
    if (!whatsappNumber) return;

    const cleanNumber = whatsappNumber.replace(/\D/g, '');

    const message = `Hi! I found your website *nikkitechnologies.com* and I'm interested in your solar and CCTV solutions.

🌐 Website: https://nikkitechnologies.com

Please provide more information about:
• Solar panel installation
• CCTV camera systems
• Pricing and quotation

Looking forward to hearing from you!`;

    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(message)}`;

    window.open(whatsappUrl, '_blank');
    setShowPopup(false);
  };

  if (!whatsappNumber) return null;

  return (
    <>
      <button
        onClick={() => setShowPopup(true)}
        className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-14 h-14 sm:w-16 sm:h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full shadow-2xl hover:shadow-green-500/50 hover:scale-110 active:scale-95 transition-all duration-300 flex items-center justify-center group animate-bounce-slow"
        aria-label="Contact us on WhatsApp"
      >
        <MessageCircle className="w-7 h-7 sm:w-8 sm:h-8 text-white group-hover:scale-110 transition-transform" />
        <span className="absolute -top-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-red-500 rounded-full animate-pulse"></span>
      </button>

      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowPopup(false)}>
          <div
            className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-2xl shadow-2xl max-w-md w-full p-6 relative animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPopup(false)}
              className="absolute top-4 right-4 w-8 h-8 bg-slate-800 hover:bg-slate-700 rounded-full flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5 text-slate-400" />
            </button>

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green-500/30">
                <MessageCircle className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-black text-white mb-2">Chat with Us on WhatsApp</h3>
              <p className="text-slate-400">Get instant responses to your queries</p>
            </div>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 mb-6">
              <p className="text-slate-300 text-sm leading-relaxed">
                Hi! We're here to help you with solar and CCTV solutions. Click below to start chatting with our team on WhatsApp.
              </p>
            </div>

            <button
              onClick={handleWhatsAppClick}
              className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white py-4 rounded-xl font-bold hover:shadow-xl hover:shadow-green-500/30 transition-all duration-300 flex items-center justify-center space-x-2 group"
            >
              <MessageCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
              <span>Start Chat on WhatsApp</span>
            </button>

            <p className="text-slate-500 text-xs text-center mt-4">
              Available: Monday - Saturday, 9 AM - 7 PM
            </p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce-slow {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-10px);
          }
        }

        @keyframes scale-in {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-bounce-slow {
          animation: bounce-slow 2s ease-in-out infinite;
        }

        .animate-scale-in {
          animation: scale-in 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
