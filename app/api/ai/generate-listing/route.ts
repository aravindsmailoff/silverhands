import { NextResponse } from 'next/server';
import { generateListingFromTranscript, generateVideoDescriptionFromSpeech } from '@/lib/gemini';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { transcript, mode, creatorName } = body;

    if (!transcript) {
      return NextResponse.json({ error: 'Spoken transcript text is required' }, { status: 400 });
    }

    if (mode === 'video_description') {
      const generated = await generateVideoDescriptionFromSpeech(transcript, creatorName || 'Senior Creator');
      return NextResponse.json({
        success: true,
        title: generated.title,
        description: generated.description
      });
    }

    const draft = await generateListingFromTranscript(transcript);
    return NextResponse.json({ success: true, draft });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Error generating AI content from transcript' }, { status: 500 });
  }
}
