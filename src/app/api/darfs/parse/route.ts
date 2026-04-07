import { NextRequest, NextResponse } from "next/server";

// IMPORTAR O WORKER ANTES DO PDFParse
import { getData } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

import { parseDarfs } from "@/utils/darf-parser";

export const runtime = "nodejs";

// Configura explicitamente o worker em memória.
// A doc do pdf-parse recomenda getData() ou getPath() para corrigir "fake worker failed".
PDFParse.setWorker(getData());

export async function POST(request: NextRequest) {
  let parser: PDFParse | null = null;

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
    const buffer = Buffer.from(arrayBuffer);

    parser = new PDFParse({
      data: buffer,
    });

    const parsed = await parser.getText();
    const extractedText = parsed?.text ?? "";

    if (!extractedText.trim()) {
      return NextResponse.json(
        {
          message: "O PDF foi lido, mas nenhum texto foi extraído.",
        },
        { status: 422 },
      );
    }

    const darfs = parseDarfs(extractedText);

    if (!darfs.length) {
      return NextResponse.json(
        {
          message: "Nenhuma guia de DARF foi identificada no PDF enviado.",
          detail: "Texto extraído com sucesso, mas o parser não reconheceu nenhuma guia.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ darfs });
  } catch (error) {
    const detail =
      error instanceof Error
        ? `${error.name}: ${error.message}`
        : "Erro desconhecido";

    console.error("Erro ao processar DARF:", error);

    return NextResponse.json(
      {
        message: "Não foi possível processar o arquivo enviado.",
        detail,
      },
      { status: 500 },
    );
  } finally {
    await parser?.destroy?.();
  }
}