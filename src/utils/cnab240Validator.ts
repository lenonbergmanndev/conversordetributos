// src/utils/cnab240Validator.ts

export interface ValidateResult {
  ok: boolean;
  notes: string[];
  errors: string[];
  debug?: Record<string, unknown>;
}

function sliceCols(line: string, from1: number, to1: number): string {
  const from = Math.max(1, from1) - 1;
  const to = Math.min(240, to1);
  return (line ?? "").slice(from, to);
}

function digitsOnly(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function parseIntSafe(value: string): number {
  const n = parseInt((value ?? "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseMoneyField(value: string): number {
  const digits = digitsOnly(value);
  return parseIntSafe(digits) / 100;
}

function isValidDateDDMMAAAA(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length !== 8) return false;

  const dd = Number(digits.slice(0, 2));
  const mm = Number(digits.slice(2, 4));
  const yyyy = Number(digits.slice(4, 8));

  if (yyyy < 1900 || yyyy > 2999) return false;
  if (mm < 1 || mm > 12) return false;
  if (dd < 1 || dd > 31) return false;

  const date = new Date(yyyy, mm - 1, dd);
  return (
    date.getFullYear() === yyyy &&
    date.getMonth() === mm - 1 &&
    date.getDate() === dd
  );
}

function normalizeDateToDDMMAAAA(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();

  if (!raw) return "";

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    return digitsOnly(raw);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split("-");
    return `${dd}${mm}${yyyy}`;
  }

  return digitsOnly(raw);
}

function isPastDateDDMMAAAA(value: string): boolean {
  if (!isValidDateDDMMAAAA(value)) return true;

  const dd = Number(value.slice(0, 2));
  const mm = Number(value.slice(2, 4));
  const yyyy = Number(value.slice(4, 8));

  const target = new Date(yyyy, mm - 1, dd);
  target.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return target.getTime() < today.getTime();
}

function lineType(line: string): string {
  return sliceCols(line, 8, 8);
}

function isHeaderArquivo(line: string): boolean {
  return lineType(line) === "0";
}

function isHeaderLote(line: string): boolean {
  return lineType(line) === "1";
}

function isTrailerLote(line: string): boolean {
  return lineType(line) === "5";
}

function isTrailerArquivo(line: string): boolean {
  return lineType(line) === "9";
}

function isDetail(line: string): boolean {
  return lineType(line) === "3";
}

function segmentCode(line: string): string {
  return sliceCols(line, 14, 14);
}

function almostEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function validateSantanderRemittance(
  text: string,
  uiTotal?: number,
  paymentDate?: string
): ValidateResult {
  const notes: string[] = [];
  const errors: string[] = [];

  const raw = (text ?? "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = raw.split("\n").filter((line) => line.length > 0);

  if (lines.length === 0) {
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

    if (sliceCols(line, 1, 3) !== "033") {
      allBankOk = false;
      errors.push(`Linha ${n} com código do banco inválido: "${sliceCols(line, 1, 3)}".`);
    }
  });

  if (allLenOk) notes.push("Todas as linhas têm 240 colunas.");
  if (allBankOk) notes.push('Código do banco "033" confirmado em todas as linhas.');

  const H = lines.find(isHeaderArquivo);
  const HL = lines.find(isHeaderLote);
  const TL = lines.find(isTrailerLote);
  const TA = lines.find(isTrailerArquivo);
  const detalhes = lines.filter(isDetail);
  const detalhesN = detalhes.filter((line) => segmentCode(line) === "N");

  if (!H) errors.push("Header do Arquivo (tipo 0) não encontrado.");
  if (!HL) errors.push("Header de Lote (tipo 1) não encontrado.");
  if (!TL) errors.push("Trailer de Lote (tipo 5) não encontrado.");
  if (!TA) errors.push("Trailer do Arquivo (tipo 9) não encontrado.");

  if (!H || !HL || !TL || !TA) {
    return { ok: false, notes, errors };
  }

  if (sliceCols(H, 4, 7) !== "0000") {
    errors.push(`Header arquivo: lote inválido "${sliceCols(H, 4, 7)}".`);
  }
  if (sliceCols(H, 143, 143) !== "1") {
    errors.push(`Header arquivo: código remessa/retorno inválido "${sliceCols(H, 143, 143)}".`);
  }
  if (sliceCols(H, 164, 166) !== "060") {
    errors.push(`Header arquivo: versão inválida "${sliceCols(H, 164, 166)}" (esperado "060").`);
  }

  const convH = sliceCols(H, 33, 52);
  const convHL = sliceCols(HL, 33, 52);

  if (convH !== convHL) {
    errors.push(`Convênio divergente entre header arquivo e header lote: "${convH}" x "${convHL}".`);
  } else {
    notes.push(`Convênio OK: ${convH}`);
  }

  if (sliceCols(HL, 9, 9) !== "C") {
    errors.push(`Header lote: tipo de operação inválido "${sliceCols(HL, 9, 9)}".`);
  }
  if (sliceCols(HL, 10, 11) !== "22") {
    errors.push(`Header lote: tipo de serviço inválido "${sliceCols(HL, 10, 11)}" (esperado "22").`);
  }
  if (sliceCols(HL, 12, 13) !== "16") {
    errors.push(`Header lote: forma de lançamento inválida "${sliceCols(HL, 12, 13)}" (esperado "16").`);
  }
  if (sliceCols(HL, 14, 16) !== "010") {
    errors.push(`Header lote: versão do lote inválida "${sliceCols(HL, 14, 16)}" (esperado "010").`);
  }

  if (detalhesN.length === 0) {
    errors.push("Nenhum detalhe Segmento N encontrado.");
  } else {
    notes.push(`Quantidade de detalhes Segmento N: ${detalhesN.length}.`);
  }

  const expectedPaymentDate = normalizeDateToDDMMAAAA(paymentDate);
  let totalDetalhes = 0;

  detalhesN.forEach((line, index) => {
    const lineNumber = lines.indexOf(line) + 1;
    const expectedSeq = index + 1;

    if (parseIntSafe(sliceCols(line, 9, 13)) !== expectedSeq) {
      errors.push(`Linha ${lineNumber}: número sequencial inválido "${sliceCols(line, 9, 13)}".`);
    }

    if (sliceCols(line, 15, 15) !== "0") {
      errors.push(`Linha ${lineNumber}: tipo de movimento inválido "${sliceCols(line, 15, 15)}".`);
    }

    if (sliceCols(line, 16, 17) !== "00") {
      errors.push(`Linha ${lineNumber}: instrução de movimento inválida "${sliceCols(line, 16, 17)}".`);
    }

    const nome = sliceCols(line, 58, 87).trim();
    if (!nome) {
      errors.push(`Linha ${lineNumber}: nome do contribuinte vazio.`);
    }

    const dataPagamento = sliceCols(line, 88, 95);
    if (!isValidDateDDMMAAAA(dataPagamento)) {
      errors.push(`Linha ${lineNumber}: data de pagamento inválida "${dataPagamento}".`);
    } else if (isPastDateDDMMAAAA(dataPagamento)) {
      errors.push(`Linha ${lineNumber}: data de pagamento inferior à data atual "${dataPagamento}".`);
    }

    if (expectedPaymentDate && dataPagamento !== expectedPaymentDate) {
      errors.push(
        `Linha ${lineNumber}: data de pagamento divergente do formulário. Arquivo=${dataPagamento} Formulário=${expectedPaymentDate}.`
      );
    }

    const valorTotal = parseMoneyField(sliceCols(line, 96, 110));
    const codigoReceita = sliceCols(line, 111, 116);
    const tipoIdent = sliceCols(line, 117, 118);
    const contribuinte = sliceCols(line, 119, 132);
    const tributo = sliceCols(line, 133, 134);
    const periodo = sliceCols(line, 135, 142);
    const referencia = sliceCols(line, 143, 159);
    const principal = parseMoneyField(sliceCols(line, 160, 174));
    const multa = parseMoneyField(sliceCols(line, 175, 189));
    const juros = parseMoneyField(sliceCols(line, 190, 204));
    const vencimento = sliceCols(line, 205, 212);

    if (!/^\d{6}$/.test(codigoReceita)) {
      errors.push(`Linha ${lineNumber}: código da receita inválido "${codigoReceita}".`);
    }

    if (!["01", "02"].includes(tipoIdent)) {
      errors.push(`Linha ${lineNumber}: tipo de identificação inválido "${tipoIdent}".`);
    }

    if (!/^\d{14}$/.test(contribuinte)) {
      errors.push(`Linha ${lineNumber}: identificação do contribuinte inválida "${contribuinte}".`);
    }

    if (tributo !== "16") {
      errors.push(`Linha ${lineNumber}: código de identificação do tributo inválido "${tributo}".`);
    }

    if (!isValidDateDDMMAAAA(periodo)) {
      errors.push(`Linha ${lineNumber}: período de apuração inválido "${periodo}".`);
    }

    if (!/^\d{17}$/.test(referencia)) {
      errors.push(`Linha ${lineNumber}: número de referência inválido "${referencia}".`);
    }

    if (!isValidDateDDMMAAAA(vencimento)) {
      errors.push(`Linha ${lineNumber}: data de vencimento inválida "${vencimento}".`);
    }

    const somaLinha = Number((principal + multa + juros).toFixed(2));
    if (!almostEqual(somaLinha, valorTotal)) {
      errors.push(
        `Linha ${lineNumber}: total divergente. Principal=${principal.toFixed(
          2
        )}, Multa=${multa.toFixed(2)}, Juros=${juros.toFixed(2)}, Total=${valorTotal.toFixed(2)}.`
      );
    }

    totalDetalhes += valorTotal;
  });

  const qtdRegLote = parseIntSafe(sliceCols(TL, 18, 23));
  const qtdEsperadaLote = 1 + detalhes.length + 1;
  if (qtdRegLote !== qtdEsperadaLote) {
    errors.push(`Trailer lote: quantidade de registros divergente ${qtdRegLote} (esperado ${qtdEsperadaLote}).`);
  }

  const totalTrailerLote = parseMoneyField(sliceCols(TL, 24, 41));
  if (!almostEqual(totalTrailerLote, totalDetalhes)) {
    errors.push(
      `Trailer lote: somatória divergente ${totalTrailerLote.toFixed(2)} (esperado ${totalDetalhes.toFixed(2)}).`
    );
  } else {
    notes.push(`Somatória do lote OK: ${totalTrailerLote.toFixed(2)}.`);
  }

  const qtdLotesArquivo = parseIntSafe(sliceCols(TA, 18, 23));
  if (qtdLotesArquivo !== 1) {
    errors.push(`Trailer arquivo: quantidade de lotes divergente ${qtdLotesArquivo} (esperado 1).`);
  }

  const qtdRegsArquivo = parseIntSafe(sliceCols(TA, 24, 29));
  if (qtdRegsArquivo !== lines.length) {
    errors.push(`Trailer arquivo: quantidade de registros divergente ${qtdRegsArquivo} (esperado ${lines.length}).`);
  }

  if (typeof uiTotal === "number" && !almostEqual(uiTotal, totalDetalhes)) {
    errors.push(
      `Total do arquivo (${totalDetalhes.toFixed(2)}) difere do total da UI (${uiTotal.toFixed(2)}).`
    );
  }

  return {
    ok: errors.length === 0,
    notes,
    errors,
    debug: {
      linhas: lines.length,
      detalhesTotal: detalhes.length,
      detalhesN: detalhesN.length,
      convH,
      convHL,
      totalDetalhes: Number(totalDetalhes.toFixed(2)),
      totalTrailerLote: Number(totalTrailerLote.toFixed(2)),
      qtdRegLote,
      qtdEsperadaLote,
      qtdRegsArquivo,
    },
  };
}