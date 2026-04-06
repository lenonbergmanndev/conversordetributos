import type { ValidateRemittanceOptions, ValidateResult } from "@/types/darf";

function sliceCols(line: string, from1: number, to1: number): string {
  const from = Math.max(1, from1) - 1;
  const to = Math.min(240, to1);
  return (line ?? "").slice(from, to);
}

function parseIntSafe(value: string): number {
  const n = Number.parseInt((value ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseMoneyAsNumber(value: string): number {
  const n = parseIntSafe(value);
  return Math.round(n) / 100;
}

function normalizeDate(value?: string) {
  const raw = (value ?? "").trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split("/");
    return `${dd}${mm}${yyyy}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split("-");
    return `${dd}${mm}${yyyy}`;
  }

  const digits = raw.replace(/\D/g, "");
  return digits.length === 8 ? digits : "";
}

function lineType(line: string) {
  return sliceCols(line, 8, 8);
}

function detailSegment(line: string) {
  return sliceCols(line, 14, 14);
}

function isHeaderArquivo(line: string) {
  return lineType(line) === "0";
}

function isHeaderLote(line: string) {
  return lineType(line) === "1";
}

function isTrailerLote(line: string) {
  return lineType(line) === "5";
}

function isTrailerArquivo(line: string) {
  return lineType(line) === "9";
}

function isSegmentN(line: string) {
  return lineType(line) === "3" && detailSegment(line) === "N";
}

export function validateSantanderRemittance(
  text: string,
  options: ValidateRemittanceOptions = {},
): ValidateResult {
  const notes: string[] = [];
  const errors: string[] = [];

  const expectedBankCode = options.expectedBankCode?.replace(/\D/g, "") || "033";
  const expectedServiceType = options.expectedServiceType ?? "22";
  const expectedLaunchType = options.expectedLaunchType ?? "16";
  const expectedPaymentDate = normalizeDate(options.expectedPaymentDate);

  const raw = (text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = raw.split("\n").filter((line) => line.trim().length > 0);

  if (!lines.length) {
    return { ok: false, notes, errors: ["Arquivo vazio."] };
  }

  let allLenOk = true;
  let allBankOk = true;

  lines.forEach((line, index) => {
    const n = index + 1;

    if (line.length !== 240) {
      allLenOk = false;
      errors.push(`Linha ${n} com tamanho inválido: ${line.length} (esperado 240).`);
    }

    const bank = sliceCols(line, 1, 3);
    if (bank !== expectedBankCode) {
      allBankOk = false;
      errors.push(
        `Linha ${n} com código do banco inválido: "${bank}" (esperado "${expectedBankCode}").`,
      );
    }
  });

  if (allLenOk) notes.push("Todas as linhas têm 240 colunas.");
  if (allBankOk) notes.push(`Código do banco ${expectedBankCode} confirmado em todas as linhas.`);

  const H = lines.find(isHeaderArquivo);
  const HL = lines.find(isHeaderLote);
  const TL = lines.find(isTrailerLote);
  const TA = lines.find(isTrailerArquivo);
  const detalhesN = lines.filter(isSegmentN);
  const detalhesTipo3 = lines.filter((line) => lineType(line) === "3");

  if (!H) errors.push("Header do arquivo não encontrado.");
  if (!HL) errors.push("Header do lote não encontrado.");
  if (!TL) errors.push("Trailer do lote não encontrado.");
  if (!TA) errors.push("Trailer do arquivo não encontrado.");
  if (!detalhesN.length) errors.push("Nenhum detalhe Segmento N encontrado.");

  if (!H || !HL || !TL || !TA || !detalhesN.length) {
    return { ok: errors.length === 0, notes, errors };
  }

  const convH = sliceCols(H, 33, 52);
  const convHL = sliceCols(HL, 33, 52);
  if (convH !== convHL) {
    errors.push(`Convênio divergente entre header arquivo e header lote: "${convH}" x "${convHL}".`);
  } else {
    notes.push(`Convênio consistente entre header arquivo e lote: ${convH}`);
  }

  const tipoServico = sliceCols(HL, 10, 11);
  const formaLancamento = sliceCols(HL, 12, 13);
  const versaoLote = sliceCols(HL, 14, 16);

  if (tipoServico !== expectedServiceType) {
    errors.push(`Tipo de serviço inválido no header do lote: "${tipoServico}" (esperado "${expectedServiceType}").`);
  } else {
    notes.push(`Tipo de serviço OK: ${tipoServico}`);
  }

  if (formaLancamento !== expectedLaunchType) {
    errors.push(`Forma de lançamento inválida no header do lote: "${formaLancamento}" (esperado "${expectedLaunchType}").`);
  } else {
    notes.push(`Forma de lançamento OK: ${formaLancamento}`);
  }

  if (versaoLote !== "010") {
    errors.push(`Versão do lote inválida: "${versaoLote}" (esperado "010").`);
  } else {
    notes.push("Versão do lote OK: 010");
  }

  let somaTotalDetalhes = 0;

  detalhesN.forEach((detail, index) => {
    const n = index + 1;
    const dataPagamento = sliceCols(detail, 88, 95);
    const valorTotal = parseMoneyAsNumber(sliceCols(detail, 96, 110));
    const codigoReceita = sliceCols(detail, 111, 116);
    const dataVencimento = sliceCols(detail, 205, 212);

    somaTotalDetalhes += valorTotal;

    if (!codigoReceita.trim()) {
      errors.push(`Detalhe N ${n} sem código da receita.`);
    }

    if (!dataVencimento.trim() || /^0+$/.test(dataVencimento)) {
      errors.push(`Detalhe N ${n} sem data de vencimento válida.`);
    }

    if (expectedPaymentDate && dataPagamento !== expectedPaymentDate) {
      errors.push(
        `Detalhe N ${n} com data de pagamento "${dataPagamento}" diferente da esperada "${expectedPaymentDate}".`,
      );
    }
  });

  const totalTrailerLote = parseMoneyAsNumber(sliceCols(TL, 24, 41));
  if (Math.abs(totalTrailerLote - somaTotalDetalhes) > 0.001) {
    errors.push(
      `Somatória do lote divergente: detalhes=${somaTotalDetalhes.toFixed(2)} trailer=${totalTrailerLote.toFixed(2)}.`,
    );
  } else {
    notes.push(`Somatória do lote OK: ${somaTotalDetalhes.toFixed(2)}`);
  }

  const qtdTrailerLote = parseIntSafe(sliceCols(TL, 18, 23));
  const qtdEsperadaLote = 1 + detalhesTipo3.length + 1;
  if (qtdTrailerLote !== qtdEsperadaLote) {
    errors.push(
      `Quantidade de registros do lote divergente: trailer=${qtdTrailerLote} esperado=${qtdEsperadaLote}.`,
    );
  } else {
    notes.push(`Quantidade de registros do lote OK: ${qtdTrailerLote}`);
  }

  const qtdLotesArquivo = parseIntSafe(sliceCols(TA, 18, 23));
  const qtdRegistrosArquivo = parseIntSafe(sliceCols(TA, 24, 29));

  if (qtdLotesArquivo !== 1) {
    errors.push(`Quantidade de lotes no arquivo inválida: ${qtdLotesArquivo} (esperado 1).`);
  } else {
    notes.push("Quantidade de lotes do arquivo OK: 1");
  }

  if (qtdRegistrosArquivo !== lines.length) {
    errors.push(
      `Quantidade de registros no arquivo divergente: trailer=${qtdRegistrosArquivo} esperado=${lines.length}.`,
    );
  } else {
    notes.push(`Quantidade total de registros do arquivo OK: ${qtdRegistrosArquivo}`);
  }

  if (typeof options.uiTotal === "number") {
    if (Math.abs(options.uiTotal - somaTotalDetalhes) > 0.001) {
      errors.push(
        `Total do arquivo (${somaTotalDetalhes.toFixed(2)}) difere do total da UI (${options.uiTotal.toFixed(2)}).`,
      );
    } else {
      notes.push(`Total do arquivo bate com a UI: ${somaTotalDetalhes.toFixed(2)}`);
    }
  }

  return {
    ok: errors.length === 0,
    notes,
    errors,
    debug: {
      bankCode: expectedBankCode,
      tipoServico,
      formaLancamento,
      versaoLote,
      convenioArquivo: convH,
      convenioLote: convHL,
      detalhesN: detalhesN.length,
      somaTotalDetalhes,
      totalTrailerLote,
      qtdTrailerLote,
      qtdEsperadaLote,
      qtdLotesArquivo,
      qtdRegistrosArquivo,
    },
  };
}