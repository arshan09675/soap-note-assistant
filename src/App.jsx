import { useState, useRef, useEffect } from 'react';

/* ─── System Prompt ─── */
const SYSTEM_PROMPT = `You are a clinical documentation assistant. Your only task is to convert a doctor's raw input (typed shorthand notes or a voice transcript) into a structured SOAP note.

INPUT: You will receive raw clinical notes. These may be in shorthand, sentence fragments, transcribed speech, or any mix of these. The input may be incomplete or ambiguous.

OUTPUT: Return ONLY a valid JSON object with this exact structure, nothing else:

{
  "subjective": "string",
  "objective": "string",
  "assessment": "string",
  "plan": "string",
  "flags": ["string"],
  "confidence": "high | medium | low"
}

FIELD DEFINITIONS:
- subjective: Patient-reported symptoms, history, and complaints, in the patient's own framing where possible.
- objective: Observable/measurable findings only — vitals, exam findings, test results. Do NOT include anything not explicitly stated in the input.
- assessment: Synthesis of the above, including differential considerations IF the doctor's input already suggests them. Do not introduce a diagnosis the doctor did not state or clearly imply.
- plan: Next steps, treatments, follow-up, AS STATED OR CLEARLY IMPLIED by the input. Do not add treatment recommendations the doctor did not mention.
- flags: A list of any ambiguities, missing information, or places where you made a judgment call about how to categorize something. If the input was clear and complete, return an empty array.
- confidence: Your own assessment of how complete and unambiguous the input was. "low" if you had to infer significant structure or content.

CRITICAL RULES:
1. NEVER invent clinical information — no symptoms, findings, diagnoses, drug names, dosages, or recommendations that are not present in the input. If a SOAP section has no relevant input, write "Not documented" rather than inferring or filling in plausible-sounding content.
2. NEVER resolve ambiguity silently. If the input is unclear, make your best categorization AND add a note to "flags" explaining the ambiguity.
3. This is a DRAFT for a licensed doctor to review and edit — not a final clinical document.
4. Preserve clinical terminology and shorthand the doctor used rather than "translating" it into different terms, unless reorganizing it into the correct SOAP section.
5. If the input contains no usable clinical content at all, return all fields as "Not documented", an empty flags array, and confidence "low".
6. Output ONLY the JSON object. No preamble, no markdown code fences, no explanation outside the JSON.`;

/* ─── SOAP Section Metadata ─── */
const SOAP_SECTIONS = [
  {
    key: 'subjective',
    label: 'Subjective',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
    color: 'indigo',
  },
  {
    key: 'objective',
    label: 'Objective',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    color: 'cyan',
  },
  {
    key: 'assessment',
    label: 'Assessment',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    color: 'purple',
  },
  {
    key: 'plan',
    label: 'Plan',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
    color: 'emerald',
  },
];

/* ─── Color Map ─── */
const colorMap = {
  indigo: {
    bg: 'bg-indigo-500/10',
    border: 'border-indigo-500/20',
    text: 'text-indigo-400',
    ring: 'focus:ring-indigo-500/40',
  },
  cyan: {
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/20',
    text: 'text-cyan-400',
    ring: 'focus:ring-cyan-500/40',
  },
  purple: {
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    text: 'text-purple-400',
    ring: 'focus:ring-purple-500/40',
  },
  emerald: {
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    ring: 'focus:ring-emerald-500/40',
  },
};

/* ─── Spinner Component ─── */
function Spinner() {
  return (
    <svg className="w-5 h-5 animate-spin-slow" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

/* ─── Copy Button ─── */
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
      title="Copy to clipboard"
    >
      {copied ? (
        <>
          <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

/* ─── Main App ─── */
function App() {
  const [mode, setMode] = useState('typed');
  const [noteText, setNoteText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [soapNote, setSoapNote] = useState(null);
  const outputRef = useRef(null);

  // Scroll to output when generated
  useEffect(() => {
    if (soapNote && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [soapNote]);

  const placeholderText =
    mode === 'typed'
      ? 'e.g. pt c/o chest pain x2 days, sharp, worse on inspiration, no SOB, no radiation. bp 128/82 hr 78 afebrile. lungs clear. ekg nsr. likely musculoskeletal, will give ibuprofen 400mg tid, f/u 1wk if not improved'
      : 'Paste transcribed speech here, e.g. from a recorded patient encounter...';

  const labelText = mode === 'typed' ? 'Clinical Typed Notes' : 'Voice Transcript Content';

  /* ─── Generate SOAP Note ─── */
  const generateSoapNote = async (rawInput) => {
    if (!rawInput.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: rawInput }],
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error || `API error: ${response.status}`);
      }

      const responseText = data.content?.[0]?.text || '';
      if (!responseText) {
        throw new Error('No content returned from the AI assistant.');
      }

      // Strip markdown code fences if present
      const cleanJsonText = responseText.replace(/```json\s*|```/g, '').trim();
      const soapObject = JSON.parse(cleanJsonText);

      // Validate fields
      const requiredFields = ['subjective', 'objective', 'assessment', 'plan', 'flags', 'confidence'];
      const missingFields = requiredFields.filter((field) => !(field in soapObject));
      if (missingFields.length > 0) {
        console.warn('API response missing fields:', missingFields);
      }

      setSoapNote(soapObject);
    } catch (err) {
      console.error('SOAP generation failed:', err);
      setError(err.message || 'Failed to generate the SOAP note. Please check your input and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateField = (field, value) => {
    setSoapNote((prev) => (prev ? { ...prev, [field]: value } : null));
  };

  const handleCopyAll = () => {
    if (!soapNote) return;
    const text = SOAP_SECTIONS.map(
      (s) => `${s.label.toUpperCase()}\n${soapNote[s.key] || 'Not documented'}`
    ).join('\n\n');
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const handleReset = () => {
    setSoapNote(null);
    setNoteText('');
    setError(null);
  };

  /* ─── Render ─── */
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-start bg-slate-950 text-slate-100 overflow-y-auto p-4 sm:p-8">
      {/* Decorative background glows */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-indigo-600/[0.07] rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[500px] h-[500px] bg-purple-600/[0.05] rounded-full blur-[100px] pointer-events-none" />
      <div className="fixed top-1/2 left-0 w-[400px] h-[400px] bg-cyan-600/[0.04] rounded-full blur-[100px] pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-3xl space-y-6">

        {/* ─── Header ─── */}
        <div className="flex flex-col items-center pt-4 pb-2 animate-fade-in">
          <div className="flex items-center justify-center w-14 h-14 mb-4 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white shadow-xl shadow-indigo-500/20">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 via-purple-200 to-pink-200">
            SOAP Note Assistant
          </h1>
          <p className="mt-2 text-slate-400 text-sm text-center max-w-md">
            AI-powered clinical documentation. Convert raw notes or voice transcripts into structured SOAP notes.
          </p>
        </div>

        {/* ─── Input Card ─── */}
        <div className="glass-card rounded-2xl p-6 sm:p-8 animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <div className="space-y-6">

            {/* Mode Toggle */}
            <div>
              <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Input Mode
              </span>
              <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800/80">
                <button
                  type="button"
                  id="mode-typed"
                  onClick={() => setMode('typed')}
                  disabled={isLoading}
                  className={`py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    mode === 'typed'
                      ? 'bg-slate-800 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Typed Notes
                </button>
                <button
                  type="button"
                  id="mode-voice"
                  onClick={() => setMode('voice')}
                  disabled={isLoading}
                  className={`py-2.5 px-4 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    mode === 'voice'
                      ? 'bg-slate-800 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  Voice Transcript
                </button>
              </div>
            </div>

            {/* Note Input */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label htmlFor="clinical-notes" className="text-sm font-medium text-slate-300">
                  {labelText}
                </label>
                <span className="text-xs text-slate-500 tabular-nums">
                  {noteText.length} characters
                </span>
              </div>
              <textarea
                id="clinical-notes"
                rows={8}
                disabled={isLoading}
                className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/50 transition-all duration-200 resize-y disabled:opacity-50 text-sm leading-relaxed"
                placeholder={placeholderText}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-200 rounded-xl text-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 animate-fade-in">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 mt-0.5 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{error}</span>
                </div>
                <button
                  onClick={() => generateSoapNote(noteText)}
                  className="text-xs font-bold text-rose-300 hover:text-rose-100 transition-colors shrink-0 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Generate Button */}
            <button
              type="button"
              id="generate-soap-btn"
              onClick={() => generateSoapNote(noteText)}
              disabled={isLoading || !noteText.trim()}
              className="w-full py-3.5 px-6 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_100%] hover:bg-[position:100%_0] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-lg shadow-indigo-500/15 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Spinner />
                  Generating SOAP Note...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate SOAP Note
                </>
              )}
            </button>
          </div>
        </div>

        {/* Loading Shimmer Skeleton */}
        {isLoading && (
          <div className="glass-card rounded-2xl p-6 sm:p-8 space-y-5 animate-fade-in">
            <div className="h-6 w-48 rounded-lg animate-shimmer" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-24 rounded animate-shimmer" />
                <div className="h-20 w-full rounded-xl animate-shimmer" />
              </div>
            ))}
          </div>
        )}

        {/* ─── Output Card ─── */}
        {soapNote && !isLoading && (
          <div
            ref={outputRef}
            className="glass-card rounded-2xl p-6 sm:p-8 space-y-6 animate-slide-up"
          >
            {/* Output Header */}
            <div className="border-b border-slate-800 pb-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Generated SOAP Note
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Review and refine each section. All fields are editable.
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* Confidence Badge */}
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${
                      soapNote.confidence === 'high'
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                        : soapNote.confidence === 'medium'
                        ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    }`}
                  >
                    {soapNote.confidence || 'unknown'}
                  </span>
                </div>

                {/* Action buttons */}
                <button
                  onClick={handleCopyAll}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-800/50 flex items-center gap-1.5"
                  title="Copy all sections"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy All
                </button>
                <button
                  onClick={handleReset}
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-800/50 flex items-center gap-1.5"
                  title="Start over"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Reset
                </button>
              </div>
            </div>

            {/* SOAP Fields */}
            <div className="space-y-4">
              {SOAP_SECTIONS.map((section, idx) => {
                const colors = colorMap[section.color];
                return (
                  <div
                    key={section.key}
                    className={`animate-fade-in stagger-${idx + 1} space-y-2`}
                  >
                    <div className="flex items-center justify-between">
                      <label
                        className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${colors.text}`}
                      >
                        <span className={`p-1 rounded-md ${colors.bg}`}>{section.icon}</span>
                        {section.label}
                      </label>
                      <CopyButton text={soapNote[section.key] || ''} />
                    </div>
                    <textarea
                      rows={4}
                      value={soapNote[section.key] || ''}
                      onChange={(e) => handleUpdateField(section.key, e.target.value)}
                      className={`w-full p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-slate-200 focus:outline-none focus:ring-2 ${colors.ring} focus:border-transparent transition-all duration-200 resize-y text-sm leading-relaxed`}
                    />
                  </div>
                );
              })}
            </div>

            {/* Flags/Ambiguities alert */}
            {soapNote.flags && soapNote.flags.length > 0 && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3 animate-fade-in stagger-5">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <svg className="w-5 h-5 animate-pulse-glow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Attention — Flags &amp; Ambiguities</span>
                </div>
                <ul className="space-y-1.5">
                  {soapNote.flags.map((flag, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-amber-200/90">
                      <span className="text-amber-400 mt-1 shrink-0">•</span>
                      <span>{flag}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-xs text-slate-600 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <p>SOAP Note Assistant — For clinical documentation assistance only.</p>
          <p className="mt-1">Generated notes are drafts and must be reviewed by a licensed clinician.</p>
        </div>
      </div>
    </div>
  );
}

export default App;
