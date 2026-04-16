require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/* ── SUPABASE ── */
const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)
  : null;

/* ── GET CHAT HISTORY ── */
app.get('/api/history', async (req, res) => {
  if (!supabase) return res.json({ messages: [], debug: 'no supabase client' });
  const { data, error } = await supabase
    .from('teddy_messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return res.json({ messages: [], debug: error.message });
  res.json({ messages: data || [] });
});

/* ── SAVE MESSAGE ── */
app.post('/api/history', async (req, res) => {
  if (!supabase) return res.json({ ok: false, debug: 'no supabase client' });
  const { role, content } = req.body;
  const { error } = await supabase.from('teddy_messages').insert({ role, content });
  if (error) return res.json({ ok: false, debug: error.message });
  res.json({ ok: true });
});

/* ── CLEAR HISTORY ── */
app.delete('/api/history', async (req, res) => {
  if (!supabase) return res.json({ ok: true });
  const { error } = await supabase.from('teddy_messages').delete().neq('id', 0);
  if (error) return res.json({ ok: false, debug: error.message });
  res.json({ ok: true });
});

/* ── TEDDY SYSTEM PROMPT — reads from master agent MD file ── */
function loadSystemPrompt() {
  try {
    const mdPath = path.join(__dirname, 'the-victory-co-master-agent.md');
    const md = fs.readFileSync(mdPath, 'utf8');
    return md + '\n\nYou are Teddy. Run the empire. When activating a sub-agent, clearly label your response with [Agent Name].';
  } catch (e) {
    console.warn('Could not read master agent MD, using fallback.');
    return 'You are Teddy, the Master Commander Agent for The Victory Co. Limited. Run the empire.';
  }
}

/* ── PASSWORD CHECK ── */
const DASHBOARD_PASSWORD = (process.env.PASSWORD || 'victory').trim();
app.post('/api/auth', (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ ok: false });
  if (password.trim() === DASHBOARD_PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false });
  }
});

/* ── CHAT ENDPOINT ── */
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid messages' });
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: loadSystemPrompt(),
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    });

    const text = response.content[0]?.text || 'No response from Teddy.';
    res.json({ text });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: 'Teddy encountered an error: ' + err.message });
  }
});

// Local dev
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`\n🟢 Victory Co. Command Centre`);
    console.log(`   Teddy is online at http://localhost:${PORT}\n`);
  });
}

// Vercel export
module.exports = app;
