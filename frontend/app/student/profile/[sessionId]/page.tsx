"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api } from "@/lib/api";
import { THEME } from "@/lib/theme";
import {
  LEVEL_CONFIG,
  scoreToLevel,
  type CompetencyLevel,
} from "@/lib/qualitative-buckets";

// --- Types ---

interface CriterionFeedback {
  commentary: string;
  quote?: { text: string; turn: number };
  note?: string;
}

interface CriterionScore {
  criterion_id: string;
  criterion_name: string;
  max_score: number;
  ai_score: number;
  level?: CompetencyLevel;
  evidence_turns: number[];
  finding: string;
  strength?: CriterionFeedback;
  growth?: CriterionFeedback;
}

interface Profile {
  criteria_scores: CriterionScore[];
  narrative_assessment: string;
  strengths: string[];
  growth_areas: string[];
  belief_model_notes?: string;
  assessment_title?: string;
  course_name?: string;
}

// --- Helpers ---

function getLevel(crit: CriterionScore): CompetencyLevel {
  if (crit.level && crit.level >= 1 && crit.level <= 5) return crit.level as CompetencyLevel;
  return scoreToLevel(crit.ai_score, crit.max_score);
}

/** Strip any [Turn N] references that leaked from legacy profiles. */
function cleanText(text: string): string {
  return text.replace(/\s*\[Turn \d+\]\s*/g, " ").trim();
}

// --- Sub-components ---

function ScoreBlocks({ level }: { level: CompetencyLevel }) {
  const config = LEVEL_CONFIG[level];
  return (
    <div style={{ display: "flex", gap: 5 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <div
          key={i}
          style={{
            width: 32,
            height: 14,
            borderRadius: 2,
            background: i <= level ? config.blockColor : "#DFDDD9",
          }}
        />
      ))}
    </div>
  );
}

function FeedbackColumn({
  type,
  feedback,
}: {
  type: "strength" | "growth";
  feedback: CriterionFeedback;
}) {
  const isStrength = type === "strength";
  const label = isStrength ? "Strengths" : "Growth areas";
  const bgColor = isStrength ? "#F0F6F2" : "#FAF8F0";
  const borderColor = isStrength ? "#38A858" : "#D4B830";
  const labelColor = isStrength ? "#38A858" : "#B8A020";
  const quoteBorderColor = isStrength ? "#A8D8B8" : "#D8D0A0";
  const quoteBgColor = isStrength ? "#E4F0E8" : "#F0ECE0";

  return (
    <div
      style={{
        flex: 1,
        minWidth: 260,
        padding: "22px 24px 24px",
        background: bgColor,
        borderTop: `3px solid ${borderColor}`,
      }}
    >
      <div style={{ ...THEME.ui.label, marginBottom: 14, color: labelColor }}>
        {label}
      </div>

      <div style={{ ...THEME.system.body, marginBottom: feedback.quote ? 16 : 0 }}>
        {cleanText(feedback.commentary)}
      </div>

      {feedback.quote && (
        <div
          style={{
            borderLeft: `3px solid ${quoteBorderColor}`,
            padding: "10px 16px",
            borderRadius: "0 4px 4px 0",
            background: quoteBgColor,
          }}
        >
          <div style={THEME.student.quote}>
            &ldquo;{feedback.quote.text}&rdquo;
          </div>
        </div>
      )}

      {feedback.note && (
        <div style={{ ...THEME.system.note, marginTop: 10 }}>
          {cleanText(feedback.note)}
        </div>
      )}
    </div>
  );
}

// --- Legacy fallback for old profiles ---

function LegacyFindingCard({
  crit,
  level,
}: {
  crit: CriterionScore;
  level: CompetencyLevel;
}) {
  const config = LEVEL_CONFIG[level];
  return (
    <div
      style={{
        border: "1px solid #E4E2DE",
        borderRadius: 6,
        overflow: "hidden",
        background: "#FAFAF8",
        marginBottom: 24,
      }}
    >
      <div
        style={{
          padding: "20px 24px 18px",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div style={{ fontSize: 20, fontWeight: 600, color: "#28261E", lineHeight: 1.2 }}>
          {crit.criterion_name}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <ScoreBlocks level={level} />
          <div style={{ fontSize: 15, fontWeight: 600, color: config.textColor }}>
            {config.label}
          </div>
        </div>
      </div>
      {crit.finding && (
        <div style={{ padding: "0 24px 20px" }}>
          <p style={THEME.system.body}>{cleanText(crit.finding)}</p>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export default function StudentProfilePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getProfile(sessionId)
      .then((data: Profile) => setProfile(data))
      .catch((err: Error) => setError(err.message || "Failed to load profile"))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4F3F1" }}>
        <div className="animate-spin w-8 h-8 border-2" style={{ borderColor: "#DFDDD9", borderTopColor: "#2B4066", borderRadius: "50%" }} />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4F3F1" }}>
        <p style={THEME.system.small}>{error || "Profile not available."}</p>
      </div>
    );
  }

  // Detect whether this is a new-format profile (has strength/growth per criterion)
  const isNewFormat =
    profile.criteria_scores.length > 0 &&
    profile.criteria_scores[0]?.strength !== undefined;

  const heading = [profile.course_name, profile.assessment_title]
    .filter(Boolean)
    .join(" \u2014 ");

  return (
    <div style={{ background: "#F4F3F1", minHeight: "100vh", fontFamily: "'Outfit', sans-serif", color: "#28261E" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "10px 24px",
          background: "#ECEAE8",
          borderBottom: "1.5px solid #DFDDD9",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: 20,
            letterSpacing: "0.01em",
            background: "linear-gradient(90deg, #2B4066, #38D670)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          argo
        </div>
        <div style={{ flex: 1 }} />
        {profile.course_name && (
          <div style={{ fontSize: 11, color: "#9A9894" }}>{profile.course_name}</div>
        )}
      </div>

      {/* Content */}
      <div style={{ maxWidth: 880, margin: "0 auto", padding: "32px 28px 60px" }}>
        {/* Page Title */}
        <div style={{ ...THEME.ui.label, color: "#9A9894", marginBottom: 6, fontSize: 11, letterSpacing: "0.1em" }}>
          Assessment results
        </div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "#28261E",
            marginBottom: 24,
            letterSpacing: "-0.01em",
          }}
        >
          {heading ? `Competency Profile: ${heading}` : "Competency Profile"}
        </div>

        {/* Overall Assessment */}
        {profile.narrative_assessment && (
          <div
            style={{
              background: "#FAFAF8",
              border: "1px solid #E4E2DE",
              borderLeft: "5px solid #2B4066",
              borderRadius: "2px 6px 6px 2px",
              padding: "24px 28px",
              marginBottom: 14,
            }}
          >
            <div style={{ ...THEME.ui.label, color: "#2B4066", opacity: 0.6, marginBottom: 10 }}>
              Overall assessment
            </div>
            <div style={THEME.system.hero}>
              {cleanText(profile.narrative_assessment)}
            </div>
          </div>
        )}

        {/* Disclaimer */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "12px 18px",
            background: "#F0EDEA",
            border: "1px solid #E0DCD6",
            borderRadius: 4,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: 16,
              height: 16,
              borderRadius: "50%",
              border: "1.5px solid #B8A898",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginTop: 1,
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 600, color: "#B8A898", lineHeight: 1 }}>i</span>
          </div>
          <div style={THEME.system.caption}>
            This is not your final grade; scores may change under instructor review.
          </div>
        </div>

        {/* Detail Cards */}
        {profile.criteria_scores.map((crit) => {
          const level = getLevel(crit);
          const config = LEVEL_CONFIG[level];

          // Legacy profile without per-criterion feedback
          if (!isNewFormat) {
            return <LegacyFindingCard key={crit.criterion_id} crit={crit} level={level} />;
          }

          return (
            <div
              key={crit.criterion_id}
              style={{
                marginBottom: 24,
                border: "1px solid #E4E2DE",
                borderRadius: 6,
                overflow: "hidden",
                background: "#FAFAF8",
              }}
            >
              {/* Card Header */}
              <div
                style={{
                  padding: "20px 24px 18px",
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 16,
                }}
              >
                <div style={{ fontSize: 21, fontWeight: 600, color: "#28261E", lineHeight: 1.2 }}>
                  {crit.criterion_name}
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 6,
                    flexShrink: 0,
                  }}
                >
                  <ScoreBlocks level={level} />
                  <div style={{ fontSize: 15, fontWeight: 600, color: config.textColor }}>
                    {config.label}
                  </div>
                </div>
              </div>

              {/* Feedback Row */}
              <div style={{ display: "flex", flexWrap: "wrap" as const }}>
                {crit.strength && (
                  <FeedbackColumn type="strength" feedback={crit.strength} />
                )}
                {crit.growth && (
                  <FeedbackColumn type="growth" feedback={crit.growth} />
                )}
              </div>
            </div>
          );
        })}

        {/* Legacy: global strengths/growth areas for old profiles */}
        {!isNewFormat &&
          ((profile.strengths?.length > 0) || (profile.growth_areas?.length > 0)) && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" as const, marginBottom: 24 }}>
              {profile.strengths?.length > 0 && (
                <div style={{ flex: 1, minWidth: 280, background: "#F0F6F2", borderTop: "3px solid #38A858", borderRadius: 4, padding: "18px 20px" }}>
                  <div style={{ ...THEME.ui.label, color: "#38A858", marginBottom: 12 }}>Strengths</div>
                  {profile.strengths.map((s, i) => (
                    <p key={i} style={{ ...THEME.system.body, marginBottom: 8 }}>{cleanText(s)}</p>
                  ))}
                </div>
              )}
              {profile.growth_areas?.length > 0 && (
                <div style={{ flex: 1, minWidth: 280, background: "#FAF8F0", borderTop: "3px solid #D4B830", borderRadius: 4, padding: "18px 20px" }}>
                  <div style={{ ...THEME.ui.label, color: "#B8A020", marginBottom: 12 }}>Growth areas</div>
                  {profile.growth_areas.map((g, i) => (
                    <p key={i} style={{ ...THEME.system.body, marginBottom: 8 }}>{cleanText(g)}</p>
                  ))}
                </div>
              )}
            </div>
          )}

        {/* Transcript Link */}
        <div style={{ textAlign: "center", paddingTop: 28, borderTop: "1px solid #E4E2DF", marginTop: 12 }}>
          <a
            href={`/student/profile/${sessionId}/full-transcript`}
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "#2B4066",
              textDecoration: "none",
              borderBottom: "1px solid #B8C4D6",
              paddingBottom: 2,
            }}
          >
            View full assessment transcript &rarr;
          </a>
        </div>
      </div>
    </div>
  );
}
