"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createPipecatClient, connectToSession, TranscriptEntry, sendCorrectionRequest, Section } from "@/lib/pipecat";
import { api } from "@/lib/api";

type SessionPhase = "connecting" | "active" | "post" | "error";
type ListeningState = "bot-speaking" | "listening" | "processing" | "idle";

// A "turn" groups consecutive messages from the same role
interface Turn {
  role: "ai" | "learner";
  texts: string[];
}

function groupIntoTurns(entries: TranscriptEntry[]): Turn[] {
  const turns: Turn[] = [];
  for (const entry of entries) {
    const last = turns[turns.length - 1];
    if (last && last.role === entry.role) {
      last.texts.push(entry.text);
    } else {
      turns.push({ role: entry.role, texts: [entry.text] });
    }
  }
  return turns;
}

function formatTimeRemaining(elapsed: number, totalMinutes: number): string {
  const remaining = Math.max(0, totalMinutes * 60 - elapsed);
  const m = Math.floor(remaining / 60);
  const s = remaining % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function AssessmentSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();

  const [phase, setPhase] = useState<SessionPhase>("connecting");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [interimText, setInterimText] = useState<string>("");
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [listeningState, setListeningState] = useState<ListeningState>("idle");
  const [showEndModal, setShowEndModal] = useState<boolean>(false);
  const [currentCriterion, setCurrentCriterion] = useState<number>(0);
  const [totalCriteria, setTotalCriteria] = useState<number>(0);
  const [sections, setSections] = useState<Section[]>([]);
  // Accumulated progress scores per section (asymptotic curve + belief model floor)
  const sectionScoresRef = useRef<number[]>([]);
  const sectionFloorsRef = useRef<number[]>([]);
  const [sectionProgress, setSectionProgress] = useState<number[]>([]);
  const [connectionWarning, setConnectionWarning] = useState<boolean>(false);
  const [profileTimeout, setProfileTimeout] = useState<boolean>(false);
  const [pollGeneration, setPollGeneration] = useState<number>(0);
  const [courseName, setCourseName] = useState<string>("");
  // Session ending countdown — detected from AI closing statement
  const [sessionEnding, setSessionEnding] = useState<boolean>(false);
  const [endCountdown, setEndCountdown] = useState<number>(3);
  const endCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [durationMinutes] = useState<number>(15);
  // Silence countdown bar: 0 = hidden, 1 = full, drains to 0
  const [silenceProgress, setSilenceProgress] = useState<number>(0);

  const clientRef = useRef<any>(null);
  const historyEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const profilePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectionErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInterimTimeRef = useRef<number>(0);
  const silenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-scroll history panel
  useEffect(() => {
    historyEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // Webcam — request camera and pipe to video element
  useEffect(() => {
    let active = true;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!active) { stream.getTracks().forEach((t) => t.stop()); return; }
        videoStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch {
        // Camera access denied — silhouette placeholder stays visible
      }
    }
    startCamera();
    return () => {
      active = false;
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Elapsed timer
  useEffect(() => {
    if (phase !== "active") return;
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Poll for profile when post-session
  useEffect(() => {
    if (phase !== "post") return;
    const MAX_POLL_ATTEMPTS = 20;
    let attempts = 0;
    profilePollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > MAX_POLL_ATTEMPTS) {
        if (profilePollRef.current) clearInterval(profilePollRef.current);
        setProfileTimeout(true);
        return;
      }
      try {
        await api.getProfile(sessionId);
        router.push(`/student/profile/${sessionId}`);
      } catch {
        // not ready yet
      }
    }, 3000);
    return () => {
      if (profilePollRef.current) clearInterval(profilePollRef.current);
    };
  }, [phase, sessionId, router, pollGeneration]);

  // Silence countdown: drain starts when interim text stops updating.
  // Visualized as the right-side green accent bar on the response bubble
  // shrinking from bottom to top. silenceProgress: 1 = full bar, 0 = empty.
  const SILENCE_DEBOUNCE_MS = 500;  // wait before starting drain (avoids flutter between words)
  const SILENCE_DRAIN_MS = 5500;    // visual drain — synced to 6s Deepgram endpointing minus debounce
  const SILENCE_TICK_MS = 40;       // update interval

  function startSilenceCountdown() {
    if (silenceDebounceRef.current) clearTimeout(silenceDebounceRef.current);
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);

    silenceDebounceRef.current = setTimeout(() => {
      setSilenceProgress(1);
      const startTime = Date.now();
      silenceTimerRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 1 - elapsed / SILENCE_DRAIN_MS);
        setSilenceProgress(remaining);
        if (remaining <= 0) {
          if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
        }
      }, SILENCE_TICK_MS);
    }, SILENCE_DEBOUNCE_MS);
  }

  function resetSilenceCountdown() {
    if (silenceDebounceRef.current) clearTimeout(silenceDebounceRef.current);
    if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
    setSilenceProgress(0);
  }

  // Connect to Pipecat via Daily
  useEffect(() => {
    let cancelled = false;

    const client = createPipecatClient({
      onBotText: (text: string) => {
        if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
        if (connectionErrorTimeoutRef.current) clearTimeout(connectionErrorTimeoutRef.current);
        setConnectionWarning(false);
        setPhase("active");
        setListeningState("listening");
        resetSilenceCountdown();
        setTranscript((prev) => [
          ...prev,
          { role: "ai", text, final: true, timestamp: new Date().toISOString() },
        ]);
        // Detect closing statement — AI signals session is over
        const lower = text.toLowerCase();
        if (
          lower.includes("concludes the assessment") ||
          lower.includes("session is now complete") ||
          lower.includes("assessment is complete") ||
          lower.includes("session is over") ||
          lower.includes("that concludes")
        ) {
          // Wait 4s for TTS to finish speaking, then start 4s visual countdown
          setTimeout(() => {
            setSessionEnding(true);
            setEndCountdown(4);
            let count = 4;
            endCountdownRef.current = setInterval(() => {
              count--;
              setEndCountdown(count);
              if (count <= 0) {
                if (endCountdownRef.current) clearInterval(endCountdownRef.current);
                client.disconnect().catch(() => {});
                setPhase("post");
              }
            }, 1000);
          }, 4000);
        }
      },
      onUserTranscriptInterim: (text: string) => {
        setInterimText(text);
        setListeningState("listening");
        resetSilenceCountdown();
        startSilenceCountdown();
        lastInterimTimeRef.current = Date.now();
      },
      onUserTranscriptFinal: (text: string) => {
        resetSilenceCountdown();
        setInterimText("");
        setListeningState("processing");
        setTranscript((prev) => [
          ...prev,
          { role: "learner", text, final: true, timestamp: new Date().toISOString() },
        ]);
      },
      onDisconnected: () => {
        resetSilenceCountdown();
        // Only transition to post if session was active (avoid flash during connection setup)
        setPhase((prev) => prev === "active" ? "post" : prev);
      },
      onCriterionAdvance: (current: number, total: number) => {
        setCurrentCriterion(current);
        setTotalCriteria(total);
      },
      onSectionProgress: (sectionIndex: number, weight: number, floor: number) => {
        const scores = sectionScoresRef.current;
        const floors = sectionFloorsRef.current;
        // Ensure arrays are large enough
        while (scores.length <= sectionIndex) scores.push(0);
        while (floors.length <= sectionIndex) floors.push(0);
        // If we moved to a new section, snap previous sections to complete
        if (sectionIndex > 0) {
          for (let i = 0; i < sectionIndex; i++) {
            scores[i] = Math.max(scores[i], 20);
            floors[i] = Math.max(floors[i], 1.0);
          }
        }
        scores[sectionIndex] += weight;
        floors[sectionIndex] = Math.max(floors[sectionIndex], floor);
        sectionScoresRef.current = [...scores];
        sectionFloorsRef.current = [...floors];
        // Asymptotic curve with belief model floor
        const RATE = 0.25;
        setSectionProgress(scores.map((s, i) => {
          const curve = 1 - 1 / (1 + s * RATE);
          const f = floors[i] || 0;
          return Math.max(curve, f);
        }));
        setCurrentCriterion(sectionIndex);
      },
    });
    clientRef.current = client;

    // Get Daily room credentials then join
    connectToSession(sessionId)
      .then(({ roomUrl, token, sections: secs }) => {
        if (cancelled) return;
        if (secs.length > 0) {
          setSections(secs);
          setTotalCriteria(secs.length);
        }
        return client.connect({ url: roomUrl, token });
      })
      .then(() => {
        // Re-attach camera after Daily SDK init (it may disrupt getUserMedia)
        if (videoStreamRef.current && videoRef.current) {
          videoRef.current.srcObject = videoStreamRef.current;
        }
      })
      .catch(() => {
        if (!cancelled) setPhase("error");
      });

    connectionTimeoutRef.current = setTimeout(() => setConnectionWarning(true), 15000);
    connectionErrorTimeoutRef.current = setTimeout(() => {
      setPhase((prev) => (prev === "connecting" ? "error" : prev));
    }, 25000);

    return () => {
      cancelled = true;
      client.disconnect().catch(() => {});
      if (connectionTimeoutRef.current) clearTimeout(connectionTimeoutRef.current);
      if (connectionErrorTimeoutRef.current) clearTimeout(connectionErrorTimeoutRef.current);
      if (silenceDebounceRef.current) clearTimeout(silenceDebounceRef.current);
      if (silenceTimerRef.current) clearInterval(silenceTimerRef.current);
      if (endCountdownRef.current) clearInterval(endCountdownRef.current);
    };
  }, [sessionId]);

  const handleEndSessionConfirm = useCallback(async () => {
    setShowEndModal(false);
    if (clientRef.current) {
      try { await clientRef.current.disconnect(); } catch {}
    }
    setPhase("post");
  }, []);

  const handleCorrection = useCallback(() => {
    if (clientRef.current) sendCorrectionRequest(clientRef.current);
    setInterimText("Re-clarifying...");
    setListeningState("listening");
  }, []);

  // --- POST-SESSION SCREEN ---
  if (phase === "post") {
    return (
      <main className="h-screen flex flex-col items-center justify-center" style={{ background: "#F4F3F1" }}>
        <div className="sr-only" aria-live="assertive" role="status">Assessment complete</div>
        <div
          className="font-extrabold text-[40px] tracking-[0.01em] lowercase"
          style={{
            fontFamily: "Outfit, sans-serif",
            background: "linear-gradient(90deg, #2B4066, #38D670)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            lineHeight: 1.2,
          }}
        >
          argo
        </div>
        <div className="border-t my-6 w-full max-w-md" style={{ borderColor: "#DFDDD9" }} />
        <div className="text-center max-w-lg px-6">
          {profileTimeout ? (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 500, color: "#28261E", fontFamily: "Outfit" }}>
                Profile is taking longer than expected.
              </h1>
              <p style={{ fontSize: 16, marginTop: 12, color: "#8A8880" }}>
                Your profile is still being generated. You can refresh to check again or visit your student portal later.
              </p>
              <button
                onClick={() => { setProfileTimeout(false); setPollGeneration(g => g + 1); }}
                className="mt-6 w-full font-medium rounded-[3px] h-12 min-h-[48px] transition-colors"
                style={{ background: "#2B4066", color: "white", fontSize: 15 }}
              >
                Refresh
              </button>
              <button
                onClick={() => router.push("/student")}
                className="mt-3 w-full font-medium rounded-[3px] h-12 min-h-[48px] border transition-colors"
                style={{ background: "white", color: "#28261E", borderColor: "#DFDDD9", fontSize: 15 }}
              >
                Go to Student Portal
              </button>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 24, fontWeight: 500, color: "#28261E", fontFamily: "Outfit" }}>
                Assessment complete.
              </h1>
              <p style={{ fontSize: 16, marginTop: 12, color: "#8A8880" }}>
                Your competency profile is being generated. This takes about 30 seconds.
              </p>
              <div className="flex justify-center mt-6">
                <div
                  className="w-6 h-6 border-2 rounded-full animate-spin motion-reduce:animate-none"
                  style={{ borderColor: "#DFDDD9", borderTopColor: "#2B4066" }}
                />
              </div>
            </>
          )}
        </div>
        <div className="border-t my-6 w-full max-w-lg" style={{ borderColor: "#DFDDD9" }} />
        <p className="text-center max-w-lg px-6" style={{ fontSize: 14, color: "#8A8880" }}>
          You can close this tab. Your profile will be available in your student portal.
        </p>
      </main>
    );
  }

  // --- ERROR STATE ---
  if (phase === "error") {
    return (
      <main className="h-screen flex flex-col items-center justify-center" style={{ background: "#F4F3F1" }}>
        <div className="rounded-[4px] border p-8 max-w-sm w-full mx-4 text-center" style={{ background: "white", borderColor: "#DFDDD9" }}>
          <h1 className="text-xl font-medium" style={{ color: "#28261E", fontFamily: "Outfit" }}>
            Unable to connect to the session.
          </h1>
          <p className="text-base mt-3" style={{ color: "#8A8880" }}>
            Check your internet connection and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 w-full font-medium rounded-[3px] h-11 min-h-[44px] transition-colors"
            style={{ background: "#2B4066", color: "white" }}
          >
            Try Again
          </button>
        </div>
      </main>
    );
  }

  // --- ACTIVE / CONNECTING SESSION ---
  // Group transcript into turns (consecutive same-role messages merged)
  const turns = groupIntoTurns(transcript);

  // Current active turn = last AI turn's full text
  const lastAiTurn = [...turns].reverse().find((t) => t.role === "ai");
  const currentAiText = lastAiTurn ? lastAiTurn.texts.join(" ") : "";

  // Current student response = all student texts since the last AI turn
  const lastAiTurnIdx = turns.lastIndexOf(lastAiTurn!);
  const studentTurnAfterAi = lastAiTurnIdx >= 0 && lastAiTurnIdx < turns.length - 1
    ? turns[turns.length - 1]
    : null;
  const settledStudentTexts = studentTurnAfterAi && studentTurnAfterAi.role === "learner"
    ? studentTurnAfterAi.texts
    : [];

  // History = all turns except the current active exchange (last AI + last student)
  const historyTurns = turns.slice(0, Math.max(0, lastAiTurnIdx >= 0 ? lastAiTurnIdx : turns.length));

  // Progress segments — use section titles from session plan, progress from asymptotic curve
  const segments = sections.length > 0
    ? sections.map((sec, i) => ({
        label: sec.title,
        progress: sectionProgress[i] ?? 0,
        active: i === currentCriterion,
      }))
    : totalCriteria > 0
      ? Array.from({ length: totalCriteria }, (_, i) => ({
          label: `Section ${i + 1}`,
          progress: sectionProgress[i] ?? 0,
          active: i === currentCriterion,
        }))
      : [];

  return (
    <div className="flex flex-col h-screen" style={{ fontFamily: "Outfit, sans-serif" }}>
      <div className="sr-only" aria-live="assertive" role="status">
        {phase === "connecting" ? "Connecting to assessment" : ""}
      </div>

      {/* ── HEADER ── */}
      <header
        className="flex items-center flex-shrink-0"
        style={{ padding: "2px 24px", background: "#ECEAE8", borderBottom: "1.5px solid #DFDDD9" }}
      >
        <div
          className="font-extrabold text-[20px] tracking-[0.01em] lowercase"
          style={{
            background: "linear-gradient(90deg, #2B4066, #38D670)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            lineHeight: 1.2,
          }}
        >
          argo
        </div>
        <div className="flex-1" />
        <span className="text-[12px]" style={{ color: "#9A9894" }}>{courseName}</span>
      </header>

      {/* ── BODY ── */}
      <div className="flex flex-1 min-h-0">

        {/* ── LEFT PANEL (300px) ── */}
        <div
          className="flex flex-col flex-shrink-0"
          style={{ width: 300, background: "#ECEAE8", borderRight: "1px solid #DFDDD9" }}
        >
          {/* Camera + Timer row */}
          <div className="flex gap-2 flex-shrink-0" style={{ padding: "10px 12px" }}>
            <div
              className="relative flex-shrink-0 overflow-hidden"
              style={{ width: 160, height: 112, borderRadius: 4, background: "#E0DDD8", border: "1.5px solid #D4D0CC" }}
            >
              {/* Live webcam feed */}
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{
                  width: "100%", height: "100%", objectFit: "cover",
                  transform: "scaleX(-1)", // mirror
                }}
              />
              {/* Silhouette fallback — hidden when video is playing */}
              {!videoStreamRef.current && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex flex-col items-center" style={{ opacity: 0.14 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#38342E" }} />
                    <div style={{ width: 38, height: 16, borderRadius: "16px 16px 0 0", background: "#38342E", marginTop: 2 }} />
                  </div>
                </div>
              )}
              {/* Recording dot */}
              <div
                className="absolute"
                style={{
                  top: 5, left: 5, width: 7, height: 7, borderRadius: "50%",
                  background: "#D04040",
                  boxShadow: "0 0 5px rgba(208,64,64,0.5), 0 0 10px rgba(208,64,64,0.2)",
                }}
              />
            </div>
            <div className="flex flex-col items-center justify-center flex-1 gap-[3px]">
              <div
                className="inline-flex items-center justify-center"
                style={{ padding: "3px 8px", border: "1.5px solid #C4A4AA", borderRadius: 3, background: "#E6DEDF" }}
              >
                <span
                  className="font-medium leading-none"
                  style={{ fontSize: 24, color: "#7E4452", fontVariantNumeric: "tabular-nums", letterSpacing: "0.04em" }}
                >
                  {formatTimeRemaining(elapsedSeconds, durationMinutes)}
                </span>
              </div>
              <span className="uppercase text-center" style={{ fontSize: 10, color: "#9A8088", letterSpacing: "0.06em" }}>
                remaining
              </span>
            </div>
          </div>

          {/* End Session button */}
          {phase === "active" && (
            <div style={{ padding: "0 12px 8px" }}>
              <button
                onClick={() => setShowEndModal(true)}
                style={{
                  width: "100%", padding: "8px 0", fontSize: 13, fontWeight: 500,
                  color: "#7E4452", background: "transparent", border: "1px solid #C4A4AA",
                  borderRadius: 3, cursor: "pointer", letterSpacing: "0.04em",
                }}
              >
                End Session
              </button>
            </div>
          )}

          {/* History panel */}
          <div
            className="flex flex-col flex-1 overflow-hidden min-h-0"
            style={{ margin: "0 8px 8px", borderRadius: 4, background: "#E4E1DC", border: "1px solid #DAD6D0" }}
          >
            <div
              className="flex-shrink-0 uppercase font-medium"
              style={{ fontSize: 9, letterSpacing: "0.06em", color: "#9A9894", padding: "8px 10px 4px" }}
            >
              History
            </div>
            <div
              className="flex-1 overflow-y-auto flex flex-col gap-[3px]"
              style={{ padding: "0 8px 8px" }}
            >
              {historyTurns.map((turn, i) => (
                <div
                  key={i}
                  style={{
                    padding: "5px 9px",
                    fontSize: 13,
                    lineHeight: 1.5,
                    background: "#E9E7E4",
                    ...(turn.role === "ai"
                      ? {
                          borderRadius: "2px 4px 4px 4px",
                          borderLeft: "3px solid #C0BEB8",
                          fontFamily: "'Source Serif 4', serif",
                          color: "#6A6860",
                        }
                      : {
                          borderRadius: "4px 2px 4px 4px",
                          borderRight: "3px solid #D4D2CC",
                          fontFamily: "'Outfit', sans-serif",
                          fontWeight: 300,
                          color: "#8A8880",
                          letterSpacing: "0.005em",
                        }),
                  }}
                >
                  <b style={{ fontWeight: turn.role === "ai" ? 500 : 400, color: turn.role === "ai" ? "#5A5850" : "#7A7870" }}>
                    {turn.role === "ai" ? "Argo:" : "You:"}
                  </b>{" "}
                  {turn.texts.join(" ")}
                </div>
              ))}
              <div ref={historyEndRef} />
            </div>
          </div>
        </div>

        {/* ── ACTIVE COLUMN ── */}
        <div className="flex-1 flex flex-col overflow-y-auto" style={{ background: "#F4F3F1" }}>
          {/* Progress bar */}
          <div className="flex gap-[6px] items-center flex-shrink-0" style={{ padding: "14px 28px 12px" }}>
            {segments.map((seg, i) => (
              <div key={i} className="flex-1 flex flex-col gap-[3px]">
                <div style={{ height: 5, borderRadius: 2, background: "#DFDDD9", overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%", borderRadius: 2,
                      width: `${Math.round(seg.progress * 100)}%`,
                      background: seg.progress >= 0.95 ? "#B8C4D6" : seg.active ? "#2B4066" : "#B8C4D6",
                      transition: "width 0.6s ease-out",
                    }}
                  />
                </div>
                <span style={{ fontSize: 12, color: seg.active ? "#2B4066" : "#9A9894", fontWeight: seg.active ? 500 : 400 }}>
                  {seg.label}
                </span>
              </div>
            ))}
          </div>

          {/* Active exchange stage */}
          <div className="flex flex-col gap-4 flex-1" style={{ padding: "0 28px 20px" }}>
            {phase === "connecting" ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-6">
                {/* Rolling gradient text */}
                <div
                  className="connecting-text"
                  style={{
                    fontSize: 15.5, fontWeight: 300, letterSpacing: "0.01em", lineHeight: 1.85,
                    background: "linear-gradient(135deg, #D4C018 0%, #38D670 28%, #E8CC20 52%, #38D670 78%, #D0B818 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    textAlign: "center",
                  }}
                >
                  {connectionWarning
                    ? "Still preparing your session..."
                    : "Preparing your assessment session..."}
                  <span
                    className="inline-block"
                    style={{
                      width: 2, height: 14, background: "#38D670",
                      verticalAlign: "text-bottom", marginLeft: 1,
                      animation: "blink 1s step-end infinite",
                    }}
                  />
                </div>
                <span style={{ fontSize: 10, color: "#9A9894", letterSpacing: "0.04em" }}>
                  {connectionWarning ? "This is taking a bit longer than usual" : "Setting up voice connection"}
                </span>
                {connectionWarning && (
                  <button
                    onClick={() => { clientRef.current?.disconnect().catch(() => {}); window.location.reload(); }}
                    className="px-4 py-2 text-sm font-medium rounded-[3px] min-h-[44px] transition-colors"
                    style={{ background: "#2B4066", color: "white" }}
                  >
                    Retry Connection
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Question bubble — vertical indigo bar on left */}
                {currentAiText && (
                  <div
                    className="relative"
                    style={{
                      width: "90%",
                      padding: "20px 22px",
                      borderRadius: "2px 6px 6px 6px",
                      background: "#EBEEF4",
                      border: "1px solid #D0D4E0",
                      borderLeft: "4px solid transparent",
                      boxShadow: "0 2px 8px rgba(43,64,102,0.04)",
                    }}
                  >
                    {/* Left accent bar — drains as countdown when session is ending */}
                    <div
                      style={{
                        position: "absolute",
                        top: 0,
                        left: -4,
                        width: 4,
                        height: sessionEnding ? `${(endCountdown / 4) * 100}%` : "100%",
                        background: "#2B4066",
                        borderRadius: "2px 0 0 2px",
                        transition: sessionEnding ? "height 1s linear" : "none",
                      }}
                    />
                    <div
                      className="uppercase font-medium"
                      style={{ fontSize: 11, letterSpacing: "0.08em", color: "#2B4066", marginBottom: 6, opacity: 0.65 }}
                    >
                      {sessionEnding ? `Session ending in ${endCountdown}s` : "Argo"}
                    </div>
                    <div style={{ fontFamily: "'Source Serif 4', serif", fontSize: 19, lineHeight: 1.6, color: "#28261E" }}>
                      {currentAiText}
                    </div>
                  </div>
                )}

                {/* Response bubble — vertical green bar on right, doubles as silence countdown */}
                <div
                  className="flex flex-col flex-1 relative"
                  style={{
                    width: "90%",
                    alignSelf: "flex-end",
                    padding: "22px 24px",
                    borderRadius: "6px 2px 6px 6px",
                    background: "#FDFCF4",
                    border: "1px solid #E8E2C0",
                    borderRight: "4px solid transparent",
                    boxShadow: "0 2px 8px rgba(232,196,0,0.06)",
                  }}
                >
                  {/* Right accent bar — full height when speaking, shrinks bottom-to-top during silence */}
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      right: -4,
                      width: 4,
                      height: silenceProgress > 0 ? `${silenceProgress * 100}%` : "100%",
                      background: "#38D670",
                      borderRadius: "0 2px 2px 0",
                      transition: silenceProgress === 1 ? "none" : "height 40ms linear",
                    }}
                  />
                  <div
                    className="uppercase font-medium"
                    style={{ fontSize: 11, letterSpacing: "0.08em", color: "#C8A800", marginBottom: 6 }}
                  >
                    Your response
                  </div>

                  {/* Settled text — all finalized student sentences in dark gray */}
                  {settledStudentTexts.length > 0 && (
                    <div
                      style={{
                        fontSize: 18, lineHeight: 1.85, fontWeight: 300,
                        letterSpacing: "0.01em", color: "#3A3834",
                      }}
                    >
                      {settledStudentTexts.join(" ")}
                    </div>
                  )}

                  {/* Live transcription — newest sentence in gradient */}
                  {interimText && (
                    <div
                      style={{
                        marginTop: settledStudentTexts.length > 0 ? 4 : 0,
                        fontSize: 18, lineHeight: 1.85, fontWeight: 300, letterSpacing: "0.01em",
                        background: "linear-gradient(135deg, #D4C018 0%, #38D670 28%, #E8CC20 52%, #38D670 78%, #D0B818 100%)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      {interimText}
                      <span
                        className="inline-block"
                        style={{
                          width: 2, height: 14, background: "#38D670",
                          verticalAlign: "text-bottom", marginLeft: 1,
                          animation: "blink 1s step-end infinite",
                        }}
                      />
                    </div>
                  )}

                  {/* Footer */}
                  <div className="flex justify-between items-center" style={{ marginTop: 12 }}>
                    {listeningState === "listening" ? (
                      <div
                        className="inline-flex items-center gap-1"
                        style={{
                          padding: "5px 12px 5px 10px", borderRadius: 3,
                          background: "rgba(56,214,112,0.10)", border: "1px solid rgba(56,214,112,0.15)",
                          fontSize: 13, fontWeight: 500, color: "#28C060",
                        }}
                      >
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#38D670" }} className="animate-pulse" />
                        Listening
                      </div>
                    ) : listeningState === "processing" ? (
                      <span style={{ fontSize: 13, fontWeight: 500, color: "#9A9894" }}>Processing...</span>
                    ) : (
                      <div />
                    )}
                    <button
                      onClick={handleCorrection}
                      style={{
                        fontFamily: "'Outfit', sans-serif", fontSize: 13, color: "#5A564E",
                        backgroundColor: "#E6E3DE", border: "1px solid #CCC9C4",
                        borderRadius: 3, padding: "6px 14px", cursor: "pointer",
                      }}
                    >
                      That&apos;s not what I said
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── END SESSION MODAL ── */}
      {showEndModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: "rgba(244,243,241,0.8)" }}
          role="dialog" aria-modal="true" aria-labelledby="end-modal-heading"
        >
          <div className="p-6 max-w-sm w-full mx-4" style={{ background: "white", borderRadius: 6, boxShadow: "0 4px 20px rgba(0,0,0,0.08)" }}>
            <h2 id="end-modal-heading" className="text-xl font-medium" style={{ color: "#28261E" }}>End this session?</h2>
            <p className="text-base mt-3" style={{ color: "#8A8880" }}>Your progress will be saved, but the session cannot be resumed.</p>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowEndModal(false)}
                className="flex-1 py-2 text-sm rounded-[3px] transition-colors"
                style={{ border: "1px solid #DFDDD9", color: "#28261E" }}
              >
                Cancel
              </button>
              <button
                onClick={handleEndSessionConfirm}
                className="flex-1 py-2 text-sm font-medium rounded-[3px] transition-colors"
                style={{ background: "#7E4452", color: "white" }}
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
