import { NextResponse } from "next/server";
import { downloadImage, generateFileName, getExtension, uploadToR2 } from "../../actions/upload-actions";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let imageData: ArrayBuffer | Buffer;
    let filename: string;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return NextResponse.json({ error: "Please provide an image file" }, { status: 400 });
      }

      imageData = await file.arrayBuffer();
      const extension = getExtension(file.name);
      filename = await generateFileName(imageData, extension);
    } else {
      const { imageUrl } = await request.json();

      if (!imageUrl) {
        return NextResponse.json({ error: "Please provide an image URL" }, { status: 400 });
      }

      imageData = await downloadImage(imageUrl);
      const extension = getExtension(imageUrl);
      filename = await generateFileName(imageData, extension);
    }

    const publicUrl = await uploadToR2(filename, imageData);

    return NextResponse.json({
      success: true,
      url: publicUrl,
      cached: false,
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: `Upload failed: ${error.message}` }, { status: 500 });
  }
}
