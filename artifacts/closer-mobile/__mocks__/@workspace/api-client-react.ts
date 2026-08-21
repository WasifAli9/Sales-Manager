// Manual mock for @workspace/api-client-react used in Jest tests.
// Individual tests override these with jest.mocked(...).mockResolvedValue(...)

export const getCurrentAuthUser = jest.fn();
export const loginWithPassword = jest.fn();
export const logoutSession = jest.fn();
export const setAuthTokenGetter = jest.fn();
export const setBaseUrl = jest.fn();

export type AuthUser = {
  id: number;
  email: string;
  name: string;
  role: string;
};
