import { CompanyInfo, DarfRecord } from "@/types/darf";

const DATE_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function padValue(value: string, size: number, options?: { align?: "left" | "right"; filler?: string }) {
  const align = options?.align ?? "left";
  const filler = options?.filler ?? (align === "left" ? " " : "0");
  if (align === "right") {
    return value.padStart(size, filler).slice(-size);
  }
  return value.padEnd(size, filler).slice(0, size);
}

function sanitizeNumber(value: string) {
  return value.replace(/\D/g, "");
}

function formatDateToCnab(date: string | Date) {
  if (date instanceof Date) {
    return `${date.getDate().toString().padStart(2, "0")}${(date.getMonth() + 1)
      .toString()
      .padStart(2, "0")}${date.getFullYear()}`;
  }

  const cleaned = date.trim();
  if (/^\d{8}$/.test(cleaned)) {
    return cleaned;
  }

  const match = cleaned.match(/(\d{2})[\/-](\d{2})[\/-](\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${day}${month}${year}`;
  }

  return formatDateToCnab(new Date());
}

function toCnabNumber(value: number, length: number) {
  const cents = Math.round((value ?? 0) * 100);
  return padValue(String(cents), length, { align: "right", filler: "0" });
}

function buildLine(parts: string[]) {
  const line = parts.join("");
  return line.length >= 240 ? line.slice(0, 240) : line.padEnd(240, " ");
}

export function generateSantanderRemittance(company: CompanyInfo, darfs: DarfRecord[]) {
  const creationDate = new Date();
  const fileDate = formatDateToCnab(creationDate);
  const fileTime = `${creationDate.getHours().toString().padStart(2, "0")}${creationDate
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  const banco = padValue(sanitizeNumber(company.banco || "033"), 3, { align: "right", filler: "0" });
  const agencia = padValue(sanitizeNumber(company.agencia), 4, { align: "right", filler: "0" });
  const dvAgencia = padValue(sanitizeNumber(company.dvAgencia), 1, { align: "right", filler: "0" });
  const conta = padValue(sanitizeNumber(company.conta), 9, { align: "right", filler: "0" });
  const dvConta = padValue(sanitizeNumber(company.dvConta), 1, { align: "right", filler: "0" });
  const convenio = padValue(sanitizeNumber(company.convenio), 20, { align: "right", filler: "0" });
  const cnpj = padValue(sanitizeNumber(company.cnpj), 14, { align: "right", filler: "0" });
  const companyName = padValue(company.empresa.toUpperCase(), 30);

  const headerArquivo = buildLine([
    "0",
    "1",
    banco,
    "00000",
    padValue(" ", 9),
    convenio,
    padValue(" ", 5),
    padValue(cnpj, 14, { align: "right", filler: "0" }),
    padValue(" ", 20),
    companyName,
    padValue("BANCO SANTANDER", 30),
    fileDate,
    fileTime,
    padValue("1", 6, { align: "right", filler: "0" }),
    padValue(" ", 71),
  ]);

  const headerLote = buildLine([
    "1",
    banco,
    padValue("0001", 4, { align: "right", filler: "0" }),
    "1",
    "J",
    padValue(" ", 2),
    padValue("040", 3),
    padValue(" ", 1),
    padValue(" ", 1),
    padValue(convenio, 20, { align: "right", filler: "0" }),
    padValue(" ", 5),
    agencia,
    dvAgencia,
    conta,
    padValue(" ", 1),
    dvConta,
    companyName,
    padValue(" ", 40),
    padValue(" ", 30),
    fileDate,
    padValue(" ", 8),
    padValue(String(darfs.length).padStart(5, "0"), 6, { align: "right", filler: "0" }),
    padValue(" ", 99),
  ]);

  let sequential = 1;
  const detailLines = darfs.map((darf) => {
    const vencimento = formatDateToCnab(darf.dataVencimento);
    const period = formatDateToCnab(darf.periodoApuracao || DATE_FORMATTER.format(creationDate));
    const referencia = padValue(sanitizeNumber(darf.numeroReferencia), 25, { align: "right", filler: "0" });

    const line = buildLine([
      "3",
      padValue("0001", 4, { align: "right", filler: "0" }),
      padValue(String(sequential++), 5, { align: "right", filler: "0" }),
      "A",
      padValue(sanitizeNumber(darf.cnpj), 15, { align: "right", filler: "0" }),
      padValue(darf.nome.toUpperCase(), 30),
      padValue(darf.codigoReceita, 6, { align: "right", filler: "0" }),
      referencia,
      period,
      vencimento,
      toCnabNumber(darf.valorPrincipal, 15),
      toCnabNumber(darf.valorMulta, 15),
      toCnabNumber(darf.valorJuros, 15),
      toCnabNumber(darf.valorTotal, 15),
      padValue(" ", 81),
    ]);

    return line;
  });

  const totalPrincipal = darfs.reduce((total, darf) => total + darf.valorPrincipal, 0);
  const totalMulta = darfs.reduce((total, darf) => total + darf.valorMulta, 0);
  const totalJuros = darfs.reduce((total, darf) => total + darf.valorJuros, 0);
  const totalGeral = darfs.reduce((total, darf) => total + darf.valorTotal, 0);

  const trailerLote = buildLine([
    "5",
    padValue("0001", 4, { align: "right", filler: "0" }),
    padValue(String(detailLines.length + 2), 6, { align: "right", filler: "0" }),
    toCnabNumber(totalPrincipal, 18),
    toCnabNumber(totalMulta, 18),
    toCnabNumber(totalJuros, 18),
    toCnabNumber(totalGeral, 18),
    padValue(" ", 145),
  ]);

  const trailerArquivo = buildLine([
    "9",
    padValue("0001", 6, { align: "right", filler: "0" }),
    padValue(String(detailLines.length + 4), 6, { align: "right", filler: "0" }),
    padValue(" ", 213),
  ]);

  const lines = [headerArquivo, headerLote, ...detailLines, trailerLote, trailerArquivo];
  return lines.join("\r\n");
}
