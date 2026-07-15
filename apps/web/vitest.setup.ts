/// <reference types="vitest/globals" />
import '@testing-library/jest-dom';

// jsdom не реализует URL.createObjectURL/revokeObjectURL — задаём заглушки,
// чтобы тесты, шпионящие за ними (downloadFile), могли работать.
if (typeof URL.createObjectURL === 'undefined') {
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => 'blob:mock-url',
    writable: true,
    configurable: true,
  });
}
if (typeof URL.revokeObjectURL === 'undefined') {
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: () => undefined,
    writable: true,
    configurable: true,
  });
}
