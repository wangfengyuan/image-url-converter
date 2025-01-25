import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import axios from 'axios';
import crypto from 'crypto';
import { NextResponse } from 'next/server';

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

    // 从URL中提取域名
    const url = new URL(imageUrl);
    const domain = url.hostname;

    // 生成文件名：使用域名作为基础
    const hash = crypto.createHash('md5')
      .update(domain) // 只对域名进行hash
      .digest('hex')
      .slice(0, 8);
    const fileExtension = 'jpg';
    const filename = `logo-${domain}-${hash}.${fileExtension}`;

    // 检查文件是否已存在
    try {
      const existingResponse = await R2.send(new HeadObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: filename,
      }));

      // 如果文件已存在，直接返回现有URL
      return NextResponse.json({
        success: true,
        url: `${process.env.R2_PUBLIC_URL}/${filename}`,
        cached: true
      });
    } catch (err) {
      // 文件不存在，继续处理
    }

    // 下载图片
    const imageResponse = await axios.get(imageUrl, {
      responseType: 'arraybuffer'
    });

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
      url: publicUrl,
      cached: false
    });

  } catch (error: any) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: `上传失败: ${error.message}` },
      { status: 500 }
    );
  }
}