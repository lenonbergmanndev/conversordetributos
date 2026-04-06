export interface DarfRecord {
  id: string;
  nome: string;
  periodoApuracao: string; // DD/MM/AAAA
  cnpj: string;
  codigoReceita: string; // no PDF costuma vir 4 dígitos, no CNAB será preenchido em 6 posições
  numeroReferencia: string;
  dataVencimento: string; // DD/MM/AAAA
  valorPrincipal: number;
  valorMulta: number;
  valorJuros: number;
  valorTotal: number;
}

export interface CompanyInfo {
  banco: string; // normalmente 033
  agencia: string;
  dvAgencia: string;
  conta: string;
  dvConta: string;
  convenio: string;
  empresa: string;
  cnpj: string;
}

export interface ValidateRemittanceOptions {
  expectedBankCode?: string;
  expectedServiceType?: string;
  expectedLaunchType?: string;
  expectedPaymentDate?: string; // DD/MM/AAAA ou YYYY-MM-DD
  uiTotal?: number;
}

export interface ValidateResult {
  ok: boolean;
  notes: string[];
  errors: string[];
  debug?: Record<string, unknown>;
}