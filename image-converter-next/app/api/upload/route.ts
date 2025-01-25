import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import axios from 'axios';
import crypto from 'crypto';
import { NextResponse } from 'next/server';

// initialize S3 client
const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

export async function POST(request: Request) {
  try {
    // Check if the request is multipart form data
    const contentType = request.headers.get('content-type') || '';

    let imageData;
    let filename;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json(
          { error: 'Please provide an image file' },
          { status: 400 }
        );
      }

      // Generate filename for uploaded file
      const originalName = file.name.toLowerCase();
      const hash = crypto.createHash('md5')
        .update(originalName + Date.now())
        .digest('hex')
        .slice(0, 8);
      const fileExtension = originalName.split('.').pop() || 'jpg';
      filename = `upload-${hash}.${fileExtension}`;

      imageData = await file.arrayBuffer();
    } else {
      // Handle URL upload (existing logic)
      const { imageUrl } = await request.json();

      if (!imageUrl) {
        return NextResponse.json(
          { error: 'Please provide an image URL' },
          { status: 400 }
        );
      }

      // extract domain from URL
      const url = new URL(imageUrl);
      const domain = url.hostname;

      // generate filename: use domain as base
      const hash = crypto.createHash('md5')
        .update(domain) // only hash domain
        .digest('hex')
        .slice(0, 8);
      const fileExtension = 'jpg';
      filename = `logo-${domain}-${hash}.${fileExtension}`;

      // check if file exists
      try {
        const existingResponse = await R2.send(new HeadObjectCommand({
          Bucket: process.env.R2_BUCKET_NAME,
          Key: filename,
        }));

        // if file exists, return existing URL
        return NextResponse.json({
          success: true,
          url: `${process.env.R2_PUBLIC_URL}/${filename}`,
          cached: true
        });
      } catch (err) {
        // file does not exist, continue processing
      }

      // download image
      const imageResponse = await axios.get(imageUrl, {
        responseType: 'arraybuffer'
      });

      imageData = imageResponse.data;
    }

    // upload to R2
    await R2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filename,
      Body: imageData,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000',
    }));

    // return public access URL
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl,
      cached: false
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: `Upload failed: ${error.message}` },
      { status: 500 }
    );
  }
}