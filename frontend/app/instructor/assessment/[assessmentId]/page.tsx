"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import BoxPlot, { BoxPlotData } from "@/components/BoxPlot";

interface AssessmentSummary {
  total_sessions: number;
  avg_duration: number;
  avg_turns: number;
  title?: string;
  slug?: string;
}

interface Session {
  id: string;
  student_email: string;
  student_name: string | null;
  status: string;
  turn_count: number | null;
  duration_seconds: number | null;
  flags: Array<{ type: string; description?: string; turn?: number }>;
  extraction_flags: Array<{ type: string; description?: string; turn?: number }>;
  has_extraction_flags: boolean;
  created_at: string | null;
}

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    completed: "bg-green-100 text-green-700",
    active: "bg-blue-100 text-blue-700",
    abandoned: "bg-gray-100 text-gray-500",
    in_progress: "bg-yellow-100 text-yellow-700",
  };
  const cls = styles[status] || "bg-gray-100 text-gray-600";
  return (
    <span
      className={`inline-block text-xs px-2 py-0.5 rounded-full ${cls}`}
      style={{ fontFamily: "Outfit, sans-serif" }}
    >
      {status}
    </span>
  );
}

export default function AssessmentDashboard() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const router = useRouter();

  const [summary, setSummary] = useState<AssessmentSummary | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [distributions, setDistributions] = useState<BoxPlotData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!assessmentId) return;

    Promise.all([
      api.getAssessmentSummary(assessmentId),
      api.getAssessmentSessions(assessmentId),
      api.getScoreDistributions(assessmentId),
    ])
      .then(([sumData, sessData, distData]) => {
        setSummary(sumData);
        setSessions(sessData.sessions || []);
        setDistributions(distData.distributions || []);
      })
      .catch((e) => setError(e.message || "Failed to load dashboard"))
      .finally(() => setLoading(false));
  }, [assessmentId]);

  // Build shareable link from slug (if available on summary) or fall back to assessmentId
  const shareableSlug = (summary as any)?.slug;
  const shareableLink = shareableSlug
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/assess/${shareableSlug}`
    : null;

  const handleCopyLink = () => {
    if (shareableLink) navigator.clipboard.writeText(shareableLink);
  };

  return (
    <main className="min-h-screen py-10" style={{ background: "#F4F3F1" }}>
      <div className="max-w-5xl mx-auto px-6">
        {/* Back link */}
        <Link
          href="/instructor"
          className="inline-flex items-center gap-1 mb-6 text-sm"
          style={{ fontFamily: "Outfit, sans-serif", color: "#6A6862" }}
        >
          ← All Assessments
        </Link>

        <h1
          className="mb-8"
          style={{
            fontFamily: "Outfit, sans-serif",
            fontWeight: 600,
            fontSize: 22,
            color: "#28261E",
          }}
        >
          Assessment Dashboard
        </h1>

        {loading && (
          <p style={{ fontSize: 14, color: "#6A6862", fontFamily: "Outfit, sans-serif" }}>
            Loading…
          </p>
        )}
        {error && (
          <p style={{ fontSize: 14, color: "#B91C1C", fontFamily: "Outfit, sans-serif" }}>
            {error}
          </p>
        )}

        {!loading && !error && (
          <>
            {/* Aggregate stats — 4-col grid */}
            {summary && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div
                  className="rounded-[4px] border p-4"
                  style={{ background: "white", borderColor: "#DFDDD9" }}
                >
                  <div
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      fontWeight: 600,
                      fontSize: 28,
                      color: "#28261E",
                    }}
                  >
                    {summary.total_sessions}
                  </div>
                  <div
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      fontWeight: 400,
                      fontSize: 12,
                      color: "#6A6862",
                      marginTop: 4,
                    }}
                  >
                    Sessions Completed
                  </div>
                </div>

                <div
                  className="rounded-[4px] border p-4"
                  style={{ background: "white", borderColor: "#DFDDD9" }}
                >
                  <div
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      fontWeight: 600,
                      fontSize: 28,
                      color: "#28261E",
                    }}
                  >
                    {formatDuration(Math.round(summary.avg_duration))}
                  </div>
                  <div
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      fontWeight: 400,
                      fontSize: 12,
                      color: "#6A6862",
                      marginTop: 4,
                    }}
                  >
                    Avg Duration
                  </div>
                </div>

                <div
                  className="rounded-[4px] border p-4"
                  style={{ background: "white", borderColor: "#DFDDD9" }}
                >
                  <div
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      fontWeight: 600,
                      fontSize: 28,
                      color: "#28261E",
                    }}
                  >
                    {Math.round(summary.avg_turns)}
                  </div>
                  <div
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      fontWeight: 400,
                      fontSize: 12,
                      color: "#6A6862",
                      marginTop: 4,
                    }}
                  >
                    Avg Turns
                  </div>
                </div>

                {/* Shareable link tile */}
                <div
                  className="rounded-[4px] border p-4 flex flex-col justify-between"
                  style={{ background: "white", borderColor: "#DFDDD9" }}
                >
                  <div
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      fontWeight: 400,
                      fontSize: 11,
                      color: "#8A8880",
                      wordBreak: "break-all",
                    }}
                  >
                    {shareableLink || "Link not available"}
                  </div>
                  {shareableLink && (
                    <button
                      onClick={handleCopyLink}
                      className="mt-2 text-xs rounded-[3px] px-2 py-1 border"
                      style={{
                        fontFamily: "Outfit, sans-serif",
                        color: "#2B4066",
                        borderColor: "#DFDDD9",
                        background: "#F4F3F1",
                      }}
                    >
                      Copy link
                    </button>
                  )}
                  <div
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      fontWeight: 400,
                      fontSize: 12,
                      color: "#6A6862",
                      marginTop: 4,
                    }}
                  >
                    Shareable Link
                  </div>
                </div>
              </div>
            )}

            {/* Score Distributions */}
            {distributions.length > 0 && (
              <section
                className="rounded-[4px] border p-6 mb-8"
                style={{ background: "white", borderColor: "#DFDDD9" }}
              >
                <h2
                  className="mb-4"
                  style={{
                    fontFamily: "Outfit, sans-serif",
                    fontWeight: 500,
                    fontSize: 15,
                    color: "#28261E",
                  }}
                >
                  Score Distributions
                </h2>
                <BoxPlot distributions={distributions} />
              </section>
            )}

            {/* Session Table */}
            <section
              className="rounded-[4px] border overflow-hidden"
              style={{ background: "white", borderColor: "#DFDDD9" }}
            >
              <div
                className="px-4 py-3 border-b"
                style={{ borderColor: "#DFDDD9" }}
              >
                <h2
                  style={{
                    fontFamily: "Outfit, sans-serif",
                    fontWeight: 500,
                    fontSize: 15,
                    color: "#28261E",
                  }}
                >
                  Student Sessions
                </h2>
              </div>

              {sessions.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      fontSize: 13,
                      color: "#8A8880",
                    }}
                  >
                    No sessions yet.
                  </p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr
                      className="border-b"
                      style={{ borderColor: "#DFDDD9" }}
                    >
                      {["Student", "Status", "Turns", "Duration", "Flags", "Date"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-4 py-2 text-left"
                            style={{
                              fontFamily: "Outfit, sans-serif",
                              fontWeight: 400,
                              fontSize: 11,
                              color: "#8A8880",
                            }}
                          >
                            {h}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((s) => (
                      <tr
                        key={s.id}
                        className="border-b last:border-0 cursor-pointer"
                        style={{ borderColor: "#DFDDD9" }}
                        onClick={() => router.push(`/instructor/session/${s.id}`)}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#F4F3F1")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "transparent")
                        }
                      >
                        <td
                          className="px-4 py-3"
                          style={{
                            fontFamily: "Outfit, sans-serif",
                            fontSize: 13,
                            color: "#28261E",
                          }}
                        >
                          {s.student_email}
                        </td>
                        <td className="px-4 py-3">{statusBadge(s.status)}</td>
                        <td
                          className="px-4 py-3"
                          style={{
                            fontFamily: "Outfit, sans-serif",
                            fontSize: 13,
                            color: "#3A3834",
                          }}
                        >
                          {s.turn_count ?? "—"}
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{
                            fontFamily: "Outfit, sans-serif",
                            fontSize: 13,
                            color: "#3A3834",
                          }}
                        >
                          {formatDuration(s.duration_seconds)}
                        </td>
                        <td className="px-4 py-3">
                          {s.has_extraction_flags && (
                            <span
                              className="text-amber-500 cursor-help"
                              title={`Extraction attempt detected: ${s.extraction_flags
                                .map((f) => f.type || "unknown")
                                .join(", ")}`}
                            >
                              ⚠
                            </span>
                          )}
                        </td>
                        <td
                          className="px-4 py-3"
                          style={{
                            fontFamily: "Outfit, sans-serif",
                            fontSize: 12,
                            color: "#8A8880",
                          }}
                        >
                          {formatDate(s.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
