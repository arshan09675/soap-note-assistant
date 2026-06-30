import { useState } from 'react';

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
2. NEVER resolve ambiguity silently. If the input is unclear (e.g., a number could be a dose or a measurement, a term could mean two different things), make your best categorization AND add a note to "flags" explaining the ambiguity. Do not just pick one silently.
3. This is a DRAFT for a licensed doctor to review and edit — not a final clinical document. Do not soften this in your output; the doctor reviewing it already knows this from the product UI.
4. Preserve clinical terminology and shorthand the doctor used rather than "translating" it into different terms, unless reorganizing it into the correct SOAP section.
5. If the input contains no usable clinical content at all (e.g., empty, gibberish, completely unrelated to a patient encounter), return all fields as "Not documented", an empty flags array, and confidence "low".
6. Output ONLY the JSON object. No preamble, no markdown code fences, no explanation outside the JSON.

EXAMPLE INPUT:
"pt c/o chest pain x2 days, sharp, worse on inspiration, no SOB, no radiation. bp 128/82 hr 78 afebrile. lungs clear. ekg nsr. likely musculoskeletal, will give ibuprofen 400mg tid, f/u 1wk if not improved"

EXAMPLE OUTPUT:
{
  "subjective": "Patient reports chest pain for 2 days, sharp, worse on inspiration. Denies shortness of breath or radiation.",
  "objective": "Blood pressure: 128/82, Heart rate: 78, Temperature: Afebrile. Lungs: Clear. EKG: Normal sinus rhythm.",
  "assessment": "Chest pain, likely musculoskeletal in origin.",
  "plan": "Ibuprofen 400mg TID. Follow up in 1 week if symptoms do not improve.",
  "flags": [],
  "confidence": "high"
}`;

function App() {
  const [mode, setMode] = useState('typed'); // 'typed' or 'voice'
  const [noteText, setNoteText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [soapNote, setSoapNote] = useState(null);

  const placeholderText = mode === 'typed' 
    ? "e.g. pt c/o chest pain x2 days, sharp, worse on inspiration..." 
    : "Paste transcribed speech here...";

  const labelText = mode === 'typed' 
    ? "Clinical Typed Notes" 
    : "Voice Transcript Content";

  const generateSoapNote = async (rawInput) => {
    if (!rawInput.trim()) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: rawInput,
            }
          ]
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // Extract the text block from the Claude messages response structure
      const responseText = data.content?.[0]?.text || '';
      if (!responseText) {
        throw new Error('No content returned from the generation assistant.');
      }
      
      // Strip markdown code fences if present (e.g. ```json ... ```)
      const cleanJsonText = responseText.replace(/```json\s*|```/g, '').trim();
      
      // Parse the JSON
      const soapObject = JSON.parse(cleanJsonText);
      
      // Validate that all expected fields are present
      const requiredFields = ['subjective', 'objective', 'assessment', 'plan', 'flags', 'confidence'];
      const missingFields = requiredFields.filter(field => !(field in soapObject));
      if (missingFields.length > 0) {
        console.warn('API response missing fields:', missingFields);
      }

      // Store in state
      setSoapNote(soapObject);
      
      // Log for verification
      console.log('Successfully generated and parsed SOAP note:', soapObject);
      
    } catch (err) {
      console.error('SOAP generation failed:', err);
      setError(err.message || 'Failed to generate or parse the SOAP note. Please check your input and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateField = (field, value) => {
    setSoapNote(prev => prev ? { ...prev, [field]: value } : null);
  };

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-start bg-slate-950 text-slate-100 overflow-y-auto font-sans p-4 sm:p-8">
      {/* Decorative background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-3xl space-y-8">
        
        {/* Card: Input Section */}
        <div className="p-6 sm:p-8 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl">
          {/* Header */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center justify-center w-12 h-12 mb-4 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 text-white shadow-lg shadow-indigo-500/20">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 via-purple-200 to-pink-200">
              SOAP Note Assistant
            </h1>
            <p className="mt-1 text-slate-400 text-xs">
              Generate structured medical notes from raw text or transcripts.
            </p>
          </div>

          {/* Form */}
          <div className="space-y-6">
            {/* Mode Toggle */}
            <div>
              <span className="block text-xs font-semibold text-slate-450 uppercase tracking-wider mb-2">Input Mode</span>
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1.5 rounded-xl border border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setMode('typed')}
                  disabled={isLoading}
                  className={`py-2 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    mode === 'typed'
                      ? 'bg-slate-800 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Typed Notes
                </button>
                <button
                  type="button"
                  onClick={() => setMode('voice')}
                  disabled={isLoading}
                  className={`py-2 px-4 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    mode === 'voice'
                      ? 'bg-slate-800 text-white shadow'
                      : 'text-slate-400 hover:text-slate-205'
                  }`}
                >
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
                <span className="text-xs text-slate-500">
                  {noteText.length} characters
                </span>
              </div>
              <textarea
                id="clinical-notes"
                rows={8}
                disabled={isLoading}
                className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-505 transition-all duration-200 resize-y disabled:opacity-60"
                placeholder={placeholderText}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
              />
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-200 rounded-xl text-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 animate-fade-in">
                <span>{error}</span>
                <button
                  onClick={() => generateSoapNote(noteText)}
                  className="text-xs font-bold text-rose-300 hover:text-rose-200 transition-colors shrink-0"
                >
                  Try Again
                </button>
              </div>
            )}

            {/* Generate Button */}
            <button
              type="button"
              onClick={() => generateSoapNote(noteText)}
              disabled={isLoading || !noteText.trim()}
              className="w-full py-3.5 px-6 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-lg shadow-indigo-500/10 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Generating...' : 'Generate SOAP Note'}
            </button>
          </div>
        </div>

        {/* Card: Output Sections */}
        {soapNote && (
          <div className="p-6 sm:p-8 bg-slate-900/60 backdrop-blur-md rounded-2xl border border-slate-800 shadow-2xl space-y-6 animate-fade-in">
            <div className="border-b border-slate-800 pb-4 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-slate-100">Generated SOAP Note</h2>
                <p className="text-xs text-slate-400 mt-1">Review and refine clinical documentation sections.</p>
              </div>
              
              {/* Confidence Badge */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Confidence:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase border ${
                  soapNote.confidence === 'high'
                    ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                    : soapNote.confidence === 'medium'
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                }`}>
                  {soapNote.confidence || 'unknown'}
                </span>
              </div>
            </div>

            {/* SOAP Fields */}
            <div className="space-y-4">
              {/* Subjective */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                  Subjective
                </label>
                <textarea
                  rows={4}
                  value={soapNote.subjective || ''}
                  onChange={(e) => handleUpdateField('subjective', e.target.value)}
                  className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-505 transition-all duration-200 resize-y font-sans"
                />
              </div>

              {/* Objective */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                  Objective
                </label>
                <textarea
                  rows={4}
                  value={soapNote.objective || ''}
                  onChange={(e) => handleUpdateField('objective', e.target.value)}
                  className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-505 transition-all duration-200 resize-y font-sans"
                />
              </div>

              {/* Assessment */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                  Assessment
                </label>
                <textarea
                  rows={4}
                  value={soapNote.assessment || ''}
                  onChange={(e) => handleUpdateField('assessment', e.target.value)}
                  className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-505 transition-all duration-200 resize-y font-sans"
                />
              </div>

              {/* Plan */}
              <div className="space-y-2">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block">
                  Plan
                </label>
                <textarea
                  rows={4}
                  value={soapNote.plan || ''}
                  onChange={(e) => handleUpdateField('plan', e.target.value)}
                  className="w-full p-4 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-505 transition-all duration-200 resize-y font-sans"
                />
              </div>
            </div>

            {/* Flags/Ambiguities alert */}
            {soapNote.flags && soapNote.flags.length > 0 && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-300 font-semibold text-sm">
                  <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>Attention / Ambiguities Flags</span>
                </div>
                <ul className="list-disc pl-5 text-xs text-amber-200/90 space-y-1">
                  {soapNote.flags.map((flag, idx) => (
                    <li key={idx}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}

export default App;
