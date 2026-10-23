import { LABOUR_CHARGE, SERVICE_PRICES, PRICE_RULES } from '../config/pricing.mjs';
import { DomainError } from '../utils/errors.mjs';

const formatUGX = (value) => `UGX ${Number(value).toLocaleString('en-US')}`;

export const normalizeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
};

export const findPriceRule = (item) => {
  const text = `${item.itemName || ''} ${item.category || ''}`.toLowerCase();
  return PRICE_RULES.find((rule) => rule.keywords.some((keyword) => text.includes(keyword)));
};

// Returns the part's unit price, or throws a clear error if it looks wrong.
// (The old code silently "fixed" the price while billing. Now the customer is never
// charged a price nobody approved: the stock item must be corrected first.)
export const checkedUnitPrice = (stockItem) => {
  const price = Number(stockItem.unitPrice);
  if (!Number.isFinite(price) || price < 0) {
    throw new DomainError(`"${stockItem.itemName}" has no valid unit price. Update it in Inventory before using it in a service.`);
  }
  const rule = findPriceRule(stockItem);
  if (rule && (price < rule.min || price > rule.max)) {
    throw new DomainError(
      `The price of "${stockItem.itemName}" (${formatUGX(price)}) is outside the allowed range ` +
        `${formatUGX(rule.min)} to ${formatUGX(rule.max)}. Correct it in Inventory before billing.`,
    );
  }
  return price;
};

// Merges duplicate rows (same part picked twice) into one quantity per stock id.
export const mergeRequestedParts = (partIds, partQuantities) => {
  const ids = normalizeArray(partIds);
  const quantities = normalizeArray(partQuantities);
  const merged = new Map();
  ids.forEach((rawId, index) => {
    const id = String(rawId || '').trim();
    const quantity = Number(quantities[index]);
    if (!id || !Number.isFinite(quantity) || quantity <= 0) return;
    merged.set(id, (merged.get(id) || 0) + quantity);
  });
  return merged;
};

// Builds the itemised bill. `parts` is [{ stockItem, quantity }].
// Every line stores the price AT THE TIME of the job, so later price changes
// in Inventory never rewrite history.
export const buildLineItems = ({ servicesDone, parts }) => {
  const lineItems = [{ type: 'labour', description: 'Labour', quantity: 1, unitPrice: LABOUR_CHARGE, amount: LABOUR_CHARGE }];

  for (const service of normalizeArray(servicesDone).filter(Boolean)) {
    const price = SERVICE_PRICES[service] || 0;
    if (price > 0) {
      lineItems.push({ type: 'service', description: service, quantity: 1, unitPrice: price, amount: price });
    }
  }

  for (const { stockItem, quantity } of parts) {
    const unitPrice = checkedUnitPrice(stockItem);
    lineItems.push({
      type: 'part',
      description: stockItem.itemName,
      stockId: stockItem._id,
      quantity,
      unitPrice,
      amount: unitPrice * quantity,
    });
  }

  const totalCost = lineItems.reduce((sum, line) => sum + line.amount, 0);
  return { lineItems, totalCost };
};
