const STORAGE_PREFIX = 'nikki_';

export const storage = {
  get: <T>(key: string, defaultValue: T): T => {
    try {
      const item = localStorage.getItem(STORAGE_PREFIX + key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  },

  set: <T>(key: string, value: T): void => {
    try {
      localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
    } catch (error) {
      console.error('Storage error:', error);
    }
  },

  remove: (key: string): void => {
    localStorage.removeItem(STORAGE_PREFIX + key);
  },

  clear: (): void => {
    Object.keys(localStorage)
      .filter(key => key.startsWith(STORAGE_PREFIX))
      .forEach(key => localStorage.removeItem(key));
  }
};

export interface Service {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface GalleryImage {
  id: string;
  url: string;
  alt: string;
  category: string;
}

export interface Testimonial {
  id: string;
  name: string;
  role: string;
  content: string;
  rating: number;
}

export interface SolarDetail {
  id: string;
  title: string;
  description: string;
}

export interface CCTVDetail {
  id: string;
  title: string;
  description: string;
}

export interface Technician {
  id: string;
  name: string;
  role: string;
  experience: string;
  photoUrl?: string;
}

export interface Benefit {
  id: string;
  title: string;
  description: string;
  icon: string;
}

export interface SiteContent {
  heroTitle: string;
  heroSubtitle: string;
  aboutText: string;
  contactEmail: string;
  contactPhone: string;
  contactAddress: string;
  whatsappNumber: string;
}

export interface MDInfo {
  name: string;
  title: string;
  message: string;
  photoUrl?: string;
}

export interface CareerApplication {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  position: string;
  experience: string;
  message: string;
  photoUrl?: string;
  submittedAt: string;
}

export interface InvestmentInquiry {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  investmentAmount: string;
  investmentType: string;
  message: string;
  submittedAt: string;
}

const defaultContent: SiteContent = {
  heroTitle: 'Powering Tomorrow with Solar Energy',
  heroSubtitle: 'Leading provider of solar solutions and CCTV installations across India',
  aboutText: 'Nikki Technologies is committed to sustainable energy solutions.',
  contactEmail: 'contact@nikkienterprises.com',
  contactPhone: '+91 98765 43210',
  contactAddress: 'Mumbai, Maharashtra, India',
  whatsappNumber: '919876543210'
};

const defaultMD: MDInfo = {
  name: 'Managing Director',
  title: 'MD & Founder',
  message: 'Welcome to Nikki Technologies. We are committed to delivering excellence.',
  photoUrl: 'https://images.pexels.com/photos/2182970/pexels-photo-2182970.jpeg?auto=compress&cs=tinysrgb&w=400'
};

export function initializeStorage() {
  if (!storage.get('content', null)) {
    storage.set('content', defaultContent);
  }
  if (!storage.get('md_info', null)) {
    storage.set('md_info', defaultMD);
  }
  if (!storage.get('services', null)) {
    storage.set('services', []);
  }
  if (!storage.get('gallery', null)) {
    storage.set('gallery', []);
  }
  if (!storage.get('testimonials', null)) {
    storage.set('testimonials', []);
  }
  if (!storage.get('solar_details', null)) {
    storage.set('solar_details', []);
  }
  if (!storage.get('cctv_details', null)) {
    storage.set('cctv_details', []);
  }
  if (!storage.get('technicians', null)) {
    storage.set('technicians', []);
  }
  if (!storage.get('benefits', null)) {
    storage.set('benefits', []);
  }
  if (!storage.get('career_applications', null)) {
    storage.set('career_applications', []);
  }
  if (!storage.get('investment_inquiries', null)) {
    storage.set('investment_inquiries', []);
  }
}
