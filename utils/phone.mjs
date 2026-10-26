// One canonical way to store a Ugandan phone number: 10 digits starting with 0 (e.g. 0758979048).
// Accepts what people actually type: "+256 758 979048", "256758979048", "0758-979-048", "758979048".
export const normalizePhone = (value) => {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('2567')) {
    digits = `0${digits.slice(3)}`;
  } else if (digits.startsWith('7') && digits.length === 9) {
    digits = `0${digits}`;
  }
  return digits;
};
