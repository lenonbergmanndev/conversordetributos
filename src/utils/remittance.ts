import type { CompanyInfo, DarfRecord } from "@/types/darf";

const COLS = 240;

const COD_BANCO = "033";
const LOTE = "0001";
const COD_REMESSA = "1";
const VERSAO_ARQUIVO = "060";

const TIPO_SERVICO = "22"; // Pagamento de Contas, Tributos e Impostos
const FORMA_LANCAMENTO = "16"; // DARF Normal – sem código de barras
const VERSAO_LOTE = "010";

const TIPO_MOVIMENTO = "0"; // inclusão
const INSTRUCAO_MOVIMENTO = "00"; // inclusão liberada
const CODIGO_IDENTIFICACAO_TRIBUTO = "16"; // DARF Normal

const blank = () => Array(COLS).fill(" ");

function put(buf: string[], from1: number, to1: number, val: string) {
  const from = Math.max(1, from1);
  const to = Math.min(COLS, to1);
  const s = String(val ?? "");

  for (let i = from - 1, j = 0; i < to && j < s.length; i += 1, j += 1) {
    buf[i] = s[j];
  }
}

function onlyDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function lpad(value: string | number, width: number, ch = "0"): string {
  const s = String(value ?? "");
  return s.length >= width ? s.slice(-width) : ch.repeat(width - s.length) + s;
}

function rpad(value: string | number, width: number, ch = " "): string {
  const s = String(value ?? "");
  return s.length >= width ? s.slice(0, width) : s + ch.repeat(width - s.length);
}

function asciiSafe(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 /&().,\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const normalized = raw
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function money15(value: number): string {
  const cents = Math.round((value || 0) * 100);
  return lpad(cents, 15, "0");
}

function todayDDMMAAAA(now = new Date()): string {
  return (
    lpad(now.getDate(), 2) +
    lpad(now.getMonth() + 1, 2) +
    lpad(now.getFullYear(), 4)
  );
}

function nowHHMMSS(now = new Date()): string {
  return (
    lpad(now.getHours(), 2) +
    lpad(now.getMinutes(), 2) +
    lpad(now.getSeconds(), 2)
  );
}

function normalizeDateToDDMMAAAA(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
    return onlyDigits(raw);
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [yyyy, mm, dd] = raw.split("-");
    return `${dd}${mm}${yyyy}`;
  }

  const digits = onlyDigits(raw);
  if (digits.length !== 8) return "";

  if (/^(19|20)\d{6}$/.test(digits)) {
    const yyyy = digits.slice(0, 4);
    const mm = digits.slice(4, 6);
    const dd = digits.slice(6, 8);
    return `${dd}${mm}${yyyy}`;
  }

  return digits;
}

function isPastDateDDMMAAAA(ddmmyyyy: string): boolean {
  if (!/^\d{8}$/.test(ddmmyyyy)) return true;

  const dd = Number(ddmmyyyy.slice(0, 2));
  const mm = Number(ddmmyyyy.slice(2, 4));
  const yyyy = Number(ddmmyyyy.slice(4, 8));

  const target = new Date(yyyy, mm - 1, dd);
  target.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return target.getTime() < today.getTime();
}

function typeInscricao1Digit(documento: string): string {
  const digits = onlyDigits(documento);
  if (digits.length === 11) return "1";
  if (digits.length === 14) return "2";
  return "0";
}

function typeInscricao2Digits(documento: string): string {
  const digits = onlyDigits(documento);
  if (digits.length === 11) return "01";
  if (digits.length === 14) return "02";
  return "00";
}

/**
 * G009
 * BBBBAAAACCCCCCCCCCCC
 * BBBB = 0033
 * AAAA = agência sem DV
 * CCCCCCCCCCCC = convênio alinhado à direita com zeros à esquerda
 */
function buildConvenio20(agencia: string, convenio: string): string {
  const banco4 = "0033";
  const ag4 = lpad(onlyDigits(agencia).slice(0, 4), 4, "0");
  const conv12 = lpad(onlyDigits(convenio).slice(0, 12), 12, "0");
  return banco4 + ag4 + conv12;
}

function buildSeuNumero(record: DarfRecord, index: number): string {
  const codigo = lpad(onlyDigits(record.codigoReceita).slice(0, 6), 6, "0");
  const ref = lpad(onlyDigits(record.numeroReferencia).slice(0, 17), 17, "0");
  const seed = `DARF${codigo}${ref}${lpad(index + 1, 5)}`;
  return rpad(seed.slice(0, 20), 20);
}

function requireValue(value: string, label: string, index?: number) {
  if (!value) {
    const prefix = typeof index === "number" ? `DARF #${index + 1}: ` : "";
    throw new Error(`${prefix}${label} não informado.`);
  }
}

function buildHeaderArquivo(company: CompanyInfo, fileSequence: number, now: Date): string {
  const cnpjEmpresa = onlyDigits(company.cnpj).slice(0, 14);
  const tpInscricao = typeInscricao1Digit(cnpjEmpresa);
  const convenio20 = buildConvenio20(company.agencia, company.convenio);

  const agencia5 = lpad(onlyDigits(company.agencia).slice(0, 5), 5, "0");
  const dvAgencia = rpad((company.dvAgencia || "").trim().slice(0, 1), 1, " ");
  const conta12 = lpad(onlyDigits(company.conta).slice(0, 12), 12, "0");
  const dvConta = rpad((company.dvConta || "").trim().slice(0, 1), 1, " ");
  const nomeEmpresa = rpad(asciiSafe(company.empresa), 30);

  const line = blank();
  put(line, 1, 3, COD_BANCO);
  put(line, 4, 7, "0000");
  put(line, 8, 8, "0");
  put(line, 9, 17, rpad("", 9));
  put(line, 18, 18, tpInscricao);
  put(line, 19, 32, lpad(cnpjEmpresa, 14));
  put(line, 33, 52, convenio20);
  put(line, 53, 57, agencia5);
  put(line, 58, 58, dvAgencia);
  put(line, 59, 70, conta12);
  put(line, 71, 71, dvConta);
  put(line, 72, 72, " ");
  put(line, 73, 102, nomeEmpresa);
  put(line, 103, 132, rpad("BANCO SANTANDER", 30));
  put(line, 133, 142, rpad("", 10));
  put(line, 143, 143, COD_REMESSA);
  put(line, 144, 151, todayDDMMAAAA(now));
  put(line, 152, 157, nowHHMMSS(now));
  put(line, 158, 163, lpad(fileSequence, 6));
  put(line, 164, 166, VERSAO_ARQUIVO);
  put(line, 167, 171, "00000");
  put(line, 172, 191, rpad("", 20));
  put(line, 192, 211, rpad("", 20));
  put(line, 212, 230, rpad("", 19));
  put(line, 231, 240, rpad("", 10));
  return line.join("");
}

function buildHeaderLote(company: CompanyInfo): string {
  const cnpjEmpresa = onlyDigits(company.cnpj).slice(0, 14);
  const tpInscricao = typeInscricao1Digit(cnpjEmpresa);
  const convenio20 = buildConvenio20(company.agencia, company.convenio);

  const agencia5 = lpad(onlyDigits(company.agencia).slice(0, 5), 5, "0");
  const dvAgencia = rpad((company.dvAgencia || "").trim().slice(0, 1), 1, " ");
  const conta12 = lpad(onlyDigits(company.conta).slice(0, 12), 12, "0");
  const dvConta = rpad((company.dvConta || "").trim().slice(0, 1), 1, " ");
  const nomeEmpresa = rpad(asciiSafe(company.empresa), 30);

  const line = blank();
  put(line, 1, 3, COD_BANCO);
  put(line, 4, 7, LOTE);
  put(line, 8, 8, "1");
  put(line, 9, 9, "C");
  put(line, 10, 11, TIPO_SERVICO);
  put(line, 12, 13, FORMA_LANCAMENTO);
  put(line, 14, 16, VERSAO_LOTE);
  put(line, 17, 17, " ");
  put(line, 18, 18, tpInscricao);
  put(line, 19, 32, lpad(cnpjEmpresa, 14));
  put(line, 33, 52, convenio20);
  put(line, 53, 57, agencia5);
  put(line, 58, 58, dvAgencia);
  put(line, 59, 70, conta12);
  put(line, 71, 71, dvConta);
  put(line, 72, 72, " ");
  put(line, 73, 102, nomeEmpresa);
  put(line, 103, 142, rpad("", 40));
  put(line, 143, 172, rpad("", 30));
  put(line, 173, 177, "00000");
  put(line, 178, 192, rpad("", 15));
  put(line, 193, 212, rpad("", 20));
  put(line, 213, 217, "00000");
  put(line, 218, 220, "000");
  put(line, 221, 222, rpad("", 2));
  put(line, 223, 230, rpad("", 8));
  put(line, 231, 240, rpad("", 10));
  return line.join("");
}

function buildSegmentoN(record: DarfRecord, index: number, paymentDate: string, company: CompanyInfo): string {
  const nomeContribuinte = rpad(asciiSafe(record.nome || company.empresa), 30);
  const documentoContribuinte = onlyDigits(record.cnpj || company.cnpj).slice(0, 14);
  const tipoIdentificacao = typeInscricao2Digits(documentoContribuinte);

  const codigoReceita = lpad(onlyDigits(record.codigoReceita).slice(0, 6), 6, "0");
  const periodoApuracao = normalizeDateToDDMMAAAA(record.periodoApuracao);
  const numeroReferencia = lpad(onlyDigits(record.numeroReferencia).slice(0, 17), 17, "0");
  const dataVencimento = normalizeDateToDDMMAAAA(record.dataVencimento);
  const dataPagamento = normalizeDateToDDMMAAAA(paymentDate);

  const valorPrincipal = parseNumber(record.valorPrincipal);
  const valorMulta = parseNumber(record.valorMulta);
  const valorJuros = parseNumber(record.valorJuros);
  const valorTotalInformado = parseNumber(record.valorTotal);
  const valorTotal =
    valorTotalInformado > 0
      ? valorTotalInformado
      : Number((valorPrincipal + valorMulta + valorJuros).toFixed(2));

  requireValue(nomeContribuinte.trim(), "Nome do contribuinte", index);
  requireValue(documentoContribuinte, "CNPJ/CPF do contribuinte", index);
  requireValue(codigoReceita.replace(/^0+$/, ""), "Código da receita", index);
  requireValue(periodoApuracao, "Período de apuração", index);
  requireValue(numeroReferencia.replace(/^0+$/, ""), "Número de referência", index);
  requireValue(dataVencimento, "Data de vencimento", index);
  requireValue(dataPagamento, "Data de pagamento", index);

  if (isPastDateDDMMAAAA(dataPagamento)) {
    throw new Error(
      `DARF #${index + 1}: a data de pagamento ${dataPagamento} é inferior à data atual.`
    );
  }

  if (valorPrincipal <= 0) {
    throw new Error(`DARF #${index + 1}: valor principal inválido.`);
  }

  if (valorTotal <= 0) {
    throw new Error(`DARF #${index + 1}: valor total inválido.`);
  }

  const line = blank();
  put(line, 1, 3, COD_BANCO);
  put(line, 4, 7, LOTE);
  put(line, 8, 8, "3");
  put(line, 9, 13, lpad(index + 1, 5));
  put(line, 14, 14, "N");
  put(line, 15, 15, TIPO_MOVIMENTO);
  put(line, 16, 17, INSTRUCAO_MOVIMENTO);
  put(line, 18, 37, rpad(buildSeuNumero(record, index), 20));
  put(line, 38, 57, rpad("", 20));
  put(line, 58, 87, nomeContribuinte);
  put(line, 88, 95, dataPagamento);
  put(line, 96, 110, money15(valorTotal));

  // N2 - DARF Normal
  put(line, 111, 116, codigoReceita);
  put(line, 117, 118, tipoIdentificacao);
  put(line, 119, 132, lpad(documentoContribuinte, 14));
  put(line, 133, 134, CODIGO_IDENTIFICACAO_TRIBUTO);
  put(line, 135, 142, periodoApuracao);
  put(line, 143, 159, numeroReferencia);
  put(line, 160, 174, money15(valorPrincipal));
  put(line, 175, 189, money15(valorMulta));
  put(line, 190, 204, money15(valorJuros));
  put(line, 205, 212, dataVencimento);
  put(line, 213, 230, rpad("", 18));
  put(line, 231, 240, rpad("", 10));

  return line.join("");
}

function buildTrailerLote(totalRegistrosLote: number, somatoriaValores: number): string {
  const line = blank();
  put(line, 1, 3, COD_BANCO);
  put(line, 4, 7, LOTE);
  put(line, 8, 8, "5");
  put(line, 9, 17, rpad("", 9));
  put(line, 18, 23, lpad(totalRegistrosLote, 6));
  put(line, 24, 41, lpad(Math.round(somatoriaValores * 100), 18, "0"));
  put(line, 42, 59, "000000000000000000");
  put(line, 60, 65, "000000");
  put(line, 66, 230, rpad("", 165));
  put(line, 231, 240, rpad("", 10));
  return line.join("");
}

function buildTrailerArquivo(totalRegistrosArquivo: number): string {
  const line = blank();
  put(line, 1, 3, COD_BANCO);
  put(line, 4, 7, "9999");
  put(line, 8, 8, "9");
  put(line, 9, 17, rpad("", 9));
  put(line, 18, 23, "000001");
  put(line, 24, 29, lpad(totalRegistrosArquivo, 6));
  put(line, 30, 240, rpad("", 211));
  return line.join("");
}

export function generateSantanderRemittance(
  company: CompanyInfo,
  darfs: DarfRecord[],
  paymentDate: string
): string {
  if (!Array.isArray(darfs) || darfs.length === 0) {
    throw new Error("Nenhum DARF informado para geração da remessa.");
  }
  
  const paymentDateNorm = normalizeDateToDDMMAAAA(paymentDate);
  if (!paymentDateNorm) {
    throw new Error("Data de pagamento não informada no formulário.");
  }

  if (isPastDateDDMMAAAA(paymentDateNorm)) {
    throw new Error("A data de pagamento informada é inferior à data atual.");
  }

  const now = new Date();
  const fileSequence = 11; // evita faixa 1-10 que pode ser tratada como teste

  const headerArquivo = buildHeaderArquivo(company, fileSequence, now);
  const headerLote = buildHeaderLote(company);

  const detalhes = darfs.map((record, index) =>
    buildSegmentoN(record, index, paymentDateNorm, company)
  );

  const somatoriaValores = darfs.reduce((acc, record) => {
    const principal = parseNumber(record.valorPrincipal);
    const multa = parseNumber(record.valorMulta);
    const juros = parseNumber(record.valorJuros);
    const totalInformado = parseNumber(record.valorTotal);
    const total =
      totalInformado > 0 ? totalInformado : Number((principal + multa + juros).toFixed(2));
    return acc + total;
  }, 0);

  const totalRegistrosLote = 1 + detalhes.length + 1;
  const trailerLote = buildTrailerLote(totalRegistrosLote, somatoriaValores);

  const totalRegistrosArquivo = 1 + 1 + detalhes.length + 1 + 1;
  const trailerArquivo = buildTrailerArquivo(totalRegistrosArquivo);

  return [headerArquivo, headerLote, ...detalhes, trailerLote, trailerArquivo].join("\r\n");
}