import { NextRequest, NextResponse } from 'next/server';
import { getSessionWorkspace } from '@/lib/data/workspace';
import { createAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'agency-logos';
const MAX_BYTES = 2 * 1024 * 1024; // 2MB

const ALLOWED: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionWorkspace();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File exceeds 2MB limit' }, { status: 400 });
    }

    const ext = ALLOWED[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: 'Unsupported file type. Allowed: PNG, JPG, WEBP.' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Ensure bucket exists
    const { data: buckets } = await admin.storage.listBuckets();
    const bucketExists = buckets?.some((b) => b.name === BUCKET);

    if (!bucketExists) {
      const { error: createErr } = await admin.storage.createBucket(BUCKET, {
        public: true,
      });
      if (createErr && !createErr.message?.includes('already exists')) {
        console.error('Bucket creation error:', createErr);
        return NextResponse.json({ error: 'Failed to create storage bucket' }, { status: 500 });
      }
    }

    // One logo per workspace (the URL is saved on the workspace profile).
    const path = `${session.workspaceId}/logo.${ext}`;
    const { error: upErr } = await admin.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) {
      console.error('Logo upload error:', upErr);
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }

    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ url: pub.publicUrl }, { status: 201 });
  } catch (err) {
    console.error('POST /api/upload-logo error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
