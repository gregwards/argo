"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { THEME } from "@/lib/theme";

type Phase =
  | "loading"
  | "email-gate"
  | "link-sent"
  | "error-closed"
  | "error-not-found";

export default function AssessEntryPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState("");
  const [assessmentTitle, setAssessmentTitle] = useState("");
  const [assessmentDuration, setAssessmentDuration] = useState<number>(0);
  const [assessmentId, setAssessmentId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function init() {
      // Fetch assessment by slug
      let assessment: any;
      try {
        assessment = await apiFetch(`/api/assessments/by-slug/${slug}`);
      } catch {
        setPhase("error-not-found");
        return;
      }

      if (assessment.status === "closed") {
        setPhase("error-closed");
        return;
      }

      setAssessmentTitle(assessment.title || "");
      setAssessmentDuration(assessment.duration_minutes || 0);
      setAssessmentId(assessment.id || "");

      // Check if already authenticated for this assessment
      // 401 is the normal unauthenticated path — not a bug
      try {
        const me = await apiFetch("/api/auth/me");
        if (me && me.assessment_id === assessment.id) {
          router.push(`/assess/${slug}/lobby`);
          return;
        }
      } catch {
        // Not authed — expected, fall through to email-gate
      }

      setPhase("email-gate");
    }

    init();
  }, [slug, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiFetch("/api/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({ email, assessment_id: assessmentId }),
      });
      setPhase("link-sent");
    } catch {
      // Per D-06: show generic "check your email" regardless of enrollment status
      setPhase("link-sent");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#F4F3F1", fontFamily: "Outfit, sans-serif" }}>
      <div className="max-w-[400px] mx-auto w-full px-4 pt-16 pb-16">
        {/* Logo */}
        <div className="text-center mb-12">
          <span
            className="font-extrabold text-[22px] tracking-[0.01em] lowercase"
            style={{
              background: "linear-gradient(90deg, #2B4066, #38D670)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            argo
          </span>
        </div>

        {/* Loading state */}
        {phase === "loading" && (
          <div style={{ background: "white", borderRadius: 6, border: "1px solid #DFDDD9", padding: 32 }}>
            <div className="flex justify-center">
              <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "#DFDDD9", borderTopColor: "#2B4066" }} />
            </div>
          </div>
        )}

        {/* Email gate */}
        {phase === "email-gate" && (
          <div style={{ background: "white", borderRadius: 6, border: "1px solid #DFDDD9", padding: 32 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600, color: "#28261E", textAlign: "center" }}>
              {assessmentTitle}
            </h1>
            {assessmentDuration > 0 && (
              <p style={{ ...THEME.system.small, textAlign: "center", marginTop: 8 }}>
                Estimated duration: {assessmentDuration} minutes
              </p>
            )}
            <div style={{ borderTop: "1px solid #DFDDD9", margin: "24px 0" }} />
            <form onSubmit={handleSubmit}>
              <label style={{ display: "block", fontSize: 14, color: "#28261E", marginBottom: 8 }}>
                Enter your student email
              </label>
              <input
                type="email"
                autoComplete="email"
                aria-label="Student email address"
                placeholder="your@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                style={{
                  width: "100%", padding: "12px 16px", fontSize: 16,
                  border: "1px solid #DFDDD9", borderRadius: 4,
                  outline: "none", boxSizing: "border-box",
                }}
              />
              <button
                type="submit"
                disabled={loading || !email}
                style={{
                  width: "100%", marginTop: 16, padding: "12px 24px",
                  background: loading || !email ? "#DFDDD9" : "#2B4066",
                  color: loading || !email ? "#9A9894" : "white",
                  fontSize: 15, fontWeight: 500, fontFamily: "Outfit, sans-serif",
                  border: "none", borderRadius: 3,
                  cursor: loading || !email ? "not-allowed" : "pointer",
                  minHeight: 44, letterSpacing: "0.04em",
                }}
              >
                {loading ? "Sending..." : "Continue"}
              </button>
            </form>
          </div>
        )}

        {/* Link sent */}
        {phase === "link-sent" && (
          <div style={{ background: "white", borderRadius: 6, border: "1px solid #DFDDD9", padding: 32 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#28261E", textAlign: "center" }}>
              Check your email
            </h2>
            <p style={{ ...THEME.system.small, textAlign: "center", marginTop: 16 }}>
              {`If ${email} is registered for this assessment, you'll receive a link within a minute. Check your spam folder if it doesn't arrive.`}
            </p>
          </div>
        )}

        {/* Closed assessment */}
        {phase === "error-closed" && (
          <div style={{ background: "white", borderRadius: 6, border: "1px solid #DFDDD9", padding: 32 }}>
            <p style={{ ...THEME.system.small, textAlign: "center" }}>
              This assessment is no longer accepting new submissions.
            </p>
          </div>
        )}

        {/* Not found */}
        {phase === "error-not-found" && (
          <div style={{ background: "white", borderRadius: 6, border: "1px solid #DFDDD9", padding: 32 }}>
            <p style={{ ...THEME.system.small, textAlign: "center" }}>
              Assessment not found.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
