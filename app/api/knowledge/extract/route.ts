import { NextResponse } from 'next/server';
import { getPool, initDatabaseSchema } from '@/lib/db';
import { chunkTranscript, textEmbedding } from '@/lib/knowledge/extraction';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { providerId, videoId, transcript, topic, skill, language } = body;

    if (!providerId || !transcript) {
      return NextResponse.json({ success: false, message: 'providerId and transcript are required.' }, { status: 400 });
    }

    const pool = await getPool();
    if (!pool) {
      return NextResponse.json({ success: false, message: 'Database unavailable.' }, { status: 503 });
    }

    await initDatabaseSchema();

    const knowledgeId = `pk_${providerId}_${Date.now()}`;
    const chunks = chunkTranscript(transcript);

    await pool.query(
      `INSERT INTO provider_knowledge (id, provider_id, video_id, topic, skill, language, summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        knowledgeId,
        providerId,
        videoId || null,
        topic || null,
        skill || null,
        language || 'en',
        chunks[0]?.content?.slice(0, 500) || null,
      ]
    );

    const savedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkId = `${knowledgeId}_c${i}`;
      const embedding = JSON.stringify(textEmbedding(chunk.content));

      await pool.query(
        `INSERT INTO provider_knowledge_chunks
          (id, provider_id, video_id, knowledge_id, content, topic, skill, language,
           timestamp_start, timestamp_end, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          chunkId,
          providerId,
          videoId || null,
          knowledgeId,
          chunk.content,
          topic || null,
          skill || null,
          language || 'en',
          chunk.timestampStart ?? null,
          chunk.timestampEnd ?? null,
          embedding,
        ]
      );
      savedChunks.push(chunkId);
    }

    if (videoId) {
      await pool.query(`UPDATE videos SET transcript = $1 WHERE id = $2 AND creator_id = $3`, [
        transcript,
        videoId,
        providerId,
      ]);
    }

    return NextResponse.json({
      success: true,
      knowledgeId,
      chunkCount: savedChunks.length,
      chunkIds: savedChunks,
    });
  } catch (err: unknown) {
    console.error('[knowledge/extract]', err);
    return NextResponse.json({ success: false, message: 'Knowledge extraction failed.' }, { status: 500 });
  }
}
