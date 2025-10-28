export interface DarfRecord {
  id: string;
  nome: string;
  periodoApuracao: string;
  cnpj: string;
  codigoReceita: string;
  numeroReferencia: string;
  dataVencimento: string;
  valorPrincipal: number;
  valorMulta: number;
  valorJuros: number;
  valorTotal: number;
}

export interface CompanyInfo {
  banco: string;
  agencia: string;
  dvAgencia: string;
  conta: string;
  dvConta: string;
  convenio: string;
  empresa: string;
  cnpj: string;
}
