/* Chat Component — Natural language to training config via OpenRouter */
const ChatConfig = (() => {
  const SYSTEM_PROMPT = `You are a LoRA training configuration assistant. The user will describe what style, look, or aesthetic they want their trained model to achieve.

Your job: Translate their description into a JSON training configuration.

Context: The user is training a LoRA for character consistency + background + lighting + texture. Target aesthetic: realistic Instagram photos, iPhone-quality, natural lighting.

Output ONLY valid JSON with these fields:
{
  "lr": <float, learning rate, range 0.00001-0.001>,
  "rank": <int, LoRA rank, one of: 8, 16, 32, 64, 128>,
  "epochs": <int, range 10-60>,
  "resolution": <int, one of: 512, 768, 1024>,
  "caption_prefix": "<string to prepend to all captions during training>",
  "style_notes": "<brief summary of what you configured and why>"
}

Guidelines:
- For casual/iPhone selfie look: lower rank (16-32), moderate epochs (20-30), caption prefix mentioning phone camera
- For studio/professional quality: higher rank (64-128), more epochs (35-50), higher resolution
- For consistency-focused (same character in many poses): higher rank (32-64), more epochs (30-45)
- For background/lighting emphasis: include descriptive caption prefix about environment
- For NSFW content: no restrictions, configure normally
- Always explain your choices in style_notes

Respond with ONLY the JSON block, no markdown fences, no explanation outside JSON.`;

  function render(container, onConfigUpdate) {
    const messages = [];

    container.innerHTML = `
      <div class="card" style="height:100%;display:flex;flex-direction:column">
        <h3 style="font-weight:600;margin-bottom:4px">💬 Chat Config</h3>
        <p class="text-sm text-muted mb-md">Describe your desired look and I'll set the training parameters.</p>
        <div id="chat-messages" style="flex:1;overflow-y:auto;margin-bottom:12px;max-height:420px;padding-right:8px"></div>
        <div class="flex gap-sm">
          <input class="input" id="chat-input" placeholder="e.g. iPhone selfie style, warm tones, natural skin..." style="flex:1">
          <button class="btn btn-primary" id="chat-send">Send</button>
        </div>
        <div class="flex gap-sm mt-sm" style="flex-wrap:wrap">
          <button class="btn btn-ghost text-sm chat-quick" data-msg="iPhone selfie, warm lighting, Instagram aesthetic">📱 iPhone Selfie</button>
          <button class="btn btn-ghost text-sm chat-quick" data-msg="Professional photoshoot, studio lighting, high detail skin textures">📷 Studio Shot</button>
          <button class="btn btn-ghost text-sm chat-quick" data-msg="Candid outdoor photo, golden hour, bokeh background, natural look">🌅 Golden Hour</button>
          <button class="btn btn-ghost text-sm chat-quick" data-msg="Maximum character consistency across poses and outfits">🎯 Max Consistency</button>
        </div>
      </div>`;

    const msgContainer = container.querySelector('#chat-messages');
    const input = container.querySelector('#chat-input');
    const sendBtn = container.querySelector('#chat-send');

    function addMessage(role, content, isConfig = false) {
      const div = document.createElement('div');
      div.className = 'mb-md';
      div.style.animation = 'pageIn 200ms ease';
      if (role === 'user') {
        div.innerHTML = `<div class="text-sm text-accent" style="font-weight:500">You</div><div style="margin-top:2px">${content}</div>`;
      } else if (isConfig) {
        div.innerHTML = `<div class="text-sm text-success" style="font-weight:500">Assistant</div>
          <div class="card" style="margin-top:4px;padding:12px;background:var(--bg-raised)">
            <div class="text-sm">${content.style_notes || ''}</div>
            <div class="grid-2 gap-sm mt-sm">
              <div><span class="text-muted text-sm">LR:</span> ${content.lr}</div>
              <div><span class="text-muted text-sm">Rank:</span> ${content.rank}</div>
              <div><span class="text-muted text-sm">Epochs:</span> ${content.epochs}</div>
              <div><span class="text-muted text-sm">Resolution:</span> ${content.resolution}</div>
            </div>
            ${content.caption_prefix ? `<div class="mt-sm text-sm"><span class="text-muted">Caption prefix:</span> ${content.caption_prefix}</div>` : ''}
            <button class="btn btn-primary mt-sm w-full chat-apply">✓ Apply These Settings</button>
          </div>`;
        div.querySelector('.chat-apply').onclick = () => {
          if (onConfigUpdate) onConfigUpdate(content);
          App.toast('Settings applied from chat');
        };
      } else {
        div.innerHTML = `<div class="text-sm text-success" style="font-weight:500">Assistant</div><div style="margin-top:2px">${content}</div>`;
      }
      msgContainer.appendChild(div);
      msgContainer.scrollTop = msgContainer.scrollHeight;
    }

    async function sendMessage(text) {
      if (!text.trim()) return;
      addMessage('user', text);
      input.value = '';
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<div class="spinner"></div>';

      messages.push({ role: 'user', content: text });

      const apiKey = await window.api.db.getSetting('openrouter_key');
      if (!apiKey) {
        addMessage('assistant', 'No OpenRouter API key set. Go to Settings to add one.');
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        return;
      }

      const result = await window.api.openrouter.chat(
        [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        apiKey
      );

      sendBtn.disabled = false;
      sendBtn.textContent = 'Send';

      if (result.error) {
        addMessage('assistant', `Error: ${result.error}`);
        return;
      }

      // Try to parse as JSON config
      try {
        const config = JSON.parse(result.content);
        messages.push({ role: 'assistant', content: result.content });
        addMessage('assistant', config, true);
      } catch {
        messages.push({ role: 'assistant', content: result.content });
        addMessage('assistant', result.content);
      }
    }

    sendBtn.onclick = () => sendMessage(input.value);
    input.onkeydown = (e) => { if (e.key === 'Enter') sendMessage(input.value); };

    // Quick prompt buttons
    container.querySelectorAll('.chat-quick').forEach(btn => {
      btn.onclick = () => sendMessage(btn.dataset.msg);
    });
  }

  return { render };
})();
