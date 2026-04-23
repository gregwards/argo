/**
 * Detects auth errors from backend and shows a helpful message with a link to the dev console.
 * Use in place of raw error display on instructor/admin pages.
 */
export function AuthErrorBanner({ error }: { error: string }) {
  const isAuthError =
    error.toLowerCase().includes("not authenticated") ||
    error.toLowerCase().includes("invalid token") ||
    error.toLowerCase().includes("user not found");

  if (isAuthError) {
    return (
      <div
        style={{
          padding: "16px 20px",
          background: "#FEF3C7",
          border: "1px solid #FDE68A",
          borderRadius: 6,
          fontSize: 14,
          color: "#92400E",
          fontFamily: "'Outfit', sans-serif",
          lineHeight: 1.6,
        }}
      >
        Not authenticated as an instructor.{" "}
        <a
          href="/dev"
          style={{
            color: "#2B4066",
            fontWeight: 500,
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          Impersonate an instructor in the dev console
        </a>{" "}
        first.
      </div>
    );
  }

  return (
    <p style={{ fontSize: 14, color: "#B91C1C", fontFamily: "'Outfit', sans-serif" }}>
      {error}
    </p>
  );
}
