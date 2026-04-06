import assert from "node:assert/strict";
import { parseDarfs } from "../src/utils/darf-parser.ts";
import { generateSantanderRemittance } from "../src/utils/remittance.ts";
import type { CompanyInfo } from "../src/types/darf";

const samplePdfText = `
MINISTÉRIO DA FAZENDA
SECRETARIA DA RECEITA FEDERAL DO BRASIL
Documento de Arrecadação de Receitas Federais
DARF
02
03
04
05
06
07
09
10
11
01 NOME / RAZÃO SOCIAL
PERÍODO DE APURAÇÃO
NÚMERO DO CPF OU CNPJ
CÓDIGO DA RECEITA
NÚMERO DE REFERÊNCIA
DATA DE VENCIMENTO
VALOR DO PRINCIPAL
VALOR DA MULTA
VALOR DOS JUROS E / OU
ENCARGOS DL - 1.025/69
VALOR TOTAL
AUTENTICAÇÃO BANCÁRIA (Somente nas 1a. e 2a. vias)
Data limite para acolhimento:
Observações:
0086
9175008
25/07/2022
1.869,99
373,99
858,88
3.102,86
06/04/2026
SENDA (Versão:1.4.3) 06/04/2026 08:24:27
39.614.753/0001-22
25/07/2022
1a. via
CENTILLION LTDA
08
Preenchim. cfm. valores inf. pelo contribuinte
Darf emitido pelo Sicalc Web
MINISTÉRIO DA FAZENDA
SECRETARIA DA RECEITA FEDERAL DO BRASIL
Documento de Arrecadação de Receitas Federais
DARF
02
03
04
05
06
07
09
10
11
01 NOME / RAZÃO SOCIAL
PERÍODO DE APURAÇÃO
NÚMERO DO CPF OU CNPJ
CÓDIGO DA RECEITA
NÚMERO DE REFERÊNCIA
DATA DE VENCIMENTO
VALOR DO PRINCIPAL
VALOR DA MULTA
VALOR DOS JUROS E / OU
ENCARGOS DL - 1.025/69
VALOR TOTAL
AUTENTICAÇÃO BANCÁRIA (Somente nas 1a. e 2a. vias)
Data limite para acolhimento:
Observações:
0086
9175008
25/07/2022
1.869,99
373,99
858,88
3.102,86
06/04/2026
SENDA (Versão:1.4.3) 06/04/2026 08:24:27
39.614.753/0001-22
25/07/2022
2a. via
CENTILLION LTDA
08
Preenchim. cfm. valores inf. pelo contribuinte
Darf emitido pelo Sicalc Web
`;

const company: CompanyInfo = {
  banco: "033",
  agencia: "3601",
  dvAgencia: "0",
  conta: "13004606",
  dvConta: "4",
  convenio: "4907424402",
  empresa: "CENTILLION LTDA",
  cnpj: "39614753000122",
};

const darfs = parseDarfs(samplePdfText);
assert.equal(darfs.length, 1);
assert.equal(darfs[0]?.codigoReceita, "0086");
assert.equal(darfs[0]?.numeroReferencia, "9175008");
assert.equal(darfs[0]?.dataVencimento, "25/07/2022");
assert.notEqual(darfs[0]?.dataVencimento, "06/04/2026");
assert.equal(darfs[0]?.cnpj, "39.614.753/0001-22");

const remittance = generateSantanderRemittance(company, [darfs[0]], "2026-04-06");
const detailLine = remittance.split(/\r?\n/)[2];
assert.equal(detailLine?.slice(87, 95), "06042026");
assert.equal(detailLine?.slice(204, 212), "25072022");

console.log("Validation OK");