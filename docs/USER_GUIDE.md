# LearnSpace User Guide

LearnSpace is a calm, all-in-one academic workspace for university students.

## 1. Getting Started

- **Sign up** with your email and password (accepting Terms & Privacy Policy) or click **Continue with Google** if configured.
- **Verify your email** using the 6-digit OTP code sent to your inbox to access the workspace, including the **AI Study Assistant**, **Study from Documents**, **AI Revision Plans**, **AI Flashcard/Quiz Generators**, and **Email Reminders**.
- Forgot your password? Use **Forgot password** on the login page to receive a reset link.

## 2. Dashboard & Progress Analytics (`/`)

- **Daily summary:** One unified view showing today's study hours, completed/open tasks, due flashcards, next scheduled class, and next upcoming exam.
- **Progress Analytics:** Switch between `7 days`, `30 days`, and `Semester` to inspect study time per course, quiz scores over time, flashcard reviews & accuracy, completed tasks, and your **Best study hours** (computed from real focus logs in your local timezone).
- **Weak topics to revise:** Topics scoring below `75%` across flashcards, quizzes, or document practice surface one-click **Revise this · Flashcards** and **Revise this · Quiz** actions.

## 3. Courses (`/courses`)

- Create active academic courses with course codes, color tags, credits, semester, and instructor details, or archive completed terms.
- Open any course to view its linked notes, study documents, planner tasks, timetable classes, upcoming exams, flashcard decks, quizzes, AI tutor chats, and focus sessions.
- Deleting a course lets you either **Unassign items** (preserve work without a course) or **Delete linked content**.

## 4. AI Study Assistant (`/chat` — AWAL)

- Start a new chat or search, rename, filter by course, and delete past conversations.
- **Maths & Science Formatting:** AWAL solves problems step by step with KaTeX-rendered equations (`$...$`, `$$...$$`, `\(...\)`, `\[...\]`, chemistry `\ce{...}`, matrices, integrals, and tables), a **Check your answer** verification step, and a **Copy LaTeX** button on display equations.
- **Pinned Composer & Scrolling:** The input bar stays pinned at the bottom (keyboard-aware on mobile) with auto-grow up to 5 lines. Scrolling up pauses auto-scroll and reveals a **Scroll to bottom** button. On desktop, `Enter` sends (`Shift+Enter` adds a newline); on mobile, `Enter` adds a newline and the Send button submits.
- Attach up to 5 images (camera capture or upload) or documents (`PDF`, `DOCX`, `PPTX`, `TXT`, `CSV`).
- Use **Quick actions** (`Explain simply`, `Give an example`, `Quiz me`, `Summarize`) when the chat is empty or the input is focused, **Continue** if a response stops early, or **Stop** streaming at any time.

### Assistant Mobile & Desktop Manual QA Checklist

- [ ] **iPhone Safari** (portrait & landscape, light & dark): keyboard open/closed keeps composer visible above keyboard; no horizontal page zoom; display equations scroll horizontally inside cards.
- [ ] **Android Chrome** (portrait & landscape, light & dark): `interactive-widget=resizes-content` keeps composer & latest message visible when keyboard opens; `Enter` inserts newline.
- [ ] **Desktop Chrome** (light & dark): `Enter` sends, `Shift+Enter` adds newline, focus stays in input; scrolling up pauses auto-scroll and shows floating **Scroll to bottom** button with unread dot.
- [ ] **Slow connection**: incomplete streaming math buffers cleanly without flashing raw broken delimiters; **Stop** and **Continue** work smoothly.

## 5. Study from Documents (`/documents`)

- Upload past question papers, lecture slides, or handwritten/printed photos.
- **Mode 1 — Answer Past Questions:** Detect individual questions, stream worked solutions, marking schemes, or concise answers (optionally grounded in your course notes), refine follow-ups, save to Notes, or export as PDF/DOCX.
- **Mode 2 — Generate Practice Questions:** Generate MCQ, True/False, short answer, essay, fill-in-the-blank, calculation, or flashcard sets by scope/difficulty, submit attempts for automated marking + weak-topic feedback, and save to your Flashcard/Quiz library.

## 6. Notes (`/notes`)

- Organize rich Markdown notes by course with full-text search and live preview.
- Click **Summarize with AI** on any note with at least 50 characters, or turn a note directly into flashcards or a practice quiz.

## 7. Timetable (`/timetable`)

- Build your weekly class schedule (lecture, lab, tutorial, seminar) with Day and Week views.
- Automatic clash detection warns/blocks overlapping slots on the same day, and local-timezone class reminders notify you before class starts.

## 8. Exams & AI Revision Plans (`/exams`)

- Track midterms, finals, quizzes, and practicals with live countdown cards, venues, weight percentages, and exam topics.
- Generate an **AI Revision Plan** per exam, review and edit sessions before saving, sync sessions directly to your Study Planner, or reschedule missed sessions automatically.

## 9. Study Planner & Focus Timer (`/planner`, `/focus`)

- **Planner:** Manage `Today`, `Upcoming`, `Overdue`, and `Done` tasks linked to courses, with priorities and local-timezone reminders (`Notification Bell` + optional email).
- **Focus Timer:** Run Focus, Short Break, and Long Break Pomodoro intervals linked to a course or task; completed sessions feed your daily hours, best study hours, and study streak.

## 10. Flashcards SM-2 & Quizzes (`/study`)

- **Flashcards (SM-2 Spaced Repetition):** Create decks manually, import via CSV, or generate decks from notes, documents, or weak topics. Attach optional diagram images to cards, review due cards using keyboard shortcuts (`Space` flip, `1`–`4` rating) or swipe gestures (`Again`, `Hard`, `Good`, `Easy`), and track due counts from the sidebar and dashboard.
- **Quizzes:** Generate multiple-choice quizzes from notes or topics, take timed/untimed assessments with per-question explanations, and track accuracy trends.

## 11. GPA & Grades Calculator (`/grades`)

- Auto-initializes with a customizable **University 4.0 Scale** (plus `4.0 +/-`, `5.0`, and custom grading scale presets).
- Log course grades across semesters, mark retakes (using `latest` or `highest` policy) or `0-credit` / excluded pass-fail courses, inspect your semester-by-semester GPA/CGPA trend chart, and use the **What do I need?** target planner to check achievable CGPA goals.

## 12. Profile, Settings & Data Export (`/profile`, `/settings`)

- Customize your academic profile or design a custom avatar in Profile.
- Configure theme (`system`, `light`, `dark`), IANA timezone, class/exam/task notification lead times, and Pomodoro durations in Settings.
- Use **Data & Privacy → Export my data** to download a complete JSON archive (`learnspace-export-YYYY-MM-DD.json`), or permanently delete your account (which removes uploaded files and scrubs login history PII).

## Email Verification Requirement

- Every new account must verify its email with the 6-digit code sent after signup before accessing the dashboard, notes, documents, planner, or AWAL AI chat.
- If you entered the wrong email address, click **Change email** on the verification screen to update it and receive a new 6-digit code.

## First-Time Welcome & Getting Started

- On your first verified visit, the Dashboard greets you with **"Welcome to LearnSpace"** and a **Getting Started** checklist (`Add a course`, `Create your first note`, `Upload a document`, `Ask AWAL a question`, `Plan a task`) that completes automatically as you use the app, or can be dismissed with **Hide**.
- On subsequent sessions, LearnSpace welcomes you back with time-of-day context (and a special **"Good to see you again"** greeting after 30+ days away).

## Course Community & Study Groups

- **Ask & Answer:** Open **Community** in the sidebar to view communities for each of your courses. Click **Ask a question**, optionally try **Ask AWAL first** for an instant AI explanation, and post to your classmates (anonymously if preferred).
- **Study Groups:** Create public or invite-only study groups, chat in real time (mention `@AWAL` for group AI help), share tasks that sync to your Planner, and start a 25-minute Focus timer together.
- **Share Safely:** Share read-only note copies or safe study links, and report or block any abusive content. Manage notification preferences in **Settings**.
