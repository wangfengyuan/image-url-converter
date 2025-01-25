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
    const filename = `logo-${domain}-${hash}.${fileExtension}`;

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

    // upload to R2
    await R2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filename,
      Body: imageResponse.data,
      ContentType: imageResponse.headers['content-type'],
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