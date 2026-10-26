import Stock from '../models/Stock.mjs';
import { InsufficientStockError } from '../utils/errors.mjs';

// WHY "conditional" updates?
// The old code did: 1) read quantity, 2) check it is enough, 3) subtract.
// Two staff members saving at the same moment could both pass step 2 and take
// stock below zero. Here the check and the subtraction are ONE database
// operation: "subtract 3 only if quantity >= 3". MongoDB runs it atomically,
// so exactly one of two competing requests wins.

const sumByStockId = (parts) => {
  const totals = new Map();
  for (const part of parts) {
    const id = String(part.stockId);
    totals.set(id, (totals.get(id) || 0) + Number(part.quantity));
  }
  return totals;
};

// Older records may only remember the part's NAME, not its stock id. Find the id.
export const normalizeParts = async (parts = []) => {
  const resolved = [];
  for (const part of parts) {
    const quantity = Number(part?.quantity) || 0;
    if (quantity <= 0) continue;
    let stockId = part.stockId;
    if (!stockId && part.itemName) {
      stockId = (await Stock.findOne({ itemName: part.itemName }).select('_id').lean())?._id;
    }
    if (stockId) resolved.push({ stockId, quantity });
  }
  return resolved;
};

export const releaseStock = async (parts) => {
  for (const [stockId, quantity] of sumByStockId(parts)) {
    await Stock.updateOne({ _id: stockId }, { $inc: { quantity } });
  }
};

// Takes stock for all parts or none. If one part is short, everything taken so far is put back.
export const reserveStock = async (parts) => {
  const taken = [];
  try {
    for (const [stockId, quantity] of sumByStockId(parts)) {
      const updated = await Stock.findOneAndUpdate(
        { _id: stockId, quantity: { $gte: quantity } },
        { $inc: { quantity: -quantity } },
        { returnDocument: 'after' },
      );
      if (!updated) {
        const current = await Stock.findById(stockId).select('itemName quantity').lean();
        throw new InsufficientStockError(current?.itemName || 'a selected item', current?.quantity ?? 0, quantity);
      }
      taken.push({ stockId, quantity });
    }
  } catch (error) {
    await releaseStock(taken);
    throw error;
  }
};

// Compares the parts a job used BEFORE an edit with the parts it uses AFTER.
// Only the difference moves in or out of stock.
// Example: job used 2 oil filters, edited to 5  -> take 3 more.
//          job used 4 brake pads, edited to 1   -> give 3 back.
export const diffParts = (oldParts, newParts) => {
  const before = sumByStockId(oldParts);
  const after = sumByStockId(newParts);
  const increase = [];
  const decrease = [];
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(id) || 0) - (before.get(id) || 0);
    if (delta > 0) increase.push({ stockId: id, quantity: delta });
    if (delta < 0) decrease.push({ stockId: id, quantity: -delta });
  }
  return { increase, decrease };
};
