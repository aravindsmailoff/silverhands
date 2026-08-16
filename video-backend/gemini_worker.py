import argparse
import json
import os
import sys
from typing import List, Optional, Literal

from dotenv import load_dotenv
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel

from clip_selection import clip_count_targets, lookup_model_prices

load_dotenv()


# --- Structured output schemas (passed as response_schema so the API
# --- guarantees the format instead of us repairing free-form JSON). ---

class ScoredWindowModel(BaseModel):
    id: str
    start: float
    end: float
    score: int
    reason: str


class ScoreResponse(BaseModel):
    windows: List[ScoredWindowModel]


class DetailClipModel(BaseModel):
    start: float
    end: float
    source_window_id: str
    predicted_score: int
    video_description_for_tiktok: str
    video_description_for_instagram: str
    video_title_for_youtube_short: str
    viral_hook_text: str


class DetailResponse(BaseModel):
    shorts: List[DetailClipModel]


class Pass1ScoredWindowModel(BaseModel):
    id: str
    start: float
    end: float
    role: Literal["opening", "context", "demonstration", "explanation", "result", "closing"]
    importance: int
    showcase_value: int
    summary: str
    narrative_necessity: Literal["essential", "important", "supporting", "optional"]
    thought_boundary_start_phrase: str
    thought_boundary_end_phrase: str


class Pass1Response(BaseModel):
    windows: List[Pass1ScoredWindowModel]


class VisualBeat(BaseModel):
    start: float
    end: float
    action: str
    stage: Literal["preparation", "demonstration", "technique", "result", "transition"]
    importance: int = 80


class TopicModel(BaseModel):
    id: str
    title: str
    description: str
    icon: str = "✨"
    timestamps: List[List[float]] = []
    showcase_potential: int = 80
    focus_type: str = "process"


class VideoUnderstandingModel(BaseModel):
    subject: str
    provider_skill: str
    detected_topics: List[TopicModel]
    natural_opening_timestamp: float = 0.0
    natural_closing_timestamp: float = 0.0
    has_clear_result: bool = True
    language: str = "en"
    content_mode: str = "speech"
    visual_beats: List[VisualBeat] = []


class FocusSpecification(BaseModel):
    focus_type: str = "process"
    focus_text: str = ""
    priority: str = "high"
    preserve_process_continuity: bool = True
    show_result: bool = True
    show_expertise: bool = True
    emphasize_topics: List[str] = []
    deprioritize_topics: List[str] = []
    editorial_tone: str = "inspiring"


class ShowcaseSegmentModel(BaseModel):
    start: float
    end: float
    source_window_id: str
    label: str
    speed: float = 1.0
    role: Literal["opening", "core_showcase", "closing"]
    beat: Literal["hook", "context", "demonstration", "supporting_evidence", "strongest_value", "payoff", "closing"]
    narration_hint: str
    contains_speech: bool
    speaker_visible: bool
    visual_action_type: Literal["talking_head", "hand_close_up", "action", "still"]
    speed_recommendation: float
    showcase_value: int
    topic: str
    reason: str
    semantic_unit: str
    pacing: Literal["normal", "slightly_fast", "fast"]
    transition_in_reason: str
    transition_out_reason: str
    narrative_necessity: Literal["essential", "important", "supporting", "optional"]
    # Editorial Engine additions
    semantic_start: float = -1.0
    semantic_end: float = -1.0
    transition_type: Literal["cut", "j_cut", "l_cut"] = "cut"
    audio_lead_lag: float = 0.0
    is_natural_opening: bool = False
    is_natural_closing: bool = False


class SilverHandsShowcaseResponse(BaseModel):
    showcase_title: str
    segments: List[ShowcaseSegmentModel]
    opening_rationale: str
    closing_rationale: str
    segments_rejected_and_why: str
    final_editorial_explanation: str


VIDEO_UNDERSTANDING_PROMPT_TEMPLATE = """
You are a senior video analyst and master story editor.
Analyze the ENTIRE transcript to understand what this video contains.
Do NOT create an edit script yet. Map the core skills, techniques, outcomes, and topics.

Provide:
1. "subject": High-level subject (e.g. "Handmade silk saree weaving", "Woodworking table build")
2. "provider_skill": The specific craft or professional skill shown (e.g. "Traditional handloom weaving", "Dovetail joinery")
3. "detected_topics": 3 to 6 distinct topics/phases discovered in the video. For each topic:
   - "id": "topic_1", "topic_2", etc.
   - "title": Short catchy title (e.g. "Weaving Technique", "Setting the Loom", "The Finished Saree")
   - "description": 1 concise friendly sentence explaining what this focus highlights (e.g. "Show the intricate handloom weaving steps.")
   - "icon": An appropriate single emoji (e.g. "🧵", "✨", "🏆", "💡", "🌿", "🪵", "🎨")
   - "timestamps": List of [start, end] ranges where this topic appears
   - "showcase_potential": Score 0-100 indicating how compelling this is for a short showcase
   - "focus_type": "process" | "technique" | "result" | "explanation" | "craftsmanship"
4. "natural_opening_timestamp": Best natural speech or action hook timestamp
5. "natural_closing_timestamp": Best timestamp where the provider naturally concludes, reveals the result, or delivers a satisfying payoff
6. "has_clear_result": True if a finished product, result, or satisfying outcome is visible/described
7. "language": Video language code
8. "content_mode": "speech"
9. "visual_beats": []

VIDEO_DURATION_SECONDS: {video_duration}
LANGUAGE: {language}
TRANSCRIPT_TEXT:
{transcript_text}

Return ONLY valid JSON matching the schema.
"""

VIDEO_UNDERSTANDING_VISUAL_PROMPT_TEMPLATE = """
You are a master video editor and visual story analyst.
Analyze these sampled video frames as a continuous visual sequence across the entire video timeline.
Each image is accompanied by its exact timestamp in seconds.
There is no speech / minimal speech in this video. The creator is demonstrating a physical skill, craft, styling, cooking, art, or tutorial.

Analyze the visual narrative:
1. "subject": What physical craft/creation/activity is shown?
2. "provider_skill": The exact craftsmanship or technique demonstrated.
3. "detected_topics": 3 to 6 logical visual phases or technique focuses discovered across the timeline.
4. "visual_beats": List of 4 to 12 distinct visual action beats across the video:
   - "start": Timestamp in seconds where this specific action/phase begins
   - "end": Timestamp in seconds where it finishes or transitions
   - "action": Clear description of what physical action is happening (e.g. "Sections hair and applies holding spray", "Carves dovetail pins with chisel", "Glazes finished pottery piece")
   - "stage": "preparation" | "demonstration" | "technique" | "result" | "transition"
   - "importance": Integer 0 to 100
5. "natural_opening_timestamp": The timestamp of the most visually compelling start/hook action.
6. "natural_closing_timestamp": The timestamp where the finished piece/transformation is revealed or concluded.
7. "has_clear_result": True if a finished product or transformation is visible.
8. "content_mode": "visual"

VIDEO_DURATION_SECONDS: {video_duration}
TOTAL_FRAMES_SAMPLED: {frame_count}

Return ONLY valid JSON matching the VideoUnderstandingModel schema.
"""

VIDEO_UNDERSTANDING_MIXED_PROMPT_TEMPLATE = """
You are a master video editor and multimodal story analyst.
You have two synchronized sources of evidence:
1. Speech transcript with timestamps.
2. Sampled visual keyframes across the timeline.

Synthesize both speech explanations and visual physical actions into a unified narrative model.
Provide:
1. "subject" and "provider_skill"
2. "detected_topics": 3 to 6 distinct topics synthesizing speech + visual demonstration
3. "visual_beats": Key physical demonstration beats (start, end, action, stage, importance)
4. "natural_opening_timestamp" and "natural_closing_timestamp"
5. "has_clear_result": True if a finished product/result is visible or stated
6. "content_mode": "mixed"

VIDEO_DURATION_SECONDS: {video_duration}
LANGUAGE: {language}
TRANSCRIPT_TEXT:
{transcript_text}

Return ONLY valid JSON matching the VideoUnderstandingModel schema.
"""



FOCUS_INTERPRETATION_PROMPT_TEMPLATE = """
The user is a craftsperson or professional who wants to make a showcase short from their video.
They selected or typed the following focus preference:
"{user_input}"

Here is the Video Understanding Object representing their source video:
{vuo_json}

Interpret the user's intent into a structured FocusSpecification.
- If the user gave a simple or vague input like "make me look professional" or "show how I do it", interpret their underlying editorial priority (e.g., focus on technique & craftsmanship, show the finished result).
- Map their intent to emphasize specific topic IDs from the detected topics list.
- Keep tone encouraging and professional.

Return ONLY valid JSON matching the FocusSpecification schema.
"""


SILVERHANDS_PASS1_PROMPT_TEMPLATE = """
You are a senior video content strategist and editor.
Analyze the ENTIRE transcript and map out all the candidate windows.
We want to extract representative moments to build a single 30–60 second showcase video demonstrating this provider's skill/service/process.

For each window, identify:
1. Its narrative role. Choose from:
   - "opening": Hook, introduction of the provider, service, or topic.
   - "context": General context, transitions, or background details.
   - "demonstration": Active physical demonstration of the skill (e.g. cutting, sewing, gardening, teaching).
   - "explanation": Verbal explanation of concepts, theory, or tips.
   - "result": The final outcome, result, completed product, or satisfying payoff.
   - "closing": Call to action, subscribe, follow, or final message.
2. An importance score from 0 to 100 indicating how crucial this window is to understanding the overall skill, process, or final value.
3. A showcase_value from 0 to 100 indicating how strongly this moment proves the provider's skill, expertise, quality, uniqueness, or professional value to a potential customer (e.g., a highly polished action or finished result has high showcase value, even if the verbal explanation is short).
   - Preference Focus Guidance: "{focus_guidance}".
   - NOTE: The focus guidance is a preference/focus area, NOT a directive to score low-value content highly. If a window matches the focus guidance but contains little actual value or repetitive content, score it appropriately.
4. A brief 1-sentence summary of the content.
5. Its narrative necessity ("essential", "important", "supporting", "optional").
6. The thought boundaries:
   - "thought_boundary_start_phrase": The exact first 3-5 words of the complete thought/sentence starting inside this window.
   - "thought_boundary_end_phrase": The exact last 3-5 words of the complete thought/sentence ending inside this window.

VIDEO_DURATION_SECONDS: {video_duration}
TRANSCRIPT_LANGUAGE: {language}
WINDOWS_JSON:
{windows_json}

Return only valid JSON matching the schema.
"""


SILVERHANDS_PASS2_PROMPT_TEMPLATE = """
You are a master short-form film editor creating a comprehensive, polished showcase video.
Construct ONE coherent 30–60 second showcase video out of these candidate windows.
Do NOT create independent clips; create a seamless EDIT SCRIPT.

==================================================
EDITORIAL & PACING RULES
==================================================
1. **NARRATIVE REGIONS**:
   - **"opening"** (STRICT Target: 3–6 seconds): Must immediately hook a cold viewer. Set `is_natural_opening=true` on the first segment. It should feel like a compelling beginning, not an arbitrary cut in the middle of a sentence.
   - **"core_showcase"** (Target: 30–45 seconds): The body showing the core process, craftsmanship, unique technique, or service.
   - **"closing"** (Target: 3–6 seconds): A satisfying conclusion, completed result, or takeaway. Set `is_natural_closing=true` on the final segment.

2. **AVOID SUDDEN STOPS (CRITICAL CLOSING RULE)**:
   - The final segment (`is_natural_closing=true`) MUST conclude on a complete thought, sentence ending, finished action, or satisfying payoff.
   - NEVER end on an incomplete sentence or mid-thought.

3. **TRANSITION TYPES & J/L CUTS**:
   - Assign `transition_type`:
     * "cut": Standard clean cut between distinct scenes.
     * "j_cut": Incoming segment audio starts 0.4–0.8s BEFORE its visual appears (dialogue leads the visual transition). Use when introducing a new topic smoothly.
     * "l_cut": Outgoing segment audio continues 0.4–0.8s INTO the next visual (dialogue trails over a visual cut). Use when a speaker's sentence resolves over an action shot.
   - `audio_lead_lag`: The duration in seconds for the J-cut or L-cut (typically 0.4 to 0.8s, 0.0 for straight cut).

4. **SEMANTIC BOUNDARIES**:
   - Provide `semantic_start` and `semantic_end` as your editorial timestamp targets (e.g. 12.450 to 18.200). The deterministic boundary engine will snap these to Whisper word boundaries.

5. **DYNAMIC BEATS**:
   - Use dynamic beats across segments: "hook", "context", "demonstration", "supporting_evidence", "strongest_value", "payoff", "closing".
   - Aim for 4 to 7 segments. Avoid chunky 20-second blocks.

6. **NATURAL SPEED & PACING**:
   - Speech/dialogue segments MUST be 1.0x (normal speed).
   - Repetitive physical action without critical speech may be 1.2x–1.5x.

7. **USER FOCUS**:
   - Focus Specification / Guidance: "{focus_guidance}".
   - Align the narrative arc to highlight the provider's chosen focus while preserving logical flow and strong payoff.

VIDEO_DURATION_SECONDS: {video_duration}
TRANSCRIPT_LANGUAGE: {language}
FOCUS_GUIDANCE: "{focus_guidance}"
SHORTLISTED_WINDOWS_JSON:
{windows_json}

Return only valid JSON matching the schema.
"""


VISUAL_PROMPT_TEMPLATE = """
You are a senior short-form video editor. This video has NO speech/audio — judge
it purely by what you SEE. Watch the whole thing and pick the 3–15 MOST engaging
visual moments for TikTok / Reels / Shorts (action, reveals, transformations,
striking or funny shots, satisfying payoffs, dramatic movement).

TIME CONTRACT — STRICT:
- Timestamps in ABSOLUTE SECONDS from the start (usable with ffmpeg -ss/-to).
- Only numbers with up to 3 decimals (e.g. 0, 12.5, 47.250).
- 0 <= start < end <= {video_duration}.
- Each clip 15 to 60 seconds long. If the whole video is shorter than 15s,
  return one clip spanning the full video.
- Cut on visual scene changes, never mid-motion.

For each clip write catchy copy in {language} (a scroll-stopping hook, a TikTok
and an Instagram description, and a YouTube title ≤100 chars). Order clips best
to worst by how likely they are to stop a viewer scrolling.
"""


class LayoutChoice(BaseModel):
    layout: str
    confidence: float
    why: str


# Scored 94/92/96% over the 48-clip corpus against hand-checked labels, with
# 0-1 false positives out of the 28 clips that must not be touched. Do not
# reword casually: the wins come from the explicit "none is usually right"
# instruction and from naming the exact decorations (corner bugs, score
# counters, subtitles) that four earlier attempts kept mistaking for content.
LAYOUT_CHOICE_PROMPT = """
These frames are sampled at regular intervals from a single landscape video.
You are choosing how to re-frame that video into a vertical 9:16 clip.

Pick ONE layout:

- "none": crop to the speaker and fill the frame. This is the RIGHT answer for
  ordinary talking heads, interviews shot in close-up, b-roll, sport, action,
  music, and any footage whose meaning survives a centre crop. Corner logos,
  score bugs, subscriber counters, lower-thirds and burned-in subtitles do NOT
  change this: they are decoration, and losing them costs nothing.
- "screencast": keep the screen. ONLY when the video is built around a screen
  recording, slides, a spreadsheet, a chart or a map that the viewer must read
  to follow it. If you cannot read words or numbers off the screen that matter
  to the point being made, it is not this.
  (A "camera_inset" option was added here and removed on 31-jul-2026. Whether a
  webcam is composited into a corner of that screen is not something the model
  can see: on the five clips that have one it answered "screencast" every time,
  in both runs, while overall accuracy fell from 92% to 83-85%. camera_inset.py
  finds the same five geometrically with no false positives, so that question is
  answered downstream instead of being asked here.)
- "split": stack two people. ONLY when two people are visible IN THE SAME SHOT
  at the same time in most frames, talking to each other. Frames that alternate
  between one-person close-ups are NOT this, however many people appear.

"none" is by far the most common correct answer. Choose anything else only if
you would defend it to an editor. If you are unsure, answer "none".

confidence is 0..1. why is at most 12 words.
"""


class WideContentRangeModel(BaseModel):
    start: float
    end: float
    what: str
    width_fraction: float


class WideContentResponse(BaseModel):
    ranges: List[WideContentRangeModel]


WIDE_CONTENT_PROMPT_TEMPLATE = """
You are preparing a landscape video to be re-framed to a vertical 9:16 crop.
The crop keeps a tall centre strip and THROWS AWAY the left and right sides.

List every time range where on-screen content would be cut by that, and for each
one report HOW MUCH OF THE FRAME WIDTH the content spans.

width_fraction is the single most important field. Measure the content's own
horizontal extent, from its left edge to its right edge, as a fraction of the
full frame width:
- a spreadsheet, slide, screen recording or map filling the picture: 0.9 - 1.0
- a chart or diagram beside a speaker: 0.4 - 0.7
- a lower-third or headline strip across the bottom: 0.6 - 0.9
- a logo, channel bug, score counter or subscriber count in a corner: 0.1 - 0.2
- subtitles centred at the bottom: 0.3 - 0.5

Report what you actually see. Do NOT inflate the number to make a range seem
worth reporting, and do NOT leave out corner graphics — report them with their
true small width_fraction. A range reported honestly at 0.15 is useful; the same
range reported at 0.9 makes the video worse.

COUNT a range when the frame shows:
- a screen recording, slide, spreadsheet, chart, graph or map
- headlines, labels, statistics or comparison tables burned into the picture
- a side-by-side or split-screen layout
- any diagram or product shot where the edges carry the meaning

DO NOT count an ordinary talking head, even against a busy background, and do
not count b-roll, landscapes, crowds or action footage with no graphics.

TIME CONTRACT — STRICT:
- ABSOLUTE SECONDS from the start, numbers only, up to 3 decimals.
- 0 <= start < end <= {video_duration}.
- Merge ranges that are less than 1 second apart.
- Return an EMPTY list if the video never shows such content. An empty list is
  the correct, expected answer for most talking-head and b-roll videos — do not
  invent ranges to seem useful.

For "what", name the content in three words or fewer (e.g. "stock chart",
"spreadsheet", "corner ticker").
"""


def _configure_stdio() -> None:
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if not stream or not hasattr(stream, "reconfigure"):
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


def _log(message: str) -> None:
    stream = sys.stdout
    text = str(message)
    try:
        stream.write(text + "\n")
    except UnicodeEncodeError:
        encoding = getattr(stream, "encoding", None) or "utf-8"
        safe_text = text.encode(encoding, errors="replace").decode(encoding, errors="replace")
        stream.write(safe_text + "\n")
    stream.flush()

SCORE_PROMPT_TEMPLATE = """
You are a senior short-form video strategist.
Select the MOST viral candidate windows from this batch.

Rules:
- Return only valid JSON.
- Choose up to 3 windows from this batch.
- `score` must be an integer from 0 to 100.
- THE 2-SECOND TEST is the main criterion: would the first 2 seconds of this
  moment force a cold viewer (no context) to keep watching? Windows that only
  work with prior context score low.
- Prefer windows with strong hooks, conflict, surprise, outrage, emotion,
  novelty, big numbers, or a clear payoff.
- Ignore weak filler, housekeeping, outros, rambling transitions, and
  low-signal padding unless there is an obvious hook or payoff.

TRANSCRIPT_LANGUAGE: {language}
VIDEO_DURATION_SECONDS: {video_duration}
WINDOWS_JSON:
{windows_json}

Return only:
{{
  "windows": [
    {{
      "id": "<window id>",
      "start": <number>,
      "end": <number>,
      "score": <integer 0-100>,
      "reason": "<very short reason>"
    }}
  ]
}}
"""

DETAIL_PROMPT_TEMPLATE = """
You are a senior short-form video editor and viral copywriter.
Choose the BEST short clips from these shortlisted candidate windows.

CLIP RULES:
- Return only valid JSON.
- Each clip must be 15 to 60 seconds long, in absolute seconds from the start of the source video.
- Stay within the candidate window boundaries.
- THE 2-SECOND RULE: the clip MUST open on its strongest moment. If the first
  2 seconds would not stop a cold viewer from scrolling, move the start or skip the clip.
- Start slightly before the hook and end slightly after the payoff when possible.
- Do not cut in the middle of a word or phrase.
- No generic intros/outros unless they are the hook.
- STANDS ALONE: the clip must make sense to someone who has seen nothing else.
  If it opens on a pronoun, a "that", a "so anyway", or an answer whose question
  was asked earlier, move the start back to where the idea begins or skip it.
  A brilliant moment that needs the previous five minutes is not a clip.
  Fix this by moving the START earlier, never by cutting the ending short: a
  clip that loses its payoff to gain context has traded down.
- HOW MANY: return {min_clips} to {max_clips} clips. Work through EVERY candidate
  window — they were already scored as the best moments in the video, so a window
  that yields nothing should be the exception, not the norm. Two or three clips
  from one window are fine when they are genuinely different moments. The rules
  above let you skip a weak clip; they are not a licence to return one clip and
  stop. Only fall short of {min_clips} when the material truly does not hold
  them, and never pad with a clip you would not publish yourself.
- DIVERSITY: never return two clips that make the same point, tell the same
  story, or land the same joke — even across different windows. Pick the
  stronger one and drop the other. Two clips on the same broad topic are fine
  as long as each lands its own moment.

HOOK PLAYBOOK — pick the strongest fitting pattern for `viral_hook_text` (max 10 words):
- Open question: "Why does everyone get this wrong?"
- Hot take / controversy: "Stop doing this. Seriously."
- Number / fact shock: "97% of people miss this."
- Story loop: "This one email almost ruined me."
- POV / pattern interrupt: "POV: you finally understand it."
(These are English PATTERNS — always write the actual hook in TRANSCRIPT_LANGUAGE.)

COPY RULES — ALL text fields (descriptions, title, hook) MUST be written in TRANSCRIPT_LANGUAGE ({language}):
- Descriptions (TikTok + Instagram): 1-2 punchy sentences that tease the payoff
  without spoiling it, then 3-5 topically relevant hashtags. No generic hashtag spam.
- `video_title_for_youtube_short`: max 100 chars, curiosity-driven, no fake claims.
- `predicted_score`: honest 0-100 estimate of viral potential.

TRANSCRIPT_LANGUAGE: {language}
VIDEO_DURATION_SECONDS: {video_duration}
CANDIDATE_WINDOWS_JSON:
{windows_json}

Return only:
{{
  "shorts": [
    {{
      "start": <number>,
      "end": <number>,
      "source_window_id": "<window id>",
      "predicted_score": <integer 0-100>,
      "video_description_for_tiktok": "<description + hashtags>",
      "video_description_for_instagram": "<description + hashtags>",
      "video_title_for_youtube_short": "<title max 100 chars>",
      "viral_hook_text": "<short overlay max 10 words>"
    }}
  ]
}}
"""


def _strip_code_fences(text: str) -> str:
    text = (text or "").strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def _extract_json_candidate(text: str) -> str:
    cleaned = _strip_code_fences(text)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        return cleaned[start:end + 1]
    return cleaned


def _escape_invalid_unicode_escapes(text: str) -> str:
    chars = []
    i = 0
    while i < len(text):
        if text[i] == "\\" and i + 1 < len(text) and text[i + 1] == "u":
            hex_digits = text[i + 2:i + 6]
            if len(hex_digits) < 4 or any(ch not in "0123456789abcdefABCDEF" for ch in hex_digits):
                chars.append("\\\\u")
                i += 2
                continue
        chars.append(text[i])
        i += 1
    return "".join(chars)


def _parse_json_response_text(text: str) -> dict:
    if not text:
        raise ValueError("Gemini returned an empty response body.")
    candidate = _extract_json_candidate(text).replace("\x00", "").strip()
    if not candidate:
        raise ValueError("Gemini response did not contain a JSON object.")
    parse_attempts = [candidate]
    sanitized_candidate = _escape_invalid_unicode_escapes(candidate)
    if sanitized_candidate != candidate:
        parse_attempts.append(sanitized_candidate)
    last_error: Optional[Exception] = None
    for parse_candidate in parse_attempts:
        try:
            return json.loads(parse_candidate)
        except json.JSONDecodeError as e:
            last_error = e
    raise ValueError(f"Failed to parse Gemini JSON response: {last_error}")


class GeminiBlockedError(ValueError):
    """The API refused the request for content-policy reasons.

    Deterministic: the same payload is rejected every time (verified in prod,
    23-jul-2026 — a stand-up video came back PROHIBITED_CONTENT in ~300ms on
    every attempt), and BLOCK_NONE safety settings do NOT lift it. Retrying is
    pointless, so callers must fail fast with a message that tells the user the
    video's content is the problem, not the service."""


_BLOCKED_FINISH_REASONS = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST",
                           "SPII", "IMAGE_SAFETY", "RECITATION"}


def raise_if_blocked(response):
    """Raise GeminiBlockedError when the API refused to answer on policy grounds."""
    pf = getattr(response, "prompt_feedback", None)
    reason = getattr(pf, "block_reason", None)
    if reason:
        name = getattr(reason, "name", None) or str(reason)
        raise GeminiBlockedError(
            f"Gemini blocked this video's content ({name}). The AI provider's "
            "usage policies reject this material, so it can't be analyzed.")
    for c in (getattr(response, "candidates", None) or []):
        fr = getattr(c, "finish_reason", None)
        name = (getattr(fr, "name", None) or str(fr or "")).upper()
        if name in _BLOCKED_FINISH_REASONS:
            raise GeminiBlockedError(
                f"Gemini blocked its answer for this video ({name}). The AI "
                "provider's usage policies reject this material, so it can't be analyzed.")


def _get_response_text(response) -> str:
    try:
        text = response.text
        if text:
            return text
    except Exception:
        pass

    parts = []
    for candidate in getattr(response, "candidates", []) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", []) or []:
            part_text = getattr(part, "text", None)
            if part_text:
                parts.append(part_text)
    return "\n".join(parts).strip()


def _calculate_cost_analysis(response, model_name: str) -> Optional[dict]:
    usage = getattr(response, "usage_metadata", None)
    if not usage:
        return None
    prices = lookup_model_prices(model_name)
    price_estimated = prices is None
    if prices is None:
        # Unknown model: conservative estimate so the UI shows something sane.
        prices = (0.50, 3.00)
    input_price_per_million, output_price_per_million = prices
    prompt_tokens = usage.prompt_token_count or 0
    output_tokens = usage.candidates_token_count or 0
    # Thinking tokens bill at the output rate even though they are invisible.
    thinking_tokens = getattr(usage, "thoughts_token_count", 0) or 0
    input_cost = (prompt_tokens / 1_000_000) * input_price_per_million
    output_cost = ((output_tokens + thinking_tokens) / 1_000_000) * output_price_per_million
    total_cost = input_cost + output_cost
    return {
        "input_tokens": prompt_tokens,
        "output_tokens": output_tokens,
        "thinking_tokens": thinking_tokens,
        "input_cost": input_cost,
        "output_cost": output_cost,
        "total_cost": total_cost,
        "model": model_name,
        "price_estimated": price_estimated,
    }


def _thinking_config_from_env(model_name: str):
    """GEMINI_THINKING_SCORE: off (default) | low | high | <token budget>.

    Applied only to the scoring stage. Gemini 3 models take thinking_level,
    Gemini 2.5 takes thinking_budget; returns None (= model default) if the
    setting is off or the SDK rejects the config."""
    raw = (os.getenv("GEMINI_THINKING_SCORE") or "off").strip().lower()
    if raw in ("", "off", "0", "none", "false"):
        return None
    try:
        if raw.isdigit():
            return genai_types.ThinkingConfig(thinking_budget=int(raw))
        if raw in ("low", "high"):
            if model_name.startswith("gemini-3"):
                return genai_types.ThinkingConfig(thinking_level=raw)
            return genai_types.ThinkingConfig(thinking_budget=2048 if raw == "low" else 8192)
    except Exception as e:
        _log(f"⚠️ Ignoring GEMINI_THINKING_SCORE={raw!r}: {e}")
    return None


def _config_for_strategy(strategy: str, mode: str, model_name: str) -> genai_types.GenerateContentConfig:
    # The detail stage writes creative copy (hooks/descriptions) — it gets a
    # high temperature; timestamps are validated and word-snapped afterwards.
    # The score stage stays precise. Fallback strategies get conservative.
    creative = mode == "detail"
    kwargs = {
        "response_mime_type": "application/json",
        "candidate_count": 1,
    }
    if strategy == "strict-json":
        kwargs["temperature"] = 0.7 if creative else 0.1
    elif strategy == "json-text-recovery":
        kwargs["temperature"] = 0.2 if creative else 0.0
    else:  # structured-schema: schema-enforced output, primary strategy
        kwargs["temperature"] = 0.9 if creative else 0.2
        kwargs["response_schema"] = DetailResponse if mode == "detail" else ScoreResponse
        if mode == "score":
            thinking = _thinking_config_from_env(model_name)
            if thinking is not None:
                kwargs["thinking_config"] = thinking
    return genai_types.GenerateContentConfig(**kwargs)


def main() -> int:
    _configure_stdio()

    parser = argparse.ArgumentParser(description="Run a single Gemini request for clip scoring/detailing.")
    parser.add_argument("--mode", choices=["score", "detail"], required=True)
    parser.add_argument("--input", dest="input_path", required=True)
    parser.add_argument("--output", dest="output_path", required=True)
    parser.add_argument("--strategy", default="structured-schema")
    parser.add_argument("--model", default="gemini-2.5-flash")
    args = parser.parse_args()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise SystemExit("Missing GEMINI_API_KEY.")

    with open(args.input_path, "r", encoding="utf-8") as f:
        payload = json.load(f)

    model_name = args.model
    client = genai.Client(api_key=api_key)
    config = _config_for_strategy(args.strategy, args.mode, model_name)
    language = str(payload.get("language") or "unknown")

    template = SCORE_PROMPT_TEMPLATE if args.mode == "score" else DETAIL_PROMPT_TEMPLATE
    fmt = {
        "video_duration": payload["video_duration"],
        "language": language,
        "windows_json": json.dumps(payload["windows"], ensure_ascii=False),
    }
    if args.mode != "score":
        # Score mode receives every window, not a shortlist, so a count target
        # derived from it would be meaningless — and the score template has no
        # placeholder for one anyway.
        fmt["min_clips"], fmt["max_clips"] = clip_count_targets(len(payload.get("windows") or []))
    prompt = template.format(**fmt)

    _log(f"🤖 Gemini worker request: mode={args.mode} strategy={args.strategy} model={model_name} items={len(payload.get('windows', []))}")
    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config=config,
    )

    raw_text = _get_response_text(response)
    # With response_schema the SDK returns an already-validated object; fall
    # back to the text-repair path only when that is unavailable.
    parsed_obj = getattr(response, "parsed", None)
    if parsed_obj is not None:
        parsed = parsed_obj.model_dump() if hasattr(parsed_obj, "model_dump") else parsed_obj
    else:
        parsed = _parse_json_response_text(raw_text)
    result = {
        "mode": args.mode,
        "payload": parsed,
        "cost_analysis": _calculate_cost_analysis(response, model_name),
        "raw_text": raw_text,
    }
    with open(args.output_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    _log(f"✅ Gemini worker success: mode={args.mode}")
    return 0


def classify_content_mode(transcript_result: dict, video_duration: float) -> str:
    """
    Classify video into 'speech', 'mixed', or 'visual' mode.
    Primary signal: speech coverage (speech_duration / video_duration).
    Secondary signal: words-per-second (wps).
    """
    if not transcript_result or not transcript_result.get("has_audio", True):
        return "visual"

    segments = transcript_result.get("segments", [])
    if not segments:
        return "visual"

    dur = max(float(video_duration), 1.0)
    speech_dur = sum(max(0.0, float(s.get("end", 0.0)) - float(s.get("start", 0.0))) for s in segments)
    coverage = speech_dur / dur

    words = sum(len(s.get("words", [])) for s in segments)
    if words == 0:
        text = transcript_result.get("text", "")
        words = len(text.split())
    wps = words / dur

    if coverage >= 0.35 and wps >= 0.4:
        return "speech"
    elif coverage >= 0.10 or wps >= 0.08:
        return "mixed"
    else:
        return "visual"


def generate_offline_vuo(transcript_result: dict, video_duration: float, content_mode: str = "speech") -> tuple:
    """Generates an offline Video Understanding Object (VUO) based on transcript segments and timeline pacing."""
    segments = transcript_result.get("segments", []) if transcript_result else []
    topics = []
    
    if segments:
        total_segs = len(segments)
        first_text = segments[0].get("text", "").strip()
        desc_1 = f"Highlights the beginning: \"{first_text[:50]}...\"" if len(first_text) > 10 else "Highlights the opening demonstration and hook."
        topics.append({
            "id": "topic_1",
            "title": "Opening Hook & Introduction",
            "description": desc_1,
            "icon": "✨",
            "timestamps": [[float(segments[0].get("start", 0.0)), float(segments[min(2, total_segs - 1)].get("end", video_duration * 0.25))]],
            "showcase_potential": 90,
            "focus_type": "process"
        })
        
        mid_start_idx = max(0, total_segs // 3)
        mid_end_idx = min(total_segs - 1, (2 * total_segs) // 3)
        topics.append({
            "id": "topic_2",
            "title": "Core Craft & Demonstration",
            "description": "Spotlights the intricate techniques, hands-on craft, and step-by-step process.",
            "icon": "🛠️",
            "timestamps": [[float(segments[mid_start_idx].get("start", video_duration * 0.25)), float(segments[mid_end_idx].get("end", video_duration * 0.75))]],
            "showcase_potential": 95,
            "focus_type": "technique"
        })
        
        last_seg = segments[-1]
        topics.append({
            "id": "topic_3",
            "title": "Final Result & Payoff",
            "description": "Showcases the completed work, final reveal, and satisfying conclusion.",
            "icon": "🏆",
            "timestamps": [[float(segments[max(0, total_segs - 2)].get("start", video_duration * 0.75)), float(last_seg.get("end", video_duration))]],
            "showcase_potential": 92,
            "focus_type": "result"
        })
    else:
        quarter = video_duration / 4.0 if video_duration > 0 else 15.0
        topics = [
            {
                "id": "topic_1",
                "title": "Visual Opening Hook",
                "description": "Dynamic opening action that grabs immediate viewer attention.",
                "icon": "🎬",
                "timestamps": [[0.0, min(video_duration, quarter)]],
                "showcase_potential": 90,
                "focus_type": "process"
            },
            {
                "id": "topic_2",
                "title": "Core Action & Technique",
                "description": "Detailed demonstration of the craftsman's technique and methods.",
                "icon": "🛠️",
                "timestamps": [[quarter, min(video_duration, quarter * 3)]],
                "showcase_potential": 95,
                "focus_type": "technique"
            },
            {
                "id": "topic_3",
                "title": "Final Reveal & Outcome",
                "description": "The satisfying final reveal and finished piece.",
                "icon": "🌟",
                "timestamps": [[quarter * 3, video_duration]],
                "showcase_potential": 92,
                "focus_type": "result"
            }
        ]

    vuo = {
        "subject": "Craftsmanship & Demonstration",
        "provider_skill": "Specialized Craft / Skill Showcase",
        "detected_topics": topics,
        "natural_opening_timestamp": 0.0,
        "natural_closing_timestamp": max(0.0, video_duration - 2.0),
        "has_clear_result": True,
        "language": str(transcript_result.get("language") or "en"),
        "content_mode": content_mode,
        "visual_beats": []
    }
    return vuo, {"input_tokens": 0, "output_tokens": 0, "total_cost": 0.0, "model": "offline-heuristic"}


def analyze_video_understanding(client, model_name: str, transcript_result: dict, video_duration: float, video_path: Optional[str] = None):
    """
    Pass 0: Build a structured VideoUnderstandingModel.
    Dynamically routes to Speech, Visual, or Mixed VUO based on content mode.
    Gracefully falls back to offline video memory if Gemini client or API key is unavailable.
    """
    content_mode = classify_content_mode(transcript_result, video_duration)
    print(f"🎬 [VUO] Detected content mode: {content_mode.upper()} (duration: {video_duration:.1f}s)")
    
    if not client:
        print("ℹ️ No Gemini client provided, using offline video understanding model.")
        return generate_offline_vuo(transcript_result, video_duration, content_mode)

    try:
        language = str(transcript_result.get("language") or "unknown")
        text_content = str(transcript_result.get("text") or "").strip()
        if not text_content:
            text_content = " ".join(seg.get("text", "") for seg in transcript_result.get("segments", []))

        if len(text_content) > 15000:
            text_sample = text_content[:7500] + "\n... [TRUNCATED] ...\n" + text_content[-7500:]
        else:
            text_sample = text_content

        import visual_sampler

        config = genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            candidate_count=1,
            temperature=0.2,
            response_schema=VideoUnderstandingModel
        )

        if content_mode == "visual" and video_path and os.path.exists(video_path):
            frames = visual_sampler.sample_frames_adaptive(video_path, video_duration)
            if frames:
                prompt_text = VIDEO_UNDERSTANDING_VISUAL_PROMPT_TEMPLATE.format(
                    video_duration=round(video_duration, 2),
                    frame_count=len(frames)
                )
                contents = [prompt_text]
                for f in frames:
                    ts = f["timestamp"]
                    contents.append(f"Frame at timestamp {ts:.2f}s:")
                    contents.append(genai_types.Part.from_bytes(data=f["image_bytes"], mime_type="image/jpeg"))

                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=config,
                )
            else:
                prompt = VIDEO_UNDERSTANDING_PROMPT_TEMPLATE.format(
                    video_duration=round(video_duration, 2),
                    language=language,
                    transcript_text=text_sample or "(No speech or visual frames available)"
                )
                response = client.models.generate_content(model=model_name, contents=prompt, config=config)

        elif content_mode == "mixed" and video_path and os.path.exists(video_path):
            frames = visual_sampler.sample_frames_adaptive(video_path, video_duration)
            if frames:
                prompt_text = VIDEO_UNDERSTANDING_MIXED_PROMPT_TEMPLATE.format(
                    video_duration=round(video_duration, 2),
                    language=language,
                    transcript_text=text_sample
                )
                contents = [prompt_text]
                for f in frames:
                    ts = f["timestamp"]
                    contents.append(f"Frame at timestamp {ts:.2f}s:")
                    contents.append(genai_types.Part.from_bytes(data=f["image_bytes"], mime_type="image/jpeg"))

                response = client.models.generate_content(
                    model=model_name,
                    contents=contents,
                    config=config,
                )
            else:
                prompt = VIDEO_UNDERSTANDING_PROMPT_TEMPLATE.format(
                    video_duration=round(video_duration, 2),
                    language=language,
                    transcript_text=text_sample
                )
                response = client.models.generate_content(model=model_name, contents=prompt, config=config)

        else:
            prompt = VIDEO_UNDERSTANDING_PROMPT_TEMPLATE.format(
                video_duration=round(video_duration, 2),
                language=language,
                transcript_text=text_sample
            )
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config,
            )

        raise_if_blocked(response)

        parsed_obj = getattr(response, "parsed", None)
        if parsed_obj is not None:
            vuo = parsed_obj.model_dump() if hasattr(parsed_obj, "model_dump") else parsed_obj
        else:
            raw_text = _get_response_text(response)
            vuo = _parse_json_response_text(raw_text)

        if not isinstance(vuo, dict):
            vuo = {}

        if "content_mode" not in vuo or not vuo.get("content_mode"):
            vuo["content_mode"] = content_mode

        cost = _calculate_cost_analysis(response, model_name)
        return vuo, cost
    except Exception as e:
        print(f"⚠️ Gemini Video Understanding API error: {e} — falling back to offline video memory.")
        return generate_offline_vuo(transcript_result, video_duration, content_mode)


def interpret_user_focus(client, model_name: str, user_input: str, vuo: dict):
    """
    Interprets user free-form or chosen focus string into a formal FocusSpecification.
    """
    if not client:
        return {"focus_type": "process", "focus_text": user_input, "priority": "high", "preserve_process_continuity": True, "show_result": True, "show_expertise": True}, {}
    
    try:
        prompt = FOCUS_INTERPRETATION_PROMPT_TEMPLATE.format(
            user_input=user_input,
            vuo_json=json.dumps(vuo, ensure_ascii=False)
        )

        config = genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            candidate_count=1,
            temperature=0.2,
            response_schema=FocusSpecification
        )

        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=config,
        )
        raise_if_blocked(response)

        parsed_obj = getattr(response, "parsed", None)
        if parsed_obj is not None:
            spec = parsed_obj.model_dump() if hasattr(parsed_obj, "model_dump") else parsed_obj
        else:
            raw_text = _get_response_text(response)
            spec = _parse_json_response_text(raw_text)

        cost = _calculate_cost_analysis(response, model_name)
        return spec, cost
    except Exception as e:
        print(f"⚠️ Focus interpretation API error ({e}) — using direct focus specification.")
        return {"focus_type": "process", "focus_text": user_input, "priority": "high", "preserve_process_continuity": True, "show_result": True, "show_expertise": True}, {}


if __name__ == "__main__":
    raise SystemExit(main())

