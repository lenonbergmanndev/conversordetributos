// src/utils/cnab240Validator.ts

export interface Cnab240ValidationOptions {
  expectedBankCode?: string;
  expectedServiceType?: string;
  expectedLaunchType?: string;
  expectedPaymentDate?: string;
  uiTotal?: number;
}

export interface Cnab240ValidationResult {
  ok: boolean;
  notes: string[];
  errors: string[];
}

function digitsOnly(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

function safeSlice(line: string, start1: number, end1: number) {
  return line.slice(start1 - 1, end1);
}

function normalizeDateToDDMMAAAA(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    const [dd, mm, yyyy] = raw.split("/");
    return `${dd}${mm}${yyyy}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split("-");
    return `${dd}${mm}${yyyy}`;
  }
  const digits = digitsOnly(raw);
  if (digits.length === 8) {
    if (Number(digits.slice(0, 4)) > 1900) {
      return `${digits.slice(6, 8)}${digits.slice(4, 6)}${digits.slice(0, 4)}`;
    }
    return digits;
  }
  return "";
}

function almostEqual(a: number, b: number, epsilon = 0.05) {
  return Math.abs(a - b) <= epsilon;
}

function toMoney18(raw: string): number {
  // Formato 9(016)V2 = 18 dígitos totais, 2 casas decimais implícitas
  const digits = digitsOnly(raw);
  const cents = Number.parseInt(digits || "0", 10);
  return Number.isFinite(cents) ? cents / 100 : 0;
}

function toMoney15(raw: string): number {
  // Formato 9(013)V2 = 15 dígitos totais, 2 casas decimais implícitas
  const digits = digitsOnly(raw);
  const cents = Number.parseInt(digits || "0", 10);
  return Number.isFinite(cents) ? cents / 100 : 0;
}

export function validateSantanderRemittance(
  content: string,
  options: Cnab240ValidationOptions = {},
): Cnab240ValidationResult {
  // Defaults para DARF Normal sem código de barras (Segmento N)
  const expectedBankCode = (options.expectedBankCode || "033").trim() || "033";
  const expectedServiceType = (options.expectedServiceType || "22").trim() || "22";
  const expectedLaunchType = (options.expectedLaunchType || "16").trim() || "16";
  const expectedPaymentDate = normalizeDateToDDMMAAAA(options.expectedPaymentDate);

  const notes: string[] = [];
  const errors: string[] = [];

  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/\uFEFF/g, ""))
    .filter((line) => line.length > 0);

  if (!lines.length) {
    return { ok: false, notes, errors: ["Arquivo remessa vazio."] };
  }

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].length !== 240) {
      errors.push(`Linha ${i + 1} com ${lines[i].length} colunas (esperado 240).`);
    }
  }

  const headerArquivo = lines[0] ?? "";
  const headerLote    = lines[1] ?? "";
  const trailerArquivo = lines[lines.length - 1] ?? "";
  const trailerLote    = lines[lines.length - 2] ?? "";
  const detalheLines   = lines.slice(2, -2);

  // ── HEADER ARQUIVO (Tipo 0) ─────────────────────────────────────────────────
  if (safeSlice(headerArquivo, 1, 3) !== expectedBankCode)
    errors.push(`Código do banco inválido no header do arquivo: "${safeSlice(headerArquivo, 1, 3)}" (esperado "${expectedBankCode}").`);

  if (safeSlice(headerArquivo, 4, 7) !== "0000")
    errors.push(`Lote inválido no header do arquivo: "${safeSlice(headerArquivo, 4, 7)}" (esperado "0000").`);

  if (safeSlice(headerArquivo, 8, 8) !== "0")
    errors.push(`Tipo de registro inválido no header do arquivo: "${safeSlice(headerArquivo, 8, 8)}" (esperado "0").`);

  const headerConvenio20 = safeSlice(headerArquivo, 33, 52);
  if (!/^\d{20}$/.test(headerConvenio20))
    errors.push(`Convênio inválido no header do arquivo: "${headerConvenio20}".`);
  else
    notes.push(`Header Arquivo convênio OK: ${headerConvenio20}`);

  // ── HEADER LOTE (Tipo 1) ────────────────────────────────────────────────────
  if (safeSlice(headerLote, 1, 3) !== expectedBankCode)
    errors.push(`Código do banco inválido no header do lote: "${safeSlice(headerLote, 1, 3)}" (esperado "${expectedBankCode}").`);

  if (safeSlice(headerLote, 8, 8) !== "1")
    errors.push(`Tipo de registro inválido no header do lote: "${safeSlice(headerLote, 8, 8)}" (esperado "1").`);

  if (safeSlice(headerLote, 9, 9) !== "C")
    errors.push(`Operação inválida no header do lote: "${safeSlice(headerLote, 9, 9)}" (esperado "C").`);

  const serviceType = safeSlice(headerLote, 10, 11);
  if (serviceType !== expectedServiceType)
    errors.push(`Tipo de serviço inválido no header do lote: "${serviceType}" (esperado "${expectedServiceType}").`);
  else
    notes.push(`Header Lote serviço OK: ${serviceType}`);

  const launchType = safeSlice(headerLote, 12, 13);
  if (launchType !== expectedLaunchType)
    errors.push(`Forma de lançamento inválida no header do lote: "${launchType}" (esperado "${expectedLaunchType}").`);
  else
    notes.push(`Header Lote forma lançamento OK: ${launchType}`);

  const versionType = safeSlice(headerLote, 14, 16);
  if (versionType !== "010")
    notes.push(`Versão do layout no header do lote: "${versionType}" (esperado "010" para DARF/Segmento N).`);

  const loteConvenio20 = safeSlice(headerLote, 33, 52);
  if (!/^\d{20}$/.test(loteConvenio20))
    errors.push(`Convênio inválido no header do lote: "${loteConvenio20}".`);
  else
    notes.push(`Header Lote convênio OK: ${loteConvenio20}`);

  // ── DETALHES – Segmento N: DARF Normal sem código de barras ────────────────
  //
  // Layout conforme manual YLEC_2403 V.11.6, seção 3.5 + N2:
  //   P1-3    Código do Banco
  //   P8      Tipo de Registro = "3"
  //   P9-13   Seq. Registro no Lote
  //   P14     Código Segmento = "N"
  //   P15     Tipo de Movimento
  //   P16-17  Código da Instrução para Movimento
  //   P18-37  Número do Documento Cliente (Seu Número)
  //   P38-57  Número do Documento Banco
  //   P58-87  Nome do Contribuinte (obrigatório)
  //   P88-95  Data do Pagamento (DDMMAAAA)
  //   P96-110 Valor Total do Pagamento  [9(013)V2 = 15 posições]
  //   -- Complementares N2 (DARF Normal) --
  //   P111-116  Código da Receita do Tributo
  //   P117-118  Tipo de Identificação do Contribuinte
  //   P119-132  Identificação do Contribuinte (14 dígitos)
  //   P133-134  Código de Identificação do Tributo = "16"
  //   P135-142  Período de Apuração (DDMMAAAA)
  //   P143-159  Número de Referência (17 dígitos)
  //   P160-174  Valor Principal     [9(013)V2 = 15 posições]
  //   P175-189  Valor da Multa      [9(013)V2 = 15 posições]
  //   P190-204  Valor dos Juros     [9(013)V2 = 15 posições]
  //   P205-212  Data de Vencimento  (DDMMAAAA)
  //   P213-230  Filler (brancos)
  //   P231-240  Ocorrências para o Retorno

  let totalGeral = 0;

  if (!detalheLines.length) {
    errors.push("Nenhum detalhe encontrado no lote.");
  }

  detalheLines.forEach((line, index) => {
    const lineNumber = index + 3;

    if (safeSlice(line, 1, 3) !== expectedBankCode)
      errors.push(`Linha ${lineNumber}: código do banco inválido "${safeSlice(line, 1, 3)}".`);

    if (safeSlice(line, 8, 8) !== "3")
      errors.push(`Linha ${lineNumber}: tipo de registro inválido "${safeSlice(line, 8, 8)}" (esperado "3").`);

    const segment = safeSlice(line, 14, 14);
    if (segment !== "N")
      errors.push(`Linha ${lineNumber}: segmento inválido "${segment}" (esperado "N" para DARF Normal).`);

    // Nome do contribuinte
    const nomeContribuinte = safeSlice(line, 58, 87).trim();
    if (!nomeContribuinte)
      errors.push(`Linha ${lineNumber}: nome do contribuinte não informado.`);

    // Data do pagamento
    const dataPagamento = safeSlice(line, 88, 95);
    if (!/^\d{8}$/.test(dataPagamento) || dataPagamento === "00000000") {
      errors.push(`Linha ${lineNumber}: data de pagamento inválida "${dataPagamento}".`);
    } else if (expectedPaymentDate && dataPagamento !== expectedPaymentDate) {
      errors.push(
        `Linha ${lineNumber}: data de pagamento "${dataPagamento}" diverge do esperado "${expectedPaymentDate}".`,
      );
    }

    // Valor Total (P96-110 = 15 posições, 9(013)V2)
    const valorTotal = toMoney15(safeSlice(line, 96, 110));
    if (valorTotal <= 0)
      errors.push(`Linha ${lineNumber}: valor total inválido ou zero.`);

    // Código da Receita (P111-116)
    const codigoReceita = safeSlice(line, 111, 116).trim();
    if (!/^\d{1,6}$/.test(codigoReceita) || Number(codigoReceita) === 0)
      errors.push(`Linha ${lineNumber}: código da receita inválido "${codigoReceita}".`);

    // Tipo de Identificação do Contribuinte (P117-118)
    const tipoIdentificacao = safeSlice(line, 117, 118);
    if (!["01", "02", "03", "04", "06", "07", "08", "09"].includes(tipoIdentificacao))
      errors.push(`Linha ${lineNumber}: tipo de identificação do contribuinte inválido "${tipoIdentificacao}".`);

    // Identificação do Contribuinte (P119-132, 14 dígitos)
    const identificacao = safeSlice(line, 119, 132);
    if (!/^\d{14}$/.test(identificacao))
      errors.push(`Linha ${lineNumber}: identificação do contribuinte inválida "${identificacao}".`);

    // Código de Identificação do Tributo (P133-134) = "16" para DARF Normal
    const codigoTributo = safeSlice(line, 133, 134);
    if (codigoTributo !== "16")
      errors.push(`Linha ${lineNumber}: código do tributo "${codigoTributo}" (esperado "16" para DARF Normal).`);

    // Período de Apuração (P135-142)
    const periodoApuracao = safeSlice(line, 135, 142);
    if (!/^\d{8}$/.test(periodoApuracao) || periodoApuracao === "00000000")
      errors.push(`Linha ${lineNumber}: período de apuração inválido "${periodoApuracao}".`);

    // Número de Referência (P143-159, 17 dígitos)
    const numeroReferencia = safeSlice(line, 143, 159);
    const refDigits = digitsOnly(numeroReferencia);
    if (refDigits.length !== 17 || Number(refDigits) === 0)
      errors.push(`Linha ${lineNumber}: número de referência inválido "${numeroReferencia}".`);

    // Valor Principal (P160-174)
    const valorPrincipal = toMoney15(safeSlice(line, 160, 174));
    if (valorPrincipal <= 0)
      errors.push(`Linha ${lineNumber}: valor principal inválido ou zero.`);

    // Valor Multa (P175-189) e Juros (P190-204) – opcionais, só validamos que são numéricos
    const valorMulta = toMoney15(safeSlice(line, 175, 189));
    const valorJuros = toMoney15(safeSlice(line, 190, 204));

    // Data de Vencimento (P205-212)
    const dataVencimento = safeSlice(line, 205, 212);
    if (!/^\d{8}$/.test(dataVencimento) || dataVencimento === "00000000")
      errors.push(`Linha ${lineNumber}: data de vencimento inválida "${dataVencimento}".`);

    // Consistência: principal + multa + juros ≈ total
    const soma = Number((valorPrincipal + valorMulta + valorJuros).toFixed(2));
    if (!almostEqual(soma, valorTotal)) {
      errors.push(
        `Linha ${lineNumber}: total divergente. ` +
          `Principal (${valorPrincipal.toFixed(2)}) + multa (${valorMulta.toFixed(2)}) + ` +
          `juros (${valorJuros.toFixed(2)}) = ${soma.toFixed(2)}, mas total = ${valorTotal.toFixed(2)}.`,
      );
    }

    totalGeral += valorTotal;
  });

  // ── TRAILER LOTE (Tipo 5) ───────────────────────────────────────────────────
  if (safeSlice(trailerLote, 8, 8) !== "5")
    errors.push(`Tipo de registro inválido no trailer do lote: "${safeSlice(trailerLote, 8, 8)}" (esperado "5").`);

  const qtdRegistrosLote = Number.parseInt(safeSlice(trailerLote, 18, 23), 10);
  const expectedQtdRegistrosLote = detalheLines.length + 2; // +header lote +trailer lote
  if (qtdRegistrosLote !== expectedQtdRegistrosLote)
    errors.push(`Quantidade de registros no trailer do lote inválida: ${qtdRegistrosLote} (esperado ${expectedQtdRegistrosLote}).`);

  // Somatória dos valores (P24-41 = 9(016)V2 = 18 posições)
  const trailerSomatoriaValue = toMoney18(safeSlice(trailerLote, 24, 41));
  if (!almostEqual(trailerSomatoriaValue, totalGeral)) {
    errors.push(
      `Somatória de valores no trailer do lote divergente: ${trailerSomatoriaValue.toFixed(2)} (esperado ${totalGeral.toFixed(2)}).`,
    );
  } else {
    notes.push(`Trailer Lote somatória OK: ${trailerSomatoriaValue.toFixed(2)}`);
  }

  // ── TRAILER ARQUIVO (Tipo 9) ────────────────────────────────────────────────
  if (safeSlice(trailerArquivo, 4, 7) !== "9999")
    errors.push(`Lote inválido no trailer do arquivo: "${safeSlice(trailerArquivo, 4, 7)}" (esperado "9999").`);

  if (safeSlice(trailerArquivo, 8, 8) !== "9")
    errors.push(`Tipo de registro inválido no trailer do arquivo: "${safeSlice(trailerArquivo, 8, 8)}" (esperado "9").`);

  const qtdLotesArquivo = Number.parseInt(safeSlice(trailerArquivo, 18, 23), 10);
  if (qtdLotesArquivo !== 1)
    errors.push(`Quantidade de lotes no trailer do arquivo inválida: ${qtdLotesArquivo} (esperado 1).`);

  const qtdRegistrosArquivo = Number.parseInt(safeSlice(trailerArquivo, 24, 29), 10);
  const expectedQtdRegistrosArquivo = lines.length;
  if (qtdRegistrosArquivo !== expectedQtdRegistrosArquivo) {
    errors.push(
      `Quantidade de registros no trailer do arquivo inválida: ${qtdRegistrosArquivo} (esperado ${expectedQtdRegistrosArquivo}).`,
    );
  } else {
    notes.push(`Todas as linhas têm 240 colunas.`);
    notes.push(`Código do banco ${expectedBankCode} confirmado em todas as linhas principais.`);
    notes.push(`Quantidade de registros do arquivo OK: ${qtdRegistrosArquivo}.`);
  }

  if (typeof options.uiTotal === "number") {
    if (!almostEqual(options.uiTotal, totalGeral)) {
      errors.push(
        `Total do arquivo (${totalGeral.toFixed(2)}) diferente do total exibido na UI (${options.uiTotal.toFixed(2)}).`,
      );
    } else {
      notes.push(`Total do arquivo igual ao total da UI: ${totalGeral.toFixed(2)}.`);
    }
  }

  return {
    ok: errors.length === 0,
    notes,
    errors,
  };
}