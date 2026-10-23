// Business settings that are not prices. Change them here.

// A stock item counts as "low" when its quantity is at or below this number,
// unless the item has its own reorderLevel.
export const LOW_STOCK_THRESHOLD = 5;

// A vehicle is "due for service" this many months after its last service.
export const SERVICE_INTERVAL_MONTHS = 6;

// The steps a job goes through, in order.
export const JOB_STATUSES = ['Booked', 'In progress', 'Ready for pickup', 'Collected'];
// Jobs saved before statuses existed are treated as already finished.
export const LEGACY_JOB_STATUS = 'Collected';

export const PAYMENT_METHODS = ['Cash', 'Mobile money', 'Card', 'Bank transfer'];

export const PAGE_SIZE = 20;
