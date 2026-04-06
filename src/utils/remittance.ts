import type { CompanyInfo, DarfRecord } from "../types/darf";

const COLS = 240;

const blank = () => Array(COLS).fill(" ");

function put(buffer: string[], from1: number, to1: number, value: string) {
  const start = Math.max(1, from1);
  const end = Math.min(COLS, to1);
  const content = `${value ?? ""}`;

  for (let index = start - 1, cursor = 0; index < end && cursor < content.length; index += 1, cursor += 1) {
    buffer[index] = content[cursor];
  }
}

function lpad(value: string | number, width: number, char = "0") {
  const content = String(value ?? "");
  return content.length >= width ? content.slice(-width) : char.repeat(width - content.length) + content;
}

function rpad(value: string | number, width: number, char = " ") {
  const content = String(value ?? "");
  return content.length >= width ? content.slice(0, width) : content + char.repeat(width - content.length);
}

function onlyDigits(value: string) {
  return (value ?? "").replace(/\D/g, "");
}

function asciiSafe(value: string) {
  const upper = (value ?? "").toUpperCase();
  return upper.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9 ]/g, " ");
}

function todayDDMMAAAA() {
  const now = new Date();
  return lpad(now.getDate(), 2) + lpad(now.getMonth() + 1, 2) + now.getFullYear();
}

function nowHHMMSS() {
  const now = new Date();
  return lpad(now.getHours(), 2) + lpad(now.getMinutes(), 2) + lpad(now.getSeconds(), 2);
}

function buildSantanderConvenio20(agencia: string, convenio: string) {
  const banco = "0033";
  const agencia4 = lpad(onlyDigits(agencia).slice(0, 4), 4, "0");
  const convenio10 = lpad(onlyDigits(convenio).slice(0, 10), 10, "0");
  return banco + agencia4 + "00" + convenio10;
}

export function normalizeDateToCnab(value: string | Date) {
  if (value instanceof Date) {
    return lpad(value.getDate(), 2) + lpad(value.getMonth() + 1, 2) + value.getFullYear();
  }

  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, "");

  if (/^\d{8}$/.test(digits) && /^\d{8}$/.test(trimmed)) {
    return digits;
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}${month}${year}`;
  }

  const brMatch = trimmed.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (brMatch) {
    const [, day, month, year] = brMatch;
    return `${day}${month}${year}`;
  }

  return null;
}

export function generateSantanderRemittance(
  company: CompanyInfo,
  darfs: DarfRecord[],
  paymentDate: string,
) {
  const dataPagamento = normalizeDateToCnab(paymentDate);
  if (!dataPagamento) {
    throw new Error("Informe uma data de pagamento válida antes de gerar a remessa.");
  }

  const COD_BANCO = "033";
  const TIPO_SERVICO = "20";
  const FORMA_LANC = "16";
  const VERS_LAYOUT_ARQ = "060";
  const VERS_LOTE = "010";

  const cnpj = onlyDigits(company.cnpj).slice(0, 14);
  const tpInscr = cnpj.length === 14 ? "2" : "1";
  const agencia5 = lpad(onlyDigits(company.agencia).slice(0, 5), 5, "0");
  const dvAg = (company.dvAgencia ?? " ").slice(0, 1) || " ";
  const conta12 = lpad(onlyDigits(company.conta).slice(0, 12), 12, "0");
  const dvCt = (company.dvConta ?? " ").slice(0, 1) || " ";
  const dacAgConta = " ";

  const convenio20 = buildSantanderConvenio20(company.agencia, company.convenio);
  const nomeEmpresa = rpad(asciiSafe(company.empresa ?? ""), 30);
  const nomeBanco = rpad("SANTANDER", 30);

  const dataArq = todayDDMMAAAA();
  const horaArq = nowHHMMSS();
  const lote = "0001";
  const numArq = lpad(1, 6, "0");

  const headerArquivo = blank();
  put(headerArquivo, 1, 3, COD_BANCO);
  put(headerArquivo, 4, 7, "0000");
  put(headerArquivo, 8, 8, "0");
  put(headerArquivo, 9, 17, rpad("", 9));
  put(headerArquivo, 18, 18, tpInscr);
  put(headerArquivo, 19, 32, lpad(cnpj, 14));
  put(headerArquivo, 33, 52, convenio20);
  put(headerArquivo, 53, 57, agencia5);
  put(headerArquivo, 58, 58, dvAg);
  put(headerArquivo, 59, 70, conta12);
  put(headerArquivo, 71, 71, dvCt);
  put(headerArquivo, 72, 72, dacAgConta);
  put(headerArquivo, 73, 102, nomeEmpresa);
  put(headerArquivo, 103, 132, nomeBanco);
  put(headerArquivo, 133, 142, rpad("", 10));
  put(headerArquivo, 143, 143, "1");
  put(headerArquivo, 144, 151, dataArq);
  put(headerArquivo, 152, 157, horaArq);
  put(headerArquivo, 158, 163, numArq);
  put(headerArquivo, 164, 166, VERS_LAYOUT_ARQ);
  put(headerArquivo, 167, 171, lpad("", 5));
  put(headerArquivo, 172, 191, rpad("", 20));
  put(headerArquivo, 192, 211, rpad("", 20));
  put(headerArquivo, 212, 230, rpad("", 19));
  put(headerArquivo, 231, 240, rpad("", 10));

  const headerLote = blank();
  put(headerLote, 1, 3, COD_BANCO);
  put(headerLote, 4, 7, lote);
  put(headerLote, 8, 8, "1");
  put(headerLote, 9, 9, "C");
  put(headerLote, 10, 11, TIPO_SERVICO);
  put(headerLote, 12, 13, FORMA_LANC);
  put(headerLote, 14, 16, VERS_LOTE);
  put(headerLote, 17, 17, " ");
  put(headerLote, 18, 18, tpInscr);
  put(headerLote, 19, 32, lpad(cnpj, 14));
  put(headerLote, 33, 52, convenio20);
  put(headerLote, 53, 57, agencia5);
  put(headerLote, 58, 58, dvAg);
  put(headerLote, 59, 70, conta12);
  put(headerLote, 71, 71, dvCt);
  put(headerLote, 72, 72, dacAgConta);
  put(headerLote, 73, 102, nomeEmpresa);
  put(headerLote, 103, 142, rpad("", 40));
  put(headerLote, 143, 230, rpad("", 88));
  put(headerLote, 231, 240, rpad("", 10));

  let sequencial = 1;
  let somaTotalCentavos = 0;
  const detalhes: string[] = [];

  for (const darf of darfs) {
    const vencimento = normalizeDateToCnab(darf.dataVencimento);
    if (!vencimento) {
      throw new Error(
        `DARF ${darf.codigoReceita} / ${darf.numeroReferencia} com data de vencimento inválida.`,
      );
    }

    const periodo = normalizeDateToCnab(darf.periodoApuracao) ?? vencimento;
    const principalCentavos = Math.round(Math.max(0, +(darf.valorPrincipal ?? 0)) * 100);
    const multaCentavos = Math.round(Math.max(0, +(darf.valorMulta ?? 0)) * 100);
    const jurosCentavos = Math.round(Math.max(0, +(darf.valorJuros ?? 0)) * 100);
    const totalCentavos = principalCentavos + multaCentavos + jurosCentavos;

    const detalhe = blank();
    put(detalhe, 1, 3, COD_BANCO);
    put(detalhe, 4, 7, lote);
    put(detalhe, 8, 8, "3");
    put(detalhe, 9, 13, lpad(sequencial, 5));
    put(detalhe, 14, 14, "N");
    put(detalhe, 15, 15, "0");
    put(detalhe, 16, 17, "00");
    put(detalhe, 18, 37, rpad(lpad(sequencial, 20), 20));
    put(detalhe, 38, 57, rpad("", 20));
    put(detalhe, 58, 87, rpad(asciiSafe(darf.nome ?? ""), 30));
    put(detalhe, 88, 95, dataPagamento);
    put(detalhe, 96, 110, lpad(totalCentavos, 15, "0"));

    const codigoReceita6 = lpad(onlyDigits(darf.codigoReceita ?? "").slice(0, 6), 6);
    const cnpjContribuinte = onlyDigits(darf.cnpj).slice(0, 14);
    const tipoContribuinte = cnpjContribuinte.length === 14 ? "02" : "01";
    const identificacaoContribuinte = lpad(cnpjContribuinte, 14);
    let numeroReferencia = onlyDigits(darf.numeroReferencia ?? "");
    numeroReferencia = numeroReferencia
      ? lpad(numeroReferencia.slice(0, 17), 17, "0")
      : "0".repeat(17);

    put(detalhe, 111, 116, codigoReceita6);
    put(detalhe, 117, 118, tipoContribuinte);
    put(detalhe, 119, 132, identificacaoContribuinte);
    put(detalhe, 133, 134, "16");
    put(detalhe, 135, 142, lpad(periodo, 8));
    put(detalhe, 143, 159, numeroReferencia);
    put(detalhe, 160, 174, lpad(principalCentavos, 15, "0"));
    put(detalhe, 175, 189, lpad(multaCentavos, 15, "0"));
    put(detalhe, 190, 204, lpad(jurosCentavos, 15, "0"));
    put(detalhe, 205, 212, lpad(vencimento, 8));
    put(detalhe, 213, 230, rpad("", 18));
    put(detalhe, 231, 240, rpad("", 10));

    detalhes.push(detalhe.join(""));
    somaTotalCentavos += totalCentavos;
    sequencial += 1;
  }

  const trailerLote = blank();
  put(trailerLote, 1, 3, COD_BANCO);
  put(trailerLote, 4, 7, lote);
  put(trailerLote, 8, 8, "5");
  put(trailerLote, 9, 17, rpad("", 9));
  put(trailerLote, 18, 23, lpad(1 + detalhes.length + 1, 6));
  put(trailerLote, 24, 41, lpad(somaTotalCentavos, 18, "0"));
  put(trailerLote, 42, 59, lpad(0, 18));
  put(trailerLote, 60, 65, lpad(0, 6));
  put(trailerLote, 66, 230, rpad("", 165));
  put(trailerLote, 231, 240, rpad("", 10));

  const trailerArquivo = blank();
  put(trailerArquivo, 1, 3, COD_BANCO);
  put(trailerArquivo, 4, 7, "9999");
  put(trailerArquivo, 8, 8, "9");
  put(trailerArquivo, 9, 17, rpad("", 9));
  put(trailerArquivo, 18, 23, lpad(1, 6));
  put(trailerArquivo, 24, 29, lpad(1 + 1 + detalhes.length + 1 + 1, 6));
  put(trailerArquivo, 30, 240, rpad("", 211));

  return [headerArquivo.join(""), headerLote.join(""), ...detalhes, trailerLote.join(""), trailerArquivo.join("")].join(
    "\r\n",
  );
}