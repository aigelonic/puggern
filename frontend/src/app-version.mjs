export const APP_VERSION = '0.1.0'; // x-release-please-version

export function isValidAppVersion(value) {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    value === value.trim() &&
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
  );
}

if (!isValidAppVersion(APP_VERSION)) {
  throw new TypeError('Invalid application version');
}
