/**
 * In-memory AsyncStorage mock used by Jest.
 * Mirrors the real API: getItem / setItem / removeItem all return Promises.
 */
let store = {};

const AsyncStorage = {
  getItem: jest.fn((key) => Promise.resolve(store[key] ?? null)),
  setItem: jest.fn((key, value) => {
    store[key] = value;
    return Promise.resolve();
  }),
  removeItem: jest.fn((key) => {
    delete store[key];
    return Promise.resolve();
  }),
  clear: jest.fn(() => {
    store = {};
    return Promise.resolve();
  }),
  // Helper exposed only for tests: reset state between cases
  __reset: () => {
    store = {};
    AsyncStorage.getItem.mockClear();
    AsyncStorage.setItem.mockClear();
    AsyncStorage.removeItem.mockClear();
    AsyncStorage.clear.mockClear();
    // Re-bind closures so cleared mocks still read/write `store`
    AsyncStorage.getItem.mockImplementation((key) => Promise.resolve(store[key] ?? null));
    AsyncStorage.setItem.mockImplementation((key, value) => {
      store[key] = value;
      return Promise.resolve();
    });
    AsyncStorage.removeItem.mockImplementation((key) => {
      delete store[key];
      return Promise.resolve();
    });
    AsyncStorage.clear.mockImplementation(() => {
      store = {};
      return Promise.resolve();
    });
  },
  __getStore: () => ({ ...store }),
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;
