import { auth } from "@/lib/firebase";

/**
 * Returns the current Firebase user's ID token string.
 * Throws if there is no authenticated user.
 */
export async function getIdToken(): Promise<string> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error("No authenticated user — cannot get ID token.");
  }

  // forceRefresh=false: use cached token if still valid
  const token = await currentUser.getIdToken(false);
  return token;
}
