const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || "API error");
  }
  return res.json();
}

export const api = {
  // Assessments
  createAssessment: (data: any) => apiFetch("/api/assessments", { method: "POST", body: JSON.stringify(data) }),
  generateRubric: (id: string) => apiFetch(`/api/assessments/${id}/generate-rubric`, { method: "POST" }),
  updateRubric: (id: string, rubric: any[]) => apiFetch(`/api/assessments/${id}/rubric`, { method: "PUT", body: JSON.stringify({ rubric }) }),
  publishAssessment: (id: string) => apiFetch(`/api/assessments/${id}/publish`, { method: "POST" }),
  getAssessment: (id: string) => apiFetch(`/api/assessments/${id}`),
  getAssessmentBySlug: (slug: string) => apiFetch(`/api/assessments/by-slug/${slug}`),

  // Auth
  requestMagicLink: (email: string, assessmentId: string) =>
    apiFetch("/api/auth/magic-link", {
      method: "POST",
      body: JSON.stringify({ email, assessment_id: assessmentId }),
    }),
  verifyToken: (token: string) =>
    apiFetch(`/api/auth/verify?token=${token}`),
  getMe: () => apiFetch("/api/auth/me"),

  // Sessions
  getSession: (id: string) => apiFetch(`/api/sessions/${id}`),
  getProfile: (sessionId: string) => apiFetch(`/api/sessions/${sessionId}/profile`),

  // Dashboard
  getInstructorAssessments: () => apiFetch("/api/dashboard/assessments"),
  getAssessmentSummary: (id: string) => apiFetch(`/api/dashboard/assessments/${id}/summary`),
  getAssessmentSessions: (id: string) => apiFetch(`/api/dashboard/assessments/${id}/sessions`),
  getScoreDistributions: (assessmentId: string) =>
    apiFetch(`/api/dashboard/assessments/${assessmentId}/score-distributions`),

  // Score editing
  editCriterionScore: (sessionId: string, criterionId: string, newScore: number) =>
    apiFetch(`/api/dashboard/sessions/${sessionId}/profile/scores`, {
      method: "PUT",
      body: JSON.stringify({ criterion_id: criterionId, new_score: newScore }),
    }),

  // Session drill-down
  getSessionDrilldown: (sessionId: string) =>
    apiFetch(`/api/sessions/${sessionId}/drill-down`),

  // Student portal
  getStudentSessions: () => apiFetch("/api/student/sessions"),
  getStudentAssessments: () => apiFetch("/api/student/assessments"),

  // Recording URL — returns a URL string for use as <audio> src, not a fetch
  getRecordingUrl: (sessionId: string) =>
    `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/sessions/${sessionId}/recording`,
};
