"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GatePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Incorrect password");
        setLoading(false);
        return;
      }
      const data = await res.json();
      router.push(data.redirect || "/dev");
    } catch {
      setError("Something went wrong");
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center"
      style={{ background: "#F4F3F1", fontFamily: "Outfit, sans-serif" }}
    >
      <div className="mb-10">
        <span
          className="font-extrabold text-[28px] tracking-[0.01em] lowercase"
          style={{
            background: "linear-gradient(90deg, #2B4066, #38D670)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            lineHeight: 1.2,
          }}
        >
          argo
        </span>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{
          width: "100%",
          maxWidth: 360,
          background: "white",
          border: "1px solid #DFDDD9",
          borderRadius: 6,
          padding: 32,
        }}
      >
        <label
          style={{ display: "block", fontSize: 14, color: "#28261E", marginBottom: 8 }}
        >
          Enter password to continue
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
          style={{
            width: "100%",
            padding: "12px 16px",
            fontSize: 16,
            border: `1px solid ${error ? "#D04040" : "#DFDDD9"}`,
            borderRadius: 4,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {error && (
          <p style={{ fontSize: 13, color: "#D04040", marginTop: 8 }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={loading || !password}
          style={{
            width: "100%",
            marginTop: 16,
            padding: "12px 24px",
            background: loading || !password ? "#DFDDD9" : "#2B4066",
            color: loading || !password ? "#9A9894" : "white",
            fontSize: 15,
            fontWeight: 500,
            fontFamily: "Outfit, sans-serif",
            border: "none",
            borderRadius: 3,
            cursor: loading || !password ? "not-allowed" : "pointer",
            minHeight: 44,
          }}
        >
          {loading ? "..." : "Continue"}
        </button>
      </form>
    </div>
  );
}
