"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Assessment {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  course_name: string;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
}

async function devFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...opts, credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

// --- Pipeline Steps ---

const PIPELINE_STEPS = [
  { num: 1, title: "Create", desc: "Instructor defines learning outcomes and assessment parameters" },
  { num: 2, title: "Share", desc: "Students receive a magic link to access the assessment" },
  { num: 3, title: "Assess", desc: "Student has a 10-20 min adaptive voice conversation with AI" },
  { num: 4, title: "Profile", desc: "AI generates a competency profile with evidence-backed findings" },
  { num: 5, title: "Review", desc: "Instructor sees performance data across all students" },
];

export default function DemoPage() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string>("");

  useEffect(() => {
    devFetch("/api/dev/data").then((data) => {
      if (data) {
        setAssessments(data.assessments || []);
        setUsers(data.users || []);
      }
      setLoading(false);
    });
  }, []);

  const publishedAssessment = assessments.find((a) => a.status === "published" && a.slug);
  const studentUser = users.find((u) => u.role === "student");
  const instructorUser = users.find((u) => u.role === "instructor");

  async function handleTakeAssessment() {
    if (!publishedAssessment || !studentUser) return;
    setActionLoading("take");
    await devFetch(
      `/api/dev/impersonate?user_id=${studentUser.id}&assessment_id=${publishedAssessment.id}&role=student`,
      { method: "POST" },
    );
    router.push(`/assess/${publishedAssessment.slug}`);
  }

  async function handleBuildAssessment() {
    if (!instructorUser) return;
    setActionLoading("build");
    await devFetch(
      `/api/dev/impersonate?user_id=${instructorUser.id}&role=instructor`,
      { method: "POST" },
    );
    router.push("/instructor/assessment/new");
  }

  return (
    <div style={{ background: "#F4F3F1", minHeight: "100vh", fontFamily: "'Outfit', sans-serif", color: "#28261E" }}>
      {/* Header */}
      <div
        style={{
          display: "flex", alignItems: "center", padding: "10px 24px",
          background: "#ECEAE8", borderBottom: "1.5px solid #DFDDD9",
          position: "sticky", top: 0, zIndex: 10,
        }}
      >
        <div
          style={{
            fontWeight: 800, fontSize: 20, letterSpacing: "0.01em",
            background: "linear-gradient(90deg, #2B4066, #38D670)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}
        >
          argo
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 28px 80px" }}>

        {/* Intro */}
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, letterSpacing: "-0.02em" }}>
          Argo demo
        </h1>
        <p style={{ fontSize: 16, color: "#6A6862", lineHeight: 1.6, marginBottom: 40, maxWidth: 600 }}>
          AI oral assessment. Students have a voice conversation with an AI assessor that adapts in real time. The system produces a competency profile that no written exam can replicate.
        </p>

        {/* Pipeline Overview */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#9A9894", marginBottom: 16 }}>
            How it works
          </div>
          <div style={{ display: "flex", gap: 0, flexWrap: "wrap" as const }}>
            {PIPELINE_STEPS.map((step, i) => (
              <div key={step.num} style={{ display: "flex", alignItems: "stretch" }}>
                <div
                  style={{
                    background: "white",
                    border: "1px solid #E4E2DE",
                    borderRadius: 6,
                    padding: "16px 18px",
                    width: 132,
                    display: "flex",
                    flexDirection: "column" as const,
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#2B4066", marginBottom: 6 }}>
                    {step.num}. {step.title}
                  </div>
                  <div style={{ fontSize: 12, color: "#6A6862", lineHeight: 1.45 }}>
                    {step.desc}
                  </div>
                </div>
                {i < PIPELINE_STEPS.length - 1 && (
                  <div style={{ display: "flex", alignItems: "center", padding: "0 6px", color: "#BBBAB6", fontSize: 16 }}>
                    &rarr;
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Walkthrough */}
        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: "#9A9894", marginBottom: 16 }}>
          Try it yourself
        </div>

        {loading ? (
          <div style={{ color: "#9A9894", fontSize: 14 }}>Loading...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" as const, gap: 20 }}>

            {/* Step 1: Take assessment */}
            <div
              style={{
                background: "white", border: "1px solid #E4E2DE", borderRadius: 8,
                padding: "28px 28px 24px", position: "relative" as const,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div
                  style={{
                    width: 32, height: 32, borderRadius: "50%", background: "#2B4066",
                    color: "white", fontSize: 15, fontWeight: 600,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginTop: 2,
                  }}
                >
                  1
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
                    Take an assessment as a student
                  </div>
                  <p style={{ fontSize: 14, color: "#6A6862", lineHeight: 1.55, marginBottom: 16 }}>
                    You'll have a voice conversation with the AI assessor. It adapts its questions based on your responses. When you're done, the system generates a competency profile with per-criterion findings.
                  </p>
                  {publishedAssessment ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <button
                        onClick={handleTakeAssessment}
                        disabled={actionLoading === "take"}
                        style={{
                          padding: "10px 24px", fontSize: 14, fontWeight: 500,
                          background: actionLoading === "take" ? "#DFDDD9" : "#2B4066",
                          color: actionLoading === "take" ? "#9A9894" : "white",
                          border: "none", borderRadius: 4, cursor: actionLoading === "take" ? "not-allowed" : "pointer",
                          fontFamily: "'Outfit', sans-serif",
                        }}
                      >
                        {actionLoading === "take" ? "Loading..." : `Take: ${publishedAssessment.title}`}
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: "#9A9894" }}>No published assessment found. Contact the dev team.</p>
                  )}
                </div>
              </div>
            </div>

            {/* Step 2: Build assessment */}
            <div
              style={{
                background: "white", border: "1px solid #E4E2DE", borderRadius: 8,
                padding: "28px 28px 24px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div
                  style={{
                    width: 32, height: 32, borderRadius: "50%", background: "#38A858",
                    color: "white", fontSize: 15, fontWeight: 600,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, marginTop: 2,
                  }}
                >
                  2
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>
                    Build an assessment as an instructor
                  </div>
                  <p style={{ fontSize: 14, color: "#6A6862", lineHeight: 1.55, marginBottom: 16 }}>
                    Walk through the instructor flow: define learning outcomes, review the AI-generated rubric, configure assessment settings, and publish.
                  </p>
                  <button
                    onClick={handleBuildAssessment}
                    disabled={actionLoading === "build" || !instructorUser}
                    style={{
                      padding: "10px 24px", fontSize: 14, fontWeight: 500,
                      background: actionLoading === "build" ? "#DFDDD9" : "#38A858",
                      color: actionLoading === "build" ? "#9A9894" : "white",
                      border: "none", borderRadius: 4, cursor: actionLoading === "build" ? "not-allowed" : "pointer",
                      fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    {actionLoading === "build" ? "Loading..." : "Start building"}
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
