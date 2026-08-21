/**
 * Keep the ownership decision independent from the database lookup so it can
 * be regression-tested without invoking the edge function.
 */
export function isAllowedUser(
  requestedUserId: string,
  ipAddress: string | null,
  walletAddress: string | null,
): boolean {
  if (!requestedUserId) return false;
  return requestedUserId === ipAddress || requestedUserId === walletAddress;
}