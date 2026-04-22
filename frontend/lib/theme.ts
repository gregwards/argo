/**
 * Central typography and color tokens for Argo.
 *
 * Two voice families:
 *   - "system": AI-generated text, instructions, labels — Ovo serif
 *   - "student": verbatim student quotes — Outfit italic
 *
 * Import and spread into style props:
 *   <p style={{ ...THEME.system.body }}>AI commentary</p>
 *   <p style={{ ...THEME.student.quote }}>Student said this</p>
 *
 * Override individual properties inline when needed:
 *   <p style={{ ...THEME.system.body, fontSize: 14 }}>Smaller text</p>
 */

export const FONT = {
  system: "'Ovo', serif",
  ui: "'Outfit', sans-serif",
  student: "'Outfit', sans-serif",
} as const;

export const THEME = {
  /** AI / system voice — Ovo serif */
  system: {
    /** Overall assessment, main narrative (largest) */
    hero: {
      fontFamily: FONT.system,
      fontSize: 19,
      lineHeight: 1.75,
      color: "#28261E",
    } as React.CSSProperties,

    /** Per-criterion commentary, findings */
    body: {
      fontFamily: FONT.system,
      fontSize: 17,
      lineHeight: 1.75,
      color: "#3A3834",
    } as React.CSSProperties,

    /** Explanatory notes under quotes */
    note: {
      fontFamily: FONT.system,
      fontSize: 15,
      lineHeight: 1.65,
      color: "#6A6860",
    } as React.CSSProperties,

    /** Disclaimers, secondary info */
    caption: {
      fontFamily: FONT.system,
      fontSize: 14.5,
      lineHeight: 1.6,
      color: "#7A7468",
    } as React.CSSProperties,

    /** Page titles (lobby, entry) */
    title: {
      fontFamily: FONT.system,
      fontSize: 26,
      lineHeight: 1.3,
      color: "#28261E",
      fontWeight: 400,
    } as React.CSSProperties,

    /** Small system messages, footer text */
    small: {
      fontFamily: FONT.system,
      fontSize: 15.5,
      lineHeight: 1.6,
      color: "#6A6862",
    } as React.CSSProperties,

    /** Instructional lists (lobby checklist) */
    list: {
      fontFamily: FONT.system,
      fontSize: 14.5,
      lineHeight: 1.7,
      color: "#6A6862",
    } as React.CSSProperties,

    /** Footer / fine print */
    footer: {
      fontFamily: FONT.system,
      fontSize: 13.5,
      lineHeight: 1.6,
      color: "#9A9894",
    } as React.CSSProperties,
  },

  /** Student voice — Outfit light italic */
  student: {
    /** Verbatim quotes in blockquotes */
    quote: {
      fontFamily: FONT.student,
      fontWeight: 300,
      fontStyle: "italic" as const,
      fontSize: 15,
      lineHeight: 1.55,
      color: "#5A5850",
    } as React.CSSProperties,
  },

  /** UI elements — Outfit sans-serif (labels, buttons, badges) */
  ui: {
    /** Section labels (STRENGTHS, GROWTH AREAS, etc.) */
    label: {
      fontFamily: FONT.ui,
      fontSize: 10,
      fontWeight: 500,
      letterSpacing: "0.08em",
      textTransform: "uppercase" as const,
    } as React.CSSProperties,
  },
} as const;
