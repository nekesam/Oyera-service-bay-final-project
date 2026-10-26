import Stock from '../models/Stock.mjs';
import { LOW_STOCK_THRESHOLD } from '../config/business.mjs';

// An item is "low" when quantity <= its own reorderLevel, or the shop-wide threshold if it has none.
export const isLowStock = (item) => (Number(item.quantity) || 0) <= (item.reorderLevel ?? LOW_STOCK_THRESHOLD);

export const findLowStock = (limit = 10) =>
  Stock.find({ $expr: { $lte: ['$quantity', { $ifNull: ['$reorderLevel', LOW_STOCK_THRESHOLD] }] } })
    .sort({ quantity: 1, itemName: 1 })
    .limit(limit)
    .lean();
