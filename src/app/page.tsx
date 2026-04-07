// src/app/page.tsx
"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import type { CompanyInfo, DarfRecord } from "@/types/darf";
import { generateSantanderRemittance } from "@/utils/remittance";

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function sanitizeDocument(value: string) {
  return (value ?? "").replace(/\D/g, "");
}

function getTodayISO() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

const initialCompany: CompanyInfo = {
  banco: "033",
  agencia: "3601",
  dvAgencia: "0",
  conta: "13004606",
  dvConta: "4",
  convenio: "4907424402",
  empresa: "CENTILLION LTDA",
  cnpj: "39614753000122",
};

const bankOptions = [{ label: "Banco Santander", value: "033" }];

export default function Page() {
  const [company, setCompany] = useState<CompanyInfo>(initialCompany);
  const [darfs, setDarfs] = useState<DarfRecord[]>([]);
  const [paymentDate, setPaymentDate] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [diagNotes, setDiagNotes] = useState<string[]>([]);
  const [diagErrors, setDiagErrors] = useState<string[]>([]);

  useEffect(() => {
    setPaymentDate(getTodayISO());
  }, []);

  const summary = useMemo(() => {
    const byCodigo = new Map<
      string,
      {
        codigoReceita: string;
        quantidade: number;
        valorPrincipal: number;
        valorMulta: number;
        valorJuros: number;
        valorTotal: number;
      }
    >();

    let totalGuias = 0;
    let totalPrincipal = 0;
    let totalMulta = 0;
    let totalJuros = 0;
    let totalGeral = 0;

    darfs.forEach((darf) => {
      totalGuias += 1;
      totalPrincipal += darf.valorPrincipal;
      totalMulta += darf.valorMulta;
      totalJuros += darf.valorJuros;
      totalGeral += darf.valorTotal;

      const existing = byCodigo.get(darf.codigoReceita) ?? {
        codigoReceita: darf.codigoReceita,
        quantidade: 0,
        valorPrincipal: 0,
        valorMulta: 0,
        valorJuros: 0,
        valorTotal: 0,
      };

      existing.quantidade += 1;
      existing.valorPrincipal += darf.valorPrincipal;
      existing.valorMulta += darf.valorMulta;
      existing.valorJuros += darf.valorJuros;
      existing.valorTotal += darf.valorTotal;

      byCodigo.set(darf.codigoReceita, existing);
    });

    return {
      totalGuias,
      totalPrincipal,
      totalMulta,
      totalJuros,
      totalGeral,
      porCodigo: Array.from(byCodigo.values()),
    };
  }, [darfs]);

  function handleCompanyChange(field: keyof CompanyInfo, value: string) {
    setCompany((current) => ({ ...current, [field]: value }));
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMessage(null);
    setValidationMessage(null);
    setDiagNotes([]);
    setDiagErrors([]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/darfs/parse", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.detail || payload.message || "Falha ao processar o PDF.",
        );
      }

      const sanitizedDarfs: DarfRecord[] = payload.darfs.map((d: DarfRecord) => ({
        ...d,
        cnpj: sanitizeDocument(d.cnpj),
        codigoReceita: (d.codigoReceita ?? "").trim(),
        numeroReferencia: sanitizeDocument(d.numeroReferencia),
      }));

      setDarfs(sanitizedDarfs);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível analisar o arquivo enviado.";

      setErrorMessage(message);
      setDarfs([]);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  function handleGenerateRemittance() {
    setValidationMessage(null);
    setDiagNotes([]);
    setDiagErrors([]);

    if (!darfs.length) {
      setValidationMessage(
        "Importe um PDF com ao menos uma guia de DARF antes de gerar a remessa.",
      );
      return;
    }

    if (!paymentDate) {
      setValidationMessage(
        "Informe a data de pagamento antes de gerar a remessa.",
      );
      return;
    }

    try {
      const remittance = generateSantanderRemittance(company, darfs, paymentDate);

      const blob = new Blob([remittance], {
        type: "text/plain;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:T]/g, "")
        .slice(0, 14);

      link.href = url;
      link.download = `REM_${timestamp}.rem`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setValidationMessage("Arquivo de remessa gerado com sucesso!");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o arquivo remessa.";

      setValidationMessage(message);
    }
  }

  function handleReset() {
    setDarfs([]);
    setErrorMessage(null);
    setValidationMessage(null);
    setDiagNotes([]);
    setDiagErrors([]);
    setPaymentDate(getTodayISO());
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Conversor de DARF para Arquivo CNAB
            </h1>
            <p className="text-sm text-slate-500 sm:text-base">
              Importe DARFs em PDF, confira o relatório consolidado e gere a remessa CNAB 240
              do Santander com a data de pagamento informada no formulário.
            </p>
          </div>
          <div className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            Segmento N · DARF sem código de barras
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-8">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Informações do arquivo CNAB</h2>
          <p className="mt-1 text-sm text-slate-500">
            A data de vencimento vem do campo 06 do DARF. A data de pagamento é carregada automaticamente com a data de hoje.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Banco
              <select
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
                value={company.banco}
                onChange={(e) => handleCompanyChange("banco", e.target.value)}
              >
                {bankOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Data de pagamento
              <input
                type="date"
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Agência
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.agencia}
                onChange={(e) => handleCompanyChange("agencia", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Dígito da Agência
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.dvAgencia}
                onChange={(e) => handleCompanyChange("dvAgencia", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Conta
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.conta}
                onChange={(e) => handleCompanyChange("conta", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Dígito da Conta
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.dvConta}
                onChange={(e) => handleCompanyChange("dvConta", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Convênio
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.convenio}
                onChange={(e) => handleCompanyChange("convenio", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Empresa
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.empresa}
                onChange={(e) => handleCompanyChange("empresa", e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              CNPJ
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.cnpj}
                onChange={(e) => handleCompanyChange("cnpj", e.target.value)}
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Importar PDF de DARF</h2>
              <p className="text-sm text-slate-500">
                Cada upload substitui os dados atuais.
              </p>
            </div>

            <div className="flex gap-3">
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-100">
                {isUploading ? "Processando..." : "Selecionar PDF"}
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isUploading}
                />
              </label>

              {darfs.length > 0 && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded-md border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-200"
                >
                  Limpar relatório
                </button>
              )}
            </div>
          </div>

          {errorMessage && (
            <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {darfs.length > 0 && (
            <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[1100px] divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">Período</th>
                    <th className="px-4 py-3 text-left">CNPJ</th>
                    <th className="px-4 py-3 text-left">Cód. Receita</th>
                    <th className="px-4 py-3 text-left">Referência</th>
                    <th className="px-4 py-3 text-left">Vencimento</th>
                    <th className="px-4 py-3 text-right">Principal</th>
                    <th className="px-4 py-3 text-right">Multa</th>
                    <th className="px-4 py-3 text-right">Juros</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {darfs.map((darf) => (
                    <tr key={darf.id}>
                      <td className="px-4 py-3 font-medium text-slate-700">{darf.nome}</td>
                      <td className="px-4 py-3 text-slate-600">{darf.periodoApuracao}</td>
                      <td className="px-4 py-3 text-slate-600">{darf.cnpj}</td>
                      <td className="px-4 py-3 text-slate-600">{darf.codigoReceita}</td>
                      <td className="px-4 py-3 text-slate-600">{darf.numeroReferencia}</td>
                      <td className="px-4 py-3 text-slate-600">{darf.dataVencimento}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(darf.valorPrincipal)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(darf.valorMulta)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(darf.valorJuros)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">
                        {formatCurrency(darf.valorTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {darfs.length > 0 && (
          <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Relatório consolidado</h3>

              <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-[900px] divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">Código da Receita</th>
                      <th className="px-4 py-3 text-right">Quantidade</th>
                      <th className="px-4 py-3 text-right">Principal</th>
                      <th className="px-4 py-3 text-right">Multa</th>
                      <th className="px-4 py-3 text-right">Juros</th>
                      <th className="px-4 py-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {summary.porCodigo.map((item) => (
                      <tr key={item.codigoReceita}>
                        <td className="px-4 py-3 font-medium text-slate-700">
                          {item.codigoReceita}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {item.quantidade}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatCurrency(item.valorPrincipal)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatCurrency(item.valorMulta)}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {formatCurrency(item.valorJuros)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900">
                          {formatCurrency(item.valorTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-semibold text-slate-900">
                    <tr>
                      <td className="px-4 py-3">Total geral</td>
                      <td className="px-4 py-3 text-right">{summary.totalGuias}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(summary.totalPrincipal)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(summary.totalMulta)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(summary.totalJuros)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(summary.totalGeral)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Resumo rápido</h3>
                <dl className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <dt>Quantidade de guias</dt>
                    <dd className="font-semibold text-slate-900">{summary.totalGuias}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Total do principal</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatCurrency(summary.totalPrincipal)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Total de multa</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatCurrency(summary.totalMulta)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Total de juros</dt>
                    <dd className="font-semibold text-slate-900">
                      {formatCurrency(summary.totalJuros)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                    <dt>Valor total</dt>
                    <dd className="text-lg font-bold text-slate-900">
                      {formatCurrency(summary.totalGeral)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Gerar arquivo remessa</h3>
                <p className="mt-1 text-sm text-slate-500">
                  O vencimento vai do PDF. A data de pagamento carrega automaticamente com a data de hoje.
                </p>

                <button
                  type="button"
                  onClick={handleGenerateRemittance}
                  className="mt-4 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                >
                  Validar e gerar remessa
                </button>

                {validationMessage && (
                  <div
                    className={`mt-4 rounded-md border px-4 py-3 text-sm ${
                      validationMessage.includes("sucesso")
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    {validationMessage}
                  </div>
                )}
              </div>

              {(diagNotes.length > 0 || diagErrors.length > 0) && (
                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-900">Mini-validador CNAB 240</h3>

                  {diagErrors.length > 0 ? (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      <p className="font-semibold">Atenção — foram encontrados problemas</p>
                      <ul className="mt-2 list-inside list-disc space-y-1">
                        {diagErrors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                      <p className="font-semibold">OK — sem erros detectados</p>
                    </div>
                  )}

                  {diagNotes.length > 0 && (
                    <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <p className="font-semibold">Notas</p>
                      <ul className="mt-2 list-inside list-disc space-y-1">
                        {diagNotes.map((note, index) => (
                          <li key={index}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}