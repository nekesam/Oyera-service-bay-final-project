// All money rules live here, in one place, so they are easy to read and to change.
// Amounts are in UGX.

export const LABOUR_CHARGE = 20000;

// Services that carry their own charge. Any other service costs nothing extra
// (the flat labour charge already covers it).
export const SERVICE_PRICES = {
  'Wheel Alignment': 30000,
  'Wheel Balance': 20000,
};

// Allowed unit-price bands for parts whose price is easy to mistype.
export const PRICE_RULES = [
  { label: 'Engine Oil', keywords: ['engine oil'], min: 79000, max: 200000 },
  { label: 'Brake Fluid', keywords: ['brake fluid'], min: 13000, max: 20000 },
  { label: 'Oil Filter', keywords: ['oil filter'], min: 15000, max: 20000 },
];
