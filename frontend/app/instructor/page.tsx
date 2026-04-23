"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthErrorBanner } from "@/components/AuthError";
import { api } from "@/lib/api";

interface Assessment {
  id: string;
  title: string;
  status: string;
  slug: string;
  session_count: number;
  duration_target_minutes: number;
  created_at: string | null;
  published_at: string | null;
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    published: "bg-green-100 text-green-700",
    draft: "bg-gray-100 text-gray-600",
    closed: "bg-red-100 text-red-700",
  };
  const cls = styles[status] || "bg-gray-100 text-gray-600";
  return (
    <span
      className={`inline-block text-xs px-2 py-0.5 rounded-full ${cls}`}
      style={{ fontFamily: "Outfit, sans-serif", fontWeight: 400 }}
    >
      {status}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function InstructorHome() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getInstructorAssessments()
      .then((data) => setAssessments(data.assessments || []))
      .catch((e) => setError(e.message || "Failed to load assessments"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="min-h-screen py-10" style={{ background: "#F4F3F1" }}>
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1
            style={{
              fontFamily: "Outfit, sans-serif",
              fontWeight: 600,
              fontSize: 24,
              color: "#28261E",
            }}
          >
            Your Assessments
          </h1>
          <Link
            href="/instructor/assessment/new"
            className="rounded-[4px] px-4 py-2 text-white text-sm"
            style={{ background: "#2B4066", fontFamily: "Outfit, sans-serif", fontWeight: 500 }}
          >
            + Create New
          </Link>
        </div>

        {/* Loading / error states */}
        {loading && (
          <p style={{ fontSize: 14, color: "#6A6862", fontFamily: "Outfit, sans-serif" }}>
            Loading assessments…
          </p>
        )}
        {error && <AuthErrorBanner error={error} />}

        {/* Empty state */}
        {!loading && !error && assessments.length === 0 && (
          <div
            className="rounded-[4px] border p-10 text-center"
            style={{ background: "white", borderColor: "#DFDDD9" }}
          >
            <p style={{ fontSize: 14, color: "#6A6862", fontFamily: "Outfit, sans-serif" }}>
              No assessments yet. Create your first assessment.
            </p>
            <Link
              href="/instructor/assessment/new"
              className="inline-block mt-4 rounded-[4px] px-4 py-2 text-white text-sm"
              style={{ background: "#2B4066", fontFamily: "Outfit, sans-serif" }}
            >
              Create Assessment
            </Link>
          </div>
        )}

        {/* Assessment cards grid */}
        {!loading && assessments.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {assessments.map((a) => (
              <div
                key={a.id}
                className="rounded-[4px] border p-4 cursor-pointer hover:shadow-sm transition-shadow"
                style={{ background: "white", borderColor: "#DFDDD9" }}
                onClick={() => router.push(`/instructor/assessment/${a.id}`)}
              >
                {/* Title */}
                <h2
                  className="mb-2 truncate"
                  style={{
                    fontFamily: "Outfit, sans-serif",
                    fontWeight: 500,
                    fontSize: 16,
                    color: "#28261E",
                  }}
                  title={a.title}
                >
                  {a.title}
                </h2>

                {/* Status badge */}
                <div className="mb-3">{statusBadge(a.status)}</div>

                {/* Meta row */}
                <div className="flex items-center justify-between">
                  <span
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      fontWeight: 400,
                      fontSize: 12,
                      color: "#6A6862",
                    }}
                  >
                    {a.session_count} {a.session_count === 1 ? "session" : "sessions"}
                  </span>
                  <span
                    style={{
                      fontFamily: "Outfit, sans-serif",
                      fontWeight: 400,
                      fontSize: 11,
                      color: "#8A8880",
                    }}
                  >
                    {formatDate(a.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
