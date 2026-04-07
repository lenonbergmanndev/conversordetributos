import { randomUUID } from "node:crypto";
import type { DarfRecord } from "../types/darf";

const moneyRe = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
const dateRe = /^\d{2}\/\d{2}\/\d{4}$/;
const codeRe = /^\d{4}$/;
const refRe = /^\d{5,}$/;
const viaRe = /^[12]a\.\s*via$/i;
const cnpjStrictRe = /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/;
const pageMarkerRe = /<PARSED TEXT FOR PAGE:\s*\d+\s*\/\s*\d+\s*>/i;

function onlyDigits(value: string) {
  return (value ?? "").replace(/\D/g, "");
}

function sanitizeLine(value: string) {
  return (value ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
  const calculated = Number(
    (valorPrincipal + valorMulta + valorJuros).toFixed(2),
  );

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

function isNoiseLine(value: string) {
  const normalized = normalizeLine(value);

  return (
    normalized.length === 0 ||
    normalized === "DARF" ||
    normalized === "02" ||
    normalized === "03" ||
    normalized === "04" ||
    normalized === "05" ||
    normalized === "06" ||
    normalized === "07" ||
    normalized === "08" ||
    normalized === "09" ||
    normalized === "10" ||
    normalized === "11" ||
    normalized.includes("MINISTERIO DA FAZENDA") ||
    normalized.includes("SECRETARIA DA RECEITA FEDERAL") ||
    normalized.includes("DOCUMENTO DE ARRECADACAO") ||
    normalized.includes("NOME / RAZAO SOCIAL") ||
    normalized.includes("PERIODO DE APURACAO") ||
    normalized.includes("NUMERO DO CPF OU CNPJ") ||
    normalized.includes("CODIGO DA RECEITA") ||
    normalized.includes("NUMERO DE REFERENCIA") ||
    normalized.includes("DATA DE VENCIMENTO") ||
    normalized.includes("VALOR DO PRINCIPAL") ||
    normalized.includes("VALOR DA MULTA") ||
    normalized.includes("VALOR DOS JUROS") ||
    normalized.includes("ENCARGOS DL") ||
    normalized.includes("VALOR TOTAL") ||
    normalized.includes("AUTENTICACAO BANCARIA") ||
    normalized.includes("DATA LIMITE PARA ACOLHIMENTO") ||
    normalized.includes("OBSERVACOES") ||
    normalized.includes("SENDA") ||
    normalized.includes("DARF EMITIDO PELO SICALC WEB") ||
    normalized.includes("PREENCHIM") ||
    normalized.includes("CALCULOS CFM") ||
    normalized === "VIA"
  );
}

function isNameCandidate(line: string) {
  const normalized = normalizeLine(line);

  if (
    !line ||
    isNoiseLine(line) ||
    dateRe.test(line) ||
    moneyRe.test(line) ||
    codeRe.test(line) ||
    refRe.test(line) ||
    viaRe.test(line) ||
    isDocumentLine(line)
  ) {
    return false;
  }

  return /[A-Z]{3,}/.test(normalized);
}

function splitCandidates(text: string) {
  const cleaned = (text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  if (pageMarkerRe.test(cleaned)) {
    return cleaned
      .split(pageMarkerRe)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return cleaned
    .split(/(?=^\s*MINIST[ÉE]RIO DA FAZENDA)/gim)
    .map((part) => part.trim())
    .filter(Boolean);
}

function findNextIndex(
  lines: string[],
  start: number,
  end: number,
  matcher: (line: string) => boolean,
) {
  for (let i = start; i < end; i += 1) {
    if (matcher(lines[i])) {
      return i;
    }
  }
  return -1;
}

function extractRecordsFromLines(lines: string[]) {
  const records: DarfRecord[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const codigo = lines[i];

    if (!codeRe.test(codigo)) {
      continue;
    }

    const referenceIndex = findNextIndex(lines, i + 1, Math.min(i + 5, lines.length), (line) =>
      refRe.test(line),
    );
    if (referenceIndex === -1) {
      continue;
    }

    const firstDateIndex = findNextIndex(
      lines,
      referenceIndex + 1,
      Math.min(referenceIndex + 5, lines.length),
      (line) => dateRe.test(line),
    );
    if (firstDateIndex === -1) {
      continue;
    }

    const principalIndex = findNextIndex(
      lines,
      firstDateIndex + 1,
      Math.min(firstDateIndex + 5, lines.length),
      (line) => moneyRe.test(line),
    );
    if (principalIndex === -1) {
      continue;
    }

    const multaIndex = findNextIndex(
      lines,
      principalIndex + 1,
      Math.min(principalIndex + 4, lines.length),
      (line) => moneyRe.test(line),
    );
    if (multaIndex === -1) {
      continue;
    }

    const jurosIndex = findNextIndex(
      lines,
      multaIndex + 1,
      Math.min(multaIndex + 4, lines.length),
      (line) => moneyRe.test(line),
    );
    if (jurosIndex === -1) {
      continue;
    }

    const totalIndex = findNextIndex(
      lines,
      jurosIndex + 1,
      Math.min(jurosIndex + 4, lines.length),
      (line) => moneyRe.test(line),
    );
    if (totalIndex === -1) {
      continue;
    }

    const cnpjIndex = findNextIndex(
      lines,
      totalIndex + 1,
      Math.min(totalIndex + 12, lines.length),
      (line) => cnpjStrictRe.test(line) || isDocumentLine(line),
    );
    if (cnpjIndex === -1) {
      continue;
    }

    const secondDateIndex = findNextIndex(
      lines,
      cnpjIndex + 1,
      Math.min(cnpjIndex + 5, lines.length),
      (line) => dateRe.test(line),
    );

    const viaIndex = findNextIndex(
      lines,
      cnpjIndex + 1,
      Math.min(cnpjIndex + 8, lines.length),
      (line) => viaRe.test(line),
    );

    const nameIndex =
      viaIndex === -1
        ? -1
        : findNextIndex(
            lines,
            viaIndex + 1,
            Math.min(viaIndex + 5, lines.length),
            (line) => isNameCandidate(line),
          );

    const valorPrincipal = parseMoney(lines[principalIndex]);
    const valorMulta = parseMoney(lines[multaIndex]);
    const valorJuros = parseMoney(lines[jurosIndex]);
    const valorTotal = clampTotal(
      valorPrincipal,
      valorMulta,
      valorJuros,
      parseMoney(lines[totalIndex]),
    );

    const record: DarfRecord = {
      id: randomUUID(),
      nome: nameIndex === -1 ? "" : lines[nameIndex],
      periodoApuracao:
        secondDateIndex !== -1 ? lines[secondDateIndex] : lines[firstDateIndex],
      cnpj: lines[cnpjIndex],
      codigoReceita: codigo,
      numeroReferencia: lines[referenceIndex],
      dataVencimento: lines[firstDateIndex],
      valorPrincipal,
      valorMulta,
      valorJuros,
      valorTotal,
    };

    if (
      !codeRe.test(record.codigoReceita) ||
      !record.dataVencimento ||
      record.valorTotal <= 0
    ) {
      continue;
    }

    records.push(record);

    if (viaIndex !== -1) {
      i = viaIndex;
    }
  }

  return records;
}

export function parseDarfs(text: string) {
  const candidates = splitCandidates(text);
  const unique = new Set<string>();
  const records: DarfRecord[] = [];

  for (const candidate of candidates) {
    const lines = candidate
      .split("\n")
      .map((line) => sanitizeLine(line))
      .filter((line) => Boolean(line) && !isNoiseLine(line));

    if (!lines.length) {
      continue;
    }

    const parsed = extractRecordsFromLines(lines);

    for (const record of parsed) {
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
  }

  return records;
}