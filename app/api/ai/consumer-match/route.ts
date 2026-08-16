import { NextResponse } from 'next/server';
import { 
  INITIAL_PRODUCTS, INITIAL_LIVE_SESSIONS, INITIAL_FREE_SESSIONS, INITIAL_VIDEOS, 
  SeniorProduct, LiveSession, FreeLiveSession, ProviderVideo 
} from '@/lib/consumer-store';

const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const preferredOllamaModel = process.env.OLLAMA_MODEL || 'qwen3:4b';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    const cleanQuery = (query || '').trim().toLowerCase();

    if (!cleanQuery) {
      return NextResponse.json({
        success: true,
        intent_category: 'all',
        ai_explanation: 'Here are all available service provider creations, videos, and live masterclasses.',
        matched_products: INITIAL_PRODUCTS,
        matched_sessions: INITIAL_LIVE_SESSIONS,
        matched_free_sessions: INITIAL_FREE_SESSIONS,
        matched_videos: INITIAL_VIDEOS
      });
    }

    let detectedCategory = 'all';
    let aiExplanation = '';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const prompt = `
You are the SilverHands Consumer AI Assistant.
Analyze this search or request from a consumer looking for service providers, biryani recipes, pottery, cooking, or crafts:
"${cleanQuery}"

Classify the intent into EXACTLY ONE category: ["pottery", "crafts", "cooking", "textiles", "gardening", "art", "all"]
And provide a warm 1-sentence summary of what they are looking for.

Respond in valid JSON format:
{
  "category": string,
  "summary": string
}
`;

      const ollamaRes = await fetch(`${ollamaHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: preferredOllamaModel,
          prompt,
          stream: false,
          format: 'json',
          options: { temperature: 0.1, num_predict: 80 }
        })
      });
      clearTimeout(timeoutId);

      if (ollamaRes.ok) {
        const data = await ollamaRes.json();
        const jsonMatch = (data.response || '').match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.category) detectedCategory = parsed.category.toLowerCase();
          if (parsed.summary) aiExplanation = parsed.summary;
        }
      }
    } catch (e) {
      // Proceed to rule engine fallback
    }

    if (detectedCategory === 'all' || !aiExplanation) {
      if (cleanQuery.includes('biryani') || cleanQuery.includes('cook') || cleanQuery.includes('pickle') || cleanQuery.includes('recipe')) {
        detectedCategory = 'cooking';
        aiExplanation = `Found authentic Dum Biryani cooking videos by Savitri Devi, free biryani live sessions, and 1-on-1 cooking classes!`;
      } else if (cleanQuery.includes('potter') || cleanQuery.includes('clay') || cleanQuery.includes('jug') || cleanQuery.includes('wheel')) {
        detectedCategory = 'pottery';
        aiExplanation = `Found traditional terracotta pottery videos by Meenakshi Ammal, free community pottery sessions, and clay products!`;
      } else if (cleanQuery.includes('paint') || cleanQuery.includes('tanjore') || cleanQuery.includes('gold')) {
        detectedCategory = 'crafts';
        aiExplanation = `Found Tanjore gold foil painting videos by Ramanathan Sir, free art webinars, and handmade art.`;
      } else {
        aiExplanation = `Showing matching videos, live sessions, and creations for "${cleanQuery}".`;
      }
    }

    // Filter products, sessions, free sessions, and videos
    const matched_products = INITIAL_PRODUCTS.filter(p => {
      if (detectedCategory !== 'all' && p.category === detectedCategory) return true;
      return (
        p.title.toLowerCase().includes(cleanQuery) ||
        p.description.toLowerCase().includes(cleanQuery) ||
        p.creator_name.toLowerCase().includes(cleanQuery)
      );
    });

    const matched_sessions = INITIAL_LIVE_SESSIONS.filter(s => {
      if (detectedCategory !== 'all' && s.category === detectedCategory) return true;
      return (
        s.title.toLowerCase().includes(cleanQuery) ||
        s.description.toLowerCase().includes(cleanQuery) ||
        s.creator_name.toLowerCase().includes(cleanQuery)
      );
    });

    const matched_free_sessions = INITIAL_FREE_SESSIONS.filter(fs => {
      if (detectedCategory !== 'all' && fs.category === detectedCategory) return true;
      return (
        fs.title.toLowerCase().includes(cleanQuery) ||
        fs.description.toLowerCase().includes(cleanQuery) ||
        fs.creator_name.toLowerCase().includes(cleanQuery)
      );
    });

    const matched_videos = INITIAL_VIDEOS.filter(v => {
      if (detectedCategory !== 'all' && v.category === detectedCategory) return true;
      const tagMatch = v.tags.some(t => t.toLowerCase().includes(cleanQuery) || cleanQuery.includes(t.toLowerCase()));
      return (
        tagMatch ||
        v.title.toLowerCase().includes(cleanQuery) ||
        v.description.toLowerCase().includes(cleanQuery) ||
        v.creator_name.toLowerCase().includes(cleanQuery)
      );
    });

    return NextResponse.json({
      success: true,
      intent_category: detectedCategory,
      ai_explanation: aiExplanation,
      matched_products,
      matched_sessions,
      matched_free_sessions,
      matched_videos
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Error processing consumer search' }, { status: 500 });
  }
}
