import { PAGE_SIZE } from '../config/business.mjs';

// Works out which slice of a long list to show, and what the page links need.
export const paginate = (query, totalItems, pageSize = PAGE_SIZE) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const requested = Number.parseInt(query?.page, 10);
  const page = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), totalPages) : 1;
  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    skip: (page - 1) * pageSize,
    hasPrev: page > 1,
    hasNext: page < totalPages,
    from: totalItems ? (page - 1) * pageSize + 1 : 0,
    to: Math.min(page * pageSize, totalItems),
  };
};

// Builds "?q=abc&page=2" style links while keeping the other filters.
export const pageLink = (params, page) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...params, page })) {
    if (value !== undefined && value !== null && value !== '' && !(key === 'page' && Number(value) === 1)) {
      search.set(key, value);
    }
  }
  const text = search.toString();
  return text ? `?${text}` : '?';
};
