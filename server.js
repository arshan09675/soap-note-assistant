import express from 'express';
import cors from 'cors';
import { existsSync, readFileSync } from 'node:fs';

const app = express();
const PORT = Number(process.env.PORT) || 3001;

function loadLocalEnv() {
  const envUrl = new URL('.env', import.meta.url);

  if (!existsSync(envUrl)) {
    return;
  }

  const envText = readFileSync(envUrl, 'utf8');

  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadLocalEnv();

const API_KEY = process.env.VITE_GROQ_API_KEY || process.env.GROQ_API_KEY;
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.post('/api/generate', async (req, res) => {
  const { model, system, messages, max_tokens } = req.body;

  if (!API_KEY || API_KEY === 'your-api-key-here') {
    return res.status(500).json({
      error: 'Server is missing VITE_GROQ_API_KEY. Add it to .env and restart the server.',
    });
  }

  if (!system || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({
      error: 'Missing required request fields: system and messages.',
    });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: system },
          ...messages.map((message) => ({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content: String(message.content || ''),
          })),
        ],
        max_completion_tokens: max_tokens || 1024,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || `Groq API error: ${response.status}`,
      });
    }

    const text = data?.choices?.[0]?.message?.content?.trim();

    if (!text) {
      return res.status(502).json({
        error: 'Groq returned no text content.',
      });
    }

    return res.json({
      content: [{ type: 'text', text }],
      raw: data,
    });
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ error: 'Failed to connect to Groq API.' });
  }
});

app.listen(PORT, () => {
  console.log(`\n  SOAP Note proxy server running at http://localhost:${PORT}`);
  console.log(
    API_KEY && API_KEY !== 'your-api-key-here'
      ? '  Groq API key loaded from server environment.\n'
      : '  VITE_GROQ_API_KEY is not configured yet.\n',
  );
});
