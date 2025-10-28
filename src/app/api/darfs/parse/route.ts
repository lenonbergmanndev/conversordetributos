import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";

interface DarfRecord {
  id: string;
  nome: string;
  periodoApuracao: string;
  cnpj: string;
  codigoReceita: string;
  numeroReferencia: string;
  dataVencimento: string;
  valorPrincipal: number;
  valorMulta: number;
  valorJuros: number;
  valorTotal: number;
}

type FieldKey = keyof Omit<DarfRecord, "id" | "valorPrincipal" | "valorMulta" | "valorJuros" | "valorTotal">;

type NumericKey = Extract<keyof DarfRecord, "valorPrincipal" | "valorMulta" | "valorJuros" | "valorTotal">;

const numericFields: Record<string, NumericKey> = {
  "07": "valorPrincipal",
  "08": "valorMulta",
  "09": "valorJuros",
  "10": "valorTotal",
};

const textFields: Record<string, FieldKey> = {
  "01": "nome",
  "02": "periodoApuracao",
  "03": "cnpj",
  "04": "codigoReceita",
  "05": "numeroReferencia",
  "06": "dataVencimento",
};

const fieldOrder = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"];

function sanitizeLine(line: string) {
  return line
    .replace(/\s+/g, " ")
    .replace(/\.\.+/g, " ")
    .replace(/\s:/g, ":")
    .trim();
}

function normalizeNumber(value: string) {
  const sanitized = value
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(/,/g, ".");
  const parsed = Number.parseFloat(sanitized);
  return Number.isNaN(parsed) ? 0 : Number(parsed.toFixed(2));
}

function extractValue(lines: string[], index: number) {
  const current = lines[index]?.trim() ?? "";
  if (current) {
    return current;
  }
  const next = lines[index + 1]?.trim();
  return next ?? "";
}

function parseBlocks(text: string) {
  const cleanedText = text.replace(/\r/g, "");
  const candidateSplits = cleanedText
    .split(/(?:^|\n)\s*(?:DOCUMENTO DE ARRECADA[CÃ‡][AÃƒ]O|DARF)\b/i)
    .map((block) => block.trim())
    .filter(Boolean);

  if (candidateSplits.length > 1) {
    return candidateSplits;
  }

  const fallback = cleanedText
    .split(/(?:^|\n)0?1\s+NOME/i)
    .map((block, index) => (index === 0 ? block : `01 NOME ${block}`))
    .map((block) => block.trim())
    .filter((block) => fieldOrder.some((code) => block.includes(code)));

  return fallback.length > 0 ? fallback : [cleanedText];
}

function parseDarfs(text: string): DarfRecord[] {
  const blocks = parseBlocks(text);
  const darfs: DarfRecord[] = [];

  for (const block of blocks) {
    const lines = block
      .split(/\n+/)
      .map((line) => sanitizeLine(line))
      .filter(Boolean);

    if (!lines.length) {
      continue;
    }

    let current: Partial<DarfRecord> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^0?(\d{1,2})\s*[-:]*\s*([A-ZÃ‡Ãƒ\s]+)(?:[:\-]\s*|\s{2,}|\s)(.*)$/iu);
      if (!match) {
        continue;
      }

      const [, codeRaw,, valueRaw] = match;
      const code = codeRaw.padStart(2, "0");
      let value = valueRaw?.trim() ?? "";

      if (!value) {
        value = extractValue(lines, i + 1);
      }

      if (textFields[code]) {
        const key = textFields[code];
        (current as Record<string, string>)[key] = value;
      } else if (numericFields[code]) {
        const key = numericFields[code];
        (current as Record<string, number>)[key] = normalizeNumber(value);
      }

      if (code === "10") {
        if (Object.keys(current).length > 0) {
          darfs.push({
            id: randomUUID(),
            nome: current.nome ?? "",
            periodoApuracao: current.periodoApuracao ?? "",
            cnpj: current.cnpj ?? "",
            codigoReceita: current.codigoReceita ?? "",
            numeroReferencia: current.numeroReferencia ?? "",
            dataVencimento: current.dataVencimento ?? "",
            valorPrincipal: current.valorPrincipal ?? 0,
            valorMulta: current.valorMulta ?? 0,
            valorJuros: current.valorJuros ?? 0,
            valorTotal: current.valorTotal ?? 0,
          });
        }
        current = {};
      }
    }

    if (Object.keys(current).length > 0 && !("valorTotal" in current)) {
      darfs.push({
        id: randomUUID(),
        nome: current.nome ?? "",
        periodoApuracao: current.periodoApuracao ?? "",
        cnpj: current.cnpj ?? "",
        codigoReceita: current.codigoReceita ?? "",
        numeroReferencia: current.numeroReferencia ?? "",
        dataVencimento: current.dataVencimento ?? "",
        valorPrincipal: current.valorPrincipal ?? 0,
        valorMulta: current.valorMulta ?? 0,
        valorJuros: current.valorJuros ?? 0,
        valorTotal: current.valorTotal ?? 0,
      });
    }
  }

  return darfs;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { message: "Arquivo PDF nÃ£o encontrado." },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsed = await pdfParse(buffer);

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
      { message: "NÃ£o foi possÃ­vel processar o arquivo enviado." },
      { status: 500 },
    );
  }
}
