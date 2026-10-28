// The settings pages and the groups of settings each one edits.
export const SETTINGS_PAGES: { slug: string; label: string; group?: string; note?: string }[] = [
  { slug: 'catalog', label: 'Catalog' },
  { slug: 'pricing', label: 'Pricing', group: 'pricing' },
  { slug: 'sizes', label: 'Size rules', group: 'sizes' },
  { slug: 'machine', label: 'Machine', group: 'machine' },
  { slug: 'engine', label: 'Engine', group: 'engine' },
  { slug: 'export', label: 'Export', group: 'export' },
  { slug: 'nesting', label: 'Nesting', group: 'nesting' },
  { slug: 'production', label: 'Production', group: 'production' },
  { slug: 'payments', label: 'Payments', group: 'payments' },
  { slug: 'tax', label: 'Tax', group: 'tax' },
  { slug: 'business', label: 'Business', group: 'business' },
  { slug: 'emails', label: 'Emails', group: 'emails' },
  { slug: 'spam', label: 'Spam protection', group: 'spam' },
  { slug: 'users', label: 'Users and roles', note: 'Sign-in, users and roles arrive in phase 4. The owner and production roles are already in the database.' },
];

export const CATEGORIES: { key: string; label: string }[] = [
  { key: 'product', label: 'Products' },
  { key: 'style', label: 'Construction styles' },
  { key: 'backer_shape', label: 'Backer shapes' },
  { key: 'size', label: 'Sizes' },
  { key: 'material', label: 'Materials' },
  { key: 'finish_type', label: 'Finishes' },
  { key: 'paint', label: 'Paint colours' },
  { key: 'stain', label: 'Stains' },
  { key: 'topcoat', label: 'Topcoats' },
  { key: 'placement', label: 'Placement' },
  { key: 'font', label: 'Fonts' },
  { key: 'addon', label: 'Add-ons' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'payment_method', label: 'Payment methods' },
];
