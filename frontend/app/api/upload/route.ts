import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { verifyRequestForUser } from '@/lib/auth';
import { getUserRole } from '@/lib/db';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

export async function POST(request: NextRequest) {
  try {
    const discordId = request.nextUrl.searchParams.get('discordId');
    if (!discordId) {
      return NextResponse.json({ error: 'discordId is required' }, { status: 400 });
    }

    const auth = await verifyRequestForUser(request, discordId);
    if (!auth.valid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const role = await getUserRole(discordId);
    if (!['admin', 'operator'].includes(role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 });
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Nur Bilder sind erlaubt' }, { status: 400 });
    }

    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Datei zu groß (max 5MB)' }, { status: 400 });
    }

    const fileExtension = path.extname(file.name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(fileExtension)) {
      return NextResponse.json({ error: 'Nicht erlaubte Dateiendung' }, { status: 400 });
    }

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'blog');
    await mkdir(uploadDir, { recursive: true });

    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(uploadDir, fileName);

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    const imageUrl = `/uploads/blog/${fileName}`;
    
    return NextResponse.json({ 
      success: true, 
      url: imageUrl,
      message: 'Bild erfolgreich hochgeladen'
    });

  } catch (error) {
    console.error('Upload-Fehler:', error);
    return NextResponse.json({ 
      error: 'Fehler beim Hochladen des Bildes' 
    }, { status: 500 });
  }
}