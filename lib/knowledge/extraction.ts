/**
 * Video transcript → semantic chunks → provider-scoped knowledge storage.
 * Embeddings stored as JSON vectors for future pgvector migration.
 */

import { generateFaceEmbedding } from '../biometrics/face-pipeline';

export interface KnowledgeChunkInput {
  content: string;
  topic?: string;
  skill?: string;
  language?: string;
  timestampStart?: number;
  timestampEnd?: number;
}

/** Simple semantic chunking by sentence groups (~3 sentences per chunk). */
export function chunkTranscript(transcript: string, maxChunkChars = 400): KnowledgeChunkInput[] {
  const cleaned = transcript.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  const chunks: KnowledgeChunkInput[] = [];
  let buffer = '';

  for (const sentence of sentences) {
    if ((buffer + ' ' + sentence).trim().length > maxChunkChars && buffer.length > 0) {
      chunks.push({ content: buffer.trim() });
      buffer = sentence;
    } else {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    }
  }
  if (buffer.trim()) chunks.push({ content: buffer.trim() });
  return chunks;
}

/** Text embedding placeholder — deterministic hash-based vector for RAG-ready storage. */
export function textEmbedding(text: string, dim = 64): number[] {
  const vec = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    vec[i % dim] += code / 255;
  }
  const norm = Math.sqrt(vec.reduce((s, x) => s + x * x, 0)) || 1;
  return vec.map((x) => x / norm);
}

export { generateFaceEmbedding };
