# AI Video Clipper V1

An automated AI-powered video clipping tool that transforms long YouTube videos into the top 5 high-retention, standalone 30–60 second clips with timestamps, viral scores, and editorial rationale.

## Pipeline Architecture

```text
YouTube URL
    │
    ▼
1. Video Downloader (yt-dlp) ──> downloads mp4 + extracts audio
    │
    ▼
2. Timestamped Transcriber ──> youtube-transcript-api (with Gemini audio STT fallback)
    │
    ▼
3. AI Moment Finder (Gemini 2.5 Flash / OpenAI) ──> identifies high-value candidate moments
    │
    ▼
4. Context Verifier ──> checks sentence boundaries & strictly enforces 30–60s duration
    │
    ▼
5. Ranker & Deduplicator ──> scores, eliminates overlapping intervals, picks top 5 diverse clips
    │
    ▼
6. FFmpeg Generator ──> outputs clip_01.mp4 ... clip_05.mp4 + clips.json
```

## Setup & Configuration

1. **Environment Variables**:
   Create or edit `.env` in this directory:
   ```env
   GEMINI_API_KEY=your_gemini_api_key
   # or
   OPENAI_API_KEY=your_openai_api_key
   PORT=8000
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

### 1. CLI Usage
Extract the top 5 clips from any YouTube URL directly from the terminal:
```bash
python main.py "https://www.youtube.com/watch?v=UF8uR6Z6KLc"
```

Optional arguments:
- `--output <dir>`: Custom destination directory (default: `output`)
- `--count <num>`: Number of clips to generate (default: `5`)
- `--temp <dir>`: Temporary directory for video/audio downloads (default: `temp_downloads`)

### 2. Full-Stack SaaS Interface (Recommended)

Run the backend and modern Next.js frontend concurrently:

#### Start the Python API Backend:
```bash
python web.py
```
*(Runs on `http://127.0.0.1:8000`)*

#### Start the Next.js SaaS Frontend:
```bash
cd frontend
npm install
npm run dev
```
*(Runs on `http://localhost:3000`)*

Open [http://localhost:3000](http://localhost:3000) in your browser:
- **Landing Page (`/`)**: Hero preview, 3-step feature walkthrough, direct CTA.
- **Studio Dashboard (`/dashboard`)**:
  - **URL Input Bar**: Auto-validating YouTube input, demo preset quick-picks, 5 vs 10 clip selector.
  - **Live 7-Stage Pipeline Visualizer**: Real-time progress bar and status badges across download, audio extract, transcript, AI moment detection, context verification, FFmpeg cutting, and metadata finalization.
  - **Generated Clip Grid**: Responsive card grid with HTML5 video players, duration overlays, viral score indicators, tags, editorial explanations, and direct MP4 downloads.
  - **Library ("My Clips")**: View and search previously saved clips.
  - **Sidebar**: Navigation, daily usage tracking, and Pro subscription upgrade tier mockups.

### 3. Lightweight Static Web UI
You can also access the minimal standalone interface directly through the backend at `http://localhost:8000`.

## Output Format

Clips are saved to `output/`:
```text
output/
├── clip_01.mp4
├── clip_02.mp4
├── clip_03.mp4
├── clip_04.mp4
├── clip_05.mp4
└── clips.json
```

`clips.json`:
```json
{
  "clips": [
    {
      "file": "clip_01.mp4",
      "start": 833.4,
      "end": 871.61,
      "duration": 38.21,
      "score": 10.0,
      "reason": "Iconic and highly motivational closing message with its origin story..."
    }
  ]
}
```

## Running Tests

Run all unit, Web API, and end-to-end integration tests:
```bash
python -m unittest discover -s tests -p "test_*.py"
```
