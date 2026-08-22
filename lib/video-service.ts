/**
 * Authoritative Video Lifecycle and Playback Service for SilverHands
 * 
 * Enforces the conceptual model:
 * MASTER VIDEO (Private, Raw Blob)
 *   ↓
 * VIDEO VERSION (Draft / Processing / Published)
 *   ↓
 * PUBLIC POST (Consumer Visible, Published Only)
 * 
 * All metadata & binary Blobs persist in IndexedDB (`SilverHandsLocalDB`).
 * Playable URLs are safely reconstructed from stored Blobs on demand.
 */

import { localDB, DBMasterVideo, DBVideoVersion, DBVideoBlob, DBPublicPost } from './local-db';

export interface PlayableVideo {
  id: string; // post or version ID
  versionId: string;
  videoId: string;
  creatorId: string;
  creatorName: string;
  title: string;
  description: string;
  durationSeconds: number;
  videoUrl: string; // fresh, playable object URL or proxy route
  mimeType: string;
  views: number;
  likes: number;
  publishedAt: string;
  isPublic: boolean;
  diagnosticStatus?: string;
}

class VideoService {
  private activeObjectUrls: Set<string> = new Set();

  /**
   * Cleans up revoked object URLs on teardown
   */
  public cleanupUrls(): void {
    for (const url of this.activeObjectUrls) {
      URL.revokeObjectURL(url);
    }
    this.activeObjectUrls.clear();
  }

  // ── Step 1: Save Master Video (Raw Recording / Upload) ─────────────────────

  public async saveMasterVideo(params: {
    creatorId: string;
    creatorName: string;
    title: string;
    description?: string;
    sourceType: 'RECORDED' | 'UPLOADED';
    durationSeconds: number;
    blob: Blob;
  }): Promise<DBMasterVideo> {
    const videoId = `mvid_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const blobId = `blob_${videoId}`;
    const now = new Date().toISOString();

    // 1. Persist Binary Blob to IndexedDB
    const videoBlob: DBVideoBlob = {
      id: blobId,
      blob: params.blob,
      mimeType: params.blob.type || 'video/webm',
      sizeBytes: params.blob.size,
      createdAt: now,
    };
    await localDB.put<DBVideoBlob>('video_blobs', videoBlob);

    // 2. Persist Master Video Metadata to IndexedDB
    const masterVideo: DBMasterVideo = {
      id: videoId,
      creatorId: params.creatorId,
      creatorName: params.creatorName,
      title: params.title || 'Untitled Lesson Recording',
      description: params.description || 'Master raw lesson recording',
      sourceType: params.sourceType,
      durationSeconds: Math.round(params.durationSeconds || 0),
      mimeType: params.blob.type || 'video/webm',
      blobId,
      status: 'RECORDED',
      createdAt: now,
      updatedAt: now,
    };
    await localDB.put<DBMasterVideo>('videos', masterVideo);

    // 3. Automatically create Version 1 as private source draft
    const ver1Id = `ver_${videoId}_1`;
    const version1: DBVideoVersion = {
      id: ver1Id,
      videoId,
      creatorId: params.creatorId,
      creatorName: params.creatorName,
      versionNumber: 1,
      title: `${params.title} (Raw Full Video)`,
      hookText: params.description,
      durationSeconds: Math.round(params.durationSeconds || 0),
      mimeType: params.blob.type || 'video/webm',
      blobId,
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now,
    };
    await localDB.put<DBVideoVersion>('video_versions', version1);

    return masterVideo;
  }

  // ── Step 2: Add AI Generated Video Version ────────────────────────────────

  public async addVideoVersion(params: {
    videoId: string;
    creatorId: string;
    creatorName: string;
    versionNumber: number;
    title: string;
    hookText?: string;
    durationSeconds: number;
    storagePath?: string; // e.g. /api/videomodel/clip/videos/...
    blob?: Blob;
  }): Promise<DBVideoVersion> {
    const versionId = `ver_${params.videoId}_${params.versionNumber}`;
    const now = new Date().toISOString();

    let blobId: string | undefined = undefined;
    let mimeType = 'video/mp4';

    if (params.blob) {
      blobId = `blob_${versionId}`;
      mimeType = params.blob.type || 'video/mp4';
      await localDB.put<DBVideoBlob>('video_blobs', {
        id: blobId,
        blob: params.blob,
        mimeType,
        sizeBytes: params.blob.size,
        createdAt: now,
      });
    }

    const version: DBVideoVersion = {
      id: versionId,
      videoId: params.videoId,
      creatorId: params.creatorId,
      creatorName: params.creatorName,
      versionNumber: params.versionNumber,
      title: params.title || `Short Clip #${params.versionNumber}`,
      hookText: params.hookText || '',
      durationSeconds: Math.round(params.durationSeconds || 15),
      mimeType,
      blobId,
      storagePath: params.storagePath,
      status: 'DRAFT',
      createdAt: now,
      updatedAt: now,
    };

    await localDB.put<DBVideoVersion>('video_versions', version);
    return version;
  }

  // ── Step 3: Publish Video Version (Explicit "Post to Profile") ─────────────

  public async publishVideoVersion(versionId: string): Promise<DBPublicPost> {
    const version = await localDB.get<DBVideoVersion>('video_versions', versionId);
    if (!version) {
      throw new Error(`Video version ${versionId} not found.`);
    }

    const now = new Date().toISOString();

    // 1. Mark version as PUBLISHED
    version.status = 'PUBLISHED';
    version.publishedAt = now;
    version.updatedAt = now;
    await localDB.put<DBVideoVersion>('video_versions', version);

    // 2. Upsert single authoritative Public Post record (Idempotent by versionId)
    const postId = `post_${version.id}`;
    const post: DBPublicPost = {
      id: postId,
      videoVersionId: version.id,
      videoId: version.videoId,
      creatorId: version.creatorId,
      creatorName: version.creatorName,
      title: version.title,
      description: version.hookText || version.title,
      durationSeconds: version.durationSeconds,
      views: 0,
      likes: 0,
      publishedAt: now,
    };

    await localDB.put<DBPublicPost>('posts', post);
    return post;
  }

  // ── Step 4: Resolve Playable URL for a Version ────────────────────────────

  public async resolvePlayableUrl(version: DBVideoVersion): Promise<{ url: string; isValid: boolean; reason?: string }> {
    // 1. If stored as a binary Blob in IndexedDB
    if (version.blobId) {
      const blobRecord = await localDB.get<DBVideoBlob>('video_blobs', version.blobId);
      if (blobRecord && blobRecord.blob && blobRecord.blob.size > 0) {
        const objUrl = URL.createObjectURL(blobRecord.blob);
        this.activeObjectUrls.add(objUrl);
        return { url: objUrl, isValid: true };
      }
    }

    // 2. If stored as a relative proxy path to FastAPI output
    if (version.storagePath && version.storagePath.startsWith('/')) {
      return { url: version.storagePath, isValid: true };
    }

    return {
      url: '',
      isValid: false,
      reason: 'PUBLISHED_BUT_FILE_MISSING',
    };
  }

  // ── Step 5: Consumer Retrieval (Authoritative Public Feed) ─────────────────

  public async getPublishedVideos(): Promise<PlayableVideo[]> {
    const posts = await localDB.getAll<DBPublicPost>('posts');
    const validPlayableVideos: PlayableVideo[] = [];

    for (const post of posts) {
      const version = await localDB.get<DBVideoVersion>('video_versions', post.videoVersionId);
      if (!version || version.status !== 'PUBLISHED') {
        continue;
      }

      const { url, isValid, reason } = await this.resolvePlayableUrl(version);
      if (!isValid || !url) {
        console.warn(`[VideoService] Video excluded from consumer feed (${reason}):`, post.id);
        continue;
      }

      validPlayableVideos.push({
        id: post.id,
        versionId: version.id,
        videoId: post.videoId,
        creatorId: post.creatorId,
        creatorName: post.creatorName,
        title: post.title,
        description: post.description || '',
        durationSeconds: post.durationSeconds,
        videoUrl: url,
        mimeType: version.mimeType || 'video/mp4',
        views: post.views,
        likes: post.likes,
        publishedAt: post.publishedAt,
        isPublic: true,
      });
    }

    // Sort by latest published
    return validPlayableVideos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  }

  // ── Step 6: Creator Profile Video Retrieval ───────────────────────────────

  public async getCreatorVideos(creatorIdOrName: string): Promise<{ publicVideos: PlayableVideo[]; privateVideos: PlayableVideo[] }> {
    const q = creatorIdOrName.trim().toLowerCase();
    const allVersions = await localDB.getAll<DBVideoVersion>('video_versions');

    const creatorVersions = allVersions.filter(v => 
      v.creatorId.toLowerCase() === q || 
      v.creatorName.toLowerCase() === q ||
      v.creatorId.toLowerCase().includes(q)
    );

    const publicVideos: PlayableVideo[] = [];
    const privateVideos: PlayableVideo[] = [];

    for (const v of creatorVersions) {
      const { url, isValid, reason } = await this.resolvePlayableUrl(v);
      if (!isValid || !url) {
        console.warn(`[VideoService] Creator version missing file (${reason}):`, v.id);
        continue;
      }

      const item: PlayableVideo = {
        id: v.id,
        versionId: v.id,
        videoId: v.videoId,
        creatorId: v.creatorId,
        creatorName: v.creatorName,
        title: v.title,
        description: v.hookText || v.title,
        durationSeconds: v.durationSeconds,
        videoUrl: url,
        mimeType: v.mimeType,
        views: 0,
        likes: 0,
        publishedAt: v.publishedAt || v.createdAt,
        isPublic: v.status === 'PUBLISHED',
      };

      if (v.status === 'PUBLISHED') {
        publicVideos.push(item);
      } else {
        privateVideos.push(item);
      }
    }

    return {
      publicVideos: publicVideos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
      privateVideos: privateVideos.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)),
    };
  }

  // ── Step 7: Delete Video ──────────────────────────────────────────────────

  public async deleteVideo(versionOrVideoId: string): Promise<void> {
    // 1. Check if it's a version
    const version = await localDB.get<DBVideoVersion>('video_versions', versionOrVideoId);
    if (version) {
      if (version.blobId) await localDB.delete('video_blobs', version.blobId);
      await localDB.delete('posts', `post_${version.id}`);
      await localDB.delete('video_versions', version.id);
      return;
    }

    // 2. Check if it's a master video
    const master = await localDB.get<DBMasterVideo>('videos', versionOrVideoId);
    if (master) {
      if (master.blobId) await localDB.delete('video_blobs', master.blobId);
      const versions = await localDB.getByIndex<DBVideoVersion>('video_versions', 'videoId', master.id);
      for (const v of versions) {
        if (v.blobId) await localDB.delete('video_blobs', v.blobId);
        await localDB.delete('posts', `post_${v.id}`);
        await localDB.delete('video_versions', v.id);
      }
      await localDB.delete('videos', master.id);
    }
  }
}

export const videoService = new VideoService();
