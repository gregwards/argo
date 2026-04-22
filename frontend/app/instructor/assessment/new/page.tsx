"use client";

import { useState, useCallback, useRef } from "react";
import { api, apiFetch } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type Step = 1 | 2 | 3 | 4 | 5;

interface LearningOutcome {
  id: string;
  text: string;
  provenance: "extracted" | "synthesized";
  source_excerpt: string | null;
  bloom_level: "remember/understand" | "apply" | "analyze/evaluate/create";
  estimated_minutes: number;
  priority: "required" | "if_time_permits" | "not_covered";
}

interface AttainmentLevel {
  level: "strong" | "partial" | "weak";
  description: string;
}

interface Criterion {
  name: string;
  weight: number;
  bloom_level: string;
  attainment_levels: AttainmentLevel[];
  question_pool: {
    foundational: string[];
    probing: string[];
  };
}

interface RubricRow {
  learning_outcome_id: string;
  criteria: Criterion[];
}

interface CoverageSummary {
  learning_outcome_id: string;
  description: string;
}

const STEP_NAMES = ["Upload Materials", "Review Outcomes", "Configure", "Review Rubric", "Publish"];

// Design tokens from UI spec
const colors = {
  bg: "#F4F3F1",
  surface: "#ECEAE8",
  border: "#DFDDD9",
  accent: "#2B4066",
  text: "#28261E",
  secondary: "#6A6862",
  muted: "#8A8880",
  darkRose: "#7E4452",
  warmYellow: "#C8A800",
};

export default function NewAssessment() {
  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState("");

  // Step 1 state
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 state
  const [los, setLos] = useState<LearningOutcome[]>([]);
  const [duration, setDuration] = useState(15);

  // Step 3 state
  const [scaffoldType, setScaffoldType] = useState<"competency_map" | "socratic_exploration">("competency_map");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState("");
  const [generateError, setGenerateError] = useState("");

  // Step 4 state
  const [assessmentId, setAssessmentId] = useState("");
  const [rubric, setRubric] = useState<RubricRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageSummary[]>([]);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [expandedQuestionPools, setExpandedQuestionPools] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Step 5 state
  const [publishing, setPublishing] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [copied, setCopied] = useState(false);

  // --- Step 1 handlers ---

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (f && f.size > 10 * 1024 * 1024) {
      setExtractError("File must be under 10MB.");
      return;
    }
    setFile(f);
    setExtractError("");
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0] || null;
    if (f && f.size > 10 * 1024 * 1024) {
      setExtractError("File must be under 10MB.");
      return;
    }
    setFile(f);
    setExtractError("");
  };

  const analyzeMaterian = useCallback(async () => {
    if (!title.trim()) return;
    setExtracting(true);
    setExtractError("");
    try {
      const formData = new FormData();
      if (file) formData.append("file", file);
      if (pastedText.trim()) formData.append("pasted_text", pastedText);

      const res = await fetch(`${API_URL}/api/assessments/extract-los`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || "Extraction failed");
      }
      const data = await res.json();
      const extracted: LearningOutcome[] = (data.learning_outcomes || []).map((lo: any) => ({
        id: lo.id || `lo_${Math.random().toString(36).slice(2)}`,
        text: lo.text || "",
        provenance: lo.provenance || "synthesized",
        source_excerpt: lo.source_excerpt || null,
        bloom_level: lo.bloom_level || "apply",
        estimated_minutes: lo.estimated_minutes ?? 3,
        priority: "required",
      }));
      setLos(extracted);
      setStep(2);
    } catch (e: any) {
      setExtractError(e.message || "Failed to analyze materials.");
    } finally {
      setExtracting(false);
    }
  }, [file, pastedText, title]);

  // --- Step 2 handlers ---

  const addLO = () => {
    const newId = `lo_${Date.now()}`;
    setLos([...los, {
      id: newId,
      text: "",
      provenance: "synthesized",
      source_excerpt: null,
      bloom_level: "apply",
      estimated_minutes: 3,
      priority: "required",
    }]);
  };

  const removeLO = (index: number) => {
    if (los.length <= 2) return;
    setLos(los.filter((_, i) => i !== index));
  };

  const updateLO = (index: number, text: string) => {
    const updated = [...los];
    updated[index] = { ...updated[index], text };
    setLos(updated);
  };

  const updateLOPriority = (index: number, priority: "required" | "if_time_permits" | "not_covered") => {
    const updated = [...los];
    updated[index] = { ...updated[index], priority };
    setLos(updated);
  };

  const requiredMinutes = los.filter((lo) => lo.priority === "required").reduce((sum, lo) => sum + lo.estimated_minutes, 0);
  const optionalMinutes = los.filter((lo) => lo.priority === "if_time_permits").reduce((sum, lo) => sum + lo.estimated_minutes, 0);
  const totalEstimatedMinutes = requiredMinutes + optionalMinutes;
  const overBudget = requiredMinutes > duration;

  // --- Step 3 handlers ---

  const generateRubric = useCallback(async () => {
    const validLOs = los.filter((lo) => lo.text.trim() && lo.priority !== "not_covered");
    if (validLOs.length < 1 || !title.trim()) return;

    setGenerating(true);
    setGenerateError("");
    setGenerateStatus("Creating assessment...");
    try {
      // Create assessment
      const { assessment } = await api.createAssessment({
        // TODO(MVP): Replace with actual course selection
        course_id: "a0000000-0000-0000-0000-000000000001",
        title,
        scaffold_type: scaffoldType,
        duration_target_minutes: duration,
        learning_outcomes: validLOs.map(({ id, text }) => ({ id, text })),
        additional_instructions: additionalInstructions || null,
        tts_enabled: ttsEnabled,
      });
      setAssessmentId(assessment.id);

      // Generate rubric via SSE for progress updates
      setGenerateStatus(`Generating rubric for ${validLOs.length} learning outcomes...`);
      const rubricData = await new Promise<{ rubric: RubricRow[]; coverage_summary: CoverageSummary[] }>((resolve, reject) => {
        const evtSource = new EventSource(`${API_URL}/api/assessments/${assessment.id}/generate-rubric-stream`, {
          // @ts-ignore — withCredentials not on EventSource in all TS defs
        });
        evtSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === "status") {
              setGenerateStatus(data.message);
            } else if (data.type === "complete") {
              evtSource.close();
              resolve({ rubric: data.rubric || [], coverage_summary: data.coverage_summary || [] });
            } else if (data.type === "error") {
              evtSource.close();
              reject(new Error(data.message));
            }
          } catch {
            // ignore parse errors on partial events
          }
        };
        evtSource.onerror = () => {
          evtSource.close();
          // Fallback to non-streaming endpoint
          setGenerateStatus("Retrying rubric generation...");
          api.generateRubric(assessment.id).then(
            (d: any) => resolve({ rubric: d.rubric || [], coverage_summary: d.coverage_summary || [] }),
            (err: any) => reject(err),
          );
        };
      });

      setRubric(rubricData.rubric);
      setCoverage(rubricData.coverage_summary);
      setStep(4);
    } catch (e: any) {
      setGenerateError(e.message || "Failed to generate rubric.");
    } finally {
      setGenerating(false);
      setGenerateStatus("");
    }
  }, [los, title, scaffoldType, duration, additionalInstructions]);

  // --- Step 4 handlers ---

  const toggleRow = (loId: string) => {
    const next = new Set(expandedRows);
    next.has(loId) ? next.delete(loId) : next.add(loId);
    setExpandedRows(next);
  };

  const toggleQuestionPool = (key: string) => {
    const next = new Set(expandedQuestionPools);
    next.has(key) ? next.delete(key) : next.add(key);
    setExpandedQuestionPools(next);
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
      updated[critIdx] = {
        ...updated[critIdx],
        question_pool: { ...updated[critIdx].question_pool, [pool]: questions },
      };
      return { ...row, criteria: updated };
    }));
  };

  const totalWeight = rubric.reduce(
    (sum, row) => sum + row.criteria.reduce((s, c) => s + (c.weight || 0), 0),
    0
  );

  const uncoveredLOs = coverage.filter((c) =>
    c.description.toLowerCase().includes("not covered") ||
    c.description.toLowerCase().includes("will not be assessed")
  );

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

  // --- Step 5 handlers ---

  const publishAssessment = useCallback(async () => {
    setPublishing(true);
    try {
      await api.updateRubric(assessmentId, rubric);
      const result = await api.publishAssessment(assessmentId);
      setShareLink(result.share_link || result.assessment?.share_link || "");
    } catch (e: any) {
      alert(`Publish failed: ${e.message}`);
    } finally {
      setPublishing(false);
    }
  }, [assessmentId, rubric]);

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}${shareLink}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const requiredLOs = los.filter((lo) => lo.priority === "required");
  const estimatedRequiredMinutes = requiredLOs.reduce((sum, lo) => sum + lo.estimated_minutes, 0);

  return (
    <main style={{ minHeight: "100vh", background: colors.bg, fontFamily: "'Outfit', sans-serif" }}>
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>

        {/* Progress indicator */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, marginBottom: 40 }}>
          {STEP_NAMES.map((name, idx) => {
            const s = idx + 1;
            const active = step === s;
            const done = step > s;
            return (
              <div key={s} style={{ display: "flex", alignItems: "center", flex: s < 5 ? 1 : "none" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 500,
                    background: done ? colors.accent : active ? colors.accent : colors.surface,
                    color: done || active ? "#fff" : colors.secondary,
                    border: `1.5px solid ${done || active ? colors.accent : colors.border}`,
                  }}>
                    {done ? "✓" : s}
                  </div>
                  <span style={{
                    fontSize: 10, fontWeight: active ? 500 : 400,
                    color: active ? colors.accent : done ? colors.secondary : colors.muted,
                    whiteSpace: "nowrap",
                  }}>
                    {name}
                  </span>
                </div>
                {s < 5 && (
                  <div style={{
                    flex: 1, height: 1.5,
                    background: done ? colors.accent : colors.border,
                    margin: "0 8px", marginBottom: 22,
                  }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step 1: Upload Materials */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: colors.text, marginBottom: 6 }}>
                Assessment Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Midterm: Supply and Demand"
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "10px 14px", fontSize: 14,
                  border: `1px solid ${colors.border}`, borderRadius: 4,
                  background: "#fff", color: colors.text, outline: "none",
                }}
              />
            </div>

            {/* File upload zone */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: colors.text, marginBottom: 6 }}>
                Upload Course Materials
              </label>
              <div
                onDrop={handleDrop}
                onDragOver={(e) => e.preventDefault()}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `1.5px dashed ${file ? colors.accent : colors.border}`,
                  borderRadius: 4, padding: "32px 24px", textAlign: "center",
                  cursor: "pointer", background: file ? "#EBEEF4" : colors.surface,
                  transition: "all 0.15s",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileChange}
                  style={{ display: "none" }}
                />
                {file ? (
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500, color: colors.accent, margin: 0 }}>{file.name}</p>
                    <p style={{ fontSize: 12, color: colors.secondary, margin: "4px 0 0" }}>
                      {(file.size / 1024).toFixed(0)} KB — click to replace
                    </p>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: 14, color: colors.secondary, margin: 0 }}>
                      Drop a file here or click to select
                    </p>
                    <p style={{ fontSize: 12, color: colors.muted, margin: "6px 0 0" }}>
                      PDF, DOCX, or TXT — max 10MB
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Paste textarea */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: colors.text, marginBottom: 6 }}>
                Or paste text directly
              </label>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste syllabus content, lecture notes, or any course material here..."
                rows={6}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "10px 14px", fontSize: 14,
                  border: `1px solid ${colors.border}`, borderRadius: 4,
                  background: "#fff", color: colors.text,
                  fontFamily: "'Outfit', sans-serif", resize: "vertical", outline: "none",
                }}
              />
            </div>

            {extractError && (
              <p style={{ fontSize: 13, color: colors.darkRose, margin: 0 }}>{extractError}</p>
            )}

            <button
              onClick={analyzeMaterian}
              disabled={extracting || (!file && !pastedText.trim()) || !title.trim()}
              style={{
                padding: "12px 24px", borderRadius: 4,
                background: extracting || (!file && !pastedText.trim()) || !title.trim() ? colors.surface : colors.accent,
                color: extracting || (!file && !pastedText.trim()) || !title.trim() ? colors.muted : "#fff",
                border: "none", fontSize: 14, fontWeight: 500, cursor: "pointer",
                fontFamily: "'Outfit', sans-serif", alignSelf: "flex-start",
              }}
            >
              {extracting ? "Analyzing your materials..." : "Analyze Materials"}
            </button>
          </div>
        )}

        {/* Step 2: Review Outcomes */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 500, color: colors.text, margin: "0 0 4px" }}>
                Review Learning Outcomes
              </h2>
              <p style={{ fontSize: 13, color: colors.secondary, margin: 0 }}>
                Edit, remove, or add learning outcomes. Each outcome shows where it came from.
              </p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {los.map((lo, i) => (
                <div key={lo.id} style={{
                  background: "#fff", border: `1px solid ${colors.border}`,
                  borderRadius: 4, padding: "14px 16px",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                    <input
                      type="text"
                      value={lo.text}
                      onChange={(e) => updateLO(i, e.target.value)}
                      style={{
                        flex: 1, padding: "8px 12px", fontSize: 14,
                        border: `1px solid ${colors.border}`, borderRadius: 4,
                        color: colors.text, outline: "none", fontFamily: "'Outfit', sans-serif",
                      }}
                    />
                    <button
                      onClick={() => removeLO(i)}
                      disabled={los.length <= 2}
                      style={{
                        padding: "8px 12px", fontSize: 14, fontWeight: 400,
                        border: `1px solid ${colors.border}`, borderRadius: 4,
                        background: colors.surface, color: colors.secondary,
                        cursor: los.length <= 2 ? "not-allowed" : "pointer",
                        opacity: los.length <= 2 ? 0.4 : 1,
                        fontFamily: "'Outfit', sans-serif",
                      }}
                    >
                      Remove
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {/* Provenance tag */}
                    <span style={{
                      fontSize: 10, fontWeight: 500, padding: "2px 8px", borderRadius: 3,
                      background: lo.provenance === "extracted" ? "#E8F5EE" : "#EBF0F8",
                      color: lo.provenance === "extracted" ? "#1A7A42" : colors.accent,
                      border: `1px solid ${lo.provenance === "extracted" ? "#B4D9C4" : "#C0CCDC"}`,
                    }}>
                      {lo.provenance === "extracted" ? "From your materials" : "Suggested by AI"}
                    </span>

                    {/* Bloom's level badge */}
                    <span style={{
                      fontSize: 10, color: colors.muted,
                      background: colors.surface, border: `1px solid ${colors.border}`,
                      padding: "2px 8px", borderRadius: 3,
                    }}>
                      {lo.bloom_level}
                    </span>

                    {/* Estimated minutes */}
                    <span style={{ fontSize: 11, color: colors.muted }}>
                      ~{lo.estimated_minutes} min
                    </span>

                    {/* Priority toggle — always visible */}
                    <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                      {(["required", "if_time_permits", "not_covered"] as const).map((p) => {
                        const label = p === "required" ? "Required" : p === "if_time_permits" ? "If time permits" : "Not covered";
                        const active = lo.priority === p;
                        const bg = active
                          ? p === "required" ? colors.accent : p === "if_time_permits" ? "#5A3640" : colors.muted
                          : colors.surface;
                        const fg = active ? "#fff" : colors.secondary;
                        const bd = active ? bg : colors.border;
                        return (
                          <button
                            key={p}
                            onClick={() => updateLOPriority(i, p)}
                            style={{
                              fontSize: 10, padding: "2px 10px", borderRadius: 3,
                              background: bg, color: fg, border: `1px solid ${bd}`,
                              cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={addLO}
              style={{
                fontSize: 13, color: colors.accent, background: "none",
                border: `1px dashed ${colors.accent}`, borderRadius: 4,
                padding: "10px 16px", cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                alignSelf: "flex-start",
              }}
            >
              Add Learning Outcome
            </button>

            {/* Time estimate summary — always visible */}
            <div style={{
              borderLeft: `4px solid ${overBudget ? colors.warmYellow : "#8AB68A"}`,
              background: overBudget ? "#FFFBEC" : "#F4F9F4",
              border: `1px solid ${overBudget ? "#E8D880" : "#C4DCC4"}`,
              borderRadius: 4, padding: "12px 16px",
            }}>
              <p style={{ fontSize: 13, color: overBudget ? "#6B5800" : "#2A5A2A", margin: 0 }}>
                <strong>Required:</strong> {requiredMinutes} min
                {optionalMinutes > 0 && <> &middot; <strong>If time permits:</strong> {optionalMinutes} min</>}
                {" "}&middot; <strong>Target:</strong> {duration} min
              </p>
              {overBudget && (
                <p style={{ fontSize: 12, color: "#6B5800", margin: "6px 0 0" }}>
                  Required outcomes exceed target duration. Mark some as &ldquo;If time permits&rdquo; or &ldquo;Not covered.&rdquo;
                </p>
              )}
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  padding: "10px 20px", borderRadius: 4,
                  border: `1px solid ${colors.border}`, background: colors.surface,
                  color: colors.secondary, fontSize: 14, cursor: "pointer",
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={los.filter((lo) => lo.text.trim()).length < 1}
                style={{
                  padding: "10px 20px", borderRadius: 4, border: "none",
                  background: los.filter((lo) => lo.text.trim()).length < 1 ? colors.surface : colors.accent,
                  color: los.filter((lo) => lo.text.trim()).length < 1 ? colors.muted : "#fff",
                  fontSize: 14, fontWeight: 500, cursor: "pointer",
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Configure */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 500, color: colors.text, margin: "0 0 4px" }}>
                Configure Assessment
              </h2>
              <p style={{ fontSize: 13, color: colors.secondary, margin: 0 }}>
                Choose how the AI will guide the conversation.
              </p>
            </div>

            {/* Scaffold type */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: colors.text, marginBottom: 12 }}>
                Assessment Type
              </label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {[
                  {
                    value: "competency_map" as const,
                    label: "Competency Map",
                    desc: "Structured progression through difficulty levels. Best for technical subjects.",
                  },
                  {
                    value: "socratic_exploration" as const,
                    label: "Socratic Exploration",
                    desc: "Open-ended questioning that follows the student's reasoning. Best for conceptual topics.",
                  },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setScaffoldType(opt.value)}
                    style={{
                      padding: "18px 20px", textAlign: "left",
                      border: `1.5px solid ${scaffoldType === opt.value ? colors.accent : colors.border}`,
                      borderRadius: 4,
                      background: scaffoldType === opt.value ? "#EBEEF4" : "#fff",
                      cursor: "pointer", fontFamily: "'Outfit', sans-serif",
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 500, color: colors.text, marginBottom: 6 }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: 13, color: colors.secondary, lineHeight: 1.5 }}>
                      {opt.desc}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Duration slider */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: colors.text, marginBottom: 8 }}>
                Duration Target
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 8 }}>
                <span style={{ fontSize: 32, fontWeight: 800, color: colors.accent, letterSpacing: "-0.02em" }}>
                  {duration}
                </span>
                <span style={{ fontSize: 14, color: colors.secondary }}>minutes</span>
              </div>
              <input
                type="range"
                min={10}
                max={20}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value))}
                style={{ width: "100%", accentColor: colors.accent }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: colors.muted, marginTop: 4 }}>
                <span>10 min</span>
                <span>20 min</span>
              </div>

              {/* Estimated time */}
              <div style={{ marginTop: 10, fontSize: 13, color: colors.secondary }}>
                Estimated time: {estimatedRequiredMinutes} min (from required outcomes)
                {estimatedRequiredMinutes > duration && (
                  <span style={{ color: colors.darkRose, marginLeft: 8 }}>
                    — assessment may exceed duration target
                  </span>
                )}
              </div>
            </div>

            {/* Additional instructions */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 500, color: colors.text, marginBottom: 6 }}>
                Additional Instructions (optional)
              </label>
              <textarea
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
                placeholder="e.g., Focus on application to real-world scenarios. Don't dwell on memorized definitions."
                rows={3}
                style={{
                  width: "100%", boxSizing: "border-box",
                  padding: "10px 14px", fontSize: 14,
                  border: `1px solid ${colors.border}`, borderRadius: 4,
                  background: "#fff", color: colors.text,
                  fontFamily: "'Outfit', sans-serif", resize: "vertical", outline: "none",
                }}
              />
            </div>

            {/* TTS toggle */}
            <div>
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
                  ? "Students will hear the AI interviewer's voice. Recommended for a natural conversation experience."
                  : "Text-only mode — students read the AI's questions on screen."}
              </p>
            </div>

            {generateError && (
              <p style={{ fontSize: 13, color: colors.darkRose, margin: 0 }}>{generateError}</p>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setStep(2)}
                style={{
                  padding: "10px 20px", borderRadius: 4,
                  border: `1px solid ${colors.border}`, background: colors.surface,
                  color: colors.secondary, fontSize: 14, cursor: "pointer",
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                Back
              </button>
              <button
                onClick={generateRubric}
                disabled={generating}
                style={{
                  padding: "10px 24px", borderRadius: 4, border: "none",
                  background: generating ? colors.surface : colors.accent,
                  color: generating ? colors.muted : "#fff",
                  fontSize: 14, fontWeight: 500, cursor: generating ? "wait" : "pointer",
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                {generating ? (generateStatus || "Generating rubric...") : "Generate Rubric"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Review Rubric */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 500, color: colors.text, margin: "0 0 4px" }}>
                Review Rubric
              </h2>
              <p style={{ fontSize: 13, color: colors.secondary, margin: 0 }}>
                Expand each outcome to review criteria, attainment levels, and question pools. Inline editing enabled.
              </p>
            </div>

            {/* Weight summary bar */}
            <div style={{
              background: totalWeight !== 100 && totalWeight > 0 ? "#FDF4F5" : colors.surface,
              border: `1px solid ${totalWeight !== 100 && totalWeight > 0 ? "#D4A0A8" : colors.border}`,
              borderRadius: 4, padding: "10px 16px",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <span style={{ fontSize: 13, color: colors.secondary }}>
                Total weight across all criteria:
              </span>
              <span style={{
                fontSize: 15, fontWeight: 500,
                color: totalWeight === 100 ? colors.accent : colors.darkRose,
              }}>
                {totalWeight}
              </span>
              {totalWeight !== 100 && totalWeight > 0 && (
                <span style={{ fontSize: 12, color: colors.darkRose }}>
                  — should be 100
                </span>
              )}
            </div>

            {/* Rubric cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {rubric.map((row) => {
                const lo = los.find((l) => l.id === row.learning_outcome_id);
                const isExpanded = expandedRows.has(row.learning_outcome_id);
                const rowWeight = row.criteria.reduce((s, c) => s + (c.weight || 0), 0);

                return (
                  <div key={row.learning_outcome_id} style={{
                    border: `1px solid ${colors.border}`, borderRadius: 6, overflow: "hidden",
                  }}>
                    {/* Collapsed header */}
                    <button
                      onClick={() => toggleRow(row.learning_outcome_id)}
                      style={{
                        width: "100%", padding: "14px 18px",
                        display: "flex", alignItems: "center", justifyContent: "space-between",
                        background: colors.surface, border: "none", cursor: "pointer",
                        textAlign: "left", fontFamily: "'Outfit', sans-serif",
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, color: colors.text, margin: "0 0 3px" }}>
                          {lo?.text || row.learning_outcome_id}
                        </p>
                        <p style={{ fontSize: 11, color: colors.muted, margin: 0 }}>
                          {row.criteria.length} {row.criteria.length === 1 ? "criterion" : "criteria"} — {rowWeight} pts
                        </p>
                      </div>
                      <span style={{ fontSize: 12, color: colors.secondary, marginLeft: 16 }}>
                        {isExpanded ? "Collapse" : "Expand"}
                      </span>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div style={{ background: colors.bg, borderTop: `1px solid ${colors.border}`, padding: "16px 18px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                          {row.criteria.map((crit, critIdx) => {
                            const poolKey = `${row.learning_outcome_id}-${critIdx}`;
                            const poolExpanded = expandedQuestionPools.has(poolKey);

                            return (
                              <div key={critIdx} style={{
                                border: `1px solid ${colors.border}`, borderRadius: 4,
                                background: "#fff", padding: "14px 16px",
                              }}>
                                {/* Criterion header */}
                                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                                  <input
                                    type="text"
                                    value={crit.name}
                                    onChange={(e) => updateCriterion(row.learning_outcome_id, critIdx, "name", e.target.value)}
                                    style={{
                                      flex: 1, padding: "6px 10px", fontSize: 14, fontWeight: 500,
                                      border: `1px solid ${colors.border}`, borderRadius: 4,
                                      color: colors.text, outline: "none", fontFamily: "'Outfit', sans-serif",
                                    }}
                                  />
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <label style={{ fontSize: 11, color: colors.muted }}>Weight</label>
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      value={crit.weight}
                                      onChange={(e) => updateCriterion(row.learning_outcome_id, critIdx, "weight", parseInt(e.target.value) || 0)}
                                      style={{
                                        width: 64, padding: "6px 8px", fontSize: 14, fontWeight: 500,
                                        border: `1px solid ${colors.border}`, borderRadius: 4,
                                        color: colors.accent, textAlign: "center", outline: "none",
                                        fontFamily: "'Outfit', sans-serif",
                                      }}
                                    />
                                    <span style={{ fontSize: 11, color: colors.muted }}>pts</span>
                                  </div>
                                </div>

                                {/* Two-panel: Attainment levels + Questions */}
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                                  {/* Left: Attainment levels */}
                                  <div>
                                    <p style={{ fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: colors.muted, margin: "0 0 8px" }}>
                                      Attainment Levels
                                    </p>
                                    {(["strong", "partial", "weak"] as const).map((levelKey, lvlIdx) => {
                                      const lvl = crit.attainment_levels[lvlIdx] || { level: levelKey, description: "" };
                                      return (
                                        <div key={levelKey} style={{ marginBottom: 8 }}>
                                          <span style={{
                                            fontSize: 9, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4,
                                            color: levelKey === "strong" ? "#2E8A48" : levelKey === "partial" ? "#A89020" : "#9A9894",
                                          }}>
                                            {levelKey}
                                          </span>
                                          <textarea
                                            value={lvl.description}
                                            onChange={(e) => updateAttainmentLevel(row.learning_outcome_id, critIdx, lvlIdx, e.target.value)}
                                            rows={3}
                                            style={{
                                              width: "100%", boxSizing: "border-box",
                                              padding: "8px 10px", fontSize: 12,
                                              border: `1px solid ${colors.border}`, borderRadius: 4,
                                              color: colors.text, background: colors.bg,
                                              fontFamily: "'Outfit', sans-serif", resize: "vertical", outline: "none",
                                              lineHeight: 1.5,
                                            }}
                                          />
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Right: Questions */}
                                  <div>
                                    {/* Starting questions */}
                                    <div style={{ marginBottom: 16 }}>
                                      <p style={{ fontSize: 9, fontWeight: 500, color: colors.accent, margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                        Starting Questions
                                      </p>
                                      <p style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontStyle: "italic" }}>
                                        Will definitely be asked to begin assessing this criterion.
                                      </p>
                                      {crit.question_pool.foundational.map((q, qIdx) => (
                                        <input
                                          key={qIdx}
                                          type="text"
                                          value={q}
                                          onChange={(e) => updateQuestion(row.learning_outcome_id, critIdx, "foundational", qIdx, e.target.value)}
                                          style={{
                                            width: "100%", boxSizing: "border-box",
                                            padding: "6px 10px", fontSize: 12, marginBottom: 6,
                                            border: `1px solid ${colors.border}`, borderRadius: 4,
                                            color: colors.text, background: colors.bg,
                                            fontFamily: "'Outfit', sans-serif", outline: "none",
                                          }}
                                        />
                                      ))}
                                    </div>

                                    {/* Follow-up questions */}
                                    <div>
                                      <p style={{ fontSize: 9, fontWeight: 500, color: "#A89020", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                        Follow-up Questions
                                      </p>
                                      <p style={{ fontSize: 11, color: colors.muted, marginBottom: 8, fontStyle: "italic" }}>
                                        Illustrative probes — the AI may adapt these based on responses.
                                      </p>
                                      {crit.question_pool.probing.map((q, qIdx) => (
                                        <input
                                          key={qIdx}
                                          type="text"
                                          value={q}
                                          onChange={(e) => updateQuestion(row.learning_outcome_id, critIdx, "probing", qIdx, e.target.value)}
                                          style={{
                                            width: "100%", boxSizing: "border-box",
                                            padding: "6px 10px", fontSize: 12, marginBottom: 6,
                                            border: `1px solid ${colors.border}`, borderRadius: 4,
                                            color: colors.secondary, background: colors.bg,
                                            fontFamily: "'Outfit', sans-serif", outline: "none",
                                          }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Coverage advisory */}
            {uncoveredLOs.length > 0 && (
              <div style={{
                borderLeft: `4px solid ${colors.warmYellow}`,
                background: "#FFFBEC", border: `1px solid #E8D880`,
                borderRadius: 4, padding: "14px 16px",
              }}>
                <p style={{ fontSize: 13, fontWeight: 500, color: "#6B5800", margin: "0 0 6px" }}>
                  These learning outcomes will not be assessed:
                </p>
                <ul style={{ margin: 0, padding: "0 0 0 20px" }}>
                  {uncoveredLOs.map((c) => (
                    <li key={c.learning_outcome_id} style={{ fontSize: 13, color: "#6B5800" }}>
                      {los.find((l) => l.id === c.learning_outcome_id)?.text || c.learning_outcome_id}
                    </li>
                  ))}
                </ul>
                <p style={{ fontSize: 12, color: "#8A7200", margin: "8px 0 0" }}>
                  You can publish anyway, or go back to adjust.
                </p>
              </div>
            )}

            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => setStep(3)}
                style={{
                  padding: "10px 20px", borderRadius: 4,
                  border: `1px solid ${colors.border}`, background: colors.surface,
                  color: colors.secondary, fontSize: 14, cursor: "pointer",
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                Back
              </button>
              <button
                onClick={saveRubric}
                disabled={saving}
                style={{
                  padding: "10px 20px", borderRadius: 4,
                  border: `1px solid ${colors.accent}`, background: "none",
                  color: colors.accent, fontSize: 14, cursor: saving ? "wait" : "pointer",
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={() => setStep(5)}
                style={{
                  padding: "10px 24px", borderRadius: 4, border: "none",
                  background: colors.accent, color: "#fff",
                  fontSize: 14, fontWeight: 500, cursor: "pointer",
                  fontFamily: "'Outfit', sans-serif",
                }}
              >
                Publish
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Publish */}
        {step === 5 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 500, color: colors.text, margin: "0 0 4px" }}>
                Publish Assessment
              </h2>
              <p style={{ fontSize: 13, color: colors.secondary, margin: 0 }}>
                Review your assessment details, then publish to generate the share link.
              </p>
            </div>

            {/* Confirmation summary */}
            <div style={{
              background: colors.surface, border: `1px solid ${colors.border}`,
              borderRadius: 4, padding: "20px 24px",
            }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <p style={{ fontSize: 11, color: colors.muted, margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Title</p>
                  <p style={{ fontSize: 15, fontWeight: 500, color: colors.text, margin: 0 }}>{title}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: colors.muted, margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Learning Outcomes</p>
                  <p style={{ fontSize: 15, fontWeight: 500, color: colors.text, margin: 0 }}>{los.length}</p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: colors.muted, margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Scaffold Type</p>
                  <p style={{ fontSize: 15, fontWeight: 500, color: colors.text, margin: 0 }}>
                    {scaffoldType === "competency_map" ? "Competency Map" : "Socratic Exploration"}
                  </p>
                </div>
                <div>
                  <p style={{ fontSize: 11, color: colors.muted, margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.06em" }}>Duration</p>
                  <p style={{ fontSize: 15, fontWeight: 500, color: colors.text, margin: 0 }}>{duration} minutes</p>
                </div>
              </div>
            </div>

            {/* Share link (post-publish) */}
            {shareLink ? (
              <div style={{
                background: "#EEF5EA", border: `1px solid #B4D4A8`,
                borderRadius: 4, padding: "20px 24px",
              }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: "#2A5C1A", margin: "0 0 10px" }}>
                  Assessment published.
                </p>
                <p style={{ fontSize: 13, color: "#3A6A2A", margin: "0 0 10px" }}>
                  Share this link with students:
                </p>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <code style={{
                    flex: 1, background: "#fff", border: `1px solid #B4D4A8`,
                    borderRadius: 4, padding: "8px 12px", fontSize: 13, color: colors.text,
                    fontFamily: "monospace",
                  }}>
                    {typeof window !== "undefined" ? `${window.location.origin}${shareLink}` : shareLink}
                  </code>
                  <button
                    onClick={copyLink}
                    style={{
                      padding: "8px 16px", borderRadius: 4, border: "none",
                      background: copied ? "#2A5C1A" : colors.accent,
                      color: "#fff", fontSize: 13, cursor: "pointer",
                      fontFamily: "'Outfit', sans-serif", whiteSpace: "nowrap",
                    }}
                  >
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  onClick={() => setStep(4)}
                  style={{
                    padding: "10px 20px", borderRadius: 4,
                    border: `1px solid ${colors.border}`, background: colors.surface,
                    color: colors.secondary, fontSize: 14, cursor: "pointer",
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  Back
                </button>
                <button
                  onClick={publishAssessment}
                  disabled={publishing}
                  style={{
                    padding: "10px 24px", borderRadius: 4, border: "none",
                    background: publishing ? colors.surface : colors.accent,
                    color: publishing ? colors.muted : "#fff",
                    fontSize: 14, fontWeight: 500, cursor: publishing ? "wait" : "pointer",
                    fontFamily: "'Outfit', sans-serif",
                  }}
                >
                  {publishing ? "Compiling session plan..." : "Publish Assessment"}
                </button>
              </div>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
