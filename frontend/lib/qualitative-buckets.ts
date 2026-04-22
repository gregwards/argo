/**
 * Level-based scoring system for student-facing profile display.
 * Raw scores are never shown to students — only qualitative levels and visual blocks.
 *
 * Levels: 5=Exceptional, 4=Proficient, 3=Developing, 2=Emerging, 1=Not Demonstrated
 */

export type CompetencyLevel = 1 | 2 | 3 | 4 | 5;

export const LEVEL_CONFIG: Record<
  CompetencyLevel,
  { label: string; blockColor: string; textColor: string }
> = {
  5: { label: "Exceptional", blockColor: "#2B4066", textColor: "#2B4066" },
  4: { label: "Proficient", blockColor: "#38A858", textColor: "#2E8A48" },
  3: { label: "Developing", blockColor: "#C8A820", textColor: "#A89020" },
  2: { label: "Emerging", blockColor: "#C8A820", textColor: "#A89020" },
  1: { label: "Not Demonstrated", blockColor: "#DFDDD9", textColor: "#6A6862" },
};

// --- Backward compatibility for legacy profiles without `level` field ---

export type QualitativeBucket = "Developing" | "Approaching" | "Proficient" | "Advanced";

export const BUCKET_COLORS: Record<QualitativeBucket, { bg: string; text: string; border: string }> = {
  Developing: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
  Approaching: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
  Proficient: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
  Advanced: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
};

export function scoreToBucket(score: number, maxScore: number): QualitativeBucket {
  if (maxScore === 0) return "Developing";
  const pct = score / maxScore;
  if (pct < 0.5) return "Developing";
  if (pct < 0.7) return "Approaching";
  if (pct < 0.9) return "Proficient";
  return "Advanced";
}

/** Map legacy percentage-based score to a 1-5 level for backward compat. */
export function scoreToLevel(score: number, maxScore: number): CompetencyLevel {
  if (maxScore === 0) return 1;
  const pct = score / maxScore;
  if (pct >= 0.9) return 5;
  if (pct >= 0.7) return 4;
  if (pct >= 0.5) return 3;
  if (pct >= 0.25) return 2;
  return 1;
}

export function overallBucket(
  criteria: Array<{ ai_score: number; instructor_score?: number; max_score: number }>
): QualitativeBucket {
  if (criteria.length === 0) return "Developing";
  const totalScore = criteria.reduce((sum, c) => sum + (c.instructor_score ?? c.ai_score), 0);
  const totalMax = criteria.reduce((sum, c) => sum + c.max_score, 0);
  return scoreToBucket(totalScore, totalMax);
}
