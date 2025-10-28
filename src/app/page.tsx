"use client";

import { useMemo, useState } from "react";
import { CompanyInfo, DarfRecord } from "@/types/darf";
import { generateSantanderRemittance } from "@/utils/remittance";

const initialCompany: CompanyInfo = {
  banco: "033",
  agencia: "",
  dvAgencia: "",
  conta: "",
  dvConta: "",
  convenio: "",
  empresa: "",
  cnpj: "",
};

const bankOptions = [
  { label: "Banco Santander", value: "033" },
];

function formatCurrency(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function sanitizeDocument(value: string) {
  return value.replace(/\D/g, "");
}

function validateCompany(company: CompanyInfo) {
  const missing: string[] = [];
  if (!company.banco) missing.push("Banco");
  if (!company.agencia) missing.push("AgÃªncia");
  if (!company.dvAgencia) missing.push("DV da agÃªncia");
  if (!company.conta) missing.push("Conta");
  if (!company.dvConta) missing.push("DÃ­gito da conta");
  if (!company.convenio) missing.push("ConvÃªnio");
  if (!company.empresa) missing.push("Empresa");
  if (!company.cnpj) missing.push("CNPJ");
  return missing;
}

export default function Home() {
  const [company, setCompany] = useState<CompanyInfo>(initialCompany);
  const [darfs, setDarfs] = useState<DarfRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  const summary = useMemo(() => {
    const byCodigo = new Map<string, {
      codigoReceita: string;
      quantidade: number;
      valorPrincipal: number;
      valorMulta: number;
      valorJuros: number;
      valorTotal: number;
    }>();

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

  const handleCompanyChange = (field: keyof CompanyInfo, value: string) => {
    setCompany((current) => ({ ...current, [field]: value }));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    setValidationMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/darfs/parse", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.message ?? "Falha ao processar o arquivo enviado.");
      }

      const sanitizedDarfs: DarfRecord[] = payload.darfs.map((darf: DarfRecord) => ({
        ...darf,
        cnpj: sanitizeDocument(darf.cnpj),
      }));

      setDarfs(sanitizedDarfs);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "NÃ£o foi possÃ­vel analisar o arquivo enviado.";
      setErrorMessage(message);
      setDarfs([]);
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const handleGenerateRemittance = () => {
    const missingFields = validateCompany(company);
    if (missingFields.length > 0) {
      setValidationMessage(`Preencha os campos obrigatÃ³rios: ${missingFields.join(", ")}.`);
      return;
    }

    if (!darfs.length) {
      setValidationMessage("Importe um PDF com ao menos uma guia de DARF antes de gerar a remessa.");
      return;
    }

    const remittance = generateSantanderRemittance(company, darfs);
    const blob = new Blob([remittance], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
    link.href = url;
    link.download = `REM_${timestamp}.rem`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    setValidationMessage("Arquivo de remessa gerado com sucesso!");
  };

  const handleReset = () => {
    setDarfs([]);
    setErrorMessage(null);
    setValidationMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
              Conversor de DARF para Arquivo CNAB
            </h1>
            <p className="text-sm text-slate-500 sm:text-base">
              Importe um PDF com suas guias de DARF sem cÃ³digo de barras, visualize o relatÃ³rio
              consolidado e gere o arquivo de remessa para o Banco Santander.
            </p>
          </div>
          <div className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            VersÃ£o 1.0 Â· Santander
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">InformaÃ§Ãµes para o arquivo CNAB</h2>
          <p className="mt-1 text-sm text-slate-500">
            Preencha os dados obrigatÃ³rios conforme o convÃªnio estabelecido com o banco.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Banco
              <select
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-slate-500 focus:outline-none"
                value={company.banco}
                onChange={(event) => handleCompanyChange("banco", event.target.value)}
              >
                {bankOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              AgÃªncia
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.agencia}
                onChange={(event) => handleCompanyChange("agencia", event.target.value)}
                placeholder="0000"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              DÃ­gito da AgÃªncia
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.dvAgencia}
                onChange={(event) => handleCompanyChange("dvAgencia", event.target.value)}
                placeholder="0"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Conta
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.conta}
                onChange={(event) => handleCompanyChange("conta", event.target.value)}
                placeholder="000000"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              DÃ­gito da Conta
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.dvConta}
                onChange={(event) => handleCompanyChange("dvConta", event.target.value)}
                placeholder="0"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              ConvÃªnio
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.convenio}
                onChange={(event) => handleCompanyChange("convenio", event.target.value)}
                placeholder="Informe o convÃªnio"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              Empresa
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.empresa}
                onChange={(event) => handleCompanyChange("empresa", event.target.value)}
                placeholder="Nome da empresa"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm font-medium text-slate-600">
              CNPJ
              <input
                className="rounded-md border border-slate-300 px-3 py-2 focus:border-slate-500 focus:outline-none"
                value={company.cnpj}
                onChange={(event) => handleCompanyChange("cnpj", event.target.value)}
                placeholder="00.000.000/0000-00"
              />
            </label>
          </div>
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Importar PDF de DARF</h2>
              <p className="text-sm text-slate-500">
                O arquivo deve conter guias sem cÃ³digo de barras. Cada upload substitui os dados atuais.
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
                  Limpar relatÃ³rio
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
            <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Nome</th>
                    <th className="px-4 py-3 text-left">PerÃ­odo</th>
                    <th className="px-4 py-3 text-left">CNPJ</th>
                    <th className="px-4 py-3 text-left">CÃ³d. Receita</th>
                    <th className="px-4 py-3 text-left">ReferÃªncia</th>
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
                      <td className="px-4 py-3 text-right font-medium text-slate-700">
                        {formatCurrency(darf.valorPrincipal)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(darf.valorMulta)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(darf.valorJuros)}</td>
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
              <h3 className="text-lg font-semibold text-slate-900">RelatÃ³rio consolidado</h3>
              <p className="mt-1 text-sm text-slate-500">
                Totais por cÃ³digo de receita com detalhamento de principal, multa, juros e valor total.
              </p>

              <div className="mt-6 overflow-hidden rounded-lg border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">CÃ³digo da Receita</th>
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
                        <td className="px-4 py-3 font-medium text-slate-700">{item.codigoReceita}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{item.quantidade}</td>
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
                <h3 className="text-lg font-semibold text-slate-900">Resumo rÃ¡pido</h3>
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
                    <dd className="font-semibold text-slate-900">{formatCurrency(summary.totalMulta)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt>Total de juros</dt>
                    <dd className="font-semibold text-slate-900">{formatCurrency(summary.totalJuros)}</dd>
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
                  Revise as informaÃ§Ãµes antes de validar. O arquivo serÃ¡ gerado no padrÃ£o CNAB 240 do
                  Santander.
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
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
