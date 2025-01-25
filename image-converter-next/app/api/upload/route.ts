import { NextResponse } from 'next/server';
import axios from 'axios';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';

// 初始化 S3 客户端
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
        { error: '请提供图片URL' },
        { status: 400 }
      );
    }

    // 下载图片
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer'
    });

    // 生成文件名
    const timestamp = Date.now();
    const hash = crypto.createHash('md5')
      .update(imageUrl + timestamp)
      .digest('hex')
      .slice(0, 8);
    const fileExtension = 'jpg'; // 可以根据实际Content-Type判断
    const filename = `${timestamp}-${hash}.${fileExtension}`;

    // 上传到 R2
    await R2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filename,
      Body: imageResponse.data,
      ContentType: imageResponse.headers['content-type'],
      CacheControl: 'public, max-age=31536000',
    }));

    // 返回公共访问URL
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${filename}`;

    return NextResponse.json({
      success: true,
      url: publicUrl
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: `上传失败: ${error.message}` },
      { status: 500 }
    );
  }
}