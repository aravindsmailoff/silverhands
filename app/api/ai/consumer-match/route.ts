import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const preferredOllamaModel = process.env.OLLAMA_MODEL || 'qwen3:4b';

export async function POST(req: Request) {
  try {
    const { query } = await req.json();
    const cleanQuery = (query || '').trim().toLowerCase();

    // Fetch live products, listings, and videos from PostgreSQL
    const pool = await getPool();
    let dbProducts: any[] = [];
    let dbListings: any[] = [];
    let dbVideos: any[] = [];

    if (pool) {
      try {
        const prodRes = await pool.query(`SELECT * FROM products ORDER BY created_at DESC`);
        dbProducts = prodRes.rows || [];
      } catch (e) {}

      try {
        const listRes = await pool.query(`SELECT * FROM listings ORDER BY created_at DESC`);
        dbListings = listRes.rows || [];
      } catch (e) {}

      try {
        const vidRes = await pool.query(`SELECT * FROM recorded_videos ORDER BY recorded_at DESC`);
        dbVideos = vidRes.rows || [];
      } catch (e) {}
    }

    const allProducts = dbProducts.map((p: any) => ({
      id: p.id,
      title: p.title,
      description: p.description || '',
      price: Number(p.price) || 0,
      category: p.category || 'general',
      creator_name: p.creator_name || 'Senior Creator',
      creator_location: 'India',
      creator_avatar: '👵🏽',
      image_url: p.image_url || 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=800&q=80',
      rating: 5.0,
      reviews_count: 1,
      stock: p.stock ?? 1,
      is_active: p.is_active !== false,
    }));

    const allSessions = dbListings.map((l: any) => ({
      id: l.id,
      title: l.title,
      description: l.description || '',
      price: Number(l.price) || 0,
      duration_mins: 60,
      category: l.category || 'cooking',
      creator_name: l.owner_name || 'Senior Creator',
      creator_experience: 'Senior Master Artisan',
      creator_location: l.locality_label || 'India',
      creator_avatar: '👵🏽',
      available_slots: ['Today 5:00 PM', 'Tomorrow 11:00 AM', 'Tomorrow 4:00 PM'],
      session_type: l.type === 'product' ? 'Product Order' : '1-on-1',
      rating: 5.0,
    }));

    const allVideos = dbVideos.map((v: any) => ({
      id: v.id,
      title: v.topic || 'Provider Video Lesson',
      description: v.description || '',
      category: 'cooking',
      creator_name: v.creator_name || 'Senior Creator',
      creator_avatar: '👵🏽',
      thumbnail_url: 'https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?auto=format&fit=crop&w=800&q=80',
      video_duration: '15:00',
      views_count: 42,
      posted_at: 'Recently posted',
      tags: [(v.topic || '').toLowerCase(), 'video', 'tutorial'],
    }));

    if (!cleanQuery) {
      return NextResponse.json({
        success: true,
        intent_category: 'all',
        ai_explanation: 'Here are all available service provider creations, videos, and live masterclasses.',
        matched_products: allProducts,
        matched_sessions: allSessions,
        matched_free_sessions: [],
        matched_videos: allVideos
      });
    }

    let detectedCategory = 'all';
    let aiExplanation = '';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const prompt = `
You are the SilverHands Consumer AI Assistant.
Analyze this search or request from a consumer looking for service providers, recipes, pottery, cooking, or crafts:
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
    } catch (e) {}

    if (detectedCategory === 'all' || !aiExplanation) {
      aiExplanation = `Showing matching videos, live sessions, and creations for "${cleanQuery}".`;
    }

    const matched_products = allProducts.filter((p: any) => {
      if (detectedCategory !== 'all' && p.category === detectedCategory) return true;
      return (
        p.title.toLowerCase().includes(cleanQuery) ||
        p.description.toLowerCase().includes(cleanQuery) ||
        p.creator_name.toLowerCase().includes(cleanQuery)
      );
    });

    const matched_sessions = allSessions.filter((s: any) => {
      if (detectedCategory !== 'all' && s.category === detectedCategory) return true;
      return (
        s.title.toLowerCase().includes(cleanQuery) ||
        s.description.toLowerCase().includes(cleanQuery) ||
        s.creator_name.toLowerCase().includes(cleanQuery)
      );
    });

    const matched_videos = allVideos.filter((v: any) => {
      if (detectedCategory !== 'all' && v.category === detectedCategory) return true;
      const tagMatch = v.tags.some((t: string) => t.toLowerCase().includes(cleanQuery) || cleanQuery.includes(t.toLowerCase()));
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
      matched_free_sessions: [],
      matched_videos
    });

  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Error processing consumer search' }, { status: 500 });
  }
}

