# Changes

Everything in this pull request: the `general-scope` branch of the fork, compared with
`general-scope` in the main repository, which ends at
"Connect 3D campus map; cleaner sources and greetings; hide roadmap for bachelor's students" (`6bc3a32`).

Two commits:
- `c2d46a6` Add My degree page, map page, calendar redesign and Microsoft sign-in
- `0a943b6` Redesign sign-in, create account and reset password; welcome animation

The work is grouped by feature (sections 1–9). Files are listed under the feature they belong to.
The answering pipeline (retrieval, prompts, agent tools other than the study-plan additions in
section 5) is unchanged.

## Summary

| Area | What changed |
|---|---|
| Sign-in | New glass sign-in page with create account, matching reset-password page, welcome animation after signing in (section 8). Optional Microsoft sign-in mode, not connected yet (section 1). |
| Chat screen | Redesigned layout, floating glass sidebar, new chat bar, answer cards, starter questions (section 3). |
| Instructor schedule | Asking about office hours opens the instructor's timetable beside the chat (section 4). |
| My degree | Student record and study plan merged into one page with planner, transcript and course cards (section 5). |
| Calendar | Academic calendar redesigned, uses the real date (section 6). |
| Campus map | The 3D map is a page instead of a pop-up, restyled to match (section 7). |
| Model | DeepSeek is the default answering model (section 2). |

---

## 1. Sign-in with the university Microsoft account

A second sign-in mode for university accounts, switched from the backend `.env`.

- **`AUTH_MODE=microsoft`** shows a single "Continue with Microsoft" button and only accepts emails from `ALLOWED_EMAIL_DOMAIN` (default `sharjah.ac.ae`). `AUTH_MODE=password` (or no value) keeps the original email/password screens.
- The real Microsoft app registration (`MS_TENANT_ID`, `MS_CLIENT_ID`) is not wired up yet, so the button shows "Microsoft sign-in is not configured yet". The app runs with `AUTH_MODE=password`.
- The earlier simulated Microsoft page (`MS_MOCK`, `/auth/mock-microsoft`) was removed.
- **`AUTH_DEV_LOGIN=true`** keeps the email/password login reachable for the demo students, behind a link on the Microsoft page.
- In Microsoft mode the Microsoft page replaces the sign-in page.

Files:
- `backend/services/microsoft_auth.py` (new): sign-in mode settings and the student-email rule; token checking waits for the app registration.
- `backend/routers/auth.py`: `GET /auth/config`, `POST /auth/microsoft`.
- `frontend/src/pages/MicrosoftLoginPage.jsx` (new), `App.jsx`, `LoginPage.jsx`, `AuthPage.module.css`.
- `frontend/src/services/api.js`: `authConfig`, `microsoftLogin`.
- `.env.example`, `README.md`: the new settings are documented.

## 2. Answering model

- DeepSeek is now the default answering model (`LLM_PROVIDER`); Gemini and Groq remain options. Embeddings still always use Gemini.
- `README.md` explains `LLM_PROVIDER`, `DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL` and `GROQ_API_KEY`.
- `backend/services/gemini_llm.py`: the comment now matches the default.

## 3. App layout and chat redesign

The whole chat screen was redesigned around one design language: Inter, black and white for most of the UI, the university green `#60B68F` for accents, floating glass panels, and light and dark themes.

- **Sidebar** (`Sidebar.jsx/.module.css`, new `NavItem.jsx/.module.css`): one floating glass sidebar with New chat, Search chats (Ctrl K), a "Your studies" group (My degree, Thesis roadmap, Academic calendar, Campus map) and chat history. It collapses to an icon rail with tooltips. The old top bar (`Header.jsx/.module.css`) was removed.
- **One icon set** (`components/icons.jsx`, new): Lucide-style outline icons used everywhere.
- **Design tokens** (`index.css`): colours, glass, shadows and motion curves for both themes.
- **Chat input** (`ChatInput.jsx/.module.css`): a two-row composer that grows up to 200 px.
- **Chat window** (`ChatWindow.jsx/.module.css`): follows the answer while it types out, stops following when you scroll up, and starts again near the bottom.
- **Answers** (`MessageBubble.jsx/.module.css`): action cards under an answer for the instructor's timetable and the places it mentions ("Show on the campus map"), a copy button, and only new messages animate in.
- **Starter questions** under the input on an empty chat (`ChatPage.jsx/.module.css`).
- Small style fixes: `FeedbackButtons.module.css`, `ThesisRoadmap.jsx/.module.css`.

## 4. Instructor schedule panel

Asking about an instructor's office hours or timetable opens their schedule beside the chat.

- Shows office hours today ("In office hours now" / next office hours), each day's slots, a weekly grid of classes and office hours, and a button to show their office on the campus map.
- Opens right away when the question names the instructor, otherwise once the answer does. Short follow-ups ("how about Manar?") keep the topic.
- Files: `SchedulePanel.jsx/.module.css` (new), `utils/schedules.js` (new; reads the A9 and A11 office directories, campus time zone), `ChatPage.jsx`.

## 5. "My degree" page (student record and study plan)

"My record" and "Study plan" were merged into one sidebar item, **My degree**, which opens a full page in place of the chat (`#degree`). Back, Esc and the Chat button return to the chat as it was.

- **Overview**: progress ring (passed and in-progress credit hours), on track / behind plan, CGPA, estimated graduation; a "Don't leave this for later" warning for bottleneck courses; this term's courses; next term's picks; the plan at a glance (counts that open the filtered list); record facts; quick questions for Mosaed.
- **Study plan**: the plan as a map (prerequisite chains) or a list with filters.
- **Next term**: a planner that suggests next term's courses (retakes, critical-path courses and courses that unlock the most first), with reasons, credit target and elective slots.
- **Transcript**: CGPA summary, every term newest first with its GPA, the term in progress, failed courses marked with when they were retaken.
- **Course card**: click any course for its status, grade, prerequisites, what it unlocks and why it matters.
- A contextual "Ask" button sends a question about the current tab to the chat.
- Accounts without a student record get the manual mode: pick a program and tick finished courses.

Backend (`backend/services/student_records.py`):
- `plan_view` returns every course's status, a summary and a next-term suggestion; `GET /students/me/plan` serves it (`backend/routers/students.py`).
- Prerequisite chains: what each course unlocks, how many later courses depend on it and its chain depth.
- Bottlenecks: overdue, critical-path and blocking courses.
- Graduation estimate from the remaining credit hours and the longest prerequisite chain.
- Elective slots are matched by department code, and numbered slots are grouped.
- The chatbot's study-plan tool (`agent_service.py`) now also gets bottlenecks, the graduation estimate and the next-term suggestion.

Data:
- `data/study-plans/.../cci_bsc-computer-science_2021-22_study-plan_v1.json`: prerequisites for the new-student track, read from the flowchart; total credit hours 123.

Frontend files: `pages/StudiesPage.jsx/.module.css`, `StudiesOverview`, `StudiesTranscript`, `PlanStanding`, `PlanList`, `NextTermPlanner`, `CourseCard` (each `.jsx` + `.module.css`) and `planText.js` (all new); `StudyPlanMap.jsx/.module.css` updated. `StudentRecord.jsx/.module.css` and `StudyPlanProgress.jsx/.module.css` were removed (merged into the page).

## 6. Academic calendar

Redesigned to match the site, in the same glass panel as the schedule panel.

- Uses the real date (it used a fixed demo date before, so "Now" and "Next" were wrong).
- Fall / Spring / Summer segmented control (arrow keys switch semesters); the current semester opens by default.
- Dates grouped by month, opened at today; a date column with day number and weekday; multi-day events show "Until Thu 25 Mar · 11 days".
- The next date shows a countdown ("In 9 days"); events happening now get a green highlight; past events turn grey.
- Close button with an Esc hint; focus returns to the sidebar. Fits phone widths.
- Copy fixes: "Midterm exams" and "Return of Academic Staff" made consistent; Summer dates sorted.
- Files: `CalendarWidget.jsx/.module.css`.

## 7. Campus map

The 3D campus map is now a page in place of the chat (`#map`) instead of a pop-up window, and its interface uses the chatbot's design.

Page (`pages/MapPage.jsx/.module.css`, new; `MapViewer.jsx/.module.css` removed):
- The sidebar's Campus map item, "Show on map" buttons and the schedule panel open the page at the right building or room.
- The map loads once and stays loaded, so returning is instant and keeps your place.
- Esc closes things in order: search results, then directions, then the page. Back returns straight to the chat (moving the map to a place no longer adds browser history entries).
- "Open in new tab" and "Chat" buttons in the top-right; on phones they become a slim bar with the title.
- `utils/mapLinks.js`, `ChatPage.jsx`, `Sidebar.jsx`.

Map itself (`frontend/public/campus-map/campus-map.html`):
- Inter, the chatbot's colours, glass panels, black pill buttons and black selected level.
- Follows the chatbot's light/dark theme; hides its own logo inside the chatbot.
- A new Directions mark: a green start dot, a dotted path and a black end dot, like the route pins.
- Office hours and the weekly timetable use coloured fills instead of side stripes.
- Earlier map work in this range: building A11 floor plans and office directory (`A11-office-directory.json`, `A11-room-mapping.json`), OpenStreetMap surroundings (`surroundings.json`), gender-split washroom colours, room hover, a texture-loading fix for the iPhone app, and an updated model, building data and walking network (`model.json`, `data.json`, `nav.json`).

## 8. Sign-in, create account and reset password

The first page is now a sign-in page with a create-account option, and the reset-password page matches it.

- **Background**: a slowly moving colour field in the brand colours (white, black, green `#60B68F`), made of soft layers that drift on their own loops (GPU-only motion, still for reduced motion).
- **Header**: Mosaed × University of Sharjah logos with a thin "×" between them.
- **Card**: one frosted-glass card with the Mosaed logo. A "Sign in / Create account" switch changes the form in place: the white highlight slides across, the fields slide in from the chosen side, and the card grows or shrinks smoothly to the new form.
- **Fields**: light glass fields with a small icon (person, envelope, lock, key); on focus they turn white with a thin black edge. Show/hide password button. Browser autofill no longer paints its blue box.
- **Create account**: the student email gets a green tick once it matches `U1234567@sharjah.ac.ae`; the password rules show as chips ("8+ characters", "A letter", "A number") that turn green as they are met.
- **Errors**: a wrong field turns red with a one-line message and shakes once on each press.
- **Reset password** (`ForgotPasswordPage.jsx`): the same card in three steps (email → code and new password → done), each sliding in from the right. The code field takes digits only.
- **Signing in**: the card dissolves, then the chat builds itself in once: the sidebar slides in, its sections follow, the logo springs in, the greeting rises word by word, the chat bar slides up and the starter questions pop in (about 1.3 s; a simple fade for reduced motion; not on reload).

Files:
- `frontend/src/components/AuthKit.jsx/.module.css` (new): the shared page shell, fields, password rules and button for both pages.
- `frontend/src/pages/LandingPage.jsx`, `ForgotPasswordPage.jsx`, `App.jsx`. `SignUpPage.jsx` and `LandingPage.module.css` were removed (merged into the sign-in page and AuthKit).
- `frontend/src/utils/entrance.js` (new), `ChatPage.jsx/.module.css`, `Sidebar.jsx`, `ChatWindow.jsx`, `ChatInput.jsx`: the welcome animation.
- Unused styles removed: `ChatInput.module.css` (`.context*`), `ThesisRoadmap.module.css` (`.trigger*`), `Sidebar.module.css` (`.sessionIcon`), `AuthPage.module.css` (old reset-page styles).

## 9. Other

- `frontend/package-lock.json`: dependency lock refresh.
- `.env.example`: lists the sign-in and answering-model settings (values are placeholders).
- `CHANGES.md`: this file.

---

## How to test

Setup is the same as in `README.md`. After pulling:

1. `cd frontend` then `npm install` (the lock file changed) and `npm run dev`.
2. Start the backend: `uvicorn backend.main:app --reload`.
3. Optional demo students: `python -m backend.seed_students` (accounts and passwords are in the README table).
4. No new `.env` settings are required. `AUTH_MODE=password` (or no value) keeps the email/password sign-in. Remove `MS_MOCK` from your `.env` if you added it; it is no longer read.

Things to try:
- **Sign-in page**: switch between Sign in and Create account; submit empty or wrong fields; on Create account, type a student email (`U1234567@sharjah.ac.ae`) and a password to see the tick and the rule chips.
- **Reset password**: "Forgot password?" → email → code and new password. With the backend in development mode, the code is shown on the page.
- **Welcome animation**: sign in with a demo student; the chat builds itself in. Reloading the page doesn't replay it.
- **Chat**: ask "What are Dr. … office hours?" to open the schedule panel; open My degree, Academic calendar and Campus map from the sidebar; Back and Esc return to the chat.
- **Themes**: switch light/dark from the profile menu at the bottom of the sidebar.

The frontend production build (`npx vite build`) passes.

## Not done yet / known limits

- The real Microsoft app registration is not connected, so Microsoft sign-in does not work yet; the app uses the email/password login.
- Student records are simulated demo data (`backend/seed_students.py`).
- Elective lists per program are partly assumed (department code matching); official lists are still needed.
- On phones the sidebar has to be collapsed by hand.
- `LoginPage.jsx` and `MicrosoftLoginPage.jsx` (only shown with `AUTH_MODE=microsoft`) still use the older card design.
- Leftovers from the original Vite starter (`src/main.ts`, `counter.ts`, `style.css`, `src/assets/*`, `public/icons.svg`, `public/favicon.svg`, `tsconfig.json`), the unused `FeedbackButtons` component and two unused logo images (`mosaed-logo-transparent.png`, `mosaed-mark-dark.png`) were there before this work and are left as they are; they can be removed in a separate clean-up.
