"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AuthErrorBanner } from "@/components/AuthError";
import { api } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TranscriptTurn {
  turn: number;
  role: "ai" | "learner";
  text: string;
  timestamp?: string;
}

interface Flag {
  type: string;
  description?: string;
  turn?: number;
}

interface SessionInfo {
  id: string;
  status: string;
  transcript: TranscriptTurn[];
  turn_count: number;
  duration_seconds: number | null;
  started_at: string | null;
  completed_at: string | null;
  flags: Flag[];
  has_recording: boolean;
}

interface StudentInfo {
  id: string;
  email: string;
  name: string | null;
}

interface CriterionScore {
  criterion_id: string;
  criterion_name: string;
  ai_score: number;
  instructor_score?: number | null;
  max_score: number;
  findings?: string;
  citations?: number[];
}

interface Profile {
  criteria_scores: CriterionScore[];
  narrative_assessment: string;
  strengths: string[];
  growth_areas: string[];
  belief_model_notes?: string;
}

interface DrilldownData {
  session: SessionInfo;
  student: StudentInfo;
  profile: Profile;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
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

/**
 * Renders text that may contain [Turn N] citation markers as clickable links
 * that scroll to the corresponding transcript turn anchor.
 */
function CitationText({ text }: { text: string }) {
  if (!text) return null;

  // Split on [Turn N] patterns
  const parts = text.split(/(\[Turn \d+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/\[Turn (\d+)\]/);
        if (match) {
          const n = match[1];
          return (
            <a
              key={i}
              href={`#transcript-turn-${n}`}
              className="font-medium underline cursor-pointer"
              style={{ color: "#2B4066" }}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(`transcript-turn-${n}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SessionDrilldown() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const [data, setData] = useState<DrilldownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline score editing state
  const [editingCriterion, setEditingCriterion] = useState<string | null>(null);
  const [editScore, setEditScore] = useState<number>(0);
  const [savingCriterion, setSavingCriterion] = useState<string | null>(null);

  // Audio / transcript sync
  const audioRef = useRef<HTMLAudioElement>(null);
  const [activeTurnId, setActiveTurnId] = useState<number | null>(null);

  // Track which turns are cited in the profile (for highlighted left border)
  const [citedTurns, setCitedTurns] = useState<Set<number>>(new Set());

  useEffect(() => {
    api
      .getSessionDrilldown(sessionId)
      .then((d: DrilldownData) => {
        setData(d);
        // Collect all cited turn numbers from criteria findings
        const cited = new Set<number>();
        for (const crit of d.profile?.criteria_scores || []) {
          for (const n of crit.citations || []) cited.add(n);
        }
        setCitedTurns(cited);
      })
      .catch((e) => setError(e.message || "Failed to load session"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  // Audio time update → highlight matching transcript turn
  const handleTimeUpdate = () => {
    if (!audioRef.current || !data?.session?.started_at) return;
    const elapsed = audioRef.current.currentTime;
    const sessionStart = new Date(data.session.started_at).getTime();
    const currentTime = sessionStart + elapsed * 1000;

    const transcript = data.session.transcript || [];
    let active: number | null = null;
    for (const turn of transcript) {
      if (turn.timestamp && new Date(turn.timestamp).getTime() <= currentTime) {
        active = turn.turn;
      }
    }
    setActiveTurnId(active);
  };

  // Save edited criterion score
  const handleSaveScore = async (criterionId: string) => {
    if (!data) return;
    setSavingCriterion(criterionId);
    try {
      await api.editCriterionScore(sessionId, criterionId, editScore);
      // Update local profile state to reflect the edited score
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          profile: {
            ...prev.profile,
            criteria_scores: prev.profile.criteria_scores.map((c) =>
              c.criterion_id === criterionId
                ? { ...c, instructor_score: editScore }
                : c
            ),
          },
        };
      });
      setEditingCriterion(null);
    } catch (e: any) {
      alert(e.message || "Failed to save score");
    } finally {
      setSavingCriterion(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen py-10" style={{ background: "#F4F3F1" }}>
        <div className="max-w-4xl mx-auto px-6">
          <p style={{ fontFamily: "Outfit, sans-serif", fontSize: 14, color: "#6A6862" }}>
            Loading session…
          </p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen py-10" style={{ background: "#F4F3F1" }}>
        <div className="max-w-4xl mx-auto px-6">
          {error ? <AuthErrorBanner error={error} /> : (
            <p style={{ fontFamily: "Outfit, sans-serif", fontSize: 14, color: "#B91C1C" }}>
              Session not found.
            </p>
          )}
        </div>
      </main>
    );
  }

  const { session, student, profile } = data;
  const extractionFlags = (session.flags || []).filter(
    (f) => f.type === "extraction_attempt"
  );

  return (
    <main
      className="min-h-screen py-10 pb-20"
      style={{ background: "#F4F3F1" }}
    >
      <div className="max-w-4xl mx-auto px-6">

        {/* ── Back link ── */}
        <Link
          href="/instructor"
          className="inline-flex items-center gap-1 mb-6 text-sm"
          style={{ fontFamily: "Outfit, sans-serif", color: "#6A6862" }}
        >
          ← Back to Assessments
        </Link>

        {/* ── Student info bar ── */}
        <section
          className="rounded-[4px] border p-5 mb-6"
          style={{ background: "white", borderColor: "#DFDDD9" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div
                style={{
                  fontFamily: "Outfit, sans-serif",
                  fontWeight: 600,
                  fontSize: 18,
                  color: "#28261E",
                }}
              >
                {student.name || student.email}
              </div>
              {student.name && (
                <div
                  style={{
                    fontFamily: "Outfit, sans-serif",
                    fontSize: 13,
                    color: "#6A6862",
                  }}
                >
                  {student.email}
                </div>
              )}
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {statusBadge(session.status)}
              <span
                style={{
                  fontFamily: "Outfit, sans-serif",
                  fontSize: 12,
                  color: "#6A6862",
                }}
              >
                {session.turn_count} turns
              </span>
              <span
                style={{
                  fontFamily: "Outfit, sans-serif",
                  fontSize: 12,
                  color: "#6A6862",
                }}
              >
                {formatDuration(session.duration_seconds)}
              </span>
              <span
                style={{
                  fontFamily: "Outfit, sans-serif",
                  fontSize: 12,
                  color: "#8A8880",
                }}
              >
                {formatDate(session.started_at)}
              </span>
            </div>
          </div>
        </section>

        {/* ── Extraction flags (if any) ── */}
        {extractionFlags.length > 0 && (
          <section
            className="rounded-[4px] border p-4 mb-6"
            style={{
              background: "#FEF9C3",
              borderColor: "#FDE047",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-amber-500">⚠</span>
              <span
                style={{
                  fontFamily: "Outfit, sans-serif",
                  fontWeight: 500,
                  fontSize: 14,
                  color: "#92400E",
                }}
              >
                Extraction Attempts Detected ({extractionFlags.length})
              </span>
            </div>
            <ul className="space-y-1">
              {extractionFlags.map((f, i) => (
                <li
                  key={i}
                  style={{
                    fontFamily: "Outfit, sans-serif",
                    fontSize: 13,
                    color: "#78350F",
                  }}
                >
                  {f.turn !== undefined && (
                    <a
                      href={`#transcript-turn-${f.turn}`}
                      className="underline cursor-pointer mr-1"
                      style={{ color: "#92400E" }}
                      onClick={(e) => {
                        e.preventDefault();
                        document
                          .getElementById(`transcript-turn-${f.turn}`)
                          ?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                    >
                      [Turn {f.turn}]
                    </a>
                  )}
                  <span className="font-medium">{f.type}</span>
                  {f.description && `: ${f.description}`}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Competency Profile with inline score editing ── */}
        {profile && (
          <section
            className="rounded-[4px] border p-6 mb-6"
            style={{ background: "white", borderColor: "#DFDDD9" }}
          >
            <h2
              className="mb-5"
              style={{
                fontFamily: "Outfit, sans-serif",
                fontWeight: 600,
                fontSize: 16,
                color: "#28261E",
              }}
            >
              Competency Profile
            </h2>

            {/* Per-criterion scores */}
            <div className="space-y-4 mb-6">
              {(profile.criteria_scores || []).map((crit) => {
                const displayScore =
                  crit.instructor_score != null ? crit.instructor_score : crit.ai_score;
                const isEdited = crit.instructor_score != null;
                const isEditing = editingCriterion === crit.criterion_id;

                return (
                  <div
                    key={crit.criterion_id}
                    className="pb-4 border-b last:border-0"
                    style={{ borderColor: "#DFDDD9" }}
                  >
                    {/* Criterion name + score row */}
                    <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                      <span
                        style={{
                          fontFamily: "Outfit, sans-serif",
                          fontWeight: 500,
                          fontSize: 14,
                          color: "#28261E",
                        }}
                      >
                        {crit.criterion_name}
                      </span>

                      <div className="flex items-center gap-2">
                        {isEditing ? (
                          <>
                            <input
                              type="number"
                              min={0}
                              max={crit.max_score}
                              value={editScore}
                              onChange={(e) => setEditScore(Number(e.target.value))}
                              className="w-16 border rounded-[3px] px-2 py-0.5 text-sm text-center"
                              style={{ borderColor: "#DFDDD9", fontFamily: "Outfit, sans-serif" }}
                            />
                            <span
                              style={{
                                fontFamily: "Outfit, sans-serif",
                                fontSize: 13,
                                color: "#6A6862",
                              }}
                            >
                              / {crit.max_score}
                            </span>
                            <button
                              onClick={() => handleSaveScore(crit.criterion_id)}
                              disabled={savingCriterion === crit.criterion_id}
                              className="rounded-[3px] px-3 py-1 text-xs text-white"
                              style={{ background: "#2B4066", fontFamily: "Outfit, sans-serif" }}
                            >
                              {savingCriterion === crit.criterion_id ? "Saving…" : "Save"}
                            </button>
                            <button
                              onClick={() => setEditingCriterion(null)}
                              className="rounded-[3px] px-2 py-1 text-xs border"
                              style={{
                                borderColor: "#DFDDD9",
                                color: "#6A6862",
                                fontFamily: "Outfit, sans-serif",
                              }}
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <span
                              style={{
                                fontFamily: "Outfit, sans-serif",
                                fontWeight: 600,
                                fontSize: 14,
                                color: "#28261E",
                              }}
                            >
                              {displayScore}/{crit.max_score}
                            </span>
                            {isEdited && (
                              <span
                                className="text-xs"
                                style={{ color: "#8A8880", fontFamily: "Outfit, sans-serif" }}
                              >
                                (edited)
                              </span>
                            )}
                            <button
                              onClick={() => {
                                setEditingCriterion(crit.criterion_id);
                                setEditScore(displayScore);
                              }}
                              className="text-xs border rounded-[3px] px-2 py-0.5"
                              style={{
                                fontFamily: "Outfit, sans-serif",
                                color: "#2B4066",
                                borderColor: "#DFDDD9",
                              }}
                            >
                              edit
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Findings with [Turn N] citations */}
                    {crit.findings && (
                      <p
                        className="mt-1"
                        style={{
                          fontFamily: "Outfit, sans-serif",
                          fontSize: 13,
                          color: "#3A3834",
                          lineHeight: 1.6,
                        }}
                      >
                        <CitationText text={crit.findings} />
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Narrative */}
            {profile.narrative_assessment && (
              <div className="mb-4">
                <h3
                  className="mb-1"
                  style={{
                    fontFamily: "Outfit, sans-serif",
                    fontWeight: 500,
                    fontSize: 13,
                    color: "#6A6862",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Narrative Assessment
                </h3>
                <p
                  style={{
                    fontFamily: "Outfit, sans-serif",
                    fontSize: 13,
                    color: "#3A3834",
                    lineHeight: 1.7,
                  }}
                >
                  <CitationText text={profile.narrative_assessment} />
                </p>
              </div>
            )}

            {/* Strengths */}
            {profile.strengths?.length > 0 && (
              <div className="mb-4">
                <h3
                  className="mb-1"
                  style={{
                    fontFamily: "Outfit, sans-serif",
                    fontWeight: 500,
                    fontSize: 13,
                    color: "#6A6862",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Strengths
                </h3>
                <ul className="space-y-1">
                  {profile.strengths.map((s, i) => (
                    <li
                      key={i}
                      style={{
                        fontFamily: "Outfit, sans-serif",
                        fontSize: 13,
                        color: "#3A3834",
                      }}
                    >
                      <CitationText text={s} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Growth areas */}
            {profile.growth_areas?.length > 0 && (
              <div className="mb-4">
                <h3
                  className="mb-1"
                  style={{
                    fontFamily: "Outfit, sans-serif",
                    fontWeight: 500,
                    fontSize: 13,
                    color: "#6A6862",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Growth Areas
                </h3>
                <ul className="space-y-1">
                  {profile.growth_areas.map((g, i) => (
                    <li
                      key={i}
                      style={{
                        fontFamily: "Outfit, sans-serif",
                        fontSize: 13,
                        color: "#3A3834",
                      }}
                    >
                      <CitationText text={g} />
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Belief model notes */}
            {profile.belief_model_notes && (
              <div
                className="rounded-[3px] border px-4 py-3 mt-2"
                style={{ background: "#F4F3F1", borderColor: "#DFDDD9" }}
              >
                <span
                  className="block mb-1"
                  style={{
                    fontFamily: "Outfit, sans-serif",
                    fontWeight: 500,
                    fontSize: 11,
                    color: "#8A8880",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Belief Model Notes
                </span>
                <p
                  style={{
                    fontFamily: "Outfit, sans-serif",
                    fontSize: 13,
                    color: "#3A3834",
                    lineHeight: 1.6,
                  }}
                >
                  {profile.belief_model_notes}
                </p>
              </div>
            )}
          </section>
        )}

        {/* ── Full transcript ── */}
        <section
          className="rounded-[4px] border overflow-hidden mb-6"
          style={{ background: "white", borderColor: "#DFDDD9" }}
        >
          <div
            className="px-5 py-3 border-b"
            style={{ borderColor: "#DFDDD9" }}
          >
            <h2
              style={{
                fontFamily: "Outfit, sans-serif",
                fontWeight: 600,
                fontSize: 15,
                color: "#28261E",
              }}
            >
              Full Transcript
            </h2>
          </div>

          <div className="divide-y" style={{ borderColor: "#DFDDD9" }}>
            {(session.transcript || []).map((turn) => {
              const isCited = citedTurns.has(turn.turn);
              const isActive = activeTurnId === turn.turn;

              return (
                <div
                  key={turn.turn}
                  id={`transcript-turn-${turn.turn}`}
                  className={`px-5 py-4 transition-colors ${
                    isActive ? "bg-[#2B4066]/5" : ""
                  }`}
                  style={{
                    borderLeft: isCited ? "3px solid #2B4066" : "3px solid transparent",
                  }}
                >
                  <div className="flex items-baseline gap-2 mb-1">
                    <span
                      style={{
                        fontFamily: "Outfit, sans-serif",
                        fontWeight: 500,
                        fontSize: 11,
                        color: "#8A8880",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      Turn {turn.turn}
                    </span>
                    <span
                      style={{
                        fontFamily: "Outfit, sans-serif",
                        fontWeight: 500,
                        fontSize: 11,
                        color: turn.role === "ai" ? "#2B4066" : "#6A6862",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {turn.role === "ai" ? "Argo" : "Student"}
                    </span>
                  </div>
                  <p
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      fontSize: 14,
                      color: "#28261E",
                      lineHeight: 1.65,
                    }}
                  >
                    {turn.text}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Floating audio player ── */}
      {session.has_recording && (
        <div
          className="fixed bottom-0 left-0 right-0 z-50 flex items-center gap-4 px-6 py-3 border-t"
          style={{ background: "white", borderColor: "#DFDDD9" }}
        >
          <audio
            ref={audioRef}
            src={api.getRecordingUrl(sessionId)}
            onTimeUpdate={handleTimeUpdate}
            controls
            className="flex-1 h-8"
          />
          <span
            className="text-xs whitespace-nowrap"
            style={{ fontFamily: "Outfit, sans-serif", color: "#8A8880" }}
          >
            Session Recording
          </span>
        </div>
      )}
    </main>
  );
}
