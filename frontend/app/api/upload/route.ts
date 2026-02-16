import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 });
    }

    // Validiere Dateityp
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Nur Bilder sind erlaubt' }, { status: 400 });
    }

    // Validiere Dateigröße (max 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'Datei zu groß (max 5MB)' }, { status: 400 });
    }

    // Erstelle Upload-Verzeichnis
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'blog');
    await mkdir(uploadDir, { recursive: true });

    // Generiere eindeutigen Dateinamen
    const fileExtension = path.extname(file.name);
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(uploadDir, fileName);

    // Konvertiere File zu Buffer und speichere
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Gebe die relative URL zurück
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