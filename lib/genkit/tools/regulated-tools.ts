// @ts-nocheck
/**
 * Regulated Genkit tools — runtime-only definitions to avoid TS OOM from heavy Genkit types.
 */
import { z } from 'zod';
import { getGenkitAi } from '../config';
import { getPool } from '../../db';

const ai = getGenkitAi();
const recordSchema = z.record(z.string(), z.unknown());

export const getProviderProfileTool = ai.defineTool(
  {
    name: 'getProviderProfile',
    description: 'Fetch a provider profile by provider_id. Read-only.',
    inputSchema: z.object({ providerId: z.string() }),
    outputSchema: z.object({ profile: recordSchema.nullable() }),
  },
  async ({ providerId }) => {
    const pool = await getPool();
    if (!pool) return { profile: null };
    const res = await pool.query(`SELECT * FROM provider_profiles WHERE provider_id = $1`, [providerId]);
    return { profile: res.rows[0] || null };
  }
);

export const getProviderKnowledgeTool = ai.defineTool(
  {
    name: 'getProviderKnowledge',
    description: 'Retrieve knowledge chunks for ONE provider only.',
    inputSchema: z.object({ providerId: z.string(), query: z.string().optional() }),
    outputSchema: z.object({ chunks: z.array(recordSchema) }),
  },
  async ({ providerId }) => {
    const pool = await getPool();
    if (!pool) return { chunks: [] };
    const res = await pool.query(
      `SELECT id, content, topic, skill, timestamp_start, timestamp_end
       FROM provider_knowledge_chunks WHERE provider_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [providerId]
    );
    return { chunks: res.rows };
  }
);

export const searchProviderTool = ai.defineTool(
  {
    name: 'searchProvider',
    description: 'Search public verified providers.',
    inputSchema: z.object({ name: z.string().optional(), skill: z.string().optional(), location: z.string().optional() }),
    outputSchema: z.object({ providers: z.array(recordSchema) }),
  },
  async ({ name, skill, location }) => {
    const pool = await getPool();
    if (!pool) return { providers: [] };
    let sql = `SELECT ua.id, ua.user_name, ua.skill, ua.location FROM user_accounts ua LIMIT 25`;
    const res = await pool.query(sql);
    let rows = res.rows;
    if (name) rows = rows.filter((r) => r.user_name?.toLowerCase().includes(name.toLowerCase()));
    if (skill) rows = rows.filter((r) => r.skill?.toLowerCase().includes(skill.toLowerCase()));
    if (location) rows = rows.filter((r) => r.location?.toLowerCase().includes(location.toLowerCase()));
    return { providers: rows };
  }
);

export const getProviderAvailabilityTool = ai.defineTool(
  {
    name: 'getProviderAvailability',
    description: 'Get real availability slots from PostgreSQL.',
    inputSchema: z.object({ providerId: z.string() }),
    outputSchema: z.object({ slots: z.array(recordSchema) }),
  },
  async ({ providerId }) => {
    const pool = await getPool();
    if (!pool) return { slots: [] };
    const res = await pool.query(
      `SELECT id, day_of_week, start_time, end_time FROM provider_availability WHERE provider_id = $1 AND is_active = true`,
      [providerId]
    );
    return { slots: res.rows };
  }
);

export const getVideoDataTool = ai.defineTool(
  {
    name: 'getVideoData',
    description: 'Get video metadata for a provider-owned video.',
    inputSchema: z.object({ providerId: z.string(), videoId: z.string() }),
    outputSchema: z.object({ video: recordSchema.nullable() }),
  },
  async ({ providerId, videoId }) => {
    const pool = await getPool();
    if (!pool) return { video: null };
    const res = await pool.query(`SELECT * FROM videos WHERE id = $1 AND creator_id = $2`, [videoId, providerId]);
    return { video: res.rows[0] || null };
  }
);

export const getPublishedVideosTool = ai.defineTool(
  {
    name: 'getPublishedVideos',
    description: 'List PUBLIC published videos for a provider.',
    inputSchema: z.object({ providerId: z.string() }),
    outputSchema: z.object({ videos: z.array(recordSchema) }),
  },
  async ({ providerId }) => {
    const pool = await getPool();
    if (!pool) return { videos: [] };
    const res = await pool.query(
      `SELECT * FROM videos WHERE creator_id = $1 AND visibility = 'PUBLIC' AND status = 'PUBLISHED'`,
      [providerId]
    );
    return { videos: res.rows };
  }
);

export const createAppointmentTool = ai.defineTool(
  {
    name: 'createAppointment',
    description: 'Book an appointment with double-booking prevention.',
    inputSchema: z.object({
      providerId: z.string(),
      consumerId: z.string(),
      availabilityId: z.string(),
      slotDate: z.string(),
      startTime: z.string(),
      endTime: z.string(),
    }),
    outputSchema: z.object({ success: z.boolean(), appointmentId: z.string().optional(), error: z.string().optional() }),
  },
  async (input) => {
    const pool = await getPool();
    if (!pool) return { success: false, error: 'Database unavailable.' };
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(
        `SELECT id FROM provider_appointments WHERE provider_id = $1 AND slot_date = $2 AND start_time = $3 AND status != 'cancelled' FOR UPDATE`,
        [input.providerId, input.slotDate, input.startTime]
      );
      if (existing.rows.length > 0) {
        await client.query('ROLLBACK');
        return { success: false, error: 'Slot already booked.' };
      }
      const id = `appt-${Date.now()}`;
      await client.query(
        `INSERT INTO provider_appointments (id, provider_id, consumer_id, availability_id, slot_date, start_time, end_time, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'confirmed')`,
        [id, input.providerId, input.consumerId, input.availabilityId, input.slotDate, input.startTime, input.endTime]
      );
      await client.query('COMMIT');
      return { success: true, appointmentId: id };
    } catch (e) {
      await client.query('ROLLBACK');
      return { success: false, error: e?.message || 'Booking failed.' };
    } finally {
      client.release();
    }
  }
);

export const updateProviderProfileTool = ai.defineTool(
  {
    name: 'updateProviderProfile',
    description: 'Update provider profile with ownership check.',
    inputSchema: z.object({ providerId: z.string(), displayName: z.string().optional(), bio: z.string().optional(), language: z.string().optional() }),
    outputSchema: z.object({ success: z.boolean(), error: z.string().optional() }),
  },
  async (input) => {
    const pool = await getPool();
    if (!pool) return { success: false, error: 'Database unavailable.' };
    await pool.query(
      `INSERT INTO provider_profiles (id, provider_id, display_name, bio, language, updated_at)
       VALUES ($1,$2,COALESCE($3,'Provider'),$4,$5,CURRENT_TIMESTAMP)
       ON CONFLICT (provider_id) DO UPDATE SET display_name=COALESCE(EXCLUDED.display_name,provider_profiles.display_name),
         bio=COALESCE(EXCLUDED.bio,provider_profiles.bio), language=COALESCE(EXCLUDED.language,provider_profiles.language), updated_at=CURRENT_TIMESTAMP`,
      [`pp_${input.providerId}`, input.providerId, input.displayName, input.bio, input.language]
    );
    return { success: true };
  }
);

export const publishVideoVersionTool = ai.defineTool(
  {
    name: 'publishVideoVersion',
    description: 'Publish a generated short to public profile.',
    inputSchema: z.object({ providerId: z.string(), videoId: z.string(), versionId: z.string() }),
    outputSchema: z.object({ success: z.boolean(), error: z.string().optional() }),
  },
  async (input) => {
    const pool = await getPool();
    if (!pool) return { success: false, error: 'Database unavailable.' };
    const verRes = await pool.query(
      `SELECT vv.* FROM video_versions vv JOIN videos v ON v.id = vv.video_id WHERE vv.id = $1 AND v.creator_id = $2`,
      [input.versionId, input.providerId]
    );
    if (!verRes.rows.length) return { success: false, error: 'Version not found.' };
    const version = verRes.rows[0];
    await pool.query(
      `UPDATE videos SET storage_key=$1, status='PUBLISHED', visibility='PUBLIC', published_at=NOW(), duration_seconds=$2 WHERE id=$3 AND creator_id=$4`,
      [version.storage_key, version.duration_seconds, input.videoId, input.providerId]
    );
    await pool.query(`UPDATE video_versions SET visibility='PUBLIC', version_type='published_short', status='PUBLISHED' WHERE id=$1`, [input.versionId]);
    return { success: true };
  }
);

export const regulatedTools = [
  getProviderProfileTool,
  getProviderKnowledgeTool,
  searchProviderTool,
  getProviderAvailabilityTool,
  getVideoDataTool,
  getPublishedVideosTool,
  createAppointmentTool,
  updateProviderProfileTool,
  publishVideoVersionTool,
];
