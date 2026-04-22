"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Status = "verifying" | "error";

function VerifyContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [status, setStatus] = useState<Status>("verifying");
  const [errorMessage, setErrorMessage] = useState("");
  const [assessmentSlug, setAssessmentSlug] = useState("");

  useEffect(() => {
    if (!token) {
      setErrorMessage("No verification token provided.");
      setStatus("error");
      return;
    }

    async function verify() {
      try {
        // Backend sets httpOnly cookie on success and returns the assessment slug
        const data = await apiFetch(`/api/auth/verify?token=${token}`);
        const slug = data.slug || data.assessment_slug || "";
        setAssessmentSlug(slug);
        router.push(`/assess/${slug}/lobby`);
      } catch {
        setErrorMessage("This link has expired.");
        setStatus("error");
      }
    }

    verify();
  }, [token, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4" style={{ background: "#F4F3F1", fontFamily: "Outfit, sans-serif" }}>
      {/* Logo */}
      <div className="mb-12">
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

      {status === "verifying" && (
        <div className="flex flex-col items-center gap-4">
          <p style={{ fontSize: 16, color: "#6A6862" }}>Verifying your link...</p>
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "#DFDDD9", borderTopColor: "#2B4066" }} />
        </div>
      )}

      {status === "error" && (
        <div style={{ maxWidth: 400, width: "100%", background: "white", borderRadius: 6, border: "1px solid #DFDDD9", padding: 32, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: "#28261E", marginBottom: 16 }}>
            This link has expired.
          </h1>
          <p style={{ fontSize: 15, color: "#6A6862" }}>
            {assessmentSlug ? (
              <>
                Return to{" "}
                <a
                  href={`/assess/${assessmentSlug}`}
                  style={{ color: "#2B4066", textDecoration: "underline", textUnderlineOffset: 2 }}
                >
                  the assessment
                </a>{" "}
                to request a new one.
              </>
            ) : (
              "Return to the assessment to request a new one."
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export default function AuthVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex flex-col items-center justify-center" style={{ background: "#F4F3F1" }}>
          <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "#DFDDD9", borderTopColor: "#2B4066" }} />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
