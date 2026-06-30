import { useState, useRef, useEffect } from "react";
import {
  LayoutDashboard, BookOpen, BookMarked, Brain, CreditCard,
  HelpCircle, CalendarDays, MessageSquare, BarChart2, Settings,
  ChevronLeft, ChevronRight, Upload, Sun, Moon, Send,
  RefreshCw, Shuffle, CheckCircle, Clock, AlertCircle,
  FileText, Zap, Target, TrendingUp, X, Plus, Minus,
  RotateCcw, Download, Sparkles, ArrowRight, Circle,
  Star, Lightbulb, BookX, BarChart, Trophy, Timer,
  Gauge, History, ArrowUp, ArrowDown, ThumbsUp, BookmarkPlus,
  PieChart, Activity
} from "lucide-react";
import "./App.css";
import MindMapPage from "./MindMap.jsx";

const NAV_ITEMS = [
  { id: "dashboard",  icon: LayoutDashboard, label: "Dashboard" },
  { id: "summary",    icon: BookOpen,         label: "Summary" },
  { id: "topics",     icon: BookMarked,       label: "Key Topics" },
  { id: "frequent",   icon: Star,             label: "Hot Topics" },
  { id: "predicted",  icon: Lightbulb,        label: "Predicted Qs" },
  { id: "pyq",        icon: BarChart,         label: "PYQ Analysis" },
  { id: "missing",    icon: BookX,            label: "Missing Topics" },
  { id: "mindmap",    icon: Brain,            label: "Mind Map" },
  { id: "flashcards", icon: CreditCard,       label: "Flashcards" },
  { id: "quiz",       icon: HelpCircle,       label: "Quiz" },
  { id: "planner",    icon: CalendarDays,     label: "Study Planner" },
  { id: "askai",      icon: MessageSquare,    label: "Ask AI" },
  { id: "analytics",  icon: BarChart2,        label: "Analytics" },
  { id: "settings",   icon: Settings,         label: "Settings" },
];

const ACCEPT = ".pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.png,.jpg,.jpeg,.webp,.zip,.xlsx,.csv";

// ── INTERACTIVE MIND MAP COMPONENT ──
const NODE_COLORS = ["#7C3AED","#4F46E5","#10B981","#F59E0B","#EF4444","#06B6D4","#EC4899","#8B5CF6"];


export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [analysisMode, setAnalysisMode] = useState("standard"); // "standard" | "exam-strategy"

  // Upload states — 3 separate buckets
  const [syllabusFiles, setSyllabusFiles] = useState([]);
  const [notesFiles, setNotesFiles] = useState([]);
  const [pyqFiles, setPyqFiles] = useState([]);
  const [dragOver, setDragOver] = useState({ syllabus: false, notes: false, pyq: false });

  // Parsed data
  const [topics, setTopics] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [summary, setSummary] = useState("");
  const [flashcards, setFlashcards] = useState([]);
  const [mindmap, setMindmap] = useState(null);
  const [frequentTopics, setFrequentTopics] = useState([]);
  const [predictedQuestions, setPredictedQuestions] = useState([]);
  const [missingTopics, setMissingTopics] = useState([]);
  const [pyqAnalysis, setPyqAnalysis] = useState("");
  const [pyqStructured, setPyqStructured] = useState(null);
  const [examReadiness, setExamReadiness] = useState(null);

  // Quiz
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [weakTopics, setWeakTopics] = useState([]);
  const [score, setScore] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [quizCount, setQuizCount] = useState(5);
  const [quizSeconds, setQuizSeconds] = useState(0);
  const [quizTimerActive, setQuizTimerActive] = useState(false);

  // Flashcards
  const [flippedCards, setFlippedCards] = useState({});
  const [currentCard, setCurrentCard] = useState(0);
  const [cardStatus, setCardStatus] = useState({}); // { [index]: "known" | "review" }

  // Session history (localStorage-backed, frontend only)
  const [sessionHistory, setSessionHistory] = useState([]);

  // Chat
  const [chatMessages, setChatMessages] = useState([
    { role: "ai", text: "Hi! I'm your AI exam coach. Upload your syllabus, notes, and previous year papers — then ask me anything!" }
  ]);
  const [askInput, setAskInput] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  // ── SESSION HISTORY (localStorage) ──
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("examPilotHistory") || "[]");
      setSessionHistory(stored);
    } catch (e) { setSessionHistory([]); }
  }, []);

  const logSession = (entry) => {
    try {
      const stored = JSON.parse(localStorage.getItem("examPilotHistory") || "[]");
      const updated = [{ ...entry, timestamp: Date.now() }, ...stored].slice(0, 20);
      localStorage.setItem("examPilotHistory", JSON.stringify(updated));
      setSessionHistory(updated);
    } catch (e) { /* localStorage unavailable, skip silently */ }
  };

  // ── QUIZ TIMER ──
  useEffect(() => {
    if (!quizTimerActive) return;
    const id = setInterval(() => setQuizSeconds(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [quizTimerActive]);

  // Start timer the moment quiz questions appear; stop+reset handled by handleSubmitQuiz / resetAll
  useEffect(() => {
    if (questions.length > 0 && !submitted) {
      setQuizSeconds(0);
      setQuizTimerActive(true);
    }
  }, [questions.length]);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // ── QUIZ DIFFICULTY (client-side heuristic, clearly labeled as estimate) ──
  const getQuestionDifficulty = (q) => {
    if (!q) return "Medium";
    const avgOptLen = q.options.reduce((sum, o) => sum + o.length, 0) / q.options.length;
    const qLen = q.question.length;
    if (qLen > 140 || avgOptLen > 45) return "Hard";
    if (qLen < 70 && avgOptLen < 25) return "Easy";
    return "Medium";
  };
  const difficultyColor = { Easy: "#10B981", Medium: "#F59E0B", Hard: "#EF4444" };

  // ── FILE HANDLERS ──
  const addFiles = (bucket, files) => {
    const arr = Array.from(files);
    if (bucket === "syllabus") setSyllabusFiles(p => [...p, ...arr]);
    if (bucket === "notes")    setNotesFiles(p => [...p, ...arr].slice(0, 4));
    if (bucket === "pyq")      setPyqFiles(p => [...p, ...arr]);
  };

  const removeFile = (bucket, idx) => {
    if (bucket === "syllabus") setSyllabusFiles(p => p.filter((_, i) => i !== idx));
    if (bucket === "notes")    setNotesFiles(p => p.filter((_, i) => i !== idx));
    if (bucket === "pyq")      setPyqFiles(p => p.filter((_, i) => i !== idx));
  };

  const resetAll = () => {
    setAnalyzed(false); setTopics([]); setQuestions([]); setSummary("");
    setFlashcards([]); setMindmap(null); setFrequentTopics([]);
    setPredictedQuestions([]); setMissingTopics([]); setPyqAnalysis("");
    setPyqStructured(null);
    setExamReadiness(null); setSelectedAnswers({}); setSubmitted(false);
    setWeakTopics([]); setFlippedCards({}); setCurrentCard(0); setCurrentQuestion(0);
    setCardStatus({}); setQuizSeconds(0); setQuizTimerActive(false);
  };

  // ── PARSER ──
  const parseAIResponse = (text) => {
    if (!text) return {};
    const clean = text.replace(/\*\*/g, "").replace(/\*/g, "").replace(/#{1,6}\s/g, "");

    const topicsMatch = clean.match(/KEY TOPICS[\s\S]*?\n([\s\S]*?)(?=QUIZ QUESTIONS|$)/i);
    const parsedTopics = topicsMatch
      ? topicsMatch[1].trim().split("\n").filter(t => /^\d+[\.\)]/.test(t.trim())).map(t => t.replace(/^\d+[\.\)]\s*/, "").trim()).filter(Boolean)
      : [];

    const questionsBlock = clean.split(/QUIZ QUESTIONS[\s:]+/i)[1]?.split(/SUMMARY[\s:]+/i)[0] || "";
    const parsedQuestions = [];
    if (questionsBlock) {
      questionsBlock.trim().split(/Q\d+[\.\)]/).forEach(block => {
        if (!block.trim()) return;
        const lines = block.trim().split("\n").filter(l => l.trim());
        if (lines.length < 5) return;
        const question = lines[0].trim();
        const options = []; let answer = "";
        lines.forEach(line => {
          const l = line.trim();
          if (/^[A-D][\.\)]/.test(l)) options.push(l.replace(/^([A-D])[\.\)]/, "$1)"));
          if (/^Answer[\s:]+/i.test(l)) answer = l.replace(/^Answer[\s:]+/i, "").trim().charAt(0).toUpperCase();
        });
        if (question && options.length === 4 && answer) parsedQuestions.push({ question, options, answer });
      });
    }

    const summaryMatch = clean.match(/SUMMARY[\s\S]*?\n([\s\S]*?)(?=FLASHCARDS|$)/i);
    const parsedSummary = summaryMatch ? summaryMatch[1].trim() : "";

    const flashcardsMatch = clean.match(/FLASHCARDS[\s\S]*?\n([\s\S]*?)(?=MINDMAP|$)/i);
    const parsedFlashcards = [];
    if (flashcardsMatch) {
      const fcText = flashcardsMatch[1];
      const qs = [...fcText.matchAll(/CARD\d+_Q[\s:]+(.+)/gi)];
      const as = [...fcText.matchAll(/CARD\d+_A[\s:]+(.+)/gi)];
      qs.forEach((q, i) => { if (as[i]) parsedFlashcards.push({ q: q[1].trim(), a: as[i][1].trim() }); });
    }

    const mindmapMatch = clean.match(/MINDMAP[\s\S]*?\n([\s\S]*?)(?=FREQUENTLY|$)/i);
    let parsedMindmap = null;
    if (mindmapMatch) {
      const mmText = mindmapMatch[1];
      const mainMatch = mmText.match(/MAIN[\s:]+(.+)/i);
      const nodes = [...mmText.matchAll(/NODE\d+[\s:]+(.+)/gi)].map(m => m[1].trim());
      const subs = {};
      nodes.forEach((_, i) => { subs[i] = [...mmText.matchAll(new RegExp(`SUB${i+1}[A-Z][\\s:]+(.+)`, 'gi'))].map(m => m[1].trim()); });
      parsedMindmap = { main: mainMatch?.[1].trim() || "Main Topic", nodes, subs };
    }

    const freqMatch = clean.match(/FREQUENTLY ASKED[\s\S]*?\n([\s\S]*?)(?=PREDICTED|$)/i);
    const parsedFrequent = freqMatch
      ? freqMatch[1].trim().split("\n").filter(t => /^\d+[\.\)]/.test(t.trim())).map(t => t.replace(/^\d+[\.\)]\s*/, "").trim()).filter(Boolean)
      : [];

    const predMatch = clean.match(/PREDICTED QUESTIONS[\s\S]*?\n([\s\S]*?)(?=MISSING|$)/i);
    const parsedPredicted = predMatch
      ? predMatch[1].trim().split("\n").filter(t => /^\d+[\.\)]/.test(t.trim())).map(t => t.replace(/^\d+[\.\)]\s*/, "").trim()).filter(Boolean)
      : [];

    const missingMatch = clean.match(/MISSING TOPICS[\s\S]*?\n([\s\S]*?)(?=PYQ ANALYSIS|$)/i);
    const parsedMissing = missingMatch
      ? missingMatch[1].trim().split("\n").filter(t => /^\d+[\.\)]/.test(t.trim())).map(t => t.replace(/^\d+[\.\)]\s*/, "").trim()).filter(Boolean)
      : [];

    const pyqMatch = clean.match(/PYQ ANALYSIS[\s\S]*?\n([\s\S]*?)(?=EXAM READINESS|$)/i);
    const pyqBlock = pyqMatch ? pyqMatch[1] : "";

    // Structured PYQ fields (only present in exam-strategy mode; standard mode has plain text only)
    const repeatedTopics = [...pyqBlock.matchAll(/REPEATED_TOPIC:\s*(.+?)\s*\|\s*Times seen:\s*(.+?)\s*\|\s*Units:\s*(.+)/gi)]
      .map(m => ({ topic: m[1].trim(), timesSeen: m[2].trim(), units: m[3].trim() }));

    const unitQuestions = [...pyqBlock.matchAll(/UNIT_QUESTIONS:\s*(.+?)\s*\|\s*Question count:\s*(.+)/gi)]
      .map(m => ({ unit: m[1].trim(), count: m[2].trim() }));

    const marksDistribution = [...pyqBlock.matchAll(/MARKS_DISTRIBUTION:\s*(.+?)\s*\|\s*Estimated marks:\s*(.+)/gi)]
      .map(m => ({ topic: m[1].trim(), marks: m[2].trim() }));

    const highProbability = [...pyqBlock.matchAll(/HIGH_PROBABILITY:\s*(.+?)\s*\|\s*Reason:\s*(.+?)\s*\|\s*Confidence:\s*(.+)/gi)]
      .map(m => ({ topic: m[1].trim(), reason: m[2].trim(), confidence: m[3].trim() }));

    const dataQualityMatch = pyqBlock.match(/DATA_QUALITY:\s*(.+)/i);
    const dataQuality = dataQualityMatch ? dataQualityMatch[1].trim() : "";

    const narrativeMatch = pyqBlock.match(/PYQ_NARRATIVE:[\s\n]*([\s\S]*?)$/i);
    const pyqNarrative = narrativeMatch ? narrativeMatch[1].trim() : "";

    const hasStructuredPyq = repeatedTopics.length > 0 || unitQuestions.length > 0 || marksDistribution.length > 0 || highProbability.length > 0;
    const parsedPyqStructured = hasStructuredPyq
      ? { repeatedTopics, unitQuestions, marksDistribution, highProbability, dataQuality, narrative: pyqNarrative }
      : null;

    // Fallback: plain-text PYQ analysis (used in standard/legacy mode, or if structured parse finds nothing)
    const parsedPyq = hasStructuredPyq ? pyqNarrative : pyqBlock.trim();

    const readinessMatch = clean.match(/EXAM READINESS[\s\S]*?\n([\s\S]*?)$/i);
    let parsedReadiness = null;
    if (readinessMatch) {
      const rt = readinessMatch[1];
      const scoreM = rt.match(/Score[\s:]+(\d+)/i);
      const strengthsM = rt.match(/Strengths[\s:]+(.+)/i);
      const gapsM = rt.match(/Gaps[\s:]+(.+)/i);
      parsedReadiness = {
        score: scoreM ? parseInt(scoreM[1]) : 50,
        strengths: strengthsM ? strengthsM[1].trim() : "",
        gaps: gapsM ? gapsM[1].trim() : ""
      };
    }

    return { parsedTopics, parsedQuestions, parsedSummary, parsedFlashcards, parsedMindmap, parsedFrequent, parsedPredicted, parsedMissing, parsedPyq, parsedPyqStructured, parsedReadiness };
  };

  // ── ANALYZE ──
  const handleAnalyze = async () => {
    const hasFiles = syllabusFiles.length > 0 || notesFiles.length > 0 || pyqFiles.length > 0;
    if (!hasFiles) return;
    setLoading(true);
    resetAll();

    const formData = new FormData();
    formData.append("quizCount", quizCount);
    syllabusFiles.forEach(f => formData.append("syllabus", f));
    notesFiles.forEach(f => formData.append("notes", f));
    pyqFiles.forEach(f => formData.append("pyq", f));

    try {
      const response = await fetch("http://localhost:5000/upload", { method: "POST", body: formData });
      const data = await response.json();
      if (data.success) {
        const parsed = parseAIResponse(data.analysis);
        setTopics(parsed.parsedTopics || []);
        setQuestions(parsed.parsedQuestions || []);
        setSummary(parsed.parsedSummary || "");
        setFlashcards(parsed.parsedFlashcards || []);
        setMindmap(parsed.parsedMindmap || null);
        setFrequentTopics(parsed.parsedFrequent || []);
        setPredictedQuestions(parsed.parsedPredicted || []);
        setMissingTopics(parsed.parsedMissing || []);
        setPyqAnalysis(parsed.parsedPyq || "");
        setPyqStructured(parsed.parsedPyqStructured || null);
        setExamReadiness(parsed.parsedReadiness || null);
        setAnalysisMode(data.mode || "standard");
        setAnalyzed(true);
        setActivePage("summary");

        // Log session to history (frontend-only, localStorage)
        const allFileNames = [...syllabusFiles, ...notesFiles, ...pyqFiles].map(f => f.name);
        logSession({
          fileNames: allFileNames,
          fileCount: allFileNames.length,
          mode: data.mode || "standard",
          topicsFound: (parsed.parsedTopics || []).length,
          readinessScore: parsed.parsedReadiness?.score ?? null,
        });
      } else {
        alert("Error: " + data.message);
      }
    } catch (e) {
      alert("Connection error: " + e.message);
    } finally {
      setLoading(false);
    }
  };

  // ── QUIZ ──
  const handleOptionSelect = (opt) => { if (!submitted) setSelectedAnswers(p => ({ ...p, [currentQuestion]: opt })); };
  const handleSubmitQuiz = () => {
    let correct = 0; const weak = [];
    questions.forEach((q, i) => {
      if (selectedAnswers[i]?.charAt(0) === q.answer) correct++;
      else if (topics[i]) weak.push(topics[i]);
    });
    setScore(correct); setWeakTopics(weak); setSubmitted(true);
    setQuizTimerActive(false);
  };
  const getOptionClass = (opt) => {
    const letter = opt.charAt(0);
    const selected = selectedAnswers[currentQuestion]?.charAt(0);
    if (!submitted) return selected === letter ? "opt-btn selected" : "opt-btn";
    if (letter === questions[currentQuestion]?.answer) return "opt-btn correct";
    if (selected === letter) return "opt-btn wrong";
    return "opt-btn";
  };

  // ── FLASHCARD STATUS ──
  const markCard = (status) => {
    setCardStatus(p => ({ ...p, [currentCard]: status }));
  };
  const knownCount = Object.values(cardStatus).filter(s => s === "known").length;
  const reviewCount = Object.values(cardStatus).filter(s => s === "review").length;

  // ── ASK AI ──
  const handleAskAI = async () => {
    if (!askInput.trim()) return;
    const userMsg = askInput.trim();
    setAskInput("");
    setChatMessages(p => [...p, { role: "user", text: userMsg }]);
    setAskLoading(true);
    try {
      const context = `Summary: ${summary}\nTopics: ${topics.join(", ")}\nFrequent: ${frequentTopics.join(", ")}\nPYQ Analysis: ${pyqAnalysis}`;
      const res = await fetch("http://localhost:5000/ask", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMsg, context }),
      });
      const data = await res.json();
      setChatMessages(p => [...p, { role: "ai", text: data.success ? data.answer : "Error: " + data.message }]);
    } catch (e) {
      setChatMessages(p => [...p, { role: "ai", text: "Connection error: " + e.message }]);
    } finally { setAskLoading(false); }
  };

  const shuffleCards = () => { setFlashcards(p => [...p].sort(() => Math.random() - 0.5)); setCurrentCard(0); setFlippedCards({}); };
  const readinessScore = examReadiness?.score ?? (submitted ? Math.round((score / questions.length) * 100) : analyzed ? 45 : 0);
  const progressPct = questions.length > 0 ? Math.round(((currentQuestion + 1) / questions.length) * 100) : 0;
  const canAnalyze = syllabusFiles.length > 0 || notesFiles.length > 0 || pyqFiles.length > 0;

  // ── UPLOAD CARD COMPONENT ──
  const UploadCard = ({ bucket, label, icon: Icon, files, color, maxFiles }) => (
    <div
      className={`upload-bucket ${dragOver[bucket] ? "drag-over" : ""}`}
      style={{ "--bucket-color": color }}
      onDragOver={e => { e.preventDefault(); setDragOver(p => ({ ...p, [bucket]: true })); }}
      onDragLeave={() => setDragOver(p => ({ ...p, [bucket]: false }))}
      onDrop={e => { e.preventDefault(); setDragOver(p => ({ ...p, [bucket]: false })); addFiles(bucket, e.dataTransfer.files); }}
    >
      <div className="bucket-icon" style={{ background: color + "22", color }}>
        <Icon size={22} />
      </div>
      <h3 className="bucket-title">{label}</h3>
      <p className="bucket-sub">{maxFiles ? `Max ${maxFiles} files` : "Multiple files"} • Any format</p>

      <label className="bucket-browse">
        <Upload size={13} /> Add Files
        <input type="file" multiple accept={ACCEPT} onChange={e => addFiles(bucket, e.target.files)} style={{ display: "none" }} />
      </label>

      {files.length > 0 && (
        <div className="bucket-files">
          {files.map((f, i) => (
            <div key={i} className="bucket-file">
              <FileText size={11} />
              <span>{f.name.length > 22 ? f.name.slice(0, 22) + "…" : f.name}</span>
              <button onClick={() => removeFile(bucket, i)}><X size={11} /></button>
            </div>
          ))}
        </div>
      )}

      {files.length === 0 && (
        <p className="bucket-empty">Drop files here</p>
      )}
    </div>
  );

  return (
    <div className={`shell ${darkMode ? "dark" : "light"}`}>
      <div className="orb orb1" /><div className="orb orb2" /><div className="orb orb3" />

      {/* ── SIDEBAR ── */}
      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="sb-logo">
          <div className="sb-logo-icon"><Sparkles size={18} /></div>
          {sidebarOpen && <span className="sb-logo-text">ExamPilot <span className="sb-logo-ai">AI</span></span>}
        </div>
        <nav className="sb-nav">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const locked = !analyzed && !["dashboard", "settings"].includes(item.id);
            return (
              <button key={item.id}
                className={`sb-item ${activePage === item.id ? "active" : ""} ${locked ? "locked" : ""}`}
                onClick={() => !locked && setActivePage(item.id)} title={item.label}>
                <Icon size={17} className="sb-icon" />
                {sidebarOpen && <span className="sb-label">{item.label}</span>}
              </button>
            );
          })}
        </nav>
        <button className="sb-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <ChevronLeft size={15} /> : <ChevronRight size={15} />}
        </button>
      </aside>

      {/* ── MAIN ── */}
      <main className={`main ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}>
        <header className="topbar">
          <div className="topbar-left">
            <h2 className="topbar-title">{NAV_ITEMS.find(n => n.id === activePage)?.label}</h2>
            {analyzed && analysisMode === "exam-strategy" && (
              <span className="mode-badge"><Trophy size={12} /> Exam Strategy Mode</span>
            )}
          </div>
          <div className="topbar-right">
            {analyzed && (
              <div className="readiness-pill"><Target size={13} /> Readiness <strong>{readinessScore}%</strong></div>
            )}
            <button className="icon-btn" onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        <div className="content">

          {/* ══ DASHBOARD ══ */}
          {activePage === "dashboard" && (
            <div className="dashboard">
              <div className="hero">
                <div className="hero-badge"><Sparkles size={13} /> AI Exam Prediction Platform</div>
                <h1 className="hero-h1">Build Your<br /><span className="grad-text">Exam Strategy.</span></h1>
                <p className="hero-sub">Upload your syllabus, notes & previous year papers.<br />AI analyzes all three to predict your exam questions.</p>
              </div>

              {/* ── 3 UPLOAD CARDS ── */}
              <div className="upload-row">
                <UploadCard bucket="syllabus" label="Syllabus" icon={BookOpen}   files={syllabusFiles} color="#7C3AED" />
                <UploadCard bucket="notes"    label="Notes"    icon={FileText}   files={notesFiles}    color="#4F46E5" maxFiles={4} />
                <UploadCard bucket="pyq"      label="Previous Year Papers" icon={BarChart} files={pyqFiles} color="#10B981" />
              </div>

              <div className="analyze-row">
                <button className="analyze-btn" onClick={handleAnalyze} disabled={loading || !canAnalyze}>
                  {loading
                    ? <><span className="spin-ring" /> Analyzing Everything...</>
                    : <><Sparkles size={17} /> Build Exam Strategy <ArrowRight size={15} /></>
                  }
                </button>
                {!canAnalyze && <p className="analyze-hint">Upload at least one file to get started</p>}
              </div>

              {/* Stats after analysis */}
              {analyzed && (
                <div className="stats-row">
                  {[
                    { icon: BookMarked, label: "Key Topics",        value: topics.length,          color: "#7C3AED" },
                    { icon: Star,       label: "Hot Topics",        value: frequentTopics.length,  color: "#F59E0B" },
                    { icon: Lightbulb, label: "Predicted Qs",      value: predictedQuestions.length, color: "#10B981" },
                    { icon: BookX,      label: "Missing Topics",    value: missingTopics.length,   color: "#EF4444" },
                    { icon: CreditCard, label: "Flashcards",        value: flashcards.length,      color: "#4F46E5" },
                    { icon: HelpCircle, label: "Quiz Questions",    value: questions.length,       color: "#06B6D4" },
                  ].map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <div key={i} className="stat-card glass">
                        <div className="stat-icon-wrap" style={{ background: s.color + "22", color: s.color }}><Icon size={18} /></div>
                        <div><p className="stat-val">{s.value}</p><p className="stat-lbl">{s.label}</p></div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Prediction Confidence — derived from real high-probability topic data, not invented */}
              {analyzed && pyqStructured && pyqStructured.highProbability.length > 0 && (
                <div className="glass card confidence-card" style={{ marginTop: 16 }}>
                  <div className="card-label"><Gauge size={13}/> Prediction Confidence</div>
                  {(() => {
                    const counts = { High: 0, Medium: 0, Low: 0 };
                    pyqStructured.highProbability.forEach(h => {
                      const c = h.confidence.toLowerCase();
                      if (c.includes("high")) counts.High++;
                      else if (c.includes("low")) counts.Low++;
                      else counts.Medium++;
                    });
                    const total = pyqStructured.highProbability.length;
                    return (
                      <>
                        <div className="confidence-bars">
                          {Object.entries(counts).map(([level, n]) => n > 0 && (
                            <div key={level} className="confidence-row">
                              <span className="confidence-label">{level}</span>
                              <div className="mini-bar"><div className="mini-fill" style={{ width: `${(n/total)*100}%`, background: level==="High"?"#10B981":level==="Low"?"#EF4444":"#F59E0B" }}/></div>
                              <span className="confidence-count">{n} topic{n!==1?"s":""}</span>
                            </div>
                          ))}
                        </div>
                        {pyqStructured.dataQuality && <p className="confidence-note">{pyqStructured.dataQuality}</p>}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Recent Activity — from localStorage session history, frontend only */}
              {sessionHistory.length > 0 && (
                <div className="glass card recent-activity-card" style={{ marginTop: 16 }}>
                  <div className="card-label"><History size={13}/> Recent Activity</div>
                  <div className="activity-list">
                    {sessionHistory.slice(0, 5).map((entry, i) => (
                      <div key={i} className="activity-row">
                        <div className="activity-icon"><FileText size={14}/></div>
                        <div className="activity-info">
                          <p className="activity-files">{entry.fileNames?.slice(0,2).join(", ")}{entry.fileCount > 2 ? ` +${entry.fileCount - 2} more` : ""}</p>
                          <p className="activity-meta">
                            {entry.mode === "exam-strategy" ? "Exam Strategy" : "Standard"} · {entry.topicsFound} topics
                            {entry.readinessScore !== null && entry.readinessScore !== undefined ? ` · ${entry.readinessScore}% ready` : ""}
                          </p>
                        </div>
                        <span className="activity-time">{new Date(entry.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feature grid when not analyzed */}
              {!analyzed && (
                <div className="feature-grid">
                  {[
                    { icon: Star,      title: "Hot Topic Detection",    desc: "Finds the most repeated topics from previous year papers.", color: "#F59E0B" },
                    { icon: Lightbulb, title: "Question Prediction",    desc: "AI predicts which questions are likely in your next exam.", color: "#7C3AED" },
                    { icon: BookX,     title: "Gap Analysis",           desc: "Identifies topics in syllabus not covered in your notes.", color: "#EF4444" },
                    { icon: BarChart,  title: "PYQ Pattern Analysis",   desc: "Analyzes years of papers to find patterns and trends.", color: "#10B981" },
                    { icon: Brain,     title: "Smart Mind Map",         desc: "Visual topic map built from syllabus structure.", color: "#4F46E5" },
                    { icon: Trophy,    title: "Exam Readiness Score",   desc: "Know exactly how prepared you are before exam day.", color: "#06B6D4" },
                  ].map((f, i) => {
                    const Icon = f.icon;
                    return (
                      <div key={i} className="feat-card glass">
                        <div className="feat-icon" style={{ background: f.color + "22", color: f.color }}><Icon size={20} /></div>
                        <h3 className="feat-title">{f.title}</h3>
                        <p className="feat-desc">{f.desc}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ══ SUMMARY ══ */}
          {activePage === "summary" && analyzed && (
            <div className="page">
              <div className="page-header"><h2 className="page-h2">Summary</h2></div>
              <div className="summary-cards">
                <div className="glass card">
                  <div className="card-label"><Zap size={13} /> AI Summary</div>
                  <p className="summary-text">{summary || "Summary not available."}</p>
                </div>
                {examReadiness && (
                  <div className="glass card readiness-card">
                    <div className="card-label"><Trophy size={13} /> Exam Readiness</div>
                    <div className="readiness-score-big">{examReadiness.score}%</div>
                    <div className="readiness-bar"><div className="readiness-fill" style={{ width: `${examReadiness.score}%` }} /></div>
                    {examReadiness.strengths && <p className="readiness-detail"><CheckCircle size={13} /> {examReadiness.strengths}</p>}
                    {examReadiness.gaps && <p className="readiness-detail warn"><AlertCircle size={13} /> {examReadiness.gaps}</p>}
                  </div>
                )}
                <div className="glass card">
                  <div className="card-label"><BookMarked size={13} /> Key Takeaways</div>
                  <div className="takeaway-list">
                    {topics.map((t, i) => (
                      <div key={i} className="takeaway-row">
                        <span className="takeaway-num">{i + 1}</span><span>{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══ KEY TOPICS ══ */}
          {activePage === "topics" && analyzed && (
            <div className="page">
              <div className="page-header"><h2 className="page-h2">Key Topics</h2><span className="badge-pill">{topics.length} topics</span></div>
              <div className="topics-grid">
                {topics.map((topic, i) => {
                  const isWeak = weakTopics.includes(topic);
                  const isStrong = submitted && !isWeak;
                  const importance = [95,85,78,68,58][i] || 50;
                  return (
                    <div key={i} className={`topic-card glass ${isWeak ? "weak" : isStrong ? "strong" : ""}`}>
                      <div className="topic-card-top">
                        <span className="topic-name">{topic}</span>
                        <span className={`topic-badge ${isWeak ? "badge-red" : isStrong ? "badge-green" : "badge-purple"}`}>
                          {isWeak ? "Needs Work" : isStrong ? "Strong" : `#${i+1}`}
                        </span>
                      </div>
                      <div className="topic-meta">
                        <div className="meta-row">
                          <span className="meta-label">Importance</span>
                          <div className="mini-bar"><div className="mini-fill" style={{ width: `${importance}%`, background: isWeak ? "#EF4444" : "#7C3AED" }} /></div>
                          <span className="meta-val">{importance}%</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ══ HOT TOPICS (FREQUENTLY ASKED) ══ */}
          {activePage === "frequent" && analyzed && (
            <div className="page">
              <div className="page-header"><h2 className="page-h2">🔥 Hot Topics</h2><span className="badge-pill badge-warn">From PYQ Analysis</span></div>
              <div className="glass card">
                <div className="card-label"><Star size={13} /> Most Frequently Asked</div>
                <div className="freq-list">
                  {frequentTopics.length > 0 ? frequentTopics.map((t, i) => (
                    <div key={i} className="freq-row">
                      <div className="freq-stars">{"★".repeat(Math.max(1, 5 - i))}{"☆".repeat(Math.min(4, i))}</div>
                      <span className="freq-topic">{t}</span>
                      <span className="freq-badge">HIGH PRIORITY</span>
                    </div>
                  )) : <p className="empty-msg">Upload previous year papers to see frequently asked topics.</p>}
                </div>
              </div>
            </div>
          )}

          {/* ══ PREDICTED QUESTIONS ══ */}
          {activePage === "predicted" && analyzed && (
            <div className="page">
              <div className="page-header"><h2 className="page-h2">Predicted Questions</h2><span className="badge-pill" style={{background:"rgba(16,185,129,0.1)",color:"#10B981",borderColor:"rgba(16,185,129,0.2)"}}>AI Predicted</span></div>
              <div className="glass card">
                <div className="card-label"><Lightbulb size={13} /> Most Likely Exam Questions</div>
                <div className="predicted-list">
                  {predictedQuestions.length > 0 ? predictedQuestions.map((q, i) => (
                    <div key={i} className="predicted-row">
                      <div className="predicted-num">{i + 1}</div>
                      <p className="predicted-q">{q}</p>
                      <span className="predicted-tag">Expected</span>
                    </div>
                  )) : <p className="empty-msg">Upload syllabus and PYQs to get question predictions.</p>}
                </div>
              </div>
            </div>
          )}

          {/* ══ PYQ ANALYSIS ══ */}
          {activePage === "pyq" && analyzed && (
            <div className="page">
              <div className="page-header">
                <h2 className="page-h2">PYQ Analysis</h2>
                {pyqStructured && <span className="badge-pill"><PieChart size={12}/> Structured Analysis</span>}
              </div>

              {!pyqStructured && (
                <div className="glass card">
                  <div className="card-label"><BarChart size={13} /> Previous Year Paper Analysis</div>
                  {pyqAnalysis
                    ? <p className="summary-text">{pyqAnalysis}</p>
                    : <p className="empty-msg">Upload previous year papers to see pattern analysis.</p>}
                </div>
              )}

              {pyqStructured && (
                <>
                  {pyqStructured.dataQuality && (
                    <div className="data-quality-note glass card">
                      <Activity size={14}/> <span>{pyqStructured.dataQuality}</span>
                    </div>
                  )}

                  {pyqStructured.narrative && (
                    <div className="glass card" style={{ marginTop: 14 }}>
                      <div className="card-label"><BarChart size={13} /> Overview</div>
                      <p className="summary-text">{pyqStructured.narrative}</p>
                    </div>
                  )}

                  {pyqStructured.repeatedTopics.length > 0 && (
                    <div className="glass card" style={{ marginTop: 14 }}>
                      <div className="card-label"><TrendingUp size={13} /> Most Repeated Topics</div>
                      <div className="freq-list">
                        {pyqStructured.repeatedTopics.map((t, i) => (
                          <div key={i} className="freq-row">
                            <div className="freq-stars">{"★".repeat(Math.max(1, 5 - i))}</div>
                            <span className="freq-topic">{t.topic}</span>
                            <span className="freq-badge">{t.timesSeen} times{t.units && t.units.toLowerCase() !== "unclear" ? ` · ${t.units}` : ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {pyqStructured.unitQuestions.length > 0 && (
                    <div className="glass card" style={{ marginTop: 14 }}>
                      <div className="card-label"><BarChart size={13} /> Questions Per Unit</div>
                      <div className="unit-bars">
                        {pyqStructured.unitQuestions.map((u, i) => {
                          const numeric = parseInt(u.count);
                          const pct = !isNaN(numeric) ? Math.min(100, numeric * 12) : 0;
                          return (
                            <div key={i} className="unit-bar-row">
                              <span className="unit-name">{u.unit}</span>
                              <div className="mini-bar"><div className="mini-fill" style={{ width: `${pct}%`, background: "#7C3AED" }} /></div>
                              <span className="unit-count">{u.count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {pyqStructured.marksDistribution.length > 0 && (
                    <div className="glass card" style={{ marginTop: 14 }}>
                      <div className="card-label"><PieChart size={13} /> Estimated Marks Distribution</div>
                      <div className="unit-bars">
                        {pyqStructured.marksDistribution.map((m, i) => {
                          const numeric = parseInt(m.marks);
                          const pct = !isNaN(numeric) ? Math.min(100, numeric * 6) : 0;
                          return (
                            <div key={i} className="unit-bar-row">
                              <span className="unit-name">{m.topic}</span>
                              <div className="mini-bar"><div className="mini-fill" style={{ width: `${pct}%`, background: "#10B981" }} /></div>
                              <span className="unit-count">{m.marks}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {pyqStructured.highProbability.length > 0 && (
                    <div className="glass card" style={{ marginTop: 14 }}>
                      <div className="card-label"><Target size={13} /> High Probability Topics</div>
                      <div className="predicted-list">
                        {pyqStructured.highProbability.map((h, i) => (
                          <div key={i} className="predicted-row">
                            <div className="predicted-num">{i + 1}</div>
                            <div style={{ flex: 1 }}>
                              <p className="predicted-q" style={{ marginBottom: 4 }}><strong>{h.topic}</strong></p>
                              <p className="empty-msg" style={{ padding: 0, fontSize: "0.8rem" }}>{h.reason}</p>
                            </div>
                            <span className="predicted-tag" style={{
                              background: h.confidence.toLowerCase().includes("high") ? "rgba(16,185,129,0.15)" : h.confidence.toLowerCase().includes("low") ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)",
                              color: h.confidence.toLowerCase().includes("high") ? "#10B981" : h.confidence.toLowerCase().includes("low") ? "#EF4444" : "#F59E0B"
                            }}>{h.confidence}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ══ MISSING TOPICS ══ */}
          {activePage === "missing" && analyzed && (
            <div className="page">
              <div className="page-header"><h2 className="page-h2">Missing Topics</h2><span className="badge-pill badge-red-pill">Gap Analysis</span></div>
              <div className="glass card">
                <div className="card-label"><BookX size={13} /> In Syllabus But Not In Your Notes</div>
                {missingTopics.length > 0 ? (
                  <div className="missing-list">
                    {missingTopics.map((t, i) => (
                      <div key={i} className="missing-row">
                        <AlertCircle size={15} />
                        <span>{t}</span>
                        <span className="missing-tag">Study This</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="empty-msg">No missing topics found — great coverage!</p>}
              </div>
            </div>
          )}

          {/* ══ MIND MAP ══ */}
          {activePage === "mindmap" && analyzed && (
            <MindMapPage mindmap={mindmap} topics={topics} darkMode={darkMode} />
          )}

          {/* ══ FLASHCARDS ══ */}
          {activePage === "flashcards" && analyzed && (
            <div className="page">
              <div className="page-header">
                <h2 className="page-h2">Flashcards</h2>
                <div className="btn-row">
                  <button className="icon-btn" onClick={shuffleCards} title="Shuffle"><Shuffle size={15} /></button>
                  <span className="badge-pill">{currentCard + 1} / {flashcards.length}</span>
                </div>
              </div>
              <div className="fc-progress-bar"><div className="fc-progress-fill" style={{ width: `${((currentCard+1)/Math.max(flashcards.length,1))*100}%` }} /></div>

              {flashcards.length > 0 && (
                <div className="fc-status-strip">
                  <span className="fc-status-chip known"><ThumbsUp size={12}/> Known: {knownCount}</span>
                  <span className="fc-status-chip review"><BookmarkPlus size={12}/> Review Later: {reviewCount}</span>
                  <span className="fc-status-chip unmarked">Unmarked: {flashcards.length - knownCount - reviewCount}</span>
                </div>
              )}

              {flashcards.length > 0 ? (
                <>
                  <div className={`flashcard-big ${flippedCards[currentCard] ? "flipped" : ""} ${cardStatus[currentCard] === "known" ? "card-known" : cardStatus[currentCard] === "review" ? "card-review" : ""}`} onClick={() => setFlippedCards(p => ({ ...p, [currentCard]: !p[currentCard] }))}>
                    <div className="fc-inner">
                      <div className="fc-front glass">
                        <div className="fc-side-label">Question {currentCard + 1}</div>
                        <p className="fc-text">{flashcards[currentCard]?.q}</p>
                        <span className="fc-hint">Click to reveal answer</span>
                      </div>
                      <div className="fc-back">
                        <div className="fc-side-label">Answer</div>
                        <p className="fc-text">{flashcards[currentCard]?.a}</p>
                        <span className="fc-hint">Click to go back</span>
                      </div>
                    </div>
                  </div>

                  <div className="fc-mark-row">
                    <button className={`mark-btn known-btn ${cardStatus[currentCard]==="known" ? "active" : ""}`} onClick={() => markCard("known")}>
                      <ThumbsUp size={14}/> Known
                    </button>
                    <button className={`mark-btn review-btn ${cardStatus[currentCard]==="review" ? "active" : ""}`} onClick={() => markCard("review")}>
                      <BookmarkPlus size={14}/> Review Later
                    </button>
                  </div>

                  <div className="fc-controls">
                    <button className="outline-btn" onClick={() => { setCurrentCard(p => Math.max(0,p-1)); setFlippedCards({}); }} disabled={currentCard===0}><ChevronLeft size={15}/> Prev</button>
                    <div className="fc-dots">{flashcards.map((_,i) => <button key={i} className={`fc-dot ${i===currentCard?"active":""} ${cardStatus[i]==="known"?"dot-known":cardStatus[i]==="review"?"dot-review":""}`} onClick={() => { setCurrentCard(i); setFlippedCards({}); }}/>)}</div>
                    <button className="outline-btn" onClick={() => { setCurrentCard(p => Math.min(flashcards.length-1,p+1)); setFlippedCards({}); }} disabled={currentCard===flashcards.length-1}>Next <ChevronRight size={15}/></button>
                  </div>
                </>
              ) : <div className="empty-state glass card"><CreditCard size={36} /><p>No flashcards generated yet.</p></div>}
            </div>
          )}

          {/* ══ QUIZ ══ */}
          {activePage === "quiz" && analyzed && (
            <div className="page">
              {questions.length === 0 && !submitted && (
                <div className="quiz-setup">
                  <div className="page-header"><h2 className="page-h2">Quiz Setup</h2></div>
                  <div className="glass card setup-card">
                    <p className="setup-label">How many questions?</p>
                    <div className="count-options">
                      {[5,10,15,20].map(n => <button key={n} className={`count-btn ${quizCount===n?"active":""}`} onClick={() => setQuizCount(n)}>{n}</button>)}
                    </div>
                    <div className="custom-count">
                      <button className="icon-btn sm" onClick={() => setQuizCount(p => Math.max(1,p-1))}><Minus size={13}/></button>
                      <span className="count-display">{quizCount} questions</span>
                      <button className="icon-btn sm" onClick={() => setQuizCount(p => Math.min(20,p+1))}><Plus size={13}/></button>
                    </div>
                    <button className="analyze-btn" onClick={handleAnalyze}><Sparkles size={15}/> Generate {quizCount} Questions</button>
                  </div>
                </div>
              )}

              {questions.length > 0 && !submitted && (
                <div className="quiz-active">
                  <div className="quiz-topbar">
                    <span className="q-counter">Question {currentQuestion+1} of {questions.length}</span>
                    <span className="quiz-timer"><Timer size={13}/> {formatTime(quizSeconds)}</span>
                    <span className="q-pct">{progressPct}%</span>
                  </div>
                  <div className="quiz-progress-bar"><div className="quiz-progress-fill" style={{ width: `${progressPct}%` }}/></div>
                  <div className="glass card question-card">
                    <div className="q-meta-row">
                      <span className="q-badge-num">Q{currentQuestion+1}</span>
                      <span className="difficulty-badge" style={{ background: difficultyColor[getQuestionDifficulty(questions[currentQuestion])] + "22", color: difficultyColor[getQuestionDifficulty(questions[currentQuestion])] }}>
                        <Gauge size={11}/> {getQuestionDifficulty(questions[currentQuestion])}
                      </span>
                    </div>
                    <p className="q-text">{questions[currentQuestion]?.question}</p>
                    <div className="options-list">
                      {questions[currentQuestion]?.options.map((opt, j) => (
                        <button key={j} className={getOptionClass(opt)} onClick={() => handleOptionSelect(opt)}>
                          <span className="opt-letter">{opt.charAt(0)}</span><span>{opt.slice(2)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="quiz-nav">
                    <button className="outline-btn" onClick={() => setCurrentQuestion(p=>Math.max(0,p-1))} disabled={currentQuestion===0}><ChevronLeft size={15}/> Prev</button>
                    {currentQuestion < questions.length-1
                      ? <button className="analyze-btn sm" onClick={() => setCurrentQuestion(p=>p+1)} disabled={!selectedAnswers[currentQuestion]}>Next <ChevronRight size={15}/></button>
                      : <button className="analyze-btn sm success" onClick={handleSubmitQuiz} disabled={Object.keys(selectedAnswers).length<questions.length}><CheckCircle size={15}/> Submit</button>
                    }
                  </div>
                  <p className="answered-note">{Object.keys(selectedAnswers).length}/{questions.length} answered</p>
                </div>
              )}

              {submitted && (
                <div className="quiz-results">
                  <div className="result-hero glass card">
                    <div className="result-emoji-big">{score===questions.length?"🏆":score>=questions.length/2?"👍":"📖"}</div>
                    <h2 className="result-title">{score===questions.length?"Perfect Score!":score>=questions.length/2?"Great Job!":"Keep Studying!"}</h2>
                    <div className="result-stats">
                      <div className="r-stat"><span className="r-val">{score}/{questions.length}</span><span className="r-lbl">Score</span></div>
                      <div className="r-stat"><span className="r-val">{Math.round((score/questions.length)*100)}%</span><span className="r-lbl">Accuracy</span></div>
                      <div className="r-stat"><span className="r-val">{questions.length-score}</span><span className="r-lbl">Wrong</span></div>
                      <div className="r-stat"><span className="r-val">{formatTime(quizSeconds)}</span><span className="r-lbl">Time Taken</span></div>
                    </div>
                    <div className="result-bar-wrap"><div className="result-bar"><div className="result-fill" style={{width:`${(score/questions.length)*100}%`}}/></div></div>
                  </div>
                  {weakTopics.length > 0 && <div className="alert-box"><AlertCircle size={15}/><div><strong>Weak Topics:</strong> {weakTopics.join(", ")}<p>Revise before exam!</p></div></div>}
                  <div className="result-actions">
                    <button className="outline-btn" onClick={() => { setSubmitted(false); setSelectedAnswers({}); setWeakTopics([]); setCurrentQuestion(0); }}><RotateCcw size={14}/> Review</button>
                    <button className="outline-btn" onClick={() => { setSubmitted(false); setSelectedAnswers({}); setWeakTopics([]); setQuestions([]); setCurrentQuestion(0); }}><RefreshCw size={14}/> New Quiz</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ STUDY PLANNER ══ */}
          {activePage === "planner" && (
            <div className="page">
              <div className="page-header"><h2 className="page-h2">Study Planner</h2><span className="badge-pill"><Clock size={12}/> AI Generated</span></div>
              {!analyzed ? (
                <div className="empty-state glass card"><CalendarDays size={36}/><p>Analyze your materials first to generate a study plan.</p></div>
              ) : (
                <div className="planner-grid">
                  {["Today","Tomorrow","Day 3","Day 4","Day 5"].map((day, i) => (
                    <div key={i} className="glass card planner-card">
                      <div className="planner-day">{day}</div>
                      <div className="planner-topics">
                        {[...frequentTopics, ...topics].slice(i*2, i*2+2).map((t, j) => (
                          <div key={j} className="planner-topic-row"><Circle size={7}/><span>{t}</span></div>
                        ))}
                      </div>
                      <div className="planner-time"><Clock size={11}/> ~{(i+1)*30} min</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ══ ASK AI ══ */}
          {activePage === "askai" && (
            <div className="page chat-page">
              <div className="page-header"><h2 className="page-h2">Ask AI</h2></div>
              <div className="chat-window glass">
                <div className="chat-messages">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`chat-bubble ${msg.role}`}>
                      {msg.role === "ai" && <div className="ai-avatar"><Sparkles size={13}/></div>}
                      <div className="bubble-text">{msg.text}</div>
                    </div>
                  ))}
                  {askLoading && <div className="chat-bubble ai"><div className="ai-avatar"><Sparkles size={13}/></div><div className="bubble-text typing"><span/><span/><span/></div></div>}
                  <div ref={chatEndRef}/>
                </div>
                <div className="chat-suggestions">
                  {["What are the most repeated topics?","Predict questions for my exam","What topics am I missing?","Explain the most important concept"].map((s,i) => (
                    <button key={i} className="sugg-chip" onClick={() => setAskInput(s)}>{s}</button>
                  ))}
                </div>
                <div className="chat-input-row">
                  <input className="chat-input" placeholder="Ask about syllabus, notes, or PYQ patterns..." value={askInput} onChange={e => setAskInput(e.target.value)} onKeyDown={e => e.key==="Enter" && handleAskAI()} disabled={!analyzed}/>
                  <button className="send-btn" onClick={handleAskAI} disabled={askLoading||!askInput.trim()||!analyzed}><Send size={16}/></button>
                </div>
              </div>
            </div>
          )}

          {/* ══ ANALYTICS ══ */}
          {activePage === "analytics" && (
            <div className="page">
              <div className="page-header">
                <h2 className="page-h2">Analytics</h2>
                {sessionHistory.length > 0 && <span className="badge-pill"><History size={12}/> {sessionHistory.length} session{sessionHistory.length!==1?"s":""} tracked</span>}
              </div>
              {!analyzed ? <div className="empty-state glass card"><BarChart2 size={36}/><p>Analyze a document to see analytics.</p></div> : (
                <>
                  <div className="analytics-grid">
                    {(() => {
                      // Previous session = the one logged just before this one (sessionHistory[0] is current)
                      const prevSession = sessionHistory[1];
                      const cards = [
                        { label:"Exam Readiness", val: readinessScore, color:"purple", icon: Trophy, prevVal: prevSession?.readinessScore },
                        { label:"Flashcards",     val: flashcards.length*10, color:"green",  icon: CreditCard, raw: flashcards.length },
                        { label:"Topics Covered", val: topics.length*20, color:"yellow", icon: BookMarked, raw: topics.length, prevVal: prevSession?.topicsFound },
                        { label:"Missing Topics", val: missingTopics.length*20, color:"red", icon: BookX, raw: missingTopics.length },
                      ];
                      return cards.map((s,i) => {
                        const Icon = s.icon;
                        const currentRaw = s.raw !== undefined ? s.raw : s.val;
                        const hasTrend = s.prevVal !== undefined && s.prevVal !== null;
                        const diff = hasTrend ? currentRaw - s.prevVal : 0;
                        return (
                          <div key={i} className="glass card analytics-card">
                            <div className="card-label"><Icon size={13}/> {s.label}</div>
                            <div className="big-num" style={{color: s.color==="purple"?"#7C3AED":s.color==="green"?"#10B981":s.color==="yellow"?"#F59E0B":"#EF4444"}}>{s.raw !== undefined ? s.raw : `${s.val}%`}</div>
                            <div className="analytics-bar"><div className={`analytics-fill ${s.color}`} style={{width:`${Math.min(100,s.val)}%`}}/></div>
                            {hasTrend && diff !== 0 && (
                              <div className={`trend-indicator ${diff > 0 ? "trend-up" : "trend-down"}`}>
                                {diff > 0 ? <ArrowUp size={11}/> : <ArrowDown size={11}/>} {Math.abs(diff)} vs last session
                              </div>
                            )}
                            {hasTrend && diff === 0 && <div className="trend-indicator trend-flat">No change vs last session</div>}
                          </div>
                        );
                      });
                    })()}
                  </div>

                  {sessionHistory.length > 1 && (
                    <div className="glass card" style={{ marginTop: 16 }}>
                      <div className="card-label"><Activity size={13}/> Session History</div>
                      <div className="activity-list">
                        {sessionHistory.slice(0, 8).map((entry, i) => (
                          <div key={i} className="activity-row">
                            <div className="activity-icon"><FileText size={14}/></div>
                            <div className="activity-info">
                              <p className="activity-files">{entry.fileNames?.slice(0,2).join(", ")}{entry.fileCount > 2 ? ` +${entry.fileCount - 2} more` : ""}</p>
                              <p className="activity-meta">{entry.topicsFound} topics{entry.readinessScore !== null && entry.readinessScore !== undefined ? ` · ${entry.readinessScore}% ready` : ""}</p>
                            </div>
                            <span className="activity-time">{new Date(entry.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ══ SETTINGS ══ */}
          {activePage === "settings" && (
            <div className="page">
              <div className="page-header"><h2 className="page-h2">Settings</h2></div>
              <div className="glass card settings-card">
                <div className="setting-row">
                  <div><p className="setting-label">Dark Mode</p><p className="setting-sub">Toggle theme</p></div>
                  <button className={`toggle-switch ${darkMode?"on":""}`} onClick={() => setDarkMode(!darkMode)}><span className="toggle-knob"/></button>
                </div>
                <div className="setting-row">
                  <div><p className="setting-label">Default Quiz Questions</p><p className="setting-sub">Questions per quiz session</p></div>
                  <div className="custom-count">
                    <button className="icon-btn sm" onClick={() => setQuizCount(p=>Math.max(1,p-1))}><Minus size={13}/></button>
                    <span className="count-display">{quizCount}</span>
                    <button className="icon-btn sm" onClick={() => setQuizCount(p=>Math.min(20,p+1))}><Plus size={13}/></button>
                  </div>
                </div>
                <div className="setting-row">
                  <div><p className="setting-label">Sidebar</p><p className="setting-sub">Collapse or expand</p></div>
                  <button className={`toggle-switch ${sidebarOpen?"on":""}`} onClick={() => setSidebarOpen(!sidebarOpen)}><span className="toggle-knob"/></button>
                </div>
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
