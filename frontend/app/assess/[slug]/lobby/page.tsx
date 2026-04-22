"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, apiFetch } from "@/lib/api";
import { THEME } from "@/lib/theme";

export default function AssessmentLobby() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();

  const [assessmentTitle, setAssessmentTitle] = useState<string>("");
  const [assessmentDuration, setAssessmentDuration] = useState<number>(15);
  const [assessmentId, setAssessmentId] = useState<string>("");
  const [micReady, setMicReady] = useState<boolean>(false);
  const [micLevel, setMicLevel] = useState<number>(0);
  const [camReady, setCamReady] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>("");
  const [sessionError, setSessionError] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);

  const bothReady = micReady && camReady;

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try { await api.getMe(); } catch { router.push(`/assess/${slug}`); return; }
      try {
        const data = await api.getAssessmentBySlug(slug);
        if (cancelled) return;
        setAssessmentTitle(data.title ?? "Oral Assessment");
        setAssessmentDuration(data.duration_target_minutes ?? data.estimated_duration_minutes ?? 15);
        setAssessmentId(data.id ?? "");
      } catch (e: any) {
        if (cancelled) return;
        setLoadError(e.message || "Failed to load assessment.");
      }
    }
    init();
    return () => { cancelled = true; };
  }, [slug, router]);

  // Mic check
  useEffect(() => {
    let active = true;
    async function startMicCheck() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyserRef.current = analyser;
        analyser.fftSize = 256;
        const source = ctx.createMediaStreamSource(stream);
        source.connect(analyser);
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        intervalRef.current = setInterval(() => {
          if (!active) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) sum += dataArray[i] * dataArray[i];
          const rms = Math.sqrt(sum / bufferLength) / 128;
          setMicLevel(Math.min(1, rms));
        }, 100);
        setMicReady(true);
      } catch {
        if (active) setMicReady(false);
      }
    }
    startMicCheck();
    return () => {
      active = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioContextRef.current && audioContextRef.current.state !== "closed") audioContextRef.current.close();
    };
  }, []);

  // Webcam
  useEffect(() => {
    let active = true;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        videoStreamRef.current = stream;
        setCamReady(true);
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch {
        if (active) setCamReady(false);
      }
    }
    startCamera();
    return () => {
      active = false;
      if (videoStreamRef.current) videoStreamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleBeginAssessment = useCallback(async () => {
    if (!bothReady || connecting || !assessmentId) return;
    setConnecting(true);
    setSessionError("");
    try {
      const data = await apiFetch("/api/sessions", {
        method: "POST",
        body: JSON.stringify({ assessment_id: assessmentId }),
      });
      router.push(`/session/${data.session_id}`);
    } catch (e: any) {
      setConnecting(false);
      const detail = e?.detail || e?.message || "";
      if (detail.includes("Maximum attempts")) {
        setSessionError("You have reached the maximum number of attempts for this assessment.");
      } else if (detail.includes("Not enrolled")) {
        setSessionError("You are not enrolled in this assessment. Contact your instructor.");
      } else if (detail.includes("closed")) {
        setSessionError("This assessment is no longer accepting submissions.");
      } else if (detail.includes("access denied")) {
        setSessionError("Your session has expired. Please log in again.");
      } else {
        setSessionError("Unable to start the session. Please try again.");
      }
    }
  }, [bothReady, connecting, assessmentId, router]);

  if (loadError) {
    return (
      <main className="h-screen flex items-center justify-center" style={{ background: "#F4F3F1", fontFamily: "Outfit, sans-serif" }}>
        <div className="p-8 max-w-sm w-full mx-4 text-center" style={{ background: "white", borderRadius: 4, border: "1px solid #DFDDD9" }}>
          <p style={{ color: "#7E4452", fontSize: 16 }}>{loadError}</p>
        </div>
      </main>
    );
  }

  return (
    <main
      className="h-screen flex flex-col items-center"
      style={{ background: "#F4F3F1", fontFamily: "Outfit, sans-serif", paddingTop: 16, paddingBottom: 16 }}
    >
      {/* Logo */}
      <div
        className="font-extrabold text-[20px] tracking-[0.01em] lowercase"
        style={{
          background: "linear-gradient(90deg, #2B4066, #38D670)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: 8,
          lineHeight: 1.2,
        }}
      >
        argo
      </div>

      {/* Card */}
      <div
        className="w-full mx-4"
        style={{ maxWidth: 540, background: "white", border: "1px solid #DFDDD9", borderRadius: 6, padding: "16px 24px" }}
      >
        {/* Title + duration */}
        <h1
          className="text-center"
          style={{ ...THEME.system.title, textAlign: "center", fontWeight: 600 }}
        >
          {assessmentTitle || "Loading..."}
        </h1>

        <div style={{ borderTop: "1px solid #DFDDD9", margin: "10px 0" }} />

        {/* Camera preview */}
        <div
          className="relative overflow-hidden"
          style={{ width: "100%", aspectRatio: "16/9", borderRadius: 4, background: "#E0DDD8", border: "1.5px solid #D4D0CC" }}
        >
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }}
          />
          {!camReady && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center" style={{ opacity: 0.14 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#38342E" }} />
                <div style={{ width: 56, height: 22, borderRadius: "22px 22px 0 0", background: "#38342E", marginTop: 2 }} />
              </div>
            </div>
          )}
          {/* Camera status overlay */}
          <div
            className="absolute flex items-center gap-2"
            style={{ bottom: 8, left: 10, padding: "4px 10px", borderRadius: 3, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)" }}
          >
            <div
              style={{
                width: 7, height: 7, borderRadius: "50%",
                background: camReady ? "#38D670" : "#D04040",
                boxShadow: camReady ? "0 0 5px rgba(56,214,112,0.5)" : "0 0 5px rgba(208,64,64,0.5)",
              }}
            />
            <span style={{ fontSize: 11, color: "white", fontWeight: 400 }}>
              {camReady ? "Camera ready" : "Camera access needed"}
            </span>
          </div>
        </div>

        {/* Duration + mic — prominent row below video */}
        <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
          {/* Duration */}
          <div className="flex items-center gap-2">
            <div
              className="inline-flex items-center justify-center"
              style={{ padding: "3px 10px", border: "1.5px solid #DFDDD9", borderRadius: 3, background: "#ECEAE8", opacity: 0.6 }}
            >
              <span style={{ fontSize: 18, fontWeight: 500, color: "#9A9894", fontVariantNumeric: "tabular-nums", letterSpacing: "0.04em" }}>
                {assessmentDuration}:00
              </span>
            </div>
            <span style={{ fontSize: 13, color: "#9A9894", opacity: 0.6 }}>time limit</span>
          </div>

          {/* Mic status */}
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: micReady ? "#38D670" : "#DFDDD9",
                boxShadow: micReady ? "0 0 5px rgba(56,214,112,0.4)" : "none",
              }}
            />
            <span style={{ fontSize: 13, color: micReady ? "#6A6862" : "#7E4452" }}>
              {micReady ? "Mic ready" : "Mic needed"}
            </span>
            {/* Mini level bar */}
            <div style={{ width: 60, height: 3, background: "#DFDDD9", borderRadius: 2, overflow: "hidden" }}>
              <div
                style={{
                  height: "100%", borderRadius: 2,
                  background: micReady ? "#38D670" : "#DFDDD9",
                  width: `${micLevel * 100}%`,
                  transition: "width 80ms ease-out",
                }}
              />
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #DFDDD9", margin: "12px 0" }} />

        {/* Preparation info */}
        <div style={THEME.system.list}>
          <p style={{ marginBottom: 6 }}>Before you begin, check that:</p>
          <ul style={{ margin: 0, paddingLeft: 20, marginBottom: 10 }}>
            <li style={{ marginBottom: 3 }}>You&rsquo;re somewhere quiet where only your voice will be picked up.</li>
            <li>Your face is clearly visible on camera and will stay that way throughout.</li>
          </ul>
          <p>During the assessment, just speak naturally and think out loud. What matters is your reasoning, not getting every detail perfect. Audio and video are recorded so your responses can be reviewed.</p>
        </div>

        {/* Error message */}
        {sessionError && (
          <div
            style={{
              marginTop: 20, padding: "12px 16px", borderRadius: 4,
              background: "#F5ECED", border: "1px solid #E0C8CC", borderLeft: "3px solid #7E4452",
              fontSize: 14, lineHeight: 1.5, color: "#7E4452",
            }}
          >
            {sessionError}
          </div>
        )}

        {/* Begin Assessment button — requires both mic and camera */}
        <button
          onClick={handleBeginAssessment}
          disabled={!bothReady || connecting || !!sessionError}
          style={{
            marginTop: 16, width: "100%", height: 48,
            background: bothReady && !connecting && !sessionError ? "#2B4066" : "#DFDDD9",
            color: bothReady && !connecting && !sessionError ? "white" : "#9A9894",
            fontSize: 15, fontWeight: 500, fontFamily: "Outfit, sans-serif",
            border: "none", borderRadius: 3,
            cursor: bothReady && !connecting && !sessionError ? "pointer" : "not-allowed",
            letterSpacing: "0.04em", transition: "background 0.15s, color 0.15s",
          }}
        >
          {connecting ? "Connecting..." : bothReady ? "Begin Assessment" : "Waiting for camera and microphone..."}
        </button>
      </div>

      {/* Footer */}
      <p style={{ ...THEME.system.footer, marginTop: 24, textAlign: "center", maxWidth: 440 }}>
        This assessment uses AI to evaluate your understanding through conversation.
        Your responses are recorded and analyzed to generate a competency profile.
      </p>
    </main>
  );
}
