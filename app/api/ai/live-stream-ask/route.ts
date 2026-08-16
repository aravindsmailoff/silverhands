import { NextResponse } from 'next/server';

const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
const preferredOllamaModel = process.env.OLLAMA_MODEL || 'qwen3:4b';

export async function POST(req: Request) {
  try {
    const { question, streamTitle, streamDesc } = await req.json();
    if (!question) {
      return NextResponse.json({ success: false, error: 'Missing question' }, { status: 400 });
    }

    const prompt = `
You are the SilverHands Live Masterclass AI Assistant.
The learner is watching a live stream titled "${streamTitle}" (${streamDesc || 'active class'}).
They have asked this question:
"${question}"

Provide a warm, supportive, and helpful 1-2 sentence response. Since you are watching the live stream alongside them, offer a tip relevant to the subject. Keep it concise.
`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const ollamaRes = await fetch(`${ollamaHost}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: preferredOllamaModel,
          prompt,
          stream: false,
          options: { temperature: 0.7, num_predict: 100 }
        })
      });

      clearTimeout(timeoutId);

      if (ollamaRes.ok) {
        const data = await ollamaRes.json();
        const text = data.response || '';
        if (text.trim().length > 0) {
          return NextResponse.json({ success: true, answer: text.trim() });
        }
      }
    } catch (ollamaErr) {
      console.warn('[Ollama Live Stream Ask] Ollama request failed, falling back to simulated matching response:', ollamaErr);
    }

    // High quality simulated matching response based on keywords
    let answer = `That is a wonderful question! For ${streamTitle}, make sure to pay close attention to the host's active demonstrations and follow their step-by-step techniques carefully.`;
    const q = question.toLowerCase();
    
    if (q.includes('salt') || q.includes('water') || q.includes('turmeric') || q.includes('spice') || q.includes('ingredient')) {
      answer = `Great question! In traditional cooking, spices and ingredients are added gradually. Watch closely as the instructor shows the exact proportions in their prep bowls!`;
    } else if (q.includes('heat') || q.includes('boil') || q.includes('fry') || q.includes('cook') || q.includes('minute')) {
      answer = `The instructor is using medium heat right now. Usually, simmering takes about 10-15 minutes to let the aromatic flavors fully blend together.`;
    } else if (q.includes('clay') || q.includes('pottery') || q.includes('wheel') || q.includes('turn')) {
      answer = `Pottery requires keeping your hands damp and maintaining a steady, centered pressure on the wheel. Look at how the master positions their thumbs!`;
    } else if (q.includes('paint') || q.includes('gold') || q.includes('foil') || q.includes('art') || q.includes('tanjore')) {
      answer = `Tanjore art utilizes gold leaf sheets pressed gently over dried muck paste. The master is detailing the alignment lines right now!`;
    }

    return NextResponse.json({ success: true, answer });
  } catch (err: any) {
    console.error('[Live Stream Ask API Error]:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
