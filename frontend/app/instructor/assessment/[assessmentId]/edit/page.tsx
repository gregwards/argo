"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";

interface AttainmentLevel {
  level: "strong" | "partial" | "weak";
  description: string;
}

interface Criterion {
  name: string;
  weight: number;
  bloom_level: string;
  attainment_levels: AttainmentLevel[];
  question_pool: { foundational: string[]; probing: string[] };
}

interface RubricRow {
  learning_outcome_id: string;
  criteria: Criterion[];
}

interface LearningOutcome {
  id: string;
  text: string;
}

const colors = {
  bg: "#F4F3F1",
  surface: "#ECEAE8",
  border: "#DFDDD9",
  accent: "#2B4066",
  text: "#28261E",
  secondary: "#6A6862",
  muted: "#8A8880",
};

export default function EditAssessmentPage() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");
  const [scaffoldType, setScaffoldType] = useState("");
  const [duration, setDuration] = useState(15);
  const [los, setLos] = useState<LearningOutcome[]>([]);
  const [rubric, setRubric] = useState<RubricRow[]>([]);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getAssessment(assessmentId);
        const a = data.assessment || data;
        setTitle(a.title || "");
        setStatus(a.status || "draft");
        setScaffoldType(a.scaffold_type || "");
        setDuration(a.duration_target_minutes || 15);
        setLos(a.learning_outcomes || []);
        setRubric(a.rubric || []);
        setAdditionalInstructions(a.additional_instructions || "");
        setTtsEnabled(a.tts_enabled !== false);
      } catch (e: any) {
        setError(e.message || "Failed to load assessment");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [assessmentId]);

  const toggleRow = (loId: string) => {
    const next = new Set(expandedRows);
    next.has(loId) ? next.delete(loId) : next.add(loId);
    setExpandedRows(next);
  };

  const updateCriterion = (loId: string, critIdx: number, field: keyof Criterion, value: any) => {
    setRubric(rubric.map((row) => {
      if (row.learning_outcome_id !== loId) return row;
      const updated = [...row.criteria];
      updated[critIdx] = { ...updated[critIdx], [field]: value };
      return { ...row, criteria: updated };
    }));
  };

  const updateAttainmentLevel = (loId: string, critIdx: number, levelIdx: number, description: string) => {
    setRubric(rubric.map((row) => {
      if (row.learning_outcome_id !== loId) return row;
      const updated = [...row.criteria];
      const levels = [...updated[critIdx].attainment_levels];
      levels[levelIdx] = { ...levels[levelIdx], description };
      updated[critIdx] = { ...updated[critIdx], attainment_levels: levels };
      return { ...row, criteria: updated };
    }));
  };

  const updateQuestion = (loId: string, critIdx: number, pool: "foundational" | "probing", qIdx: number, text: string) => {
    setRubric(rubric.map((row) => {
      if (row.learning_outcome_id !== loId) return row;
      const updated = [...row.criteria];
      const questions = [...updated[critIdx].question_pool[pool]];
      questions[qIdx] = text;
      updated[critIdx] = { ...updated[critIdx], question_pool: { ...updated[critIdx].question_pool, [pool]: questions } };
      return { ...row, criteria: updated };
    }));
  };

  const addQuestion = (loId: string, critIdx: number, pool: "foundational" | "probing") => {
    setRubric(rubric.map((row) => {
      if (row.learning_outcome_id !== loId) return row;
      const updated = [...row.criteria];
      const questions = [...updated[critIdx].question_pool[pool], ""];
      updated[critIdx] = { ...updated[critIdx], question_pool: { ...updated[critIdx].question_pool, [pool]: questions } };
      return { ...row, criteria: updated };
    }));
  };

  const removeQuestion = (loId: string, critIdx: number, pool: "foundational" | "probing", qIdx: number) => {
    setRubric(rubric.map((row) => {
      if (row.learning_outcome_id !== loId) return row;
      const updated = [...row.criteria];
      const questions = updated[critIdx].question_pool[pool].filter((_, i) => i !== qIdx);
      updated[critIdx] = { ...updated[critIdx], question_pool: { ...updated[critIdx].question_pool, [pool]: questions } };
      return { ...row, criteria: updated };
    }));
  };

  const saveRubric = useCallback(async () => {
    setSaving(true);
    try {
      await api.updateRubric(assessmentId, rubric);
    } catch (e: any) {
      alert(`Save failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }, [assessmentId, rubric]);

  const totalWeight = rubric.reduce(
    (sum, row) => sum + row.criteria.reduce((s, c) => s + (c.weight || 0), 0), 0
  );

  if (loading) {
    return (
      <main style={{ minHeight: "100vh", background: colors.bg, fontFamily: "'Outfit', sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 24, height: 24, border: "2px solid #DFDDD9", borderTopColor: colors.accent, borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ minHeight: "100vh", background: colors.bg, fontFamily: "'Outfit', sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ color: "#7E4452" }}>{error}</p>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: colors.bg, fontFamily: "'Outfit', sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
          <div>
            <p style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: colors.muted, marginBottom: 4 }}>
              Edit Assessment
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 600, color: colors.text, margin: 0 }}>{title}</h1>
            <p style={{ fontSize: 13, color: colors.secondary, marginTop: 4 }}>
              {scaffoldType} · {duration} min · {status}
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => router.push(`/instructor/assessment/${assessmentId}`)} style={secondaryBtnStyle}>
              ← Back to Results
            </button>
            <button onClick={saveRubric} disabled={saving} style={primaryBtnStyle}>
              {saving ? "Saving..." : "Save Rubric"}
            </button>
          </div>
        </div>

        {/* Learning Outcomes summary */}
        <Section title={`Learning Outcomes (${los.length})`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {los.map((lo, i) => (
              <div key={lo.id} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                <span style={{ fontSize: 12, color: colors.muted, fontFamily: "monospace", minWidth: 36 }}>{lo.id}</span>
                <span style={{ fontSize: 14, color: colors.text }}>{lo.text}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* Additional Instructions */}
        <Section title="Additional Instructions">
          <textarea
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            placeholder="Optional instructions for rubric/session generation..."
            style={{
              width: "100%", minHeight: 80, padding: "10px 14px", fontSize: 14,
              border: `1px solid ${colors.border}`, borderRadius: 4,
              background: "#fff", color: colors.text, outline: "none",
              resize: "vertical", boxSizing: "border-box",
            }}
          />
        </Section>

        {/* TTS toggle */}
        <Section title="Voice Settings">
          <label
            style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            onClick={() => setTtsEnabled(!ttsEnabled)}
          >
            <div style={{
              width: 36, height: 20, borderRadius: 10, position: "relative",
              background: ttsEnabled ? colors.accent : colors.border,
              transition: "background 0.15s",
            }}>
              <div style={{
                width: 16, height: 16, borderRadius: "50%", background: "#fff",
                position: "absolute", top: 2,
                left: ttsEnabled ? 18 : 2,
                transition: "left 0.15s",
                boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
              }} />
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: colors.text }}>
              AI speaks aloud during assessment
            </span>
          </label>
          <p style={{ fontSize: 12, color: colors.secondary, marginTop: 4, marginLeft: 46 }}>
            {ttsEnabled
              ? "Students will hear the AI interviewer's voice."
              : "Text-only mode — students read the AI's questions on screen."}
          </p>
        </Section>

        {/* Rubric Editor */}
        <Section title={`Rubric (${rubric.reduce((n, r) => n + r.criteria.length, 0)} criteria · total weight: ${totalWeight})`}>
          {rubric.length === 0 ? (
            <p style={{ fontSize: 14, color: colors.muted }}>No rubric generated yet. Use the "Create Assessment" flow to generate one.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {rubric.map((row) => {
                const lo = los.find((l) => l.id === row.learning_outcome_id);
                const expanded = expandedRows.has(row.learning_outcome_id);
                return (
                  <div key={row.learning_outcome_id} style={{ border: `1px solid ${colors.border}`, borderRadius: 6, overflow: "hidden", background: "#fff" }}>
                    {/* Row header */}
                    <div
                      onClick={() => toggleRow(row.learning_outcome_id)}
                      style={{ padding: "14px 18px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", background: expanded ? "#FAFAF8" : "#fff" }}
                    >
                      <div>
                        <span style={{ fontSize: 11, color: colors.muted, fontFamily: "monospace" }}>{row.learning_outcome_id}</span>
                        <p style={{ fontSize: 14, fontWeight: 500, color: colors.text, margin: "2px 0 0" }}>{lo?.text || row.learning_outcome_id}</p>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <span style={{ fontSize: 12, color: colors.secondary }}>{row.criteria.length} criteria</span>
                        <span style={{ fontSize: 14, color: colors.muted }}>{expanded ? "▾" : "▸"}</span>
                      </div>
                    </div>

                    {/* Expanded criteria */}
                    {expanded && (
                      <div style={{ borderTop: `1px solid ${colors.border}`, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 20 }}>
                        {row.criteria.map((crit, critIdx) => (
                          <div key={critIdx} style={{ border: `1px solid ${colors.border}`, borderRadius: 4, padding: 16, background: "#fff" }}>
                            {/* Criterion name + weight */}
                            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                              <input
                                value={crit.name}
                                onChange={(e) => updateCriterion(row.learning_outcome_id, critIdx, "name", e.target.value)}
                                style={{ flex: 1, ...inputStyle, fontWeight: 500 }}
                              />
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <label style={{ fontSize: 11, color: colors.muted }}>Weight:</label>
                                <input
                                  type="number"
                                  value={crit.weight}
                                  onChange={(e) => updateCriterion(row.learning_outcome_id, critIdx, "weight", parseInt(e.target.value) || 0)}
                                  style={{ ...inputStyle, width: 56, textAlign: "center" }}
                                />
                              </div>
                            </div>

                            {/* Two-panel: Attainment levels + Questions */}
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                              {/* Left: Attainment levels */}
                              <div>
                                <p style={{ fontSize: 10, fontWeight: 500, color: colors.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                  Attainment Levels
                                </p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                  {crit.attainment_levels.map((lvl, lvlIdx) => (
                                    <div key={lvlIdx}>
                                      <span style={{
                                        fontSize: 10, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.04em", display: "block", marginBottom: 4,
                                        color: lvl.level === "strong" ? "#2E8A48" : lvl.level === "partial" ? "#A89020" : "#9A9894",
                                      }}>
                                        {lvl.level}
                                      </span>
                                      <textarea
                                        value={lvl.description}
                                        onChange={(e) => updateAttainmentLevel(row.learning_outcome_id, critIdx, lvlIdx, e.target.value)}
                                        rows={3}
                                        style={{ ...inputStyle, width: "100%", resize: "vertical", fontSize: 12, lineHeight: 1.5 }}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Right: Questions */}
                              <div>
                                {/* Starting questions */}
                                <div style={{ marginBottom: 16 }}>
                                  <p style={{ fontSize: 10, fontWeight: 500, color: "#2B4066", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                    Starting Questions
                                  </p>
                                  <p style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontStyle: "italic" }}>
                                    These will definitely be asked to begin the assessment of this criterion.
                                  </p>
                                  {(crit.question_pool?.foundational || []).map((q, qIdx) => (
                                    <div key={qIdx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                                      <input
                                        value={q}
                                        onChange={(e) => updateQuestion(row.learning_outcome_id, critIdx, "foundational", qIdx, e.target.value)}
                                        style={{ ...inputStyle, flex: 1, fontSize: 12 }}
                                      />
                                      <button
                                        onClick={() => removeQuestion(row.learning_outcome_id, critIdx, "foundational", qIdx)}
                                        style={{ ...removeBtnStyle }}
                                        title="Remove"
                                      >×</button>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => addQuestion(row.learning_outcome_id, critIdx, "foundational")}
                                    style={addBtnStyle}
                                  >
                                    + Add starting question
                                  </button>
                                </div>

                                {/* Follow-up questions */}
                                <div>
                                  <p style={{ fontSize: 10, fontWeight: 500, color: "#A89020", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                    Follow-up Questions
                                  </p>
                                  <p style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontStyle: "italic" }}>
                                    Illustrative probes used to explore depth. The AI may adapt these based on responses.
                                  </p>
                                  {(crit.question_pool?.probing || []).map((q, qIdx) => (
                                    <div key={qIdx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                                      <input
                                        value={q}
                                        onChange={(e) => updateQuestion(row.learning_outcome_id, critIdx, "probing", qIdx, e.target.value)}
                                        style={{ ...inputStyle, flex: 1, fontSize: 12 }}
                                      />
                                      <button
                                        onClick={() => removeQuestion(row.learning_outcome_id, critIdx, "probing", qIdx)}
                                        style={{ ...removeBtnStyle }}
                                        title="Remove"
                                      >×</button>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => addQuestion(row.learning_outcome_id, critIdx, "probing")}
                                    style={addBtnStyle}
                                  >
                                    + Add follow-up question
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      </div>
    </main>
  );
}

// --- Shared styles ---

const inputStyle: React.CSSProperties = {
  padding: "8px 12px", fontSize: 13,
  border: "1px solid #DFDDD9", borderRadius: 4,
  background: "#fff", color: "#28261E", outline: "none",
  boxSizing: "border-box",
};

const addBtnStyle: React.CSSProperties = {
  fontSize: 12, color: "#2B4066", background: "none",
  border: "none", cursor: "pointer", padding: "4px 0",
  fontFamily: "'Outfit', sans-serif", fontWeight: 500,
};

const removeBtnStyle: React.CSSProperties = {
  width: 24, height: 24, fontSize: 16, lineHeight: "1",
  color: "#9A9894", background: "none", border: "1px solid #DFDDD9",
  borderRadius: 4, cursor: "pointer", display: "flex",
  alignItems: "center", justifyContent: "center", flexShrink: 0,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "8px 20px", fontSize: 14, fontWeight: 500,
  background: "#2B4066", color: "#fff", border: "none",
  borderRadius: 4, cursor: "pointer", fontFamily: "'Outfit', sans-serif",
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "8px 16px", fontSize: 14, fontWeight: 500,
  background: "transparent", color: "#6A6862",
  border: "1px solid #DFDDD9", borderRadius: 4,
  cursor: "pointer", fontFamily: "'Outfit', sans-serif",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A9894", marginBottom: 10 }}>{title}</h2>
      <div style={{ background: "#FAFAF8", border: "1px solid #E4E2DE", borderRadius: 6, padding: 20 }}>{children}</div>
    </section>
  );
}
