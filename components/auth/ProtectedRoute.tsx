/**
 * ProtectedRoute — alias for ProtectedGuard.
 *
 * Use this component to wrap any page or layout that requires
 * an authenticated Firebase session. Unauthenticated visitors
 * are immediately redirected to / (the login page).
 *
 * Usage:
 *   import ProtectedRoute from "@/components/auth/ProtectedRoute";
 *   <ProtectedRoute>{children}</ProtectedRoute>
 */
export { default } from "@/components/auth/ProtectedGuard";
