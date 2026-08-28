/**
 * Manual mock for @workspace/api-client-react used in Jest tests.
 * Individual tests override these with jest.mocked(...).mockResolvedValue(...)
 */

export const getCurrentAuthUser = jest.fn();
export const loginWithPassword = jest.fn();
export const logoutSession = jest.fn();
export const setAuthTokenGetter = jest.fn();
export const setBaseUrl = jest.fn();
export const customFetch = jest.fn();
export const getBaseUrl = jest.fn(() => 'http://localhost:5000');
export const getAuthToken = jest.fn(() => null);
