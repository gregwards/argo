"use client";

import { useEffect, useState } from "react";
import { THEME } from "@/lib/theme";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Assessment {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  course_name: string;
  session_count: number;
}

interface SessionRow {
  id: string;
  status: string;
  student_email: string;
  student_name: string;
  assessment_title: string;
  assessment_id: string;
  turn_count: number;
  duration_seconds: number | null;
  has_profile: boolean;
  created_at: string | null;
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
}

async function devFetch(path: string, opts?: RequestInit) {
  console.log("[devFetch]", path, "credentials: include", "opts:", opts);
  const res = await fetch(`${API}${path}`, { ...opts, credentials: "include" });
  if (!res.ok) return null;
  return res.json();
}

export default function DevIndexPage() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [impersonating, setImpersonating] = useState<string>("");
  const [enrollments, setEnrollments] = useState<{ assessment_id: string; student_id: string }[]>([]);
  const [enrollStudentId, setEnrollStudentId] = useState<string>("");
  const [enrollAssessmentId, setEnrollAssessmentId] = useState<string>("");
  const [enrollMsg, setEnrollMsg] = useState<string>("");

  async function loadData() {
    setLoading(true);
    const data = await devFetch("/api/dev/data");
    if (!data) {
      setError("Failed to load dev data. Is the backend running?");
      setLoading(false);
      return;
    }
    setAssessments(data.assessments || []);
    setSessions(data.sessions || []);
    setUsers(data.users || []);
    setEnrollments(data.enrollments || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function impersonate(userId: string, assessmentId: string, role: string) {
    const res = await devFetch(
      `/api/dev/impersonate?user_id=${userId}&assessment_id=${assessmentId}&role=${role}`,
      { method: "POST" }
    );
    if (res?.ok) {
      setImpersonating(res.impersonating);
    }
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
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#9A9894", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Dev Console
        </span>
      </div>

      <div style={{ maxWidth: 1040, margin: "0 auto", padding: "28px 28px 60px" }}>

        {/* Status */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap", alignItems: "center" }}>
          <Chip label="API" value={API} />
          <Chip label="Assessments" value={String(assessments.length)} />
          <Chip label="Sessions" value={String(sessions.length)} />
          {impersonating && <Chip label="Impersonating" value={impersonating} highlight />}
        </div>

        {error && (
          <div style={{ padding: "12px 18px", background: "#F5ECED", border: "1px solid #E0C8CC", borderRadius: 4, color: "#7E4452", fontSize: 14, marginBottom: 24 }}>
            {error}
          </div>
        )}

        {/* Quick Links */}
        <Section title="Quick Links">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 10 }}>
            <LinkCard href="/instructor" label="Instructor Dashboard" />
            <LinkCard href="/instructor/assessment/new" label="Create Assessment" />
            <LinkCard href="/student" label="Student Portal" />
            {/* Voice test removed — Daily transport doesn't use prebuilt UI */}
            <LinkCard href={`${API}/docs`} label="API Docs (Swagger)" external />
          </div>
        </Section>

        {/* Seed DB (for fresh environments) */}
        {users.length === 0 && !loading && (
          <Section title="Setup">
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <p style={{ fontSize: 14, color: "#6A6862" }}>Fresh database — no users yet.</p>
              <button
                onClick={async () => {
                  const res = await devFetch("/api/dev/seed", { method: "POST" });
                  if (res?.ok) loadData();
                }}
                style={{ ...btnStyle, background: "#2B4066", padding: "8px 16px", fontSize: 13 }}
              >
                Seed instructor + course
              </button>
            </div>
          </Section>
        )}

        {/* Impersonate */}
        <Section title="Impersonate User">
          {users.length === 0 && !loading ? (
            <p style={THEME.system.caption}>No users found. Seed the database first.</p>
          ) : (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {users.map((u) => (
                <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, background: "white", border: "1px solid #DFDDD9", borderRadius: 4, padding: "8px 14px" }}>
                  <span style={{ fontSize: 13, fontFamily: "monospace" }}>{u.email}</span>
                  <button
                    onClick={() => impersonate(u.id, assessments[0]?.id || "", "instructor")}
                    style={{ ...btnStyle, background: "#2B4066" }}
                  >
                    as instructor
                  </button>
                  <button
                    onClick={() => impersonate(u.id, assessments[0]?.id || "", "student")}
                    style={{ ...btnStyle, background: "#38A858" }}
                  >
                    as student
                  </button>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Enrollment */}
        <Section title="Enroll Student in Assessment">
          {users.filter((u) => u.role !== "instructor").length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <p style={{ fontSize: 14, color: "#6A6862" }}>No student users found.</p>
              <button
                onClick={async () => {
                  const res = await devFetch("/api/dev/create-student", { method: "POST" });
                  if (res?.ok) loadData();
                }}
                style={{ ...btnStyle, background: "#38A858", padding: "8px 16px", fontSize: 13 }}
              >
                Create Demo Student
              </button>
            </div>
          ) : assessments.length === 0 ? (
            <p style={THEME.system.caption}>No assessments yet. Create one first.</p>
          ) : (
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A9894", display: "block", marginBottom: 4 }}>Student</label>
                <select
                  value={enrollStudentId}
                  onChange={(e) => setEnrollStudentId(e.target.value)}
                  style={{ fontSize: 13, padding: "6px 10px", borderRadius: 4, border: "1px solid #DFDDD9", fontFamily: "monospace", minWidth: 220 }}
                >
                  <option value="">Select student...</option>
                  {users.filter((u) => u.role !== "instructor").map((u) => (
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A9894", display: "block", marginBottom: 4 }}>Assessment</label>
                <select
                  value={enrollAssessmentId}
                  onChange={(e) => setEnrollAssessmentId(e.target.value)}
                  style={{ fontSize: 13, padding: "6px 10px", borderRadius: 4, border: "1px solid #DFDDD9", fontFamily: "monospace", minWidth: 220 }}
                >
                  <option value="">Select assessment...</option>
                  {assessments.map((a) => (
                    <option key={a.id} value={a.id}>{a.title}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={async () => {
                  if (!enrollStudentId || !enrollAssessmentId) return;
                  setEnrollMsg("");
                  const res = await devFetch("/api/dev/enroll", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ student_id: enrollStudentId, assessment_id: enrollAssessmentId }),
                  });
                  if (res?.ok) {
                    setEnrollMsg(res.message);
                    loadData();
                  } else {
                    setEnrollMsg("Failed to enroll");
                  }
                }}
                disabled={!enrollStudentId || !enrollAssessmentId}
                style={{ ...btnStyle, background: enrollStudentId && enrollAssessmentId ? "#2B4066" : "#BBBAB6", padding: "7px 16px", fontSize: 13 }}
              >
                Enroll
              </button>
              {enrollMsg && <span style={{ fontSize: 13, color: "#2E8A48", fontWeight: 500 }}>{enrollMsg}</span>}
            </div>
          )}
          {enrollments.length > 0 && (
            <div style={{ marginTop: 14, fontSize: 12, color: "#6A6862" }}>
              <strong style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: "#9A9894" }}>Current enrollments:</strong>
              <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {enrollments.map((e, i) => {
                  const student = users.find((u) => u.id === e.student_id);
                  const assessment = assessments.find((a) => a.id === e.assessment_id);
                  return (
                    <span key={i} style={{ background: "#E8F5EC", padding: "3px 10px", borderRadius: 3, fontFamily: "monospace", fontSize: 11 }}>
                      {student?.email || e.student_id.slice(0, 8)} → {assessment?.title || e.assessment_id.slice(0, 8)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </Section>

        {/* Assessments */}
        <Section title="Assessments">
          {loading ? <Loading /> : assessments.length === 0 ? (
            <p style={THEME.system.caption}>No assessments found.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr style={headRowStyle}>
                  <Th>Title</Th><Th>Course</Th><Th>Slug</Th><Th>Status</Th><Th>Sessions</Th><Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((a) => (
                  <tr key={a.id} style={rowStyle}>
                    <Td><a href={`/instructor/assessment/${a.id}`} style={linkStyle}>{a.title}</a></Td>
                    <Td>{a.course_name}</Td>
                    <Td>
                      {a.slug ? <a href={`/assess/${a.slug}`} style={{ ...linkStyle, fontFamily: "monospace", fontSize: 12 }}>{a.slug}</a> : <Muted>—</Muted>}
                    </Td>
                    <Td><Badge status={a.status} /></Td>
                    <Td>{a.session_count}</Td>
                    <Td>
                      {a.slug && a.status === "published" && <a href={`/assess/${a.slug}`} style={{ ...actionLink, color: "#2B4066" }}>Take</a>}
                      <a href={`/instructor/assessment/${a.id}/edit`} style={{ ...actionLink, color: "#2B4066" }}>Edit</a>
                      <a href={`/instructor/assessment/${a.id}`} style={actionLink}>Results</a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Sessions & Profiles */}
        <Section title="Sessions & Profiles">
          {loading ? <Loading /> : sessions.length === 0 ? (
            <p style={THEME.system.caption}>No sessions found.</p>
          ) : (
            <table style={tableStyle}>
              <thead>
                <tr style={headRowStyle}>
                  <Th>Assessment</Th><Th>Student</Th><Th>Status</Th><Th>Turns</Th><Th>Profile</Th><Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} style={rowStyle}>
                    <Td>{s.assessment_title}</Td>
                    <Td><span style={{ fontFamily: "monospace", fontSize: 12 }}>{s.student_email}</span></Td>
                    <Td><Badge status={s.status} /></Td>
                    <Td>{s.turn_count || <Muted>—</Muted>}</Td>
                    <Td>
                      {s.has_profile
                        ? <span style={{ color: "#38A858", fontWeight: 500 }}>Yes</span>
                        : <Muted>No</Muted>}
                    </Td>
                    <Td>
                      {s.has_profile && (
                        <a
                          href={`/student/profile/${s.id}`}
                          style={{ ...actionLink, color: "#2B4066" }}
                          onClick={(e) => {
                            // Impersonate the student for this assessment so the report loads
                            e.preventDefault();
                            const user = users.find((u) => u.email === s.student_email);
                            if (user) {
                              impersonate(user.id, s.assessment_id, "student").then(() => {
                                window.location.href = `/student/profile/${s.id}`;
                              });
                            }
                          }}
                        >
                          Report
                        </a>
                      )}
                      <a href={`/instructor/session/${s.id}`} style={actionLink}>Drill-down</a>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      </div>
    </div>
  );
}

// --- Styles ---

const tableStyle: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 14 };
const headRowStyle: React.CSSProperties = { borderBottom: "1px solid #DFDDD9", textAlign: "left" };
const rowStyle: React.CSSProperties = { borderBottom: "1px solid #ECEAE8" };
const linkStyle: React.CSSProperties = { color: "#2B4066", textDecoration: "none", fontWeight: 500 };
const actionLink: React.CSSProperties = { fontSize: 12, color: "#6A6862", marginRight: 12, textDecoration: "none" };
const btnStyle: React.CSSProperties = {
  fontSize: 11, color: "white", border: "none", borderRadius: 3,
  padding: "4px 10px", cursor: "pointer", fontFamily: "Outfit, sans-serif",
};

// --- Components ---

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A9894", marginBottom: 10 }}>{title}</h2>
      <div style={{ background: "#FAFAF8", border: "1px solid #E4E2DE", borderRadius: 6, padding: 20, overflow: "auto" }}>{children}</div>
    </section>
  );
}

function Chip({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, background: highlight ? "#E8F5EC" : "#ECEAE8", borderRadius: 4, padding: "6px 12px" }}>
      <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: highlight ? "#2E8A48" : "#9A9894" }}>{label}</span>
      <span style={{ fontSize: 13, color: "#28261E", fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}

function LinkCard({ href, label, external }: { href: string; label: string; external?: boolean }) {
  return (
    <a
      href={href} target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}
      style={{ display: "block", padding: "12px 16px", background: "white", border: "1px solid #DFDDD9", borderRadius: 4, color: "#2B4066", fontSize: 14, fontWeight: 500, textDecoration: "none" }}
    >
      {label} {external && "↗"}
    </a>
  );
}

function Badge({ status }: { status: string }) {
  const c: Record<string, { bg: string; text: string }> = {
    published: { bg: "#E8F5EC", text: "#2E8A48" }, draft: { bg: "#F0EDEA", text: "#9A9894" },
    closed: { bg: "#F5ECED", text: "#7E4452" }, completed: { bg: "#E8F5EC", text: "#2E8A48" },
    active: { bg: "#EFF6FF", text: "#2B4066" }, pending: { bg: "#F0EDEA", text: "#9A9894" },
  };
  const s = c[status] || c.draft;
  return <span style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 3, background: s.bg, color: s.text }}>{status}</span>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "8px 12px 8px 0", fontSize: 11, fontWeight: 500, color: "#9A9894", textTransform: "uppercase", letterSpacing: "0.06em" }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "10px 12px 10px 0", verticalAlign: "middle" }}>{children}</td>;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span style={{ color: "#9A9894" }}>{children}</span>;
}

function Loading() {
  return <p style={{ color: "#9A9894", fontSize: 14 }}>Loading...</p>;
}
