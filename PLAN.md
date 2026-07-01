# LoRA Trainer — Master Plan & Progress Tracker

> **Repo:** `loratrainer` (private, GitHub)  
> **Created:** 2026-07-01  
> **Status:** 🟡 Planning Complete — Awaiting GitHub Access

---

## 0. Platform Access Needed

| Platform | Status | Notes |
|----------|--------|-------|
| GitHub | ❌ **NEED ACCESS** | Create private repo `loratrainer` |
| Azure DevOps | ⏳ Later | For .exe/.deb compilation |
| RunPod/Vast.ai | N/A | User provides own API key |
| OpenRouter | N/A | User provides own API key |

---

## 1. What We're Building

A **downloadable desktop app** (.exe for Windows, .deb for Linux) that lets 1-3 users:
1. Upload images in bulk → auto-caption via OpenRouter
2. Configure LoRA training via simple UI or **chat interface** (natural language → training config)
3. Train on cloud GPUs (RunPod/Vast.ai) using user's own API key
4. Monitor training with ETA, start/stop/continue
5. Auto-shutdown GPU server when done
6. Generate sample images with trained LoRA
7. Manage a local library of trained models + download .safetensors

**LoRA scope:** Character + background + lighting + textures consistency (Instagram-realistic, iPhone-quality aesthetic).

**NSFW:** Allowed under standard rules (consensual, 21+ only).

---

## 2. Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Desktop Shell** | Electron | Compiles to .exe + .deb via electron-builder. One codebase. |
| **Frontend** | Vanilla HTML/CSS/JS | Simplest to maintain. No framework churn. |
| **Backend** | Node.js (embedded in Electron) | Same language as frontend. Handles API calls, file mgmt, job orchestration. |
| **Database** | SQLite (via better-sqlite3) | Zero-config, local, single file. |
| **Training Engine** | AI Toolkit (Ostris) | Deployed to cloud GPU as Docker container. YAML config generated locally. |
| **GPU Providers** | Vast.ai (primary), RunPod (secondary) | User picks. Both have REST APIs. |
| **Captioning** | OpenRouter API | User's own key. Cost-conscious model selection. |
| **Chat Config** | OpenRouter API | Translates natural language → training YAML via inference model. |
| **File Storage** | Local filesystem | Models + datasets stored in app data directory. |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────┐
│              ELECTRON DESKTOP APP                │
│                                                  │
│  ┌──────────────┐  ┌─────────────────────────┐  │
│  │  Frontend     │  │  Node.js Backend         │  │
│  │  HTML/CSS/JS  │◄─►  - API orchestrator      │  │
│  │              │  │  - File manager           │  │
│  │  Pages:       │  │  - SQLite DB             │  │
│  │  - Onboarding │  │  - Job queue             │  │
│  │  - Upload     │  │  - GPU lifecycle mgr     │  │
│  │  - Train      │  │  - Config generator      │  │
│  │  - Dashboard  │  │  - Cost tracker          │  │
│  │  - Library    │  │                          │  │
│  │  - Settings   │  │  External APIs:          │  │
│  │  - Chat       │  │  - Vast.ai / RunPod      │  │
│  └──────────────┘  │  - OpenRouter             │  │
│                     └─────────────────────────┘  │
└─────────────────────────────────────────────────┘
                        │
                        │ REST API calls
                        ▼
              ┌───────────────────┐
              │  CLOUD GPU        │
              │  (Vast.ai/RunPod) │
              │                   │
              │  Docker:          │
              │  AI Toolkit +     │
              │  Base Model       │
              │  (KREA2/Ideo4)    │
              │                   │
              │  Trains LoRA →    │
              │  Uploads result   │
              └───────────────────┘
```

---

## 4. User Flow

### 4.1 First Launch (Onboarding)
1. User enters name/profile
2. User adds API keys: OpenRouter + (Vast.ai or RunPod or both)
3. System validates keys
4. Done — redirect to dashboard

### 4.2 New Training Job
1. **Upload** — Drag & drop images (bulk). System auto-captions via OpenRouter.
2. **Review** — User reviews/edits captions in a grid view.
3. **Configure** — Two modes:
   - **Simple UI** — Presets (Quick/Standard/HQ) + sliders for key params
   - **Chat Mode** — User describes what they want in plain English → system uses OpenRouter inference to generate training YAML config
4. **Select Base Model** — KREA 2, Ideogram 4, or both (trains two separate LoRAs)
5. **Select GPU** — User picks from available GPUs + system suggestion based on model size
6. **Set Spend Limit** — Hard cap in $ for this job
7. **Launch** — System spins up GPU, deploys AI Toolkit container, starts training

### 4.3 Training Dashboard
- Progress bar with ETA
- Live cost tracker vs spend limit
- Start / Pause / Stop / Continue controls
- Log stream (collapsible)
- Auto-shutdown notification when complete

### 4.4 Post-Training
- Sample images auto-generated using trained LoRA + base model
- LoRA appears in model library
- User can download .safetensors locally

### 4.5 Model Library
- Grid of all trained models with thumbnail, base model, cost, date, download/delete

---

## 5. Key Design Decisions

### 5.1 Chat-to-Config System
User says: *"I want my character to look like a casual iPhone selfie, warm lighting, slightly blurry background, Instagram filter vibes"*

System (via OpenRouter) translates to training YAML config with appropriate lr, rank, epochs, resolution, style tags, and caption prefix.

### 5.2 GPU Suggestion Logic
| Base Model | Min VRAM | Recommended GPU | Est. Cost |
|-----------|---------|----------------|-----------|
| KREA 2 RAW | 24GB | RTX 4090 / A100 40GB | $0.30-1.00 |
| Ideogram 4 (9.3B) | 48GB+ | A100 80GB / H100 | $1.00-3.00 |
| Both | 48GB+ | A100 80GB / H100 | $2.00-5.00 |

### 5.3 Spend Limit Enforcement
- Poll GPU provider API every 30s for cost
- 90% → warn, 100% → force stop + shutdown GPU
- Always shutdown on completion/error

### 5.4 NSFW Handling
- No content filters in app. Captioning uses uncensored models.
- Standard disclaimer on onboarding (21+ only, consensual only).

---

## 6. File Structure

```
loratrainer/
├── package.json
├── electron/
│   ├── main.js
│   ├── preload.js
│   └── ipc/
│       ├── gpu-provider.js
│       ├── openrouter.js
│       ├── training.js
│       ├── storage.js
│       └── database.js
├── src/
│   ├── index.html
│   ├── css/
│   │   └── index.css
│   ├── js/
│   │   ├── app.js
│   │   ├── pages/
│   │   │   ├── onboarding.js
│   │   │   ├── dashboard.js
│   │   │   ├── upload.js
│   │   │   ├── train.js
│   │   │   ├── library.js
│   │   │   └── settings.js
│   │   └── components/
│   │       ├── chat.js
│   │       ├── gpu-picker.js
│   │       ├── image-grid.js
│   │       └── progress.js
│   └── assets/
├── training/
│   ├── templates/
│   │   ├── krea2.yaml
│   │   └── ideogram4.yaml
│   └── docker/
│       └── Dockerfile
├── db/
│   └── schema.sql
├── build/
│   ├── win/
│   └── linux/
└── PLAN.md
```

---

## 7. Task Bulletin Board

### Phase 1: Foundation
| # | Task | Status | Branch |
|---|------|--------|--------|
| 1.1 | Create GitHub repo `loratrainer` (private) | ❌ BLOCKED — need access | — |
| 1.2 | Init Electron + Node.js project | ⬜ Not started | `feat/init` |
| 1.3 | Design system (CSS) | ⬜ Not started | `feat/design-system` |
| 1.4 | SQLite schema + DB module | ⬜ Not started | `feat/database` |
| 1.5 | Onboarding page (API key entry) | ⬜ Not started | `feat/onboarding` |

### Phase 2: Core Upload & Captioning
| # | Task | Status | Branch |
|---|------|--------|--------|
| 2.1 | Image upload page (bulk drag & drop) | ⬜ Not started | `feat/upload` |
| 2.2 | OpenRouter integration (captioning) | ⬜ Not started | `feat/captioning` |
| 2.3 | Caption review/edit grid | ⬜ Not started | `feat/caption-editor` |

### Phase 3: Training Configuration
| # | Task | Status | Branch |
|---|------|--------|--------|
| 3.1 | Training config UI (presets + sliders) | ⬜ Not started | `feat/train-config` |
| 3.2 | Chat-to-config system (OpenRouter) | ⬜ Not started | `feat/chat-config` |
| 3.3 | GPU picker + suggestion engine | ⬜ Not started | `feat/gpu-picker` |
| 3.4 | Base model selector (KREA2/Ideo4/both) | ⬜ Not started | `feat/model-select` |
| 3.5 | Spend limit setting | ⬜ Not started | `feat/spend-limit` |

### Phase 4: GPU Orchestration & Training
| # | Task | Status | Branch |
|---|------|--------|--------|
| 4.1 | Vast.ai API integration | ⬜ Not started | `feat/vastai` |
| 4.2 | RunPod API integration | ⬜ Not started | `feat/runpod` |
| 4.3 | AI Toolkit Docker image + YAML gen | ⬜ Not started | `feat/training-engine` |
| 4.4 | Job orchestrator (launch/monitor/stop) | ⬜ Not started | `feat/job-orchestrator` |
| 4.5 | Training dashboard (progress/ETA/cost) | ⬜ Not started | `feat/dashboard` |
| 4.6 | Auto-shutdown on completion | ⬜ Not started | `feat/auto-shutdown` |

### Phase 5: Post-Training & Library
| # | Task | Status | Branch |
|---|------|--------|--------|
| 5.1 | Sample image generation | ⬜ Not started | `feat/sample-gen` |
| 5.2 | Model library page | ⬜ Not started | `feat/library` |
| 5.3 | Model download (.safetensors) | ⬜ Not started | `feat/download` |

### Phase 6: Polish & Build
| # | Task | Status | Branch |
|---|------|--------|--------|
| 6.1 | Settings page (keys, preferences) | ⬜ Not started | `feat/settings` |
| 6.2 | Error handling + edge cases | ⬜ Not started | `feat/error-handling` |
| 6.3 | Electron-builder config (.exe + .deb) | ⬜ Not started | `feat/build` |
| 6.4 | Azure DevOps pipeline | ⬜ Not started | `feat/ci-cd` |

---

## 8. Change Log

| Date | Change | Branch |
|------|--------|--------|
| 2026-07-01 | Plan created | — |

---

*This document is the source of truth. Check here before starting any task.*
