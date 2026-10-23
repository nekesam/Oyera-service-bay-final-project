import { SERVICE_INTERVAL_MONTHS } from '../config/business.mjs';

// A vehicle is due for service SERVICE_INTERVAL_MONTHS after its last service.
// A vehicle that has never been serviced counts from the day it was registered,
// so a brand-new vehicle is not flagged on day one.

export const serviceDueCutoff = (now = new Date()) => {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - SERVICE_INTERVAL_MONTHS);
  return cutoff;
};

export const nextServiceDate = (vehicle) => {
  const from = vehicle.lastService || vehicle.createdAt;
  if (!from) return null;
  const due = new Date(from);
  due.setMonth(due.getMonth() + SERVICE_INTERVAL_MONTHS);
  return due;
};

export const isServiceDue = (vehicle, now = new Date()) => {
  const due = nextServiceDate(vehicle);
  return Boolean(due) && due <= now;
};
