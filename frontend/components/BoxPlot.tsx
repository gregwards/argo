"use client";

export interface BoxPlotData {
  criterion_id: string;
  criterion_name: string;
  max_score: number;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  count: number;
}

interface BoxPlotProps {
  distributions: BoxPlotData[];
}

function SingleBoxPlot({ d }: { d: BoxPlotData }) {
  // All positions as percentage of max_score for this criterion
  const pct = (v: number) => `${(v / d.max_score) * 100}%`;
  const width = (lo: number, hi: number) => `${((hi - lo) / d.max_score) * 100}%`;

  return (
    <div className="flex items-center gap-3">
      {/* Criterion label */}
      <span
        className="w-40 shrink-0 text-right truncate"
        style={{ fontFamily: "Outfit, sans-serif", fontSize: 12, color: "#3A3834", fontWeight: 400 }}
        title={d.criterion_name}
      >
        {d.criterion_name}
      </span>

      {/* Box plot track */}
      <div
        className="relative flex-1 rounded-[3px] border"
        style={{ height: 40, background: "#F4F3F1", borderColor: "#DFDDD9" }}
      >
        {/* Whisker: min to max */}
        <div
          className="absolute"
          style={{
            left: pct(d.min),
            width: width(d.min, d.max),
            top: "50%",
            height: 2,
            background: "#8A8880",
            transform: "translateY(-50%)",
          }}
        />

        {/* Box: q1 to q3 */}
        <div
          className="absolute rounded-[2px]"
          style={{
            left: pct(d.q1),
            width: width(d.q1, d.q3),
            top: "50%",
            height: 20,
            background: "rgba(43, 64, 102, 0.15)",
            border: "1px solid rgba(43, 64, 102, 0.30)",
            transform: "translateY(-50%)",
          }}
        />

        {/* Median line */}
        <div
          className="absolute"
          style={{
            left: pct(d.median),
            width: 2,
            top: "50%",
            height: 20,
            background: "#2B4066",
            transform: "translateY(-50%)",
          }}
        />

        {/* Min cap */}
        <div
          className="absolute"
          style={{
            left: pct(d.min),
            width: 1,
            top: "50%",
            height: 10,
            background: "#8A8880",
            transform: "translateY(-50%)",
          }}
        />

        {/* Max cap */}
        <div
          className="absolute"
          style={{
            left: pct(d.max),
            width: 1,
            top: "50%",
            height: 10,
            background: "#8A8880",
            transform: "translateY(-50%)",
          }}
        />
      </div>

      {/* Count label */}
      <span
        className="w-10 shrink-0"
        style={{ fontFamily: "Outfit, sans-serif", fontSize: 10, color: "#8A8880", fontWeight: 400 }}
      >
        n={d.count}
      </span>
    </div>
  );
}

export default function BoxPlot({ distributions }: BoxPlotProps) {
  if (!distributions || distributions.length === 0) {
    return (
      <p style={{ fontSize: 13, color: "#8A8880" }}>No score distribution data yet.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {distributions.map((d) => (
        <SingleBoxPlot key={d.criterion_id} d={d} />
      ))}
    </div>
  );
}
