export function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function text(value, label, max, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) {
    fail(400, `${label} must be ${min}–${max} characters.`);
  }
  return value.trim();
}

export function id(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail(400, 'Invalid identifier.');
  return Number(value);
}
