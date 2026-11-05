/**
 * Public entry point for ts-percent-encoding.
 *
 * We re-export from core.js rather than defining the API here so that the
 * implementation stays in one place and the entry point remains a thin,
 * stable surface. Consumers should import from this module only.
 */

export { decode, decodeComponent, PercentEncodingError } from './core.js';
