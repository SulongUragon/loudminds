require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

app.get('/logo.jpg', (req, res) => {
  res.setHeader('Content-Type', 'image/jpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  fs.createReadStream(path.join(__dirname, 'logo.jpg')).pipe(res);
});

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const pillarContext = {
  'The Hunt': 'How narcissists identify, target, and trap overthinkers. Warning signs, patterns, the selection process.',
  'The Trap': 'Psychological tactics inside narcissistic relationships — love bombing, silent treatment, gaslighting, trauma bonding.',
  'The 3am Mind': 'Raw, intimate content about what it feels like to be an overthinker in a narc relationship. Late night thoughts, replaying conversations.',
  'The Awakening': 'The moment of clarity — when you finally see the pattern. The turning point. Realizing it was never your fault.',
  'The Survival': 'Healing, recovery, reclaiming your identity after narcissistic abuse. Hope, strength, the overthinker always survives.',
  'The Victory': 'Celebration and quiet triumph — milestones, choosing yourself, the person you became after surviving it. Dark and poetic but triumphant.'
};

const platformContext = {
  tiktok: 'TikTok (60 seconds, short punchy lines, viral hooks)',
  instagram: 'Instagram Reels (30-60 seconds, emotional and visual)',
  youtube: 'YouTube Shorts (60 seconds, slightly more depth, strong hook)'
};

const toneMap = {
  1: 'FORBIDDEN KNOWLEDGE — cold, ominous, prophetic. Like a warning from someone who barely survived. Clinical and dark. Zero warmth.',
  2: 'WARNING — dark and cautionary, like pulling back the curtain on something dangerous. Urgent and intense.',
  3: 'BALANCED — dark and poetic, grounded in emotional truth. The standard Loud Minds voice.',
  4: 'EMPATHETIC — deeply understanding and raw. Like a letter from someone who knows exactly what the reader is going through.',
  5: 'INTIMATE — intensely vulnerable. Like reading someone\'s diary at 3am. Soft, broken, healing.'
};

const parseJSON = text => {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  return JSON.parse(cleaned);
};

// ── Hook Variations ──────────────────────────────────────────
app.post('/generate-hooks', async (req, res) => {
  const { pillar, platform, topic, tone } = req.body;
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 700,
      system: `Write 3 hook variations for @loudminds dark psychology TikTok. All lowercase. Must stop scroll in 2 seconds.
Return JSON only: {"hooks":[{"text":"...","score":85,"why":"one sentence"},{"text":"...","score":82,"why":"..."},{"text":"...","score":79,"why":"..."}]}`,
      messages: [{ role: 'user', content: `Pillar: ${pillar} — ${pillarContext[pillar]}\nPlatform: ${platformContext[platform]||platformContext.tiktok}\nTone: ${toneMap[tone]||toneMap[3]}\n${topic?'Topic: '+topic:''}\n\nWrite 3 hook styles:\n1. WARNING — forbidden knowledge, cold and prophetic\n2. IDENTITY — speaks directly to the overthinker's pain\n3. REVELATION — pattern recognition moment\nAll lowercase. Score each 0-100.` }]
    });
    res.json({ success: true, ...parseJSON(message.content[0].text) });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Regenerate Hook ──────────────────────────────────────────
app.post('/regenerate-hook', async (req, res) => {
  const { pillar, platform, topic, tone } = req.body;
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 150,
      system: `Write one hook for @loudminds dark psychology TikTok. All lowercase. Return JSON only: {"hook":"...","hook_score":85}`,
      messages: [{ role: 'user', content: `Pillar: ${pillar} — ${pillarContext[pillar]}\nTone: ${toneMap[tone]||toneMap[3]}\n${topic?'Topic: '+topic:''}\nWrite ONE fresh hook. Avoid "they never tell you this" format. Be unexpected.` }]
    });
    res.json({ success: true, ...parseJSON(message.content[0].text) });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── ElevenLabs Voice ─────────────────────────────────────────
app.post('/generate-voice', async (req, res) => {
  const { text, model } = req.body;
  const apiKey = process.env.ELEVEN_API_KEY;
  if (!apiKey) return res.status(400).json({ success: false, error: 'Add ELEVEN_API_KEY to your .env file' });
  const voiceId = process.env.ELEVEN_VOICE_ID || 'onwK4e9ZLuTAKqWW03F9';
  const modelId = model === 'v3' ? 'eleven_v3' : 'eleven_turbo_v2_5';
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'Accept': 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': apiKey },
      body: JSON.stringify({ text, model_id: modelId, voice_settings: { stability: 0.45, similarity_boost: 0.75 } })
    });
    if (!r.ok) return res.status(500).json({ success: false, error: await r.text() });
    const chunks = [];
    const reader = r.body.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; chunks.push(Buffer.from(value)); }
    res.setHeader('Content-Type', 'audio/mpeg');
    res.end(Buffer.concat(chunks));
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});
app.get('/eleven-status', (req, res) => res.json({ configured: !!process.env.ELEVEN_API_KEY }));

// ── Image Proxy (Pollinations) ────────────────────────────────
app.get('/gen-image', async (req, res) => {
  try {
    const prompt = req.query.prompt || 'dark cinematic';
    const seed = req.query.seed || '1';
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=640&height=360&seed=${seed}&nologo=true`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!r.ok) return res.status(502).send('image error');
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buf = await r.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Carousel Generation ──────────────────────────────────────
app.post('/generate-carousel', async (req, res) => {
  const { pillar, topic, tone, slides } = req.body;
  const slideCount = slides || 7;
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 2000,
      system: `You are the content strategist for @loudminds — dark psychology TikTok/Instagram channel. Create carousel posts that stop the scroll. Each slide must be punchy, all lowercase, emotionally sharp. The last slide always ends with a soft CTA like "save this." or "you needed to hear this." Return JSON only.`,
      messages: [{ role: 'user', content: `Pillar: ${pillar} — ${pillarContext[pillar]}\nTone: ${toneMap[tone]||toneMap[3]}\n${topic?'Topic: '+topic:''}\nSlides: ${slideCount}\n\nCreate a ${slideCount}-slide carousel. Return JSON:\n{"slides":[{"type":"hook|content|cta","headline":"...","subtext":"..."}],"caption":"...","hashtags":"#loudminds ..."}` }]
    });
    res.json({ success: true, ...parseJSON(message.content[0].text) });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Blog Generation ──────────────────────────────────────────
app.post('/generate-blog', async (req, res) => {
  const { pillar, topic, length } = req.body;
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 4000,
      system: `You are the blog writer for Loud Minds — a dark psychology brand about narcissistic abuse, overthinkers, and trauma bonding.\nBRAND VOICE: poetic, dark, deeply empathetic. Writes in second person. lowercase headings. No filler. Ends with: "you're not crazy. you're just loud. 🖤"\nReturn JSON only: {"title":"...","slug":"...","intro":"...","sections":[{"heading":"...","content":"..."}],"outro":"...","meta_description":"...","tags":["..."]}`,
      messages: [{ role: 'user', content: `Pillar: ${pillar} — ${pillarContext[pillar]}\nWord count: ${length==='long'?'1200-1500':'500-700'} words\n${topic?'Topic: '+topic:''}\nWrite a complete Loud Minds blog post. Make the reader feel: "finally. someone understands."` }]
    });
    res.json({ success: true, ...parseJSON(message.content[0].text) });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Script Generation ────────────────────────────────────────
app.post('/generate', async (req, res) => {
  const { pillar, platform, topic, length, tone } = req.body;
  const lengthCtx = {
    short: 'SHORT (15-30s). Extremely punchy. Hook → 2-3 body lines → outro. Every word hits.',
    long: 'LONG (60s). Deep and cinematic. Hook → layered storytelling → emotional outro. Let it breathe.'
  };
  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-5', max_tokens: 2000,
      system: `You are the scriptwriter for @loudminds — dark psychology TikTok channel.\nRULES: all lowercase. every word intentional. always end with "you're not crazy. you're just loud. 🖤". In the "script" field include [STOCK FOOTAGE:], [TEXT OVERLAY:], [PAUSE] cues. The "voiceover" field must contain ONLY the spoken words — no cues, no brackets, no [PAUSE], no [TEXT OVERLAY:], no stage directions of any kind. Voiceover is clean text for text-to-speech.\nReturn JSON only: {"script":"...","voiceover":"...","hook":"...","hook_score":0-100,"stock_footage":["..."],"posting_time":"...","hashtags":"#loudminds #darkpsychology..."}`,
      messages: [{ role: 'user', content: `Platform: ${platformContext[platform]||platformContext.tiktok}\nPillar: ${pillar} — ${pillarContext[pillar]}\nLength: ${lengthCtx[length]||lengthCtx.short}\nTone: ${toneMap[tone]||toneMap[3]}\n${topic?'Topic: '+topic:''}\nWrite a complete Loud Minds script. Dark, poetic, deeply resonant.` }]
    });
    const parsed = parseJSON(message.content[0].text);
    if (parsed.voiceover) parsed.voiceover = parsed.voiceover.replace(/\[.*?\]/g, '').replace(/\s{2,}/g, ' ').trim();
    res.json({ success: true, ...parsed });
  } catch(err) { res.status(500).json({ success: false, error: err.message }); }
});

// ── Main UI ───────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>LoudMinds.Club — Content Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
:root {
  --gold:#C9A247; --gold-bright:#E8C96A; --gold-light:#E8D5A3; --gold-dark:#9A7A2E;
  --gold-muted:#7A6020; --gold-deep:#4a3810; --gold-subtle:#2a2000;
  --ink:#050400; --ink2:#080700; --ink3:#0d0b00; --ink4:#111000; --ink5:#181500;
  --text:#D4B870; --text-dim:#8A6E30;
  --border:rgba(201,162,71,0.1); --border-mid:rgba(201,162,71,0.25); --border-hi:rgba(201,162,71,0.55);
}
*{margin:0;padding:0;box-sizing:border-box;}
body{background:var(--ink);color:var(--text);font-family:'Inter','Helvetica Neue',sans-serif;min-height:100vh;overflow-x:hidden;}
body::before{content:'';position:fixed;top:-100px;left:50%;transform:translateX(-50%);width:800px;height:500px;background:radial-gradient(ellipse at center top,rgba(201,162,71,0.05) 0%,transparent 65%);pointer-events:none;z-index:0;}
*{scrollbar-width:thin;scrollbar-color:var(--gold-subtle) var(--ink);}
*::-webkit-scrollbar{width:5px;}*::-webkit-scrollbar-track{background:var(--ink);}
*::-webkit-scrollbar-thumb{background:var(--gold-subtle);border-radius:2px;}
*::-webkit-scrollbar-thumb:hover{background:var(--gold-dark);}

/* ── HISTORY DRAWER ── */
.hist-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:90;backdrop-filter:blur(2px);}
.hist-overlay.open{display:block;}
.hist-drawer{position:fixed;top:0;right:0;bottom:0;width:360px;background:var(--ink2);border-left:1px solid var(--border);z-index:100;transform:translateX(100%);transition:transform 0.35s ease;display:flex;flex-direction:column;}
.hist-drawer.open{transform:translateX(0);}
.hist-hdr{padding:24px 20px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:flex-start;flex-shrink:0;}
.hist-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.4rem;font-weight:400;color:var(--gold-light);}
.hist-sub{font-size:0.65rem;color:var(--gold-deep);letter-spacing:0.1em;text-transform:uppercase;margin-top:3px;}
.hist-close{background:none;border:none;color:var(--gold-deep);font-size:1rem;cursor:pointer;padding:4px;transition:color 0.2s;}
.hist-close:hover{color:var(--gold);}
.score-chart-wrap{padding:16px 20px 12px;border-bottom:1px solid var(--border);flex-shrink:0;}
.score-chart-lbl{font-size:0.58rem;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:8px;}
.score-chart-bars{display:flex;gap:3px;align-items:flex-end;height:28px;}
.score-bar{flex:1;border-radius:1px 1px 0 0;min-height:3px;transition:height 0.4s ease;cursor:default;}
.score-bar.high{background:var(--gold);}
.score-bar.mid{background:var(--gold-dark);}
.score-bar.low{background:var(--gold-subtle);}
.hist-list{flex:1;overflow-y:auto;padding:12px;}
.hist-empty{text-align:center;padding:40px 20px;font-size:0.8rem;color:var(--gold-deep);font-style:italic;}
.hist-item{border:1px solid var(--border);border-left:2px solid var(--gold-subtle);border-radius:3px;padding:12px 14px;margin-bottom:8px;cursor:pointer;transition:all 0.2s;position:relative;}
.hist-item:hover{border-color:var(--border-mid);border-left-color:var(--gold-muted);}
.hist-item-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;}
.hist-item-pillar{font-size:0.65rem;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold);}
.hist-item-score{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.1rem;color:var(--gold);}
.hist-item-hook{font-size:0.78rem;color:var(--text-dim);line-height:1.4;margin-bottom:6px;}
.hist-item-meta{font-size:0.62rem;color:var(--gold-deep);display:flex;gap:8px;}
.hist-item-del{position:absolute;top:8px;right:8px;background:none;border:none;color:var(--gold-deep);font-size:0.8rem;cursor:pointer;opacity:0;transition:opacity 0.2s,color 0.2s;padding:2px 5px;}
.hist-item:hover .hist-item-del{opacity:1;}
.hist-item-del:hover{color:var(--gold);}
.hist-clear{margin:12px;padding:10px;background:none;border:1px solid var(--border);color:var(--gold-deep);font-family:'Inter',sans-serif;font-size:0.65rem;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;border-radius:3px;cursor:pointer;transition:all 0.2s;flex-shrink:0;}
.hist-clear:hover{border-color:var(--border-mid);color:var(--gold-muted);}

/* ── HEADER ── */
.header{position:relative;background:#000;padding:28px 48px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:24px;z-index:10;}
.header::after{content:'';position:absolute;bottom:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent 0%,var(--gold) 40%,var(--gold-bright) 50%,var(--gold) 60%,transparent 100%);opacity:0.35;}
.header-logo{width:84px;height:84px;border-radius:50%;object-fit:cover;flex-shrink:0;box-shadow:0 0 0 1px rgba(201,162,71,0.25),0 0 24px rgba(201,162,71,0.1),0 0 60px rgba(201,162,71,0.05);}
.header-brand{font-family:'Cormorant Garamond',Georgia,serif;font-size:2.4rem;font-weight:400;letter-spacing:0.06em;line-height:1;background:linear-gradient(135deg,#E8D5A3 0%,#C9A247 45%,#9A7A2E 75%,#D4B870 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.header-tagline{font-size:0.65rem;font-weight:500;letter-spacing:0.22em;text-transform:uppercase;color:var(--gold-muted);margin-top:7px;}
.header-right{margin-left:auto;display:flex;align-items:center;gap:12px;}
.hist-btn{background:none;border:1px solid var(--border);color:var(--gold-deep);width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;position:relative;flex-shrink:0;}
.hist-btn:hover{border-color:var(--gold);color:var(--gold);}
.hist-btn svg{width:18px;height:18px;}
.hist-count{position:absolute;top:-4px;right:-4px;background:var(--gold);color:#000;font-size:0.6rem;font-weight:700;width:16px;height:16px;border-radius:50%;display:flex;align-items:center;justify-content:center;display:none;}

/* ── LAYOUT ── */
.container{max-width:820px;margin:0 auto;padding:52px 32px 100px;position:relative;z-index:1;}

/* ── MODE TOGGLE ── */
.mode-toggle{display:flex;gap:0;margin-bottom:44px;border-bottom:1px solid var(--border);}
.mode-btn{padding:13px 28px;background:none;border:none;font-family:'Inter',sans-serif;font-size:0.72rem;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;color:var(--gold-deep);cursor:pointer;transition:color 0.3s;position:relative;}
.mode-btn::after{content:'';position:absolute;bottom:-1px;left:0;right:0;height:1px;background:var(--gold);transform:scaleX(0);transition:transform 0.3s ease;}
.mode-btn.active{color:var(--gold);}
.mode-btn.active::after{transform:scaleX(1);}

/* ── FORM ── */
.form-group{margin-bottom:28px;}
label{display:block;font-size:0.62rem;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:var(--gold-muted);margin-bottom:12px;}
label .opt{font-weight:400;letter-spacing:0.04em;text-transform:none;color:var(--gold-deep);font-size:0.72rem;}
input[type="text"]{width:100%;background:var(--ink3);border:1px solid var(--border);border-left:2px solid transparent;color:var(--text);padding:14px 18px;border-radius:3px;font-family:'Inter',sans-serif;font-size:0.9rem;outline:none;transition:all 0.3s;}
input[type="text"]:focus{border-color:var(--border-mid);border-left-color:var(--gold);background:var(--ink4);}
::placeholder{color:var(--gold-deep);opacity:1;}

/* ── TONE SLIDER ── */
.tone-wrap{position:relative;}
input[type="range"]{-webkit-appearance:none;width:100%;height:2px;background:linear-gradient(90deg,var(--gold) 50%,var(--gold-subtle) 50%);border-radius:1px;outline:none;cursor:pointer;margin-bottom:8px;}
input[type="range"]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--gold);cursor:pointer;box-shadow:0 0 8px rgba(201,162,71,0.5);}
input[type="range"]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:var(--gold);cursor:pointer;border:none;}
.tone-labels{display:flex;justify-content:space-between;font-size:0.58rem;color:var(--gold-deep);text-transform:uppercase;letter-spacing:0.1em;}
.tone-current{font-size:0.72rem;color:var(--gold-muted);margin-top:8px;font-style:italic;text-align:center;}

/* ── CUSTOM SELECT ── */
.custom-select{position:relative;width:100%;user-select:none;}
.custom-select-trigger{width:100%;background:var(--ink3);border:1px solid var(--border);color:var(--text);padding:14px 44px 14px 18px;border-radius:3px;font-family:'Inter',sans-serif;font-size:0.9rem;cursor:pointer;display:flex;align-items:center;transition:all 0.25s;position:relative;}
.custom-select-trigger:hover{border-color:var(--border-mid);background:var(--ink4);}
.custom-select.open .custom-select-trigger{border-color:var(--gold);border-bottom-color:transparent;border-radius:3px 3px 0 0;background:var(--ink4);}
.custom-select-arrow{position:absolute;right:16px;top:50%;transform:translateY(-50%);width:10px;height:6px;transition:transform 0.25s;flex-shrink:0;}
.custom-select.open .custom-select-arrow{transform:translateY(-50%) rotate(180deg);}
.custom-select-dropdown{display:none;position:absolute;top:100%;left:0;right:0;z-index:200;background:var(--ink4);border:1px solid var(--gold);border-top:none;border-radius:0 0 3px 3px;overflow:hidden;box-shadow:0 16px 48px rgba(0,0,0,0.9);}
.custom-select.open .custom-select-dropdown{display:block;}
.custom-select-option{padding:13px 18px;font-family:'Inter',sans-serif;font-size:0.875rem;color:var(--text-dim);cursor:pointer;transition:all 0.15s;border-bottom:1px solid rgba(201,162,71,0.06);display:flex;align-items:center;gap:12px;}
.custom-select-option::before{content:'';width:3px;height:3px;border-radius:50%;background:var(--gold-subtle);flex-shrink:0;transition:background 0.15s;}
.custom-select-option:last-child{border-bottom:none;}
.custom-select-option:hover{background:rgba(201,162,71,0.05);color:var(--gold-light);}
.custom-select-option:hover::before,.custom-select-option.selected::before{background:var(--gold);}
.custom-select-option.selected{color:var(--gold);background:rgba(201,162,71,0.04);}

/* ── PLATFORM TABS ── */
.platform-tabs{display:flex;gap:8px;}
.platform-tab{flex:1;padding:13px 14px;background:var(--ink3);border:1px solid var(--border);color:var(--gold-deep);border-radius:3px;cursor:pointer;text-align:center;transition:all 0.2s;font-family:'Inter',sans-serif;font-size:0.82rem;}
.platform-tab:hover{border-color:var(--border-mid);color:var(--gold-muted);}
.platform-tab.active{background:rgba(201,162,71,0.09);border-color:var(--gold);color:var(--gold);}

/* ── PILLAR GUIDE ── */
.pillar-guide{margin-bottom:28px;}
.pillar-guide-header{display:flex;align-items:center;gap:14px;width:100%;}
.pillar-guide-line{flex:1;height:1px;background:var(--border);}
.pillar-guide-toggle{background:none;border:none;color:var(--gold-deep);font-family:'Inter',sans-serif;font-size:0.65rem;font-weight:500;letter-spacing:0.16em;text-transform:uppercase;cursor:pointer;transition:color 0.2s;white-space:nowrap;padding:0;}
.pillar-guide-toggle:hover{color:var(--gold);}
.pillar-cards{display:none;margin-top:20px;}
.pillar-cards.open{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
@media(max-width:600px){.pillar-cards.open{grid-template-columns:1fr;}}
.pillar-card{background:var(--ink2);border:1px solid var(--border);border-left:2px solid var(--gold-subtle);border-radius:3px;padding:18px 20px 16px;cursor:pointer;transition:all 0.25s;position:relative;overflow:hidden;}
.pillar-card-num{position:absolute;top:-12px;right:10px;font-family:'Cormorant Garamond',Georgia,serif;font-size:5rem;font-weight:300;color:rgba(201,162,71,0.04);line-height:1;user-select:none;pointer-events:none;transition:color 0.25s;}
.pillar-card:hover{border-color:var(--border-mid);border-left-color:var(--gold-muted);}
.pillar-card:hover .pillar-card-num{color:rgba(201,162,71,0.08);}
.pillar-card.selected{border-color:var(--border-hi);border-left-color:var(--gold);background:rgba(201,162,71,0.04);}
.pillar-card.selected .pillar-card-num{color:rgba(201,162,71,0.12);}
.pillar-card-tag{font-size:0.58rem;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:var(--gold-deep);margin-bottom:5px;}
.pillar-card-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.15rem;font-weight:600;color:var(--gold);margin-bottom:8px;line-height:1.2;}
.pillar-card-desc{font-size:0.77rem;color:var(--gold-deep);line-height:1.65;}
.pillar-card-topics{margin-top:12px;display:flex;flex-wrap:wrap;gap:5px;}
.pillar-topic{border:1px solid var(--gold-subtle);padding:2px 9px;border-radius:2px;font-size:0.67rem;color:var(--gold-muted);letter-spacing:0.02em;}
.pillar-badge{display:inline-block;margin-bottom:8px;padding:2px 9px;border-radius:2px;font-size:0.56rem;font-weight:700;letter-spacing:0.18em;text-transform:uppercase;}
.pillar-badge.roi{background:rgba(201,162,71,0.15);color:var(--gold);border:1px solid rgba(201,162,71,0.4);}
.pillar-badge.quick{background:rgba(201,162,71,0.08);color:var(--gold-light);border:1px solid rgba(201,162,71,0.22);}
.pillar-badge.power{background:rgba(201,162,71,0.05);color:var(--text-dim);border:1px solid var(--border);}

/* ── CAROUSEL ── */
.carousel-viewer{position:relative;user-select:none;}
.carousel-slide-wrap{overflow:hidden;border-radius:4px;}
.carousel-slide{display:none;background:var(--ink2);border:1px solid var(--border-mid);border-radius:4px;aspect-ratio:1/1;padding:40px 36px;flex-direction:column;justify-content:center;align-items:flex-start;gap:16px;position:relative;}
.carousel-slide.active{display:flex;}
.carousel-slide-type{font-size:0.55rem;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:var(--gold-muted);}
.carousel-slide-headline{font-family:'Cormorant Garamond',Georgia,serif;font-size:2rem;font-weight:600;color:var(--gold);line-height:1.25;}
.carousel-slide-subtext{font-size:0.88rem;color:var(--text-dim);line-height:1.7;font-family:'Inter',sans-serif;}
.carousel-slide-num{position:absolute;bottom:18px;right:22px;font-size:0.6rem;color:var(--gold-muted);letter-spacing:0.1em;}
.carousel-nav{display:flex;align-items:center;justify-content:space-between;margin-top:14px;gap:12px;}
.carousel-nav-btn{background:none;border:1px solid var(--border);color:var(--text-dim);width:36px;height:36px;border-radius:50%;cursor:pointer;font-size:1rem;transition:all 0.2s;flex-shrink:0;}
.carousel-nav-btn:hover{border-color:var(--gold);color:var(--gold);}
.carousel-nav-btn:disabled{opacity:0.2;cursor:default;}
.carousel-dots{display:flex;gap:5px;flex:1;justify-content:center;flex-wrap:wrap;}
.carousel-dot{width:6px;height:6px;border-radius:50%;background:var(--gold-subtle);cursor:pointer;transition:all 0.2s;border:none;padding:0;}
.carousel-dot.active{background:var(--gold);width:18px;border-radius:3px;}
.carousel-copy-slide{background:none;border:1px solid var(--border);color:var(--text-dim);padding:5px 12px;border-radius:2px;font-family:'Inter',sans-serif;font-size:0.62rem;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.2s;flex-shrink:0;}
.carousel-copy-slide:hover{border-color:var(--gold);color:var(--gold);}

/* ── WEEK MODE ── */
.week-global{margin-bottom:28px;}
.week-grid{display:flex;flex-direction:column;gap:8px;margin-bottom:8px;}
.week-row{background:var(--ink3);border:1px solid var(--border);border-radius:3px;padding:14px 18px;display:grid;grid-template-columns:64px 1fr auto;gap:16px;align-items:center;transition:border-color 0.2s;}
.week-row.generating{border-color:var(--gold-dark);}
.week-row.done{border-color:var(--gold);background:rgba(201,162,71,0.04);}
.week-row.error{border-color:rgba(255,80,80,0.3);}
.week-day{font-size:0.65rem;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold-muted);}
.week-pillar-cycle{background:none;border:1px solid var(--gold-subtle);color:var(--text-dim);padding:8px 12px;border-radius:3px;font-family:'Inter',sans-serif;font-size:0.8rem;cursor:pointer;transition:all 0.2s;text-align:left;width:100%;}
.week-pillar-cycle:hover{border-color:var(--border-mid);color:var(--gold-light);}
.week-status{font-size:0.9rem;width:24px;text-align:center;}
.week-results-grid{display:flex;flex-direction:column;gap:10px;}
.week-result-card{background:var(--ink3);border:1px solid var(--border);border-left:2px solid var(--gold);border-radius:3px;padding:16px 18px;}
.week-card-top{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;}
.week-card-day{font-size:0.6rem;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:var(--gold-muted);}
.week-card-score{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.2rem;color:var(--gold);}
.week-card-hook{font-size:0.85rem;color:var(--text);margin-bottom:12px;line-height:1.5;font-style:italic;}
.week-card-actions{display:flex;gap:8px;}
.week-copy-btn{background:transparent;border:1px solid var(--border);color:var(--text-dim);padding:5px 12px;border-radius:2px;font-family:'Inter',sans-serif;font-size:0.65rem;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.2s;}
.week-copy-btn:hover{border-color:var(--gold);color:var(--gold);}

/* ── BUTTON ── */
.btn-generate{width:100%;padding:17px;border:none;border-radius:3px;cursor:pointer;font-family:'Inter',sans-serif;font-size:0.72rem;font-weight:600;letter-spacing:0.22em;text-transform:uppercase;color:#000;margin-top:8px;background:linear-gradient(110deg,#9A7A2E 0%,#C9A247 25%,#E8C96A 50%,#C9A247 75%,#9A7A2E 100%);background-size:250% 100%;background-position:100% 0;transition:background-position 0.6s ease,box-shadow 0.3s;position:relative;overflow:hidden;}
.btn-generate:hover{background-position:0% 0;box-shadow:0 6px 30px rgba(201,162,71,0.35);}
.btn-generate:disabled{opacity:0.3;cursor:not-allowed;box-shadow:none;}

/* ── DIVIDER ── */
.divider{border:none;margin:52px 0;height:1px;background:linear-gradient(90deg,transparent,rgba(201,162,71,0.2),transparent);}

/* ── RESULTS ── */
.result{display:none;}.result.show{display:block;}
.result-header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:32px;}
.rh-label{font-size:0.58rem;font-weight:600;letter-spacing:0.2em;text-transform:uppercase;color:var(--gold-muted);margin-bottom:6px;}
.score-val{font-family:'Cormorant Garamond',Georgia,serif;font-size:3.2rem;font-weight:300;color:var(--gold);line-height:1;}
.score-val small{font-size:1.1rem;color:var(--text-dim);font-weight:400;}
.post-time-val{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.5rem;font-weight:400;color:var(--gold);text-align:right;}
.regen-btn{background:none;border:1px solid var(--border);color:var(--text-dim);width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;flex-shrink:0;margin-bottom:6px;}
.regen-btn:hover{border-color:var(--gold);color:var(--gold);}
.regen-btn svg{width:14px;height:14px;}
.regen-btn.spinning svg{animation:spin 0.8s linear infinite;}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

/* ── TABS ── */
.tabs{display:flex;gap:0;border-bottom:1px solid var(--border);}
.tab-btn{padding:11px 22px;background:none;border:none;font-family:'Inter',sans-serif;font-size:0.68rem;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold-deep);cursor:pointer;position:relative;transition:color 0.2s;outline:none;}
.tab-btn::after{content:'';position:absolute;bottom:-1px;left:0;right:0;height:1px;background:var(--gold);transform:scaleX(0);transition:transform 0.25s;}
.tab-btn.active{color:var(--gold);}
.tab-btn.active::after{transform:scaleX(1);}
.tab-content{background:var(--ink3);border:1px solid var(--border);border-top:none;border-radius:0 0 3px 3px;padding:28px 28px 24px;display:none;position:relative;}
.tab-content.active{display:block;}
.script-text{font-size:0.9rem;line-height:2;color:var(--text);white-space:pre-wrap;font-family:'Inter',sans-serif;}

/* ── COPY / ACTION BUTTONS ── */
.copy-btn{background:transparent;border:1px solid var(--border);color:var(--text-dim);padding:5px 14px;border-radius:2px;font-family:'Inter',sans-serif;font-size:0.65rem;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.2s;flex-shrink:0;}
.copy-btn:hover,.copy-btn.copied{border-color:var(--gold);color:var(--gold);}
.tab-actions{display:flex;justify-content:flex-end;margin-bottom:16px;gap:8px;}
.meta-row{display:flex;gap:10px;margin-top:20px;flex-wrap:wrap;align-items:center;}
.meta-chip{background:var(--ink3);border:1px solid var(--border);padding:7px 14px;border-radius:2px;font-size:0.75rem;color:var(--text-dim);font-family:'Inter',sans-serif;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.meta-chip span{color:var(--gold);}
.caption-btn{background:transparent;border:1px solid var(--border);color:var(--text-dim);padding:7px 14px;border-radius:2px;font-family:'Inter',sans-serif;font-size:0.65rem;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.2s;white-space:nowrap;flex-shrink:0;}
.caption-btn:hover{border-color:var(--gold);color:var(--gold);}
.footage-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:14px;}
.footage-tag-simple{border:1px solid var(--gold-subtle);padding:4px 10px;border-radius:2px;font-size:0.7rem;color:var(--gold-deep);font-family:'Inter',sans-serif;}
.hashtags{color:var(--gold-deep);font-size:0.78rem;margin-top:14px;line-height:1.8;font-family:'Inter',sans-serif;}

/* ── VOICE BUTTON + AUDIO ── */
.voice-btn{background:transparent;border:1px solid var(--border-mid);color:var(--gold-muted);padding:5px 14px;border-radius:2px;font-family:'Inter',sans-serif;font-size:0.65rem;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.2s;white-space:nowrap;}
.voice-btn:hover{border-color:var(--gold);color:var(--gold);}
.voice-btn:disabled{opacity:0.4;cursor:not-allowed;}
.audio-wrap{margin-top:16px;padding:12px 14px;background:var(--ink4);border:1px solid var(--border);border-radius:3px;}
.audio-wrap audio{width:100%;height:32px;filter:sepia(0.8) saturate(0.6) hue-rotate(20deg) brightness(0.9);}
.speed-row{display:flex;align-items:center;gap:6px;margin-top:10px;}
.speed-label{font-size:0.6rem;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold-muted);margin-right:4px;}
.speed-btn{background:none;border:1px solid var(--border);color:var(--text-dim);padding:3px 9px;border-radius:2px;font-family:'Inter',sans-serif;font-size:0.65rem;cursor:pointer;transition:all 0.2s;}
.speed-btn:hover{border-color:var(--border-mid);color:var(--gold-muted);}
.speed-btn.active{border-color:var(--gold);color:var(--gold);background:rgba(201,162,71,0.07);}

/* ── HOOK VARIATIONS ── */
.hooks-section{margin-top:28px;}
.hooks-header{display:flex;align-items:center;gap:14px;}
.hooks-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:16px;}
@media(max-width:640px){.hooks-grid{grid-template-columns:1fr;}}
.hook-var-card{background:var(--ink2);border:1px solid var(--border);border-radius:3px;padding:14px 16px;cursor:pointer;transition:all 0.2s;position:relative;}
.hook-var-card:hover{border-color:var(--gold-muted);background:rgba(201,162,71,0.04);}
.hook-var-score{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.8rem;font-weight:300;color:var(--gold);line-height:1;margin-bottom:8px;}
.hook-var-text{font-size:0.82rem;color:var(--text);line-height:1.55;margin-bottom:8px;font-style:italic;}
.hook-var-why{font-size:0.68rem;color:var(--gold-deep);line-height:1.5;}
.hook-var-use{font-size:0.6rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold-muted);margin-top:10px;transition:color 0.2s;}
.hook-var-card:hover .hook-var-use{color:var(--gold);}

/* ── BLOG ── */
.blog-result{display:none;}.blog-result.show{display:block;}
.blog-title{font-family:'Cormorant Garamond',Georgia,serif;font-size:2.2rem;font-weight:400;line-height:1.3;color:var(--gold-light);margin-bottom:10px;}
.blog-meta{font-size:0.7rem;color:var(--gold-deep);margin-bottom:36px;font-family:'Inter',sans-serif;letter-spacing:0.04em;}
.blog-section{margin-bottom:32px;}
.blog-section h3{font-size:0.6rem;font-weight:600;color:var(--gold-muted);text-transform:uppercase;letter-spacing:0.2em;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border);font-family:'Inter',sans-serif;}
.blog-section p{font-size:0.92rem;color:var(--text);line-height:1.95;margin-bottom:14px;font-family:'Inter',sans-serif;}
.blog-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:24px;}
.blog-tag{border:1px solid var(--gold-subtle);padding:4px 12px;border-radius:2px;font-size:0.7rem;color:var(--gold-muted);font-family:'Inter',sans-serif;}

/* ── LOADING ── */
.loading{text-align:center;padding:64px;}
.loading-text{font-family:'Cormorant Garamond',Georgia,serif;font-size:1.3rem;font-weight:300;font-style:italic;color:var(--gold-muted);animation:breathe 2s ease-in-out infinite;}
@keyframes breathe{0%,100%{opacity:0.35}50%{opacity:1}}
</style>
</head>
<body>

<!-- History Overlay -->
<div class="hist-overlay" id="histOverlay" onclick="closeHistory()"></div>

<!-- History Drawer -->
<aside class="hist-drawer" id="histDrawer">
  <div class="hist-hdr">
    <div>
      <div class="hist-title">Script History</div>
      <div class="hist-sub" id="histSub">0 scripts saved</div>
    </div>
    <button class="hist-close" onclick="closeHistory()">✕</button>
  </div>
  <div class="score-chart-wrap" id="scoreChartWrap" style="display:none">
    <div class="score-chart-lbl">Hook Scores — Recent</div>
    <div class="score-chart-bars" id="scoreChartBars"></div>
  </div>
  <div class="hist-list" id="histList">
    <div class="hist-empty">No scripts yet. Generate your first one.</div>
  </div>
  <button class="hist-clear" onclick="clearHistory()">Clear All History</button>
</aside>

<!-- Header -->
<header class="header">
  <img src="/logo.jpg" alt="LoudMinds" class="header-logo">
  <div>
    <div class="header-brand">LoudMinds<span style="opacity:0.6">.Club</span></div>
    <div class="header-tagline">Dark Psychology Content Studio &nbsp;·&nbsp; For Overthinkers 🖤</div>
  </div>
  <div class="header-right">
    <button class="hist-btn" onclick="openHistory()" title="Script History">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
      <span class="hist-count" id="histCount">0</span>
    </button>
  </div>
</header>

<div class="container">

  <!-- Mode Toggle -->
  <div class="mode-toggle">
    <button class="mode-btn active" onclick="setMode('script',this)">Script</button>
    <button class="mode-btn" onclick="setMode('blog',this)">Blog Post</button>
    <button class="mode-btn" onclick="setMode('week',this)">Week Plan</button>
    <button class="mode-btn" onclick="setMode('carousel',this)">Carousel</button>
  </div>

  <!-- ── SCRIPT FIELDS ── -->
  <div id="scriptFields">
    <div class="pillar-guide">
      <div class="pillar-guide-header">
        <div class="pillar-guide-line"></div>
        <button class="pillar-guide-toggle" onclick="toggleGuide(this)">The Six Pillars — expand to explore</button>
        <div class="pillar-guide-line"></div>
      </div>
      <div class="pillar-cards" id="pillarGuide">
        <div class="pillar-card" onclick="selectPillar('The Hunt',this)">
          <div class="pillar-card-num">01</div><div class="pillar-card-tag">Pillar I</div>
          <div class="pillar-badge roi">Biggest ROI</div>
          <div class="pillar-card-title">The Hunt</div>
          <div class="pillar-card-desc">How narcissists identify, target, and trap overthinkers. Warn your audience — forbidden knowledge tone.</div>
          <div class="pillar-card-topics"><span class="pillar-topic">why they target you first</span><span class="pillar-topic">the first test they run</span><span class="pillar-topic">empathy as a weapon</span></div>
        </div>
        <div class="pillar-card" onclick="selectPillar('The Trap',this)">
          <div class="pillar-card-num">02</div><div class="pillar-card-tag">Pillar II</div>
          <div class="pillar-card-title">The Trap</div>
          <div class="pillar-card-desc">Psychological tactics that keep overthinkers confused and dependent. Deep psychology — inside the relationship.</div>
          <div class="pillar-card-topics"><span class="pillar-topic">love bombing</span><span class="pillar-topic">silent treatment</span><span class="pillar-topic">gaslighting</span><span class="pillar-topic">trauma bonding</span></div>
        </div>
        <div class="pillar-card" onclick="selectPillar('The 3am Mind',this)">
          <div class="pillar-card-num">03</div><div class="pillar-card-tag">Pillar III</div>
          <div class="pillar-badge quick">Quick Win</div>
          <div class="pillar-card-title">The 3am Mind</div>
          <div class="pillar-card-desc">Raw, intimate, deeply relatable. What it actually feels like inside — your most emotionally powerful pillar.</div>
          <div class="pillar-card-topics"><span class="pillar-topic">replaying conversations</span><span class="pillar-topic">when they go silent</span><span class="pillar-topic">thoughts at 3am</span></div>
        </div>
        <div class="pillar-card" onclick="selectPillar('The Awakening',this)">
          <div class="pillar-card-num">04</div><div class="pillar-card-tag">Pillar IV</div>
          <div class="pillar-badge power">Power User</div>
          <div class="pillar-card-title">The Awakening</div>
          <div class="pillar-card-desc">The turning point. When the pattern becomes visible. Your highest-performing content — people share this when it hits.</div>
          <div class="pillar-card-topics"><span class="pillar-topic">finally seeing them clearly</span><span class="pillar-topic">it wasn't your fault</span><span class="pillar-topic">your gut was right</span></div>
        </div>
        <div class="pillar-card" onclick="selectPillar('The Survival',this)">
          <div class="pillar-card-num">05</div><div class="pillar-card-tag">Pillar V</div>
          <div class="pillar-card-title">The Survival</div>
          <div class="pillar-card-desc">Healing, recovery, reclaiming identity. Give your audience hope. The overthinker always survives the narcissist.</div>
          <div class="pillar-card-topics"><span class="pillar-topic">what healing looks like</span><span class="pillar-topic">reclaiming yourself</span><span class="pillar-topic">you will survive this</span></div>
        </div>
        <div class="pillar-card" onclick="selectPillar('The Victory',this)">
          <div class="pillar-card-num">06</div><div class="pillar-card-tag">Pillar VI</div>
          <div class="pillar-card-title">The Victory</div>
          <div class="pillar-card-desc">The quiet triumph of choosing yourself. Milestones. Dark and poetic — a deep exhale after a long war.</div>
          <div class="pillar-card-topics"><span class="pillar-topic">the day I chose myself</span><span class="pillar-topic">6 months free</span><span class="pillar-topic">you survived what broke others</span></div>
        </div>
      </div>
    </div>

    <div class="form-group">
      <label>Platform</label>
      <div class="platform-tabs">
        <div class="platform-tab active" data-platform="tiktok" onclick="selectPlatformTab(this)">TikTok</div>
        <div class="platform-tab" data-platform="instagram" onclick="selectPlatformTab(this)">Instagram</div>
        <div class="platform-tab" data-platform="youtube" onclick="selectPlatformTab(this)">YouTube</div>
      </div>
    </div>

    <div class="form-group">
      <label>Content Pillar</label>
      <div class="custom-select" id="pillarSelect">
        <div class="custom-select-trigger" onclick="toggleDropdown('pillarSelect')">
          <span id="pillarLabel">The Hunt — how narcissists target overthinkers</span>
          <svg class="custom-select-arrow" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="#C9A247" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="custom-select-dropdown">
          <div class="custom-select-option selected" onclick="selectOption('pillarSelect','The Hunt','The Hunt — how narcissists target overthinkers')">The Hunt — how narcissists target overthinkers</div>
          <div class="custom-select-option" onclick="selectOption('pillarSelect','The Trap','The Trap — psychological tactics inside the relationship')">The Trap — psychological tactics inside the relationship</div>
          <div class="custom-select-option" onclick="selectOption('pillarSelect','The 3am Mind','The 3am Mind — raw thoughts at 3am')">The 3am Mind — raw thoughts at 3am</div>
          <div class="custom-select-option" onclick="selectOption('pillarSelect','The Awakening','The Awakening — the moment you finally saw clearly')">The Awakening — the moment you finally saw clearly</div>
          <div class="custom-select-option" onclick="selectOption('pillarSelect','The Survival','The Survival — healing and reclaiming yourself')">The Survival — healing and reclaiming yourself</div>
          <div class="custom-select-option" onclick="selectOption('pillarSelect','The Victory','The Victory — celebrating how far you\\'ve come')">The Victory — celebrating how far you've come</div>
        </div>
      </div>
    </div>

    <div class="form-group">
      <label>Content Length</label>
      <div class="platform-tabs">
        <div class="platform-tab active" data-length="short" onclick="selectLength(this)">
          <div style="font-weight:600;font-size:0.82rem">Short</div>
          <div style="font-size:0.67rem;margin-top:3px;opacity:0.6">15–30s · punchy · viral</div>
        </div>
        <div class="platform-tab" data-length="long" onclick="selectLength(this)">
          <div style="font-weight:600;font-size:0.82rem">Long</div>
          <div style="font-size:0.67rem;margin-top:3px;opacity:0.6">60s · deep · cinematic</div>
        </div>
      </div>
    </div>

    <div class="form-group">
      <label>Tone</label>
      <div class="tone-wrap">
        <input type="range" id="toneSlider" min="1" max="5" value="3" oninput="updateTone(this.value)">
        <div class="tone-labels"><span>⚠ Forbidden</span><span>🖤 Intimate</span></div>
        <div class="tone-current" id="toneCurrent">Balanced — dark, poetic, emotional truth</div>
      </div>
    </div>

    <div class="form-group">
      <label>Specific Topic <span class="opt">(optional)</span></label>
      <input type="text" id="topic" placeholder="e.g. love bombing, silent treatment, trauma bonding...">
    </div>
  </div><!-- end scriptFields -->

  <!-- ── BLOG FIELDS ── -->
  <div id="blogFields" style="display:none">
    <div class="form-group">
      <label>Content Pillar</label>
      <div class="custom-select" id="blogPillarSelect">
        <div class="custom-select-trigger" onclick="toggleDropdown('blogPillarSelect')">
          <span id="blogPillarLabel">The Hunt — how narcissists target overthinkers</span>
          <svg class="custom-select-arrow" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="#C9A247" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="custom-select-dropdown">
          <div class="custom-select-option selected" onclick="selectOption('blogPillarSelect','The Hunt','The Hunt — how narcissists target overthinkers')">The Hunt — how narcissists target overthinkers</div>
          <div class="custom-select-option" onclick="selectOption('blogPillarSelect','The Trap','The Trap — psychological tactics inside the relationship')">The Trap — psychological tactics inside the relationship</div>
          <div class="custom-select-option" onclick="selectOption('blogPillarSelect','The 3am Mind','The 3am Mind — raw thoughts at 3am')">The 3am Mind — raw thoughts at 3am</div>
          <div class="custom-select-option" onclick="selectOption('blogPillarSelect','The Awakening','The Awakening — the moment you finally saw clearly')">The Awakening — the moment you finally saw clearly</div>
          <div class="custom-select-option" onclick="selectOption('blogPillarSelect','The Survival','The Survival — healing and reclaiming yourself')">The Survival — healing and reclaiming yourself</div>
          <div class="custom-select-option" onclick="selectOption('blogPillarSelect','The Victory','The Victory — celebrating how far you\\'ve come')">The Victory — celebrating how far you've come</div>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label>Blog Length</label>
      <div class="platform-tabs">
        <div class="platform-tab active" data-bloglength="short" onclick="selectBlogLength(this)">
          <div style="font-weight:600;font-size:0.82rem">Short</div>
          <div style="font-size:0.67rem;margin-top:3px;opacity:0.6">500–700 words · punchy read</div>
        </div>
        <div class="platform-tab" data-bloglength="long" onclick="selectBlogLength(this)">
          <div style="font-weight:600;font-size:0.82rem">Long</div>
          <div style="font-size:0.67rem;margin-top:3px;opacity:0.6">1200–1500 words · deep dive</div>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label>Specific Topic <span class="opt">(optional)</span></label>
      <input type="text" id="blogTopic" placeholder="e.g. why you kept forgiving them, the day you stopped explaining yourself...">
    </div>
  </div>

  <!-- ── WEEK FIELDS ── -->
  <div id="weekFields" style="display:none">
    <div class="week-global">
      <div class="form-group">
        <label>Platform for All</label>
        <div class="platform-tabs">
          <div class="platform-tab active" data-week-platform="tiktok" onclick="setWeekPlatform(this,'tiktok')">TikTok</div>
          <div class="platform-tab" data-week-platform="instagram" onclick="setWeekPlatform(this,'instagram')">Instagram</div>
          <div class="platform-tab" data-week-platform="youtube" onclick="setWeekPlatform(this,'youtube')">YouTube</div>
        </div>
      </div>
      <div class="form-group">
        <label>Length for All</label>
        <div class="platform-tabs">
          <div class="platform-tab active" data-week-length="short" onclick="setWeekLength(this,'short')">
            <div style="font-weight:600;font-size:0.82rem">Short</div>
            <div style="font-size:0.67rem;margin-top:3px;opacity:0.6">15–30s · viral</div>
          </div>
          <div class="platform-tab" data-week-length="long" onclick="setWeekLength(this,'long')">
            <div style="font-weight:600;font-size:0.82rem">Long</div>
            <div style="font-size:0.67rem;margin-top:3px;opacity:0.6">60s · cinematic</div>
          </div>
        </div>
      </div>
    </div>
    <div class="week-grid" id="weekGrid"></div>
  </div>

  <!-- ── CAROUSEL FIELDS ── -->
  <div id="carouselFields" style="display:none">
    <div class="form-group">
      <label>Content Pillar</label>
      <div class="custom-select" id="carouselPillarSelect">
        <div class="custom-select-trigger" onclick="toggleDropdown('carouselPillarSelect')">
          <span id="carouselPillarLabel">The Hunt — how narcissists target overthinkers</span><span class="custom-select-arrow">&#8964;</span>
        </div>
        <div class="custom-select-dropdown">
          <div class="custom-select-option selected" onclick="selectOption('carouselPillarSelect','The Hunt','The Hunt — how narcissists target overthinkers')">The Hunt — how narcissists target overthinkers</div>
          <div class="custom-select-option" onclick="selectOption('carouselPillarSelect','The Trap','The Trap — psychological tactics inside the relationship')">The Trap — psychological tactics inside the relationship</div>
          <div class="custom-select-option" onclick="selectOption('carouselPillarSelect','The 3am Mind','The 3am Mind — raw thoughts at 3am')">The 3am Mind — raw thoughts at 3am</div>
          <div class="custom-select-option" onclick="selectOption('carouselPillarSelect','The Awakening','The Awakening — the moment you finally saw clearly')">The Awakening — the moment you finally saw clearly</div>
          <div class="custom-select-option" onclick="selectOption('carouselPillarSelect','The Survival','The Survival — healing and reclaiming yourself')">The Survival — healing and reclaiming yourself</div>
          <div class="custom-select-option" onclick="selectOption('carouselPillarSelect','The Victory','The Victory — celebrating how far you\'ve come')">The Victory — celebrating how far you've come</div>
        </div>
      </div>
    </div>
    <div class="form-group">
      <label>Number of Slides</label>
      <div class="platform-tabs">
        <div class="platform-tab active" onclick="setCarouselSlides(5,this)">5 slides</div>
        <div class="platform-tab" onclick="setCarouselSlides(7,this)">7 slides</div>
        <div class="platform-tab" onclick="setCarouselSlides(10,this)">10 slides</div>
      </div>
    </div>
    <div class="form-group">
      <label>Topic <span style="color:var(--gold-muted);font-weight:400">(optional)</span></label>
      <input type="text" id="carouselTopic" placeholder="e.g. love bombing signs" class="topic-input">
    </div>
  </div>

  <button class="btn-generate" id="generateBtn" onclick="handleGenerate()">Generate Script</button>

  <!-- ── SCRIPT RESULT ── -->
  <div class="result" id="result">
    <hr class="divider">
    <div class="result-header">
      <div>
        <div class="rh-label">Hook Score</div>
        <div class="score-val" id="hookScore">—</div>
      </div>
      <div style="display:flex;gap:10px;align-items:flex-end">
        <button class="regen-btn" id="regenBtn" onclick="regenerateHook()" title="New hook">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 4v5h5"/><path d="M20 20v-5h-5"/><path d="M4 9a9 9 0 0115.5-4.5M20 15a9 9 0 01-15.5 4.5"/></svg>
        </button>
        <div>
          <div class="rh-label" style="text-align:right">Best Time to Post</div>
          <div class="post-time-val" id="postTime">—</div>
        </div>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('script')">Full Script</button>
      <button class="tab-btn" onclick="switchTab('voiceover')">Voiceover</button>
    </div>

    <div class="tab-content active" id="tab-script">
      <div class="tab-actions">
        <button class="copy-btn" onclick="copyText('scriptText',this)">Copy</button>
      </div>
      <div class="script-text" id="scriptText"></div>
    </div>

    <div class="tab-content" id="tab-voiceover">
      <div class="tab-actions">
        <div id="voiceControls" style="display:none;align-items:center;gap:6px;flex-wrap:wrap">
          <button class="speed-btn active" id="modelTurbo" onclick="setVoiceModel('turbo')">Turbo</button>
          <button class="speed-btn" id="modelV3" onclick="setVoiceModel('v3')">V3 ✦</button>
          <button class="voice-btn" id="voiceBtn" onclick="generateVoice()">🔊 Generate Audio</button>
        </div>
        <button class="copy-btn" onclick="copyText('voiceoverText',this)">Copy</button>
      </div>
      <div class="script-text" id="voiceoverText"></div>
      <div id="audioWrap" class="audio-wrap" style="display:none">
        <audio id="audioEl" controls></audio>
        <div class="speed-row">
          <span class="speed-label">Speed</span>
          <button class="speed-btn" onclick="setSpeed(0.75)">0.75×</button>
          <button class="speed-btn" onclick="setSpeed(0.85)">0.85×</button>
          <button class="speed-btn active" onclick="setSpeed(0.9)">0.9×</button>
          <button class="speed-btn" onclick="setSpeed(1.0)">1×</button>
          <button class="speed-btn" onclick="setSpeed(1.1)">1.1×</button>
        </div>
      </div>
    </div>

    <div class="meta-row">
      <div class="meta-chip">Hook: <span id="hookLine">—</span></div>
      <button class="caption-btn" onclick="copyAsCaption()">Copy as Caption</button>
    </div>
    <div class="footage-tags" id="footageTags"></div>
    <div class="hashtags" id="hashtags"></div>

    <!-- Hook Variations -->
    <div class="hooks-section" style="margin-top:32px">
      <div class="hooks-header">
        <div class="pillar-guide-line"></div>
        <button class="pillar-guide-toggle" id="hooksToggleBtn" onclick="generateHookVariations()">↺ Generate 3 Alternative Hooks</button>
        <div class="pillar-guide-line"></div>
      </div>
      <div class="hooks-grid" id="hooksGrid" style="display:none;margin-top:16px"></div>
    </div>
  </div>

  <!-- ── BLOG RESULT ── -->
  <div class="blog-result" id="blogResult">
    <hr class="divider">
    <div>
      <div class="tab-actions">
        <div id="blogVoiceControls" style="display:none;align-items:center;gap:6px">
          <button class="speed-btn active" id="blogModelTurbo" onclick="setBlogVoiceModel('turbo')">Turbo</button>
          <button class="speed-btn" id="blogModelV3" onclick="setBlogVoiceModel('v3')">V3 ✦</button>
          <button class="voice-btn" id="blogVoiceBtn" onclick="generateBlogVoice()">🔊 Audio</button>
        </div>
        <button class="copy-btn" onclick="copyBlog()">Copy All</button>
      </div>
      <div id="blogAudioWrap" class="audio-wrap" style="display:none;margin-bottom:16px">
        <audio id="blogAudioEl" controls></audio>
        <div class="speed-row">
          <span class="speed-label">Speed</span>
          <button class="speed-btn" onclick="setBlogSpeed(0.75)">0.75×</button>
          <button class="speed-btn" onclick="setBlogSpeed(0.85)">0.85×</button>
          <button class="speed-btn active" onclick="setBlogSpeed(0.9)">0.9×</button>
          <button class="speed-btn" onclick="setBlogSpeed(1.0)">1×</button>
          <button class="speed-btn" onclick="setBlogSpeed(1.1)">1.1×</button>
        </div>
      </div>
      <div class="blog-title" id="blogTitle"></div>
      <div class="blog-meta" id="blogMeta"></div>
    </div>
    <div class="blog-section"><h3>intro</h3><div id="blogIntro"></div></div>
    <div id="blogSections"></div>
    <div class="blog-section"><h3>outro</h3><div id="blogOutro"></div></div>
    <div class="blog-tags" id="blogTags"></div>
  </div>

  <!-- ── WEEK RESULTS ── -->
  <div id="weekResultsWrap" style="display:none">
    <hr class="divider">
    <div class="rh-label" style="margin-bottom:20px">This Week — Generated Scripts</div>
    <div class="week-results-grid" id="weekResultsGrid"></div>
  </div>

  <!-- ── CAROUSEL RESULT ── -->
  <div id="carouselResult" style="display:none">
    <hr class="divider">
    <div id="carouselViewer"></div>
    <div class="meta-row" style="margin-top:20px">
      <div id="carouselCaption" style="font-size:0.78rem;color:var(--gold-deep);line-height:1.7;flex:1"></div>
      <button class="copy-btn" onclick="copyCarouselAll()">Copy All Slides</button>
    </div>
    <div class="hashtags" id="carouselHashtags"></div>
  </div>

</div><!-- end container -->

<script>
// ── STATE ───────────────────────────────────────────────────
let selectedPlatform = 'tiktok';
let selectedLength = 'short';
let selectedBlogLength = 'short';
let currentMode = 'script';
let selectedPillar = 'The Hunt';
let selectedBlogPillar = 'The Hunt';
let selectedTone = 3;
let currentResult = null;
let weekPlatform = 'tiktok';
let weekLength = 'short';
const PILLARS = ['The Hunt','The Trap','The 3am Mind','The Awakening','The Survival','The Victory'];
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
let weekConfig = DAYS.map((day, i) => ({ day, pillar: PILLARS[i] || PILLARS[0], status: 'pending', result: null }));
const HIST_KEY = 'lm_history_v2';

const toneLabels = {
  1: 'Cold & Prophetic — forbidden knowledge, warning tone',
  2: 'Dark & Cautionary — pulling back the curtain',
  3: 'Balanced — dark, poetic, emotional truth',
  4: 'Empathetic & Raw — intimate understanding',
  5: 'Deeply Intimate — diary at 3am, soft and healing'
};
const pillarLabels = {
  'The Hunt': 'The Hunt — how narcissists target overthinkers',
  'The Trap': 'The Trap — psychological tactics inside the relationship',
  'The 3am Mind': 'The 3am Mind — raw thoughts at 3am',
  'The Awakening': 'The Awakening — the moment you finally saw clearly',
  'The Survival': 'The Survival — healing and reclaiming yourself',
  'The Victory': "The Victory — celebrating how far you've come"
};

// ── INIT ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateHistoryCount();
  updateTone(3);
  renderWeekGrid();
  checkElevenStatus();
  // Platform tabs
  document.querySelectorAll('[data-platform]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-platform]').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedPlatform = tab.dataset.platform;
    });
  });
});

// ── PLATFORM ─────────────────────────────────────────────────
function selectPlatformTab(tab) {
  document.querySelectorAll('[data-platform]').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  selectedPlatform = tab.dataset.platform;
}

// ── TONE ────────────────────────────────────────────────────
function updateTone(val) {
  selectedTone = parseInt(val);
  document.getElementById('toneCurrent').textContent = toneLabels[selectedTone];
  const pct = ((val - 1) / 4) * 100;
  document.getElementById('toneSlider').style.background =
    'linear-gradient(90deg, var(--gold) ' + pct + '%, var(--gold-subtle) ' + pct + '%)';
}

// ── DROPDOWN ────────────────────────────────────────────────
function toggleDropdown(id) {
  const el = document.getElementById(id);
  const isOpen = el.classList.contains('open');
  document.querySelectorAll('.custom-select.open').forEach(d => d.classList.remove('open'));
  if (!isOpen) el.classList.add('open');
}
function selectOption(selectId, value, label) {
  if (selectId === 'pillarSelect') selectedPillar = value;
  else if (selectId === 'blogPillarSelect') selectedBlogPillar = value;
  else if (selectId === 'carouselPillarSelect') selectedCarouselPillar = value;
  const labelMap = { pillarSelect: 'pillarLabel', blogPillarSelect: 'blogPillarLabel', carouselPillarSelect: 'carouselPillarLabel' };
  document.getElementById(labelMap[selectId] || 'pillarLabel').textContent = label;
  document.querySelectorAll('#' + selectId + ' .custom-select-option').forEach(o => o.classList.remove('selected'));
  event.currentTarget.classList.add('selected');
  document.getElementById(selectId).classList.remove('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.custom-select')) document.querySelectorAll('.custom-select.open').forEach(d => d.classList.remove('open'));
});

// ── MODE ────────────────────────────────────────────────────
function setMode(mode, btn) {
  currentMode = mode;
  document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('scriptFields').style.display = mode === 'script' ? 'block' : 'none';
  document.getElementById('blogFields').style.display = mode === 'blog' ? 'block' : 'none';
  document.getElementById('weekFields').style.display = mode === 'week' ? 'block' : 'none';
  document.getElementById('carouselFields').style.display = mode === 'carousel' ? 'block' : 'none';
  document.getElementById('result').classList.remove('show');
  document.getElementById('blogResult').classList.remove('show');
  document.getElementById('weekResultsWrap').style.display = 'none';
  document.getElementById('carouselResult').style.display = 'none';
  const labels = { script: 'Generate Script', blog: 'Generate Blog Post', week: 'Generate This Week', carousel: 'Generate Carousel' };
  document.getElementById('generateBtn').textContent = labels[mode] || 'Generate';
}

// ── LENGTH / BLOG LENGTH ────────────────────────────────────
function selectLength(el) {
  document.querySelectorAll('[data-length]').forEach(t => t.classList.remove('active'));
  el.classList.add('active'); selectedLength = el.dataset.length;
}
function selectBlogLength(el) {
  document.querySelectorAll('[data-bloglength]').forEach(t => t.classList.remove('active'));
  el.classList.add('active'); selectedBlogLength = el.dataset.bloglength;
}

// ── TABS ────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelector('[onclick="switchTab(\\''+tab+'\\')"]').classList.add('active');
  document.getElementById('tab-'+tab).classList.add('active');
}

// ── PILLAR GUIDE ────────────────────────────────────────────
function toggleGuide(btn) {
  const guide = document.getElementById('pillarGuide');
  guide.classList.toggle('open');
  btn.textContent = guide.classList.contains('open') ? 'The Six Pillars — collapse' : 'The Six Pillars — expand to explore';
}
function selectPillar(name, card) {
  selectedPillar = name;
  document.getElementById('pillarLabel').textContent = pillarLabels[name];
  document.querySelectorAll('#pillarSelect .custom-select-option').forEach(o => o.classList.toggle('selected', o.textContent.trim() === pillarLabels[name]));
  document.querySelectorAll('.pillar-card').forEach(c => c.classList.remove('selected'));
  card.classList.add('selected');
}

// ── WEEK MODE ───────────────────────────────────────────────
function renderWeekGrid() {
  const grid = document.getElementById('weekGrid');
  grid.innerHTML = weekConfig.map((row, i) => \`
    <div class="week-row" id="week-row-\${i}">
      <div class="week-day">\${row.day.slice(0,3)}</div>
      <button class="week-pillar-cycle" onclick="cycleWeekPillar(\${i})" id="week-pillar-\${i}">\${row.pillar} ↻</button>
      <div class="week-status" id="week-status-\${i}">⏳</div>
    </div>
  \`).join('');
}
function cycleWeekPillar(i) {
  const idx = PILLARS.indexOf(weekConfig[i].pillar);
  weekConfig[i].pillar = PILLARS[(idx + 1) % PILLARS.length];
  document.getElementById('week-pillar-'+i).textContent = weekConfig[i].pillar + ' ↻';
}
function setWeekPlatform(el, val) {
  document.querySelectorAll('[data-week-platform]').forEach(t => t.classList.remove('active'));
  el.classList.add('active'); weekPlatform = val;
}
function setWeekLength(el, val) {
  document.querySelectorAll('[data-week-length]').forEach(t => t.classList.remove('active'));
  el.classList.add('active'); weekLength = val;
}

// ── GENERATE ────────────────────────────────────────────────
function handleGenerate() {
  if (currentMode === 'blog') generateBlog();
  else if (currentMode === 'week') generateWeek();
  else if (currentMode === 'carousel') generateCarousel();
  else generate();
}

async function generate() {
  const btn = document.getElementById('generateBtn');
  const result = document.getElementById('result');
  btn.disabled = true; btn.textContent = 'Writing...';
  result.classList.remove('show');
  document.getElementById('hooksGrid').style.display = 'none';
  document.getElementById('hooksToggleBtn').textContent = '↺ Generate 3 Alternative Hooks';
  try {
    const res = await fetch('/generate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pillar: selectedPillar, platform: selectedPlatform, topic: document.getElementById('topic').value, length: selectedLength, tone: selectedTone })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    currentResult = data;
    document.getElementById('hookScore').innerHTML = data.hook_score + '<small>/100</small>';
    document.getElementById('postTime').textContent = data.posting_time;
    document.getElementById('hookLine').textContent = data.hook;
    document.getElementById('scriptText').textContent = data.script;
    document.getElementById('voiceoverText').textContent = data.voiceover;
    document.getElementById('hashtags').textContent = data.hashtags;
    renderFootageTags(data.stock_footage||[]);
    document.getElementById('audioWrap').style.display = 'none';
    // Reset tabs
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn')[0].classList.add('active');
    document.getElementById('tab-script').classList.add('active');
    result.classList.add('show');
    saveToHistory({ type:'script', pillar:selectedPillar, platform:selectedPlatform, length:selectedLength, tone:selectedTone, hookScore:data.hook_score, hook:data.hook, script:data.script, voiceover:data.voiceover, hashtags:data.hashtags, footageTags:data.stock_footage||[] });
  } catch(err) { alert('Error: '+err.message); }
  finally { btn.disabled = false; btn.textContent = 'Generate Script'; }
}

async function generateBlog() {
  const btn = document.getElementById('generateBtn');
  const blogResult = document.getElementById('blogResult');
  btn.disabled = true; btn.textContent = 'Writing...';
  blogResult.classList.remove('show');
  try {
    const res = await fetch('/generate-blog', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pillar: selectedBlogPillar, topic: document.getElementById('blogTopic').value, length: selectedBlogLength })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    document.getElementById('blogTitle').textContent = data.title;
    document.getElementById('blogMeta').textContent = '/' + data.slug + '  ·  ' + data.meta_description;
    document.getElementById('blogIntro').innerHTML = '<p>' + data.intro + '</p>';
    document.getElementById('blogOutro').innerHTML = '<p>' + data.outro + '</p>';
    document.getElementById('blogSections').innerHTML = (data.sections||[]).map(s =>
      '<div class="blog-section"><h3>'+s.heading+'</h3>'+s.content.split('\\n\\n').map(p=>'<p>'+p+'</p>').join('')+'</div>').join('');
    document.getElementById('blogTags').innerHTML = (data.tags||[]).map(t=>'<span class="blog-tag">#'+t+'</span>').join('');
    blogResult.classList.add('show');
    saveToHistory({ type:'blog', pillar:selectedBlogPillar, hookScore:null, hook:data.title, script:null, voiceover:null });
  } catch(err) { alert('Error: '+err.message); }
  finally { btn.disabled = false; btn.textContent = 'Generate Blog Post'; }
}

async function generateWeek() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = true; btn.textContent = 'Generating Week...';
  weekConfig.forEach((_, i) => { weekConfig[i].status = 'pending'; weekConfig[i].result = null; });
  document.getElementById('weekResultsWrap').style.display = 'none';

  for (let i = 0; i < weekConfig.length; i++) {
    const row = weekConfig[i];
    document.getElementById('week-row-'+i).className = 'week-row generating';
    document.getElementById('week-status-'+i).textContent = '⟳';
    try {
      const res = await fetch('/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pillar: row.pillar, platform: weekPlatform, topic: '', length: weekLength, tone: selectedTone })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      weekConfig[i].status = 'done'; weekConfig[i].result = data;
      document.getElementById('week-row-'+i).className = 'week-row done';
      document.getElementById('week-status-'+i).textContent = '✓';
      saveToHistory({ type:'script', pillar:row.pillar, platform:weekPlatform, length:weekLength, tone:selectedTone, hookScore:data.hook_score, hook:data.hook, script:data.script, voiceover:data.voiceover, hashtags:data.hashtags, footageTags:data.stock_footage||[] });
    } catch(err) {
      weekConfig[i].status = 'error';
      document.getElementById('week-row-'+i).className = 'week-row error';
      document.getElementById('week-status-'+i).textContent = '✗';
    }
  }
  renderWeekResults();
  document.getElementById('weekResultsWrap').style.display = 'block';
  showWeekAudioButtons();
  btn.disabled = false; btn.textContent = 'Generate This Week';
}

function renderWeekResults() {
  const grid = document.getElementById('weekResultsGrid');
  grid.innerHTML = weekConfig.map((row, idx) => {
    if (!row.result) return '';
    return \`<div class="week-result-card">
      <div class="week-card-top">
        <div><div class="week-card-day">\${row.day} · \${row.pillar}</div></div>
        <div class="week-card-score">\${row.result.hook_score}<span style="font-size:0.8rem;color:var(--text-dim)">/100</span></div>
      </div>
      <div class="week-card-hook">"\${row.result.hook}"</div>
      <div class="week-card-actions">
        <button class="week-copy-btn" onclick="copyWeekItem(\${idx},'script')">Copy Script</button>
        <button class="week-copy-btn" onclick="copyWeekItem(\${idx},'voiceover')">Copy Voiceover</button>
        <button class="week-copy-btn" id="weekVoiceBtn-\${idx}" onclick="generateWeekVoice(\${idx})" style="display:none">🔊 Audio</button>
      </div>
      <div id="weekAudioWrap-\${idx}" class="audio-wrap" style="display:none;margin-top:10px">
        <audio id="weekAudioEl-\${idx}" controls></audio>
        <div class="speed-row">
          <span class="speed-label">Speed</span>
          <button class="speed-btn" onclick="setWeekSpeed(\${idx},0.75)">0.75×</button>
          <button class="speed-btn" onclick="setWeekSpeed(\${idx},0.85)">0.85×</button>
          <button class="speed-btn active" onclick="setWeekSpeed(\${idx},0.9)">0.9×</button>
          <button class="speed-btn" onclick="setWeekSpeed(\${idx},1.0)">1×</button>
        </div>
      </div>
    </div>\`;
  }).join('');
}
function copyWeekItem(idx, field) { navigator.clipboard.writeText(weekConfig[idx].result[field]); }
function copyRaw(text) { navigator.clipboard.writeText(text); }
function showWeekAudioButtons() {
  if (!elevenConfigured) return;
  weekConfig.forEach((row, idx) => {
    if (row.result) {
      const btn = document.getElementById('weekVoiceBtn-'+idx);
      if (btn) btn.style.display = 'inline-block';
    }
  });
}
function setSpeed(rate) {
  const audio = document.getElementById('audioEl');
  if (audio) audio.playbackRate = rate;
  document.querySelectorAll('.speed-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.textContent) === rate);
  });
}

// ── REGENERATE HOOK ─────────────────────────────────────────
async function regenerateHook() {
  const btn = document.getElementById('regenBtn');
  btn.classList.add('spinning'); btn.disabled = true;
  try {
    const res = await fetch('/regenerate-hook', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pillar: selectedPillar, platform: selectedPlatform, topic: document.getElementById('topic').value, tone: selectedTone })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    document.getElementById('hookScore').innerHTML = data.hook_score + '<small>/100</small>';
    document.getElementById('hookLine').textContent = data.hook;
    if (currentResult) currentResult.hook = data.hook;
  } catch(err) { alert('Error: '+err.message); }
  finally { btn.classList.remove('spinning'); btn.disabled = false; }
}

// ── HOOK VARIATIONS ─────────────────────────────────────────
async function generateHookVariations() {
  const btn = document.getElementById('hooksToggleBtn');
  const grid = document.getElementById('hooksGrid');
  btn.textContent = 'Generating...';
  try {
    const res = await fetch('/generate-hooks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pillar: selectedPillar, platform: selectedPlatform, topic: document.getElementById('topic').value, tone: selectedTone })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    grid.innerHTML = (data.hooks||[]).map((h, i) => \`
      <div class="hook-var-card" onclick="useHookVariation('\${h.text.replace(/'/g,"\\\\'")}',\${h.score})">
        <div class="hook-var-score">\${h.score}<span style="font-size:0.8rem;color:var(--text-dim)">/100</span></div>
        <div class="hook-var-text">"\${h.text}"</div>
        <div class="hook-var-why">\${h.why}</div>
        <div class="hook-var-use">↑ Use this hook</div>
      </div>
    \`).join('');
    grid.style.display = 'grid';
    btn.textContent = '↺ Regenerate Hooks';
  } catch(err) { btn.textContent = '↺ Generate 3 Alternative Hooks'; alert('Error: '+err.message); }
}
function useHookVariation(text, score) {
  document.getElementById('hookScore').innerHTML = score + '<small>/100</small>';
  document.getElementById('hookLine').textContent = text;
  if (currentResult) currentResult.hook = text;
}

// ── ELEVENLABS VOICE ─────────────────────────────────────────
let selectedVoiceModel = 'turbo';
function setVoiceModel(model) {
  selectedVoiceModel = model;
  document.getElementById('modelTurbo').classList.toggle('active', model === 'turbo');
  document.getElementById('modelV3').classList.toggle('active', model === 'v3');
}
let elevenConfigured = false;
async function checkElevenStatus() {
  try {
    const res = await fetch('/eleven-status');
    const data = await res.json();
    elevenConfigured = data.configured;
    if (data.configured) {
      document.getElementById('voiceControls').style.display = 'flex';
      document.getElementById('blogVoiceControls').style.display = 'flex';
    }
  } catch(_) {}
}
async function generateVoice() {
  const btn = document.getElementById('voiceBtn');
  const text = document.getElementById('voiceoverText').textContent;
  if (!text.trim()) return;
  btn.disabled = true;
  btn.textContent = selectedVoiceModel === 'v3' ? '⏳ V3 generating (slow)...' : '⏳ Generating...';
  try {
    const res = await fetch('/generate-voice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model: selectedVoiceModel })
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audioEl = document.getElementById('audioEl');
    audioEl.src = url;
    audioEl.playbackRate = 0.9;
    document.getElementById('audioWrap').style.display = 'block';
    audioEl.play();
    btn.textContent = '🔊 Regenerate';
  } catch(err) { alert('Voice error: '+err.message); btn.textContent = '🔊 Audio'; }
  finally { btn.disabled = false; }
}

// ── BLOG VOICE ───────────────────────────────────────────────
let selectedBlogVoiceModel = 'turbo';
function setBlogVoiceModel(model) {
  selectedBlogVoiceModel = model;
  document.getElementById('blogModelTurbo').classList.toggle('active', model === 'turbo');
  document.getElementById('blogModelV3').classList.toggle('active', model === 'v3');
}
function setBlogSpeed(rate) {
  const audio = document.getElementById('blogAudioEl');
  if (audio) audio.playbackRate = rate;
  document.querySelectorAll('#blogAudioWrap .speed-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.textContent) === rate);
  });
}
async function generateBlogVoice() {
  const btn = document.getElementById('blogVoiceBtn');
  const title = document.getElementById('blogTitle').textContent;
  const intro = document.getElementById('blogIntro').textContent;
  const outro = document.getElementById('blogOutro').textContent;
  const text = [title, intro, outro].filter(Boolean).join('\\n\\n');
  if (!text.trim()) return;
  btn.disabled = true;
  btn.textContent = selectedBlogVoiceModel === 'v3' ? '⏳ V3...' : '⏳ Generating...';
  try {
    const res = await fetch('/generate-voice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model: selectedBlogVoiceModel })
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audioEl = document.getElementById('blogAudioEl');
    audioEl.src = url;
    audioEl.playbackRate = 0.9;
    document.getElementById('blogAudioWrap').style.display = 'block';
    audioEl.play();
    btn.textContent = '🔊 Regenerate';
  } catch(err) { alert('Voice error: '+err.message); btn.textContent = '🔊 Audio'; }
  finally { btn.disabled = false; }
}

// ── WEEK VOICE ────────────────────────────────────────────────
function setWeekSpeed(idx, rate) {
  const audio = document.getElementById('weekAudioEl-'+idx);
  if (audio) audio.playbackRate = rate;
  document.querySelectorAll('#weekAudioWrap-'+idx+' .speed-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.textContent) === rate);
  });
}
async function generateWeekVoice(idx) {
  const btn = document.getElementById('weekVoiceBtn-'+idx);
  const text = weekConfig[idx].result.voiceover;
  if (!text || !text.trim()) return;
  btn.disabled = true; btn.textContent = '⏳...';
  try {
    const res = await fetch('/generate-voice', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model: selectedVoiceModel })
    });
    if (!res.ok) { const err = await res.json(); throw new Error(err.error); }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audioEl = document.getElementById('weekAudioEl-'+idx);
    audioEl.src = url;
    audioEl.playbackRate = 0.9;
    document.getElementById('weekAudioWrap-'+idx).style.display = 'block';
    audioEl.play();
    btn.textContent = '🔊 Redo';
  } catch(err) { alert('Voice error: '+err.message); btn.textContent = '🔊 Audio'; }
  finally { btn.disabled = false; }
}

// ── FOOTAGE IMAGES ───────────────────────────────────────────
function renderFootageTags(tags) {
  const container = document.getElementById('footageTags');
  container.innerHTML = tags.map(t => '<span class="footage-tag-simple">🎥 ' + t + '</span>').join('');
}

// ── CAROUSEL ─────────────────────────────────────────────────
let selectedCarouselPillar = 'The Hunt';
let selectedCarouselSlides = 7;
let carouselData = [];
let carouselIndex = 0;

function setCarouselSlides(n, el) {
  selectedCarouselSlides = n;
  document.querySelectorAll('#carouselFields .platform-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

async function generateCarousel() {
  const btn = document.getElementById('generateBtn');
  btn.disabled = true; btn.textContent = 'Generating...';
  document.getElementById('carouselResult').style.display = 'none';
  try {
    const res = await fetch('/generate-carousel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pillar: selectedCarouselPillar, topic: document.getElementById('carouselTopic').value, tone: selectedTone, slides: selectedCarouselSlides })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error);
    carouselData = data.slides || [];
    carouselIndex = 0;
    renderCarousel();
    document.getElementById('carouselCaption').textContent = data.caption || '';
    document.getElementById('carouselHashtags').textContent = data.hashtags || '';
    document.getElementById('carouselResult').style.display = 'block';
  } catch(err) { alert('Error: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Generate Carousel'; }
}

function renderCarousel() {
  const wrap = document.getElementById('carouselViewer');
  if (!carouselData.length) return;
  const total = carouselData.length;
  const dots = carouselData.map((_, i) => '<button class="carousel-dot' + (i === 0 ? ' active' : '') + '" onclick="goSlide(' + i + ')"></button>').join('');
  const slides = carouselData.map((s, i) => {
    return '<div class="carousel-slide' + (i === 0 ? ' active' : '') + '" id="cslide-' + i + '">'
      + '<div class="carousel-slide-headline">' + (s.headline || '') + '</div>'
      + (s.subtext ? '<div class="carousel-slide-subtext">' + s.subtext + '</div>' : '')
      + '<div class="carousel-slide-num">' + (i + 1) + ' / ' + total + '</div>'
      + '</div>';
  }).join('');
  wrap.innerHTML = '<div class="carousel-slide-wrap">' + slides + '</div>'
    + '<div class="carousel-nav">'
    + '<button class="carousel-nav-btn" id="cprev" onclick="moveSlide(-1)" disabled>&#8592;</button>'
    + '<div class="carousel-dots">' + dots + '</div>'
    + '<button class="carousel-copy-slide" onclick="copyCurrentSlide()">Copy Slide</button>'
    + '<button class="carousel-nav-btn" id="cnext" onclick="moveSlide(1)">&#8594;</button>'
    + '</div>';
}

function goSlide(i) {
  document.querySelectorAll('.carousel-slide').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.carousel-dot').forEach(d => d.classList.remove('active'));
  carouselIndex = i;
  document.getElementById('cslide-' + i).classList.add('active');
  document.querySelectorAll('.carousel-dot')[i].classList.add('active');
  document.getElementById('cprev').disabled = i === 0;
  document.getElementById('cnext').disabled = i === carouselData.length - 1;
}

function moveSlide(dir) {
  const next = carouselIndex + dir;
  if (next >= 0 && next < carouselData.length) goSlide(next);
}

function copyCurrentSlide() {
  const s = carouselData[carouselIndex];
  if (!s) return;
  const text = (s.headline || '') + (s.subtext ? '\\n\\n' + s.subtext : '');
  navigator.clipboard.writeText(text);
}

function copyCarouselAll() {
  const nl = '\\n';
  const text = carouselData.map((s, i) => 'Slide ' + (i+1) + ':' + nl + (s.headline || '') + (s.subtext ? nl + s.subtext : '')).join(nl + nl + '---' + nl + nl);
  navigator.clipboard.writeText(text);
}

// ── CAPTION COPY ─────────────────────────────────────────────
function copyAsCaption() {
  const hook = document.getElementById('hookLine').textContent;
  const tags = document.getElementById('hashtags').textContent;
  const caption = hook + '\\n\\n' + tags;
  navigator.clipboard.writeText(caption).then(() => {
    const btn = event.currentTarget;
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = orig, 2000);
  });
}

// ── HISTORY ──────────────────────────────────────────────────
function getHistory() { try { return JSON.parse(localStorage.getItem(HIST_KEY)) || []; } catch { return []; } }
function saveToHistory(item) {
  const hist = getHistory();
  hist.unshift({ ...item, id: Date.now(), savedAt: new Date().toISOString() });
  if (hist.length > 30) hist.length = 30;
  localStorage.setItem(HIST_KEY, JSON.stringify(hist));
  updateHistoryCount();
  updateScoreChart();
}
function updateHistoryCount() {
  const count = getHistory().length;
  const el = document.getElementById('histCount');
  const sub = document.getElementById('histSub');
  el.textContent = count;
  el.style.display = count > 0 ? 'flex' : 'none';
  if (sub) sub.textContent = count + ' script' + (count !== 1 ? 's' : '') + ' saved';
}
function updateScoreChart() {
  const hist = getHistory().filter(h => h.hookScore != null).slice(0, 10);
  const wrap = document.getElementById('scoreChartWrap');
  const bars = document.getElementById('scoreChartBars');
  if (!hist.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'block';
  const max = Math.max(...hist.map(h => h.hookScore), 60);
  bars.innerHTML = hist.reverse().map(h => {
    const pct = (h.hookScore / max) * 100;
    const cls = h.hookScore >= 80 ? 'high' : h.hookScore >= 60 ? 'mid' : 'low';
    return '<div class="score-bar '+cls+'" style="height:'+pct+'%" title="'+h.hookScore+'/100 — '+h.pillar+'"></div>';
  }).join('');
}
function renderHistory() {
  const hist = getHistory();
  const list = document.getElementById('histList');
  if (!hist.length) { list.innerHTML = '<div class="hist-empty">No scripts yet. Generate your first one.</div>'; return; }
  list.innerHTML = hist.map(item => \`
    <div class="hist-item" onclick="restoreFromHistory(\${item.id})">
      <button class="hist-item-del" onclick="event.stopPropagation();deleteHistoryItem(\${item.id})">✕</button>
      <div class="hist-item-top">
        <div class="hist-item-pillar">\${item.pillar}</div>
        \${item.hookScore != null ? '<div class="hist-item-score">'+item.hookScore+'<span style="font-size:0.7rem;color:var(--text-dim)">/100</span></div>' : '<div class="hist-item-score" style="font-size:0.75rem;color:var(--gold-muted)">blog</div>'}
      </div>
      <div class="hist-item-hook">"\${item.hook || 'untitled'}"</div>
      <div class="hist-item-meta">
        <span>\${item.type||'script'}</span>
        \${item.platform ? '<span>'+item.platform+'</span>' : ''}
        <span>\${new Date(item.savedAt).toLocaleDateString()}</span>
      </div>
    </div>
  \`).join('');
}
function restoreFromHistory(id) {
  const item = getHistory().find(h => h.id === id);
  if (!item || !item.script) return;
  currentResult = item;
  document.getElementById('hookScore').innerHTML = item.hookScore + '<small>/100</small>';
  document.getElementById('hookLine').textContent = item.hook;
  document.getElementById('scriptText').textContent = item.script;
  document.getElementById('voiceoverText').textContent = item.voiceover || '';
  document.getElementById('hashtags').textContent = item.hashtags || '';
  renderFootageTags(item.footageTags||[]);
  document.getElementById('postTime').textContent = '—';
  document.getElementById('audioWrap').style.display = 'none';
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.tab-btn')[0].classList.add('active');
  document.getElementById('tab-script').classList.add('active');
  document.getElementById('result').classList.add('show');
  closeHistory();
  // Switch to script mode if needed
  if (currentMode !== 'script') {
    document.querySelectorAll('.mode-btn')[0].click();
  }
}
function deleteHistoryItem(id) {
  const hist = getHistory().filter(h => h.id !== id);
  localStorage.setItem(HIST_KEY, JSON.stringify(hist));
  updateHistoryCount(); updateScoreChart(); renderHistory();
}
function clearHistory() {
  if (!confirm('Clear all history?')) return;
  localStorage.removeItem(HIST_KEY);
  updateHistoryCount(); updateScoreChart(); renderHistory();
}
function openHistory() {
  renderHistory(); updateScoreChart();
  document.getElementById('histDrawer').classList.add('open');
  document.getElementById('histOverlay').classList.add('open');
}
function closeHistory() {
  document.getElementById('histDrawer').classList.remove('open');
  document.getElementById('histOverlay').classList.remove('open');
}

// ── COPY UTILS ───────────────────────────────────────────────
function copyText(id, btn) {
  navigator.clipboard.writeText(document.getElementById(id).textContent).then(() => {
    const orig = btn.textContent; btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 2000);
  });
}
function copyBlog() {
  const text = [
    document.getElementById('blogTitle').textContent,
    document.getElementById('blogIntro').textContent,
    document.getElementById('blogSections').textContent,
    document.getElementById('blogOutro').textContent
  ].join('\\n\\n');
  navigator.clipboard.writeText(text).then(() => alert('Blog post copied!'));
}
</script>
</body>
</html>`);
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`\nloud minds. running at http://localhost:${PORT}\n`));
