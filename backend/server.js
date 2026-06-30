require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const Anthropic = require("@anthropic-ai/sdk");
const mammoth = require("mammoth");
const AdmZip = require("adm-zip");

const app = express();
app.use(cors());
app.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync("uploads/")) fs.mkdirSync("uploads/");
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + "_" + Math.random().toString(36).slice(2) + ext);
  }
});

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });
const ai = new Anthropic.Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

const CODE_EXTENSIONS = [".py", ".java", ".c", ".cpp", ".js", ".ts", ".html", ".css", ".sql", ".json", ".xml"];

// ─── PARSERS ───
async function parsePDF(filePath) {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return data.text;
}

async function parseWord(filePath) {
  const buffer = fs.readFileSync(filePath);
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

async function parsePPT(filePath, ext) {
  if (ext === ".pptx") {
    try {
      const zip = new AdmZip(filePath);
      const entries = zip.getEntries();
      let text = "";
      entries.forEach(entry => {
        if (entry.entryName.match(/ppt\/slides\/slide\d+\.xml/)) {
          const xml = entry.getData().toString("utf-8");
          const matches = xml.match(/<a:t[^>]*>([^<]+)<\/a:t>/g);
          if (matches) matches.forEach(m => { const t = m.replace(/<[^>]+>/g, "").trim(); if (t) text += t + " "; });
        }
      });
      return text || "No text found in presentation";
    } catch (e) { return "Could not parse PPTX: " + e.message; }
  }
  return "Old .ppt format. Please save as .pptx.";
}

async function parseImage(filePath, ext) {
  const imageBuffer = fs.readFileSync(filePath);
  const base64 = imageBuffer.toString("base64");
  const mediaTypeMap = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".bmp": "image/png", ".tiff": "image/png" };
  const mediaType = mediaTypeMap[ext] || "image/jpeg";
  const response = await ai.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [{ role: "user", content: [
      { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
      { type: "text", text: "This image contains study material or exam paper. Carefully read and transcribe ALL text you can see including handwritten notes, printed text, questions, diagrams labels, formulas, and any visible content. Return everything." }
    ]}]
  });
  return response.content[0].text;
}

async function parseExcel(filePath, ext) {
  if (ext === ".csv") return fs.readFileSync(filePath, "utf-8");
  try {
    const XLSX = require("xlsx");
    const workbook = XLSX.readFile(filePath);
    let text = "";
    workbook.SheetNames.forEach(name => { text += `Sheet: ${name}\n`; text += XLSX.utils.sheet_to_csv(workbook.Sheets[name]) + "\n\n"; });
    return text;
  } catch (e) { return "Could not parse Excel: " + e.message; }
}

async function parseZip(filePath) {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();
  let combinedText = "";
  let processed = 0;
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const entryExt = path.extname(entry.entryName).toLowerCase();
    const tempPath = `uploads/${Date.now()}_${entry.name}`;
    try {
      fs.writeFileSync(tempPath, entry.getData());
      const text = await extractTextFromFile(tempPath, entry.name);
      combinedText += `\n\n--- ${entry.name} ---\n${text}`;
      processed++;
      try { fs.unlinkSync(tempPath); } catch (e) {}
    } catch (e) { console.log("Skip zip entry:", entry.name); }
    if (processed >= 5) break;
  }
  return combinedText || "No readable files in ZIP";
}

async function extractTextFromFile(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  console.log(`  📂 [${ext}]: ${originalName}`);
  if (ext === ".pdf") return await parsePDF(filePath);
  if ([".docx", ".doc", ".rtf"].includes(ext)) return await parseWord(filePath);
  if ([".pptx", ".ppt"].includes(ext)) return await parsePPT(filePath, ext);
  if ([".xlsx", ".xls", ".csv"].includes(ext)) return await parseExcel(filePath, ext);
  if ([".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"].includes(ext)) return await parseImage(filePath, ext);
  if ([".txt", ".md"].includes(ext)) return fs.readFileSync(filePath, "utf-8");
  if (CODE_EXTENSIONS.includes(ext)) return `[CODE - ${ext}]\n${fs.readFileSync(filePath, "utf-8")}`;
  if (ext === ".zip") return await parseZip(filePath);
  throw new Error(`Unsupported: ${ext}`);
}

// ─── MULTI-SOURCE PROMPT ───
function buildExamStrategyPrompt(syllabusText, notesText, pyqText, quizCount) {
  return `You are an expert AI exam preparation coach. You have been given THREE sources of information about a student's exam subject. Analyze ALL THREE carefully and respond in EXACTLY this format with no asterisks, no bold, no markdown symbols:

KEY TOPICS:
1. Most important topic from syllabus+notes+PYQs
2. Second most important topic
3. Third most important topic
4. Fourth most important topic
5. Fifth most important topic

QUIZ QUESTIONS:
Generate exactly ${quizCount} questions based on frequently asked PYQ patterns:

Q1. Question based on most repeated PYQ topic?
A) Option
B) Option
C) Option
D) Option
Answer: A

Q2. Question?
A) Option
B) Option
C) Option
D) Option
Answer: B

Q3. Question?
A) Option
B) Option
C) Option
D) Option
Answer: C

Q4. Question?
A) Option
B) Option
C) Option
D) Option
Answer: A

Q5. Question?
A) Option
B) Option
C) Option
D) Option
Answer: D

SUMMARY:
Write a 5-6 line summary combining insights from syllabus, notes, and previous year papers.

FLASHCARDS:
CARD1_Q: Key concept from most repeated PYQ topic?
CARD1_A: Clear concise answer.
CARD2_Q: Important definition from notes?
CARD2_A: Clear concise answer.
CARD3_Q: Frequently asked concept?
CARD3_A: Clear concise answer.
CARD4_Q: Important formula or algorithm?
CARD4_A: Clear concise answer.
CARD5_Q: Predicted exam question topic?
CARD5_A: Clear concise answer.

MINDMAP:
MAIN: Subject main topic
NODE1: First major unit from syllabus
SUB1A: Key subtopic
SUB1B: Another subtopic
NODE2: Second major unit
SUB2A: Key subtopic
SUB2B: Another subtopic
NODE3: Third major unit
SUB3A: Key subtopic
SUB3B: Another subtopic

FREQUENTLY ASKED:
1. Topic name - appeared X times in PYQs
2. Topic name - appeared X times in PYQs
3. Topic name - appeared X times in PYQs
4. Topic name - appeared X times in PYQs
5. Topic name - appeared X times in PYQs

PREDICTED QUESTIONS:
1. Write a predicted exam question likely to appear based on PYQ patterns
2. Write another predicted exam question
3. Write another predicted exam question
4. Write another predicted exam question
5. Write another predicted exam question

MISSING TOPICS:
1. Topic present in syllabus but NOT covered in notes
2. Another missing topic
3. Another missing topic

PYQ ANALYSIS:
Base every line below ONLY on what is actually present in the uploaded syllabus, notes, and previous year papers. Do not invent numbers. If the previous year papers do not contain enough information for a field, write "Not enough data in uploaded papers" for that field instead of guessing.

REPEATED_TOPIC: Topic name | Times seen: N or "unclear" | Units: unit name(s) if identifiable
REPEATED_TOPIC: Topic name | Times seen: N or "unclear" | Units: unit name(s) if identifiable
REPEATED_TOPIC: Topic name | Times seen: N or "unclear" | Units: unit name(s) if identifiable

UNIT_QUESTIONS: Unit/Chapter name | Question count: N or "unclear from papers"
UNIT_QUESTIONS: Unit/Chapter name | Question count: N or "unclear from papers"
UNIT_QUESTIONS: Unit/Chapter name | Question count: N or "unclear from papers"

MARKS_DISTRIBUTION: Topic or unit name | Estimated marks: N or "not stated in papers"
MARKS_DISTRIBUTION: Topic or unit name | Estimated marks: N or "not stated in papers"
MARKS_DISTRIBUTION: Topic or unit name | Estimated marks: N or "not stated in papers"

HIGH_PROBABILITY: Topic name | Reason: short factual reason drawn from the documents (e.g. "appeared in 3 of 4 uploaded papers") | Confidence: High, Medium, or Low
HIGH_PROBABILITY: Topic name | Reason: short factual reason | Confidence: High, Medium, or Low
HIGH_PROBABILITY: Topic name | Reason: short factual reason | Confidence: High, Medium, or Low

DATA_QUALITY: One honest sentence stating how many PYQ files/years were actually provided and whether that is enough to trust this analysis.

PYQ_NARRATIVE:
Write 2-3 plain-language lines summarizing the overall pattern, written for a student to read directly.

EXAM READINESS:
Score: Give a percentage score (0-100) based on how well the notes cover the syllabus and PYQs
Strengths: List 2-3 strong areas
Gaps: List 2-3 areas needing more study

=== SYLLABUS ===
${(syllabusText || "No syllabus provided").slice(0, 2000)}

=== NOTES ===
${(notesText || "No notes provided").slice(0, 2000)}

=== PREVIOUS YEAR PAPERS ===
${(pyqText || "No previous year papers provided").slice(0, 2000)}`;
}

// ─── STANDARD PROMPT (when only notes uploaded) ───
function buildStandardPrompt(text, quizCount) {
  return `You are a study assistant. Analyze this study material and respond in EXACTLY this format with no asterisks, no bold, no markdown symbols:

KEY TOPICS:
1. Topic one
2. Topic two
3. Topic three
4. Topic four
5. Topic five

QUIZ QUESTIONS:
Generate exactly ${quizCount} questions:

Q1. Question?
A) Option
B) Option
C) Option
D) Option
Answer: A

Q2. Question?
A) Option
B) Option
C) Option
D) Option
Answer: B

Q3. Question?
A) Option
B) Option
C) Option
D) Option
Answer: C

Q4. Question?
A) Option
B) Option
C) Option
D) Option
Answer: A

Q5. Question?
A) Option
B) Option
C) Option
D) Option
Answer: D

SUMMARY:
Write a clear 5-6 line summary of the entire study material here.

FLASHCARDS:
CARD1_Q: Question about topic 1?
CARD1_A: Answer to topic 1.
CARD2_Q: Question about topic 2?
CARD2_A: Answer to topic 2.
CARD3_Q: Question about topic 3?
CARD3_A: Answer to topic 3.
CARD4_Q: Question about topic 4?
CARD4_A: Answer to topic 4.
CARD5_Q: Question about topic 5?
CARD5_A: Answer to topic 5.

MINDMAP:
MAIN: Main subject of the material
NODE1: First major topic
SUB1A: Subtopic of first topic
SUB1B: Another subtopic
NODE2: Second major topic
SUB2A: Subtopic of second topic
SUB2B: Another subtopic
NODE3: Third major topic
SUB3A: Subtopic of third topic
SUB3B: Another subtopic

FREQUENTLY ASKED:
1. Key topic 1 - core concept
2. Key topic 2 - core concept
3. Key topic 3 - core concept
4. Key topic 4 - core concept
5. Key topic 5 - core concept

PREDICTED QUESTIONS:
1. Predicted exam question based on important topics
2. Another predicted question
3. Another predicted question
4. Another predicted question
5. Another predicted question

MISSING TOPICS:
1. Topic that needs more coverage
2. Another area to study
3. Another area to study

PYQ ANALYSIS:
No previous year papers provided. Analysis based on notes content only.

EXAM READINESS:
Score: 50
Strengths: Good note coverage on main topics
Gaps: No PYQ analysis available, no syllabus cross-reference

Study Material:
${text.slice(0, 5000)}`;
}

// ─── UPLOAD ROUTE ───
app.post("/upload", (req, res) => {
  console.log("\n📥 Upload request received!");

  upload.fields([
    { name: "syllabus", maxCount: 10 },
    { name: "notes", maxCount: 5 },
    { name: "pyq", maxCount: 10 },
    { name: "file", maxCount: 10 }  // legacy support
  ])(req, res, async (err) => {
    if (err) return res.status(500).json({ success: false, message: err.message });

    const quizCount = parseInt(req.body?.quizCount) || 5;

    // Extract text from each source
    async function processFiles(files, label) {
      if (!files || files.length === 0) return "";
      let combined = "";
      for (const file of files) {
        try {
          const text = await extractTextFromFile(file.path, file.originalname);
          combined += `\n--- ${file.originalname} ---\n${text}`;
          console.log(`  ✅ ${label}: ${file.originalname}`);
        } catch (e) {
          console.log(`  ❌ ${label} failed: ${file.originalname} - ${e.message}`);
        } finally {
          try { fs.unlinkSync(file.path); } catch (e) {}
        }
      }
      return combined;
    }

    const syllabusFiles = req.files?.syllabus || [];
    const notesFiles = req.files?.notes || [];
    const pyqFiles = req.files?.pyq || [];
    const legacyFiles = req.files?.file || [];

    // Legacy single-file support
    if (legacyFiles.length > 0 && syllabusFiles.length === 0 && notesFiles.length === 0 && pyqFiles.length === 0) {
      console.log("📄 Legacy mode: single file upload");
      let combinedText = await processFiles(legacyFiles, "file");
      if (!combinedText.trim()) return res.status(400).json({ success: false, message: "Could not extract text from file" });
      const prompt = buildStandardPrompt(combinedText, quizCount);
      try {
        const response = await ai.messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 3000, messages: [{ role: "user", content: prompt }] });
        console.log("✅ Claude AI responded!");
        return res.json({ success: true, analysis: response.content[0].text, mode: "standard" });
      } catch (e) {
        return res.status(500).json({ success: false, message: e.message });
      }
    }

    // Multi-source exam strategy mode
    console.log(`📊 Exam Strategy Mode: ${syllabusFiles.length} syllabus, ${notesFiles.length} notes, ${pyqFiles.length} PYQ files`);

    const [syllabusText, notesText, pyqText] = await Promise.all([
      processFiles(syllabusFiles, "Syllabus"),
      processFiles(notesFiles, "Notes"),
      processFiles(pyqFiles, "PYQ"),
    ]);

    if (!syllabusText && !notesText && !pyqText) {
      return res.status(400).json({ success: false, message: "No text could be extracted from uploaded files" });
    }

    console.log("🤖 Sending to Claude AI...");
    const prompt = buildExamStrategyPrompt(syllabusText, notesText, pyqText, quizCount);

    try {
      const response = await ai.messages.create({ model: "claude-haiku-4-5-20251001", max_tokens: 3800, messages: [{ role: "user", content: prompt }] });
      console.log("✅ Claude AI responded!");
      res.json({
        success: true,
        analysis: response.content[0].text,
        mode: "exam-strategy",
        sources: { syllabus: syllabusFiles.length, notes: notesFiles.length, pyq: pyqFiles.length }
      });
    } catch (e) {
      console.log("❌ AI Error:", e.message);
      res.status(500).json({ success: false, message: e.message });
    }
  });
});

// ─── ASK AI ───
app.post("/ask", async (req, res) => {
  const { question, context } = req.body;
  if (!question) return res.status(400).json({ success: false, message: "No question" });
  try {
    const response = await ai.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: `You are an expert study assistant with access to the student's syllabus, notes, and previous year papers. Answer this question clearly and concisely.

Context from uploaded materials:
${context || "No context provided"}

Student Question: ${question}

Give a helpful answer in 3-5 sentences. If relevant, mention if this topic has appeared in previous year papers.` }]
    });
    res.json({ success: true, answer: response.content[0].text });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📂 Supported: PDF, DOCX, PPTX, XLSX, CSV, TXT, MD, PNG, JPG, ZIP`);
  console.log(`🎯 Modes: Exam Strategy (syllabus+notes+PYQ) | Standard (notes only)`);
});