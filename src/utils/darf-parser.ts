import { randomUUID } from "node:crypto";
import type { DarfRecord } from "@/types/darf";

const moneyRe = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
const dateRe = /^\d{2}\/\d{2}\/\d{4}$/;
const codeRe = /^\d{4,6}$/;
const refRe = /^\d{5,17}$/;
const viaRe = /^[12]a\.\s*via$/i;
const cnpjStrictRe = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;

function onlyDigits(value: string) {
  return (value ?? "").replace(/\D/g, "");
}

function sanitizeLine(value: string) {
  return (value ?? "").replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}

function removeDiacritics(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeLine(value: string) {
  return removeDiacritics(sanitizeLine(value)).toUpperCase();
}

function parseMoney(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
}

function clampTotal(
  valorPrincipal: number,
  valorMulta: number,
  valorJuros: number,
  valorTotal: number,
) {
  const calculated = Number((valorPrincipal + valorMulta + valorJuros).toFixed(2));
  if (valorTotal <= 0 || Math.abs(valorTotal - calculated) > 0.05) {
    return calculated;
  }
  return valorTotal;
}

function isDocumentLine(value: string) {
  if (dateRe.test(value)) {
    return false;
  }

  const digits = onlyDigits(value);
  return digits.length === 11 || digits.length === 14;
}

function keepOnlyFirstViaInBlock(block: string) {
  const lines = block.split("\n");
  const secondViaIndex = lines.findIndex(
    (line) => viaRe.test(sanitizeLine(line)) && /2a\./i.test(line),
  );

  if (secondViaIndex === -1) {
    return block.trim();
  }

  const firstViaIndex = lines.findIndex(
    (line) => viaRe.test(sanitizeLine(line)) && /1a\./i.test(line),
  );

  if (firstViaIndex !== -1 && firstViaIndex < secondViaIndex) {
    return lines.slice(0, secondViaIndex).join("\n").trim();
  }

  return null;
}

function splitBlocks(text: string) {
  const cleaned = (text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const delimiter =
    /(?=^\s*MINIST[ÉE]RIO DA FAZENDA)|(?=^\s*DOCUMENTO DE ARRECADA[ÇC][AÃ]O)/im;

  const blocks = cleaned
    .split(delimiter)
    .map((block) => block.trim())
    .filter((block) => block.length > 40 && /DARF/i.test(block));

  const sourceBlocks = blocks.length > 0 ? blocks : [cleaned];

  return sourceBlocks
    .map((block) => keepOnlyFirstViaInBlock(block))
    .filter((block): block is string => Boolean(block));
}

function findNextIndex(
  lines: string[],
  start: number,
  end: number,
  matcher: (line: string, normalized: string) => boolean,
) {
  for (let index = start; index < end; index += 1) {
    const line = lines[index];
    const normalized = normalizeLine(line);

    if (!line) {
      continue;
    }

    if (matcher(line, normalized)) {
      return index;
    }
  }

  return -1;
}

function isNameCandidate(line: string, normalized: string) {
  if (!line || dateRe.test(line) || moneyRe.test(line) || codeRe.test(line) || refRe.test(line)) {
    return false;
  }

  if (
    normalized.includes("SENDA") ||
    normalized.includes("PREENCHIM") ||
    normalized.includes("DARF EMITIDO") ||
    normalized.includes("AUTENTICACAO") ||
    normalized.includes("OBSERVACOES") ||
    normalized.includes("DATA LIMITE") ||
    normalized.includes("MINISTERIO") ||
    normalized.includes("SECRETARIA") ||
    normalized.includes("DOCUMENTO DE ARRECADACAO") ||
    normalized === "DARF"
  ) {
    return false;
  }

  return /[A-Z]{3,}/.test(normalized);
}

function parseBlock(block: string): DarfRecord | null {
  const lines = block
    .split("\n")
    .map((line) => sanitizeLine(line))
    .filter(Boolean);

  if (!lines.length) {
    return null;
  }

  const codeLabelIndex = lines.findIndex(
    (line) => normalizeLine(line) === "CODIGO DA RECEITA",
  );
  if (codeLabelIndex === -1) {
    return null;
  }

  const codeIndex = findNextIndex(
    lines,
    codeLabelIndex + 1,
    lines.length,
    (line) => codeRe.test(onlyDigits(line)),
  );
  if (codeIndex === -1) {
    return null;
  }

  const referenceIndex = findNextIndex(
    lines,
    codeIndex + 1,
    lines.length,
    (line) => refRe.test(onlyDigits(line)),
  );

  // Vencimento = primeira data após a referência e antes do primeiro valor monetário.
  // Isso impede pegar "Data limite para acolhimento".
  const firstMoneyAfterReference =
    referenceIndex === -1
      ? -1
      : findNextIndex(
          lines,
          referenceIndex + 1,
          lines.length,
          (line) => moneyRe.test(line),
        );

  const dueDateIndex =
    referenceIndex === -1
      ? -1
      : findNextIndex(
          lines,
          referenceIndex + 1,
          firstMoneyAfterReference === -1 ? lines.length : firstMoneyAfterReference,
          (line) => dateRe.test(line),
        );

  const principalIndex =
    firstMoneyAfterReference === -1
      ? -1
      : findNextIndex(lines, firstMoneyAfterReference, lines.length, (line) => moneyRe.test(line));

  const multaIndex =
    principalIndex === -1
      ? -1
      : findNextIndex(lines, principalIndex + 1, lines.length, (line) => moneyRe.test(line));

  const jurosIndex =
    multaIndex === -1
      ? -1
      : findNextIndex(lines, multaIndex + 1, lines.length, (line) => moneyRe.test(line));

  const totalIndex =
    jurosIndex === -1
      ? -1
      : findNextIndex(lines, jurosIndex + 1, lines.length, (line) => moneyRe.test(line));

  const cnpjIndex =
    totalIndex === -1
      ? -1
      : findNextIndex(
          lines,
          totalIndex + 1,
          lines.length,
          (line) => cnpjStrictRe.test(line) || isDocumentLine(line),
        );

  const viaIndex = lines.findIndex((line) => viaRe.test(line));
  const searchEnd = viaIndex === -1 ? lines.length : viaIndex;

  const periodIndex =
    cnpjIndex === -1
      ? -1
      : findNextIndex(lines, cnpjIndex + 1, searchEnd, (line) => dateRe.test(line));

  const nameIndex =
    viaIndex !== -1
      ? findNextIndex(lines, viaIndex + 1, lines.length, isNameCandidate)
      : findNextIndex(lines, searchEnd, lines.length, isNameCandidate);

  const valorPrincipal = principalIndex === -1 ? 0 : parseMoney(lines[principalIndex]);
  const valorMulta = multaIndex === -1 ? 0 : parseMoney(lines[multaIndex]);
  const valorJuros = jurosIndex === -1 ? 0 : parseMoney(lines[jurosIndex]);
  const valorTotal = totalIndex === -1 ? 0 : parseMoney(lines[totalIndex]);
  const totalAjustado = clampTotal(valorPrincipal, valorMulta, valorJuros, valorTotal);

  const record: DarfRecord = {
    id: randomUUID(),
    nome: nameIndex === -1 ? "" : lines[nameIndex],
    periodoApuracao:
      periodIndex === -1
        ? dueDateIndex === -1
          ? ""
          : lines[dueDateIndex]
        : lines[periodIndex],
    cnpj: cnpjIndex === -1 ? "" : lines[cnpjIndex],
    codigoReceita: onlyDigits(lines[codeIndex]),
    numeroReferencia: referenceIndex === -1 ? "" : onlyDigits(lines[referenceIndex]),
    dataVencimento: dueDateIndex === -1 ? "" : lines[dueDateIndex],
    valorPrincipal,
    valorMulta,
    valorJuros,
    valorTotal: totalAjustado,
  };

  if (!record.codigoReceita || totalAjustado <= 0 || !record.dataVencimento) {
    return null;
  }

  return record;
}

export function parseDarfs(text: string) {
  const blocks = splitBlocks(text);
  const unique = new Set<string>();
  const records: DarfRecord[] = [];

  for (const block of blocks) {
    const record = parseBlock(block);
    if (!record) {
      continue;
    }

    const key = [
      record.codigoReceita,
      record.numeroReferencia,
      record.periodoApuracao,
      record.dataVencimento,
      record.valorPrincipal.toFixed(2),
      record.valorMulta.toFixed(2),
      record.valorJuros.toFixed(2),
      record.valorTotal.toFixed(2),
      onlyDigits(record.cnpj),
    ].join("|");

    if (unique.has(key)) {
      continue;
    }

    unique.add(key);
    records.push(record);
  }

  return records;
}