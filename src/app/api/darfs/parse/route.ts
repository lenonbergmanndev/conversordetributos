import { NextRequest, NextResponse } from "next/server";
import { PDFParse } from "pdf-parse";
import { parseDarfs } from "@/utils/darf-parser";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "Arquivo PDF não encontrado." },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const parser = new PDFParse({ data: Buffer.from(arrayBuffer) });
    const parsed = await parser.getText();
    await parser.destroy();

    const darfs = parseDarfs(parsed.text);

    if (!darfs.length) {
      return NextResponse.json(
        { message: "Nenhuma guia de DARF foi identificada no PDF enviado." },
        { status: 422 },
      );
    }

    return NextResponse.json({ darfs });
  } catch (error) {
    console.error("Erro ao processar DARF", error);
    return NextResponse.json(
      { message: "Não foi possível processar o arquivo enviado." },
      { status: 500 },
    );
  }
}