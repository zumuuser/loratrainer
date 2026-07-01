// OpenRouter API integration — captioning + chat-to-config
const fs = require('fs');
const path = require('path');

// Cost-conscious vision model for captioning (good quality, low cost)
const CAPTION_MODEL = 'google/gemini-2.0-flash-001';
// Fallback if primary unavailable
const CAPTION_MODEL_FALLBACK = 'meta-llama/llama-4-scout:free';

const CAPTION_SYSTEM_PROMPT = `You are a precise image captioning assistant for AI model training datasets.

Your task: Write a detailed, natural-language caption for the given image.

Rules:
- Describe the person's appearance in detail: face shape, skin tone, hair color/style, eye color, body type, age range
- Describe clothing, accessories, and styling
- Describe the background, lighting conditions, color temperature, and atmosphere
- Describe the camera angle, framing, and photo style (selfie, portrait, candid, etc.)
- Mention texture quality (phone camera, DSLR, film grain, etc.)
- Be factual and specific — no poetic language
- Keep to 2-4 sentences
- Do NOT add any prefix like "Caption:" — just output the description directly`;

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

async function callOpenRouter(apiKey, model, messages, maxTokens = 300) {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://loratrainer.app',
      'X-Title': 'LoRA Trainer',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${err}`);
  }

  const data = await res.json();
  return {
    content: data.choices?.[0]?.message?.content?.trim() || '',
    usage: data.usage || {},
    cost: data.usage?.total_cost || 0,
  };
}

function imageToBase64(filePath) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext] || 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function register(ipcMain) {
  // Validate API key
  ipcMain.handle('openrouter:validateKey', async (_, apiKey) => {
    try {
      const res = await fetch(`${OPENROUTER_BASE}/models`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      });
      return res.ok;
    } catch { return false; }
  });

  // Caption images one-by-one (cost-conscious: no batching large payloads)
  ipcMain.handle('openrouter:caption', async (event, imagePaths, apiKey, model) => {
    const captions = [];
    let totalCost = 0;
    const selectedModel = model || CAPTION_MODEL;

    for (let i = 0; i < imagePaths.length; i++) {
      try {
        const b64 = imageToBase64(imagePaths[i]);
        const messages = [
          { role: 'system', content: CAPTION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: b64 } },
              { type: 'text', text: 'Caption this image for LoRA training.' },
            ],
          },
        ];

        let result;
        try {
          result = await callOpenRouter(apiKey, selectedModel, messages);
        } catch (err) {
          // If custom model failed, try primary fallback
          result = await callOpenRouter(apiKey, CAPTION_MODEL_FALLBACK, messages);
        }

        captions.push(result.content);
        totalCost += result.cost;

        // Send progress back to renderer
        event.sender.send('openrouter:captionProgress', {
          current: i + 1,
          total: imagePaths.length,
          caption: result.content,
          cost: totalCost,
        });
      } catch (err) {
        captions.push(`[Error: ${err.message}]`);
      }
    }

    return { captions, totalCost };
  });

  // Chat completion for config generation
  ipcMain.handle('openrouter:chat', async (_, messages, apiKey, model) => {
    try {
      const selectedModel = model || CAPTION_MODEL;
      const result = await callOpenRouter(apiKey, selectedModel, messages, 800);
      return { content: result.content, cost: result.cost };
    } catch (err) {
      return { error: err.message };
    }
  });
}

module.exports = { register };
