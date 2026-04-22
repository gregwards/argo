"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

// --- Types ---

interface StudentSession {
  id: string;
  assessment_title: string;
  created_at: string;
  status: "active" | "completed" | "abandoned";
  has_profile: boolean;
}

// --- Status Badge ---

type StatusVariant = "completed" | "generating" | "active";

function StatusBadge({ variant }: { variant: StatusVariant }) {
  const styles: Record<StatusVariant, { bg: string; text: string; label: string }> = {
    completed: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Completed" },
    generating: { bg: "bg-amber-50", text: "text-amber-700", label: "Profile Generating" },
    active: { bg: "bg-blue-50", text: "text-blue-700", label: "In Progress" },
  };
  const s = styles[variant];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${s.bg} ${s.text}`}
    >
      {s.label}
    </span>
  );
}

function getStatusVariant(session: StudentSession): StatusVariant {
  if (session.status === "active") return "active";
  if (session.has_profile) return "completed";
  return "generating";
}

function formatDate(isoString: string): string {
  try {
    return new Date(isoString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return isoString;
  }
}

// --- Main Component ---

export default function StudentHomePage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<StudentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getStudentSessions()
      .then((data) => setSessions(Array.isArray(data) ? data : data.sessions ?? []))
      .catch((err) => setError(err.message || "Failed to load sessions"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen bg-[#F4F3F1] py-10">
      <div className="max-w-3xl mx-auto px-6">

        {/* Header */}
        <div className="mb-8">
          <p
            className="text-xl font-extrabold lowercase"
            style={{
              fontFamily: "'Outfit', sans-serif",
              background: "linear-gradient(90deg, #2B4066, #2d9c6c)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}
          >
            argo
          </p>
          <h1
            className="text-2xl font-medium text-[#28261E] mt-2"
            style={{ fontFamily: "'Outfit', sans-serif" }}
          >
            Your Assessments
          </h1>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin w-8 h-8 border-2 border-[#DFDDD9] border-t-[#2B4066] rounded-full" />
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-[#6A6862]">{error}</p>
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[#8A8880]" style={{ fontFamily: "'Outfit', sans-serif" }}>
              No assessments completed yet.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sessions.map((session) => {
              const variant = getStatusVariant(session);
              const canViewProfile = session.has_profile;
              return (
                <div
                  key={session.id}
                  onClick={() => canViewProfile && router.push(`/student/profile/${session.id}`)}
                  className={`
                    bg-white border border-[#DFDDD9] rounded-[4px] px-5 py-4
                    border-l-[3px] border-l-[#2B4066]
                    transition-shadow duration-150
                    ${canViewProfile ? "cursor-pointer hover:shadow-sm" : "cursor-default opacity-80"}
                  `}
                  role={canViewProfile ? "button" : undefined}
                  tabIndex={canViewProfile ? 0 : undefined}
                  onKeyDown={
                    canViewProfile
                      ? (e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            router.push(`/student/profile/${session.id}`);
                          }
                        }
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2
                      className="text-base font-medium text-[#28261E] leading-snug"
                      style={{ fontFamily: "'Outfit', sans-serif" }}
                    >
                      {session.assessment_title || "Assessment"}
                    </h2>
                    <StatusBadge variant={variant} />
                  </div>

                  <p
                    className="text-xs text-[#8A8880] mt-1"
                    style={{ fontFamily: "'Outfit', sans-serif" }}
                  >
                    {formatDate(session.created_at)}
                  </p>

                  <div className="mt-3">
                    {canViewProfile ? (
                      <span
                        className="text-sm text-[#2B4066] font-medium underline underline-offset-2"
                        style={{ fontFamily: "'Outfit', sans-serif" }}
                      >
                        View Profile
                      </span>
                    ) : (
                      <span
                        className="text-sm text-[#8A8880]"
                        style={{ fontFamily: "'Outfit', sans-serif" }}
                      >
                        {variant === "active" ? "In progress..." : "Profile generating..."}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
