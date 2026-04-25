# Argo UI Specification

Structural and behavioral specification for the three core student-facing screens. Describes components, layout, and user goals. No design opinion — intended as a contract for a designer to interpret.

---

## 1. Assessment Lobby

**URL:** `/assess/{slug}/lobby`

**User goal:** Confirm that hardware is working and understand what to expect before starting.

### Layout

Single centered card on the page, vertically stacked. Logo above, footer below.

### Components

#### Assessment Header
- Assessment title (fetched from backend)
- Divider below

#### Camera Preview
- 16:9 aspect ratio video element showing the student's live webcam feed (mirrored)
- If camera access is denied: placeholder silhouette indicating where the face should be
- Overlay badge in the corner: status indicator (ready / access needed) with label text

#### Device Status Row
Below the camera preview, a row with two groups:

- **Duration display:** The assessment time limit shown as `MM:00`, with a "time limit" label
- **Microphone status:** Ready/needed indicator, label, and a small live volume meter showing real-time mic input level

#### Preparation Instructions
Static text block with two parts:
- A checklist of environmental requirements (quiet space, face visible on camera)
- A reassurance statement about what matters during the assessment (reasoning over perfection, recording disclosure)

#### Error Display
Contextual error messages for specific failure states:
- Not enrolled
- Maximum attempts reached
- Assessment closed
- Session expired
- Generic connection failure

Only visible when an error occurs on session creation.

#### Begin Button
Full-width primary action button. Three states:
- **Disabled:** Camera or microphone not yet available. Label: "Waiting for camera and microphone..."
- **Ready:** Both devices available. Label: "Begin Assessment"
- **Connecting:** Session creation in progress. Label: "Connecting..."

Disabled if an error message is currently displayed.

#### Footer
Brief disclosure text explaining that AI evaluates responses through conversation and that recordings are analyzed.

---

## 2. Assessment Session

**URL:** `/session/{sessionId}`

**User goal:** Have a voice conversation with the AI assessor. See what the AI is asking, see their own words being transcribed, understand how much time is left and how far through the assessment they are.

### Layout

Full viewport height, two-column layout:

- **Left sidebar** (fixed width): Camera, timer, controls, conversation history
- **Main area** (flexible): Section progress, active exchange (AI question + student response)

### Left Sidebar Components

#### Camera + Timer Row
Side by side at the top of the sidebar:

- **Camera feed:** Small live webcam preview (mirrored). Recording indicator dot. If no camera, silhouette placeholder.
- **Countdown timer:** Time remaining displayed prominently as `MM:SS`, counting down from the assessment duration. Label: "remaining"

#### End Session Button
Visible only during an active session. Triggers a confirmation modal (see below).

#### Conversation History
Scrollable panel showing all completed exchanges. Each entry shows the speaker label ("Argo:" or "You:") followed by the full text of that turn. Auto-scrolls to the latest entry. Visually distinguishes AI turns from student turns.

### Main Area Components

#### Section Progress Bar
Horizontal row of segments, one per assessment section (learning outcome or criterion depending on the assessment structure). Each segment has:

- A fill bar showing progress within that section (0-100%). Progress uses an asymptotic curve — early responses produce visible movement, but reaching 100% requires strong demonstrated understanding.
- A label showing the section name
- Visual distinction for the currently active section

Progress updates arrive in real-time via the backend as the AI evaluates each response.

#### Connecting State
Shown before the AI has started speaking. Displays a status message ("Preparing your assessment session...") with a blinking cursor. If connection takes longer than expected, shows a warning message and a retry button.

#### AI Question Bubble
Displays the AI assessor's current question or statement. Positioned on the left side of the main area.

- Accent bar on the left edge. When the session is ending, this bar drains as a visual countdown.
- Speaker label ("Argo" or "Session ending in Ns")
- Question text

#### Student Response Bubble
Displays the student's current response as it's being spoken. Positioned on the right side of the main area. Contains:

- **Silence countdown bar:** Accent bar on the right edge. Full height while the student is speaking. When the student stops speaking, drains over 5 seconds to indicate how much silence time remains before the AI responds. Stays at zero after draining, returns to full when the AI delivers the next question.
- **Speaker label:** "Your response"
- **Settled text:** Previously finalized sentences from the current turn, displayed in standard text
- **Live transcription:** The sentence currently being spoken, displayed distinctly (e.g., different treatment) with a blinking cursor to indicate active listening
- **Status indicator:** Shows current state:
  - "Listening" with a pulsing dot — actively receiving speech
  - "Processing..." — speech finalized, waiting for AI response
- **Correction button:** "That's not what I said" — allows the student to flag a transcription error

#### End Session Modal
Confirmation dialog triggered by the End Session button:
- Heading: "End this session?"
- Warning: progress is saved but session cannot be resumed
- Two actions: Cancel, End Session

---

## 3. Competency Profile

**URL:** `/student/profile/{sessionId}`

**User goal:** Understand how they performed across each criterion — where they were strong, where they can grow, and what evidence the AI used.

### Layout

Single-column, vertically scrolled page. Sticky header at top. Content area is centered with a max width.

### Components

#### Header
Sticky bar at the top of the page:
- Logo on the left
- Course name on the right (if available)

#### Page Title
- Section label: "Assessment results"
- Heading: "Competency Profile: {Course} — {Assessment Title}"

#### Overall Assessment
A prominent block containing the AI's narrative summary of the student's performance across all criteria. This is the highest-level takeaway — a few sentences synthesizing the whole conversation.

Visually distinguished from the criterion cards (e.g., different container treatment, accent on one edge).

#### Disclaimer
A brief notice: "This is not your final grade; scores may change under instructor review." Displayed with an info icon.

#### Criterion Cards
One card per rubric criterion. Each card contains:

##### Card Header
- **Criterion name** (left)
- **Score visualization** (right): A row of 5 blocks, filled up to the score level. Score label below (e.g., "Strong", "Developing", "Emerging"). The score is on a 1-5 scale with qualitative labels.

##### Feedback Row
Two side-by-side columns within the card:

- **Strengths column:**
  - Label: "Strengths"
  - Commentary text (AI-generated, criterion-specific)
  - Optional supporting quote from the student's transcript, displayed in a callout/blockquote

- **Growth areas column:**
  - Label: "Growth areas"
  - Commentary text (AI-generated, criterion-specific)
  - Optional supporting quote

The two columns use subtly different background treatments to distinguish positive feedback from developmental feedback.

Each feedback commentary may also include an additional note (secondary observation).

#### Transcript Link
Centered at the bottom of the page. Links to the full assessment transcript: "View full assessment transcript"

#### Back to Demo Link
Conditionally visible. If the user arrived via the demo flow, shows a link back to the demo landing page.

---

## Behavioral Notes

### Lobby → Session Transition
Clicking "Begin Assessment" creates a session record, then redirects to the session page. The session page handles WebRTC connection setup.

### Session → Profile Transition
When the session ends (AI delivers closing statement, or student clicks End Session), the page transitions to a "post" state. It polls the backend every 3 seconds for up to 60 seconds waiting for the competency profile to be generated. Once available, redirects to the profile page. If generation times out, shows an error with the option to check back later.

### Silence Countdown Behavior
The countdown bar is the primary visual cue for turn-taking. Students should be able to rely on it as an indicator of how much silence time remains before the AI will respond:

1. Full while the student is speaking
2. Begins draining when the student stops speaking (after a short debounce to avoid flicker between words)
3. Drains linearly over 5 seconds
4. Stays empty after fully draining (does not restart from late transcript corrections)
5. Returns to full when the AI delivers its next question

### Section Progress Behavior
Progress bars update after each student response. The curve is asymptotic — first few responses produce noticeable movement, approaching 100% requires consistently strong responses. A belief model floor prevents the bar from dropping below a minimum level once understanding has been established at a certain level (e.g., if the AI believes understanding is "strong", the bar won't drop below ~80%).

### Error Handling
- Lobby: Contextual error messages for enrollment, attempt limits, and session creation failures
- Session: Connection timeout warning after 5s, error state after 10s, retry button
- Profile: Loading spinner, timeout after 60s with error message
