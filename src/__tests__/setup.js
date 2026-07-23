import '@testing-library/jest-dom/vitest';

// jsdom does not implement scrollIntoView; stub it so component tests
// exercising TimeCell keyboard navigation do not throw unhandled errors.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
