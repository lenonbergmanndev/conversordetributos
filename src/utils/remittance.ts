import type { CompanyInfo, DarfRecord } from "@/types/darf";

const COLS = 240;

function blank() {
  return Array(COLS).fill(" ");
}

function put(buf: string[], from1: number, to1: number, val: string) {
  const from = Math.max(1, from1);
  const to = Math.min(COLS, to1);
  const s = (val ?? "").toString();

  for (let i = from - 1, j = 0; i < to && j < s.length; i += 1, j += 1) {
    buf[i] = s[j];
  }
}

function lpad(v: string | number, w: number, ch = "0") {
  const s = String(v ?? "");
  return s.length >= w ? s.slice(-w) : ch.repeat(w - s.length) + s;
}

function rpad(v: string | number, w: number, ch = " ") {
  const s = String(v ?? "");
  return s.length >= w ? s.slice(0, w) : s + ch.repeat(w - s.length);
}

function onlyDigits(value: string) {
  return (value ?? "").replace(/\D/g, "");
}

function removeDiacritics(value: string) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function asciiSafe(value: string) {
  return removeDiacritics(value).toUpperCase().replace(/[^A-Z0-9 ]/g, " ");
}

function normalizeDate(value: string) {
  const trimmed = (value ?? "").trim();

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    const [dd, mm, yyyy] = trimmed.split("/");
    return `${dd}${mm}${yyyy}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [yyyy, mm, dd] = trimmed.split("-");
    return `${dd}${mm}${yyyy}`;
  }

  const digits = onlyDigits(trimmed);
  if (digits.length === 8) {
    return digits;
  }

  return "";
}

function todayDDMMAAAA() {
  const d = new Date();
  return lpad(d.getDate(), 2) + lpad(d.getMonth() + 1, 2) + d.getFullYear();
}

function nowHHMMSS() {
  const d = new Date();
  return lpad(d.getHours(), 2) + lpad(d.getMinutes(), 2) + lpad(d.getSeconds(), 2);
}

function money15(n: number) {
  const cents = Math.round((n ?? 0) * 100);
  return lpad(cents, 15, "0");
}

function money16(n: number) {
  const cents = Math.round((n ?? 0) * 100);
  return lpad(cents, 16, "0");
}

function buildSantanderConvenio20(agencia: string, convenio: string) {
  const banco4 = "0033";
  const ag5 = lpad(onlyDigits(agencia).slice(0, 5), 5, "0");
  const dvAg = " ";
  const conta12 = lpad("0", 12, "0");
  const dvConta = " ";
  const dac = " ";

  // Mantive o convênio completo no campo obrigatório e preenchi agência/conta em seus campos próprios.
  // Para o convênio de 20 posições, usamos o número informado pela empresa, ajustado à largura do campo.
  const conv = rpad(onlyDigits(convenio).slice(0, 20), 20, " ");
  void ag5;
  void dvAg;
  void conta12;
  void dvConta;
  void dac;

  return conv;
}

function getContributorType(cnpjOrCpf: string) {
  const digits = onlyDigits(cnpjOrCpf);
  if (digits.length === 11) return "01";
  if (digits.length === 14) return "02";
  return "00";
}

function buildClientDocumentNumber(record: DarfRecord, seq: number) {
  const codigo = onlyDigits(record.codigoReceita).slice(-6);
  const referencia = onlyDigits(record.numeroReferencia).slice(-8);
  return rpad(`DARF${codigo}${referencia}${lpad(seq, 3)}`, 20);
}

function sanitizeBankCode(value: string) {
  const digits = onlyDigits(value);
  return digits.length === 3 ? digits : "033";
}

/**
 * Santander CNAB 240 – Pagamento de Tributos e Impostos sem código de barras
 * Segmento N / DARF Normal (N2)
 */
export function generateSantanderRemittance(
  company: CompanyInfo,
  darfs: DarfRecord[],
  paymentDate: string,
  fileSequence = 11,
) {
  if (!darfs.length) {
    throw new Error("Nenhum DARF informado para geração da remessa.");
  }

  const dataPagamento = normalizeDate(paymentDate);
  if (!dataPagamento) {
    throw new Error("Data de pagamento inválida.");
  }

  const COD_BANCO = sanitizeBankCode(company.banco);
  const LOTE = "0001";
  const TIPO_SERVICO = "22";
  const FORMA_LANCAMENTO = "16";
  const VERSAO_LOTE = "010";
  const VERSAO_ARQUIVO = "060";

  const cnpjEmpresa = onlyDigits(company.cnpj).slice(0, 14);
  const tipoInscricaoEmpresa = cnpjEmpresa.length === 14 ? "2" : "1";

  const convenio20 = buildSantanderConvenio20(company.agencia, company.convenio);
  const agencia = lpad(onlyDigits(company.agencia).slice(0, 5), 5, "0");
  const dvAgencia = rpad((company.dvAgencia ?? " ").slice(0, 1), 1);
  const conta = lpad(onlyDigits(company.conta).slice(0, 12), 12, "0");
  const dvConta = rpad((company.dvConta ?? " ").slice(0, 1), 1);

  const nomeEmpresa = rpad(asciiSafe(company.empresa ?? ""), 30);
  const nomeBanco = rpad("BANCO SANTANDER", 30);

  const dataGeracao = todayDDMMAAAA();
  const horaGeracao = nowHHMMSS();
  const numeroSequencialArquivo = lpad(fileSequence, 6, "0");

  // HEADER ARQUIVO
  const H = blank();
  put(H, 1, 3, COD_BANCO);
  put(H, 4, 7, "0000");
  put(H, 8, 8, "0");
  put(H, 9, 17, rpad("", 9));
  put(H, 18, 18, tipoInscricaoEmpresa);
  put(H, 19, 32, lpad(cnpjEmpresa, 14));
  put(H, 33, 52, convenio20);
  put(H, 53, 57, agencia);
  put(H, 58, 58, dvAgencia);
  put(H, 59, 70, conta);
  put(H, 71, 71, dvConta);
  put(H, 72, 72, " ");
  put(H, 73, 102, nomeEmpresa);
  put(H, 103, 132, nomeBanco);
  put(H, 133, 142, rpad("", 10));
  put(H, 143, 143, "1");
  put(H, 144, 151, dataGeracao);
  put(H, 152, 157, horaGeracao);
  put(H, 158, 163, numeroSequencialArquivo);
  put(H, 164, 166, VERSAO_ARQUIVO);
  put(H, 167, 171, "00000");
  put(H, 172, 191, rpad("", 20));
  put(H, 192, 211, rpad("", 20));
  put(H, 212, 230, rpad("", 19));
  put(H, 231, 240, rpad("", 10));

  // HEADER LOTE
  const HL = blank();
  put(HL, 1, 3, COD_BANCO);
  put(HL, 4, 7, LOTE);
  put(HL, 8, 8, "1");
  put(HL, 9, 9, "C");
  put(HL, 10, 11, TIPO_SERVICO);
  put(HL, 12, 13, FORMA_LANCAMENTO);
  put(HL, 14, 16, VERSAO_LOTE);
  put(HL, 17, 17, " ");
  put(HL, 18, 18, tipoInscricaoEmpresa);
  put(HL, 19, 32, lpad(cnpjEmpresa, 14));
  put(HL, 33, 52, convenio20);
  put(HL, 53, 57, agencia);
  put(HL, 58, 58, dvAgencia);
  put(HL, 59, 70, conta);
  put(HL, 71, 71, dvConta);
  put(HL, 72, 72, " ");
  put(HL, 73, 102, nomeEmpresa);
  put(HL, 103, 142, rpad("", 40));
  put(HL, 143, 172, rpad("", 30));
  put(HL, 173, 177, "00000");
  put(HL, 178, 192, rpad("", 15));
  put(HL, 193, 212, rpad("", 20));
  put(HL, 213, 217, "00000");
  put(HL, 218, 220, "000");
  put(HL, 221, 222, rpad("", 2));
  put(HL, 223, 230, rpad("", 8));
  put(HL, 231, 240, rpad("", 10));

  // DETALHES SEGMENTO N
  let seq = 1;
  let somaTotal = 0;
  const detalhes: string[] = [];

  for (const record of darfs) {
    const contribuinte = onlyDigits(record.cnpj).slice(0, 14);
    const tipoContribuinte = getContributorType(record.cnpj);
    const periodoApuracao = normalizeDate(record.periodoApuracao);
    const dataVencimento = normalizeDate(record.dataVencimento);

    if (!periodoApuracao) {
      throw new Error(`Período de apuração inválido no DARF ${record.codigoReceita}.`);
    }

    if (!dataVencimento) {
      throw new Error(`Data de vencimento inválida no DARF ${record.codigoReceita}.`);
    }

    const D = blank();
    put(D, 1, 3, COD_BANCO);
    put(D, 4, 7, LOTE);
    put(D, 8, 8, "3");
    put(D, 9, 13, lpad(seq, 5));
    put(D, 14, 14, "N");
    put(D, 15, 15, "0");
    put(D, 16, 17, "00");
    put(D, 18, 37, buildClientDocumentNumber(record, seq));
    put(D, 38, 57, rpad("", 20));
    put(D, 58, 87, rpad(asciiSafe(record.nome || company.empresa), 30));
    put(D, 88, 95, dataPagamento);
    put(D, 96, 110, money15(record.valorTotal));

    // N2 - DARF NORMAL
    put(D, 111, 116, lpad(onlyDigits(record.codigoReceita).slice(0, 6), 6));
    put(D, 117, 118, tipoContribuinte);
    put(D, 119, 132, lpad(contribuinte, 14));
    put(D, 133, 134, "16");
    put(D, 135, 142, periodoApuracao);
    put(D, 143, 159, lpad(onlyDigits(record.numeroReferencia).slice(0, 17), 17));
    put(D, 160, 174, money15(record.valorPrincipal));
    put(D, 175, 189, money15(record.valorMulta));
    put(D, 190, 204, money15(record.valorJuros));
    put(D, 205, 212, dataVencimento);
    put(D, 213, 230, rpad("", 18));
    put(D, 231, 240, rpad("", 10));

    detalhes.push(D.join(""));
    somaTotal += record.valorTotal || 0;
    seq += 1;
  }

  // TRAILER LOTE
  const TL = blank();
  put(TL, 1, 3, COD_BANCO);
  put(TL, 4, 7, LOTE);
  put(TL, 8, 8, "5");
  put(TL, 9, 17, rpad("", 9));
  put(TL, 18, 23, lpad(1 + detalhes.length + 1, 6));
  put(TL, 24, 41, money16(somaTotal));
  put(TL, 42, 59, "0".repeat(18));
  put(TL, 60, 65, "000000");
  put(TL, 66, 230, rpad("", 165));
  put(TL, 231, 240, rpad("", 10));

  // TRAILER ARQUIVO
  const TA = blank();
  put(TA, 1, 3, COD_BANCO);
  put(TA, 4, 7, "9999");
  put(TA, 8, 8, "9");
  put(TA, 9, 17, rpad("", 9));
  put(TA, 18, 23, lpad(1, 6));
  put(TA, 24, 29, lpad(1 + 1 + detalhes.length + 1 + 1, 6));
  put(TA, 30, 240, rpad("", 211));

  return [H.join(""), HL.join(""), ...detalhes, TL.join(""), TA.join("")].join("\r\n");
}