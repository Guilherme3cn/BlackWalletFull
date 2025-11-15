# BlackVault Wallet (Expo)

Aplicativo mobile construido com Expo e React Native para gerenciamento de uma cold wallet Bitcoin diretamente no dispositivo.

## Principais recursos
Ficha Técnica — BlackWalletFull

Categoria: Carteira Bitcoin (open source)
Proposta de valor: Uma carteira gratuita voltada à comunidade bitcoiner, reunindo em um único app três modos de uso — Offline (fria) para máxima segurança, Online para praticidade (consultas e envio da transação sem assinar), e Completo (assina e transmite no próprio app), com transparência sobre o trade-off de segurança. 
GitHub

Principais recursos

Três modos no mesmo app

Modo Offline (Cold/Frio): geração e custódia de chaves/seed e assinatura offline; o arquivo/QR da transação assinada é levado para transmissão em um dispositivo conectado.

Modo Online: consulta de saldo e criação/transmissão de transações sem assinar (delegando a assinatura para o dispositivo offline).

Modo Completo: gera chaves, assina e transmite no próprio app (mais prático, porém menos seguro).

Gratuito e de código aberto: foco em acessibilidade e colaboração da comunidade. 
GitHub

Multi-dispositivo: pensado para fluxo “air-gapped” (ex.: celular offline + celular/PC online). (TBD detalhamento por plataforma)

Privacidade por padrão: sem coleta desnecessária de dados pessoais. (TBD política de privacidade)

Segurança (visão geral recomendada)

Custódia própria: chaves privadas ficam somente no dispositivo offline (modo frio).

Assinatura offline: uso de PSBT (Partially Signed Bitcoin Transaction) para levar a transação entre dispositivos via arquivo/QR. (Recomendação técnica; confirme na implementação)

Seeds/Backups: compatibilidade com BIP-39 (mnemônico) e BIP-32/44/84 (derivações HD) — recomendado para interoperabilidade. (Sugerido; confirmar no código)

Bloqueio por PIN/biometria no app (TBD) e criptografia local de dados sensíveis (TBD).

Aviso transparente de risco ao usar o Modo Completo (assinatura em dispositivo online).

Arquitetura (alto nível)

Camada Offline (Signer): gera seed/XPUB, deriva endereços, assina PSBT.

Camada Online (Broadcaster/Watcher): consulta blockchain (via nó próprio, Electrum, ou API de terceiros — TBD), monta e transmite transações.

Canal de transporte PSBT: arquivo/QR entre as camadas (air-gap).

Módulos utilitários: carteira HD, gerenciamento de contatos/etiquetas (TBD), exportação/importação de backups.

Fluxos principais

Receber BTC

App (online ou offline) exibe endereço/QR;

Rede confirma;

App mostra saldo atualizado (via nó/API, TBD).

Enviar com segurança (recomendado)

Dispositivo online monta PSBT (sem chaves);

Dispositivo offline assina a PSBT;

Dispositivo online transmite para a rede.

Enviar no Modo Completo (prático)

App cria e assina internamente;

App transmite;

Mostra status/ID da transação.

Compatibilidade e padrões (propostos)

Redes: Bitcoin mainnet e testnet (TBD).

Endereços: bech32 (SegWit nativo) e compatibilidade legada (TBD).

Padrões: BIP-21 (URIs), BIP-174 (PSBT), BIP-39/32/44/84 (TBD conforme implementação).

Sincronização: SPV/Electrum/Full-node remoto (TBD).

Transparência & comunidade

Repositório público: acompanhamento aberto do desenvolvimento, issues e PRs. 
GitHub

Licença: TBD (o repositório não exibe “Releases” nem arquivo de licença no momento). 
GitHub

Roadmap público: sugerido criar milestones (ex.: PSBT via QR, integração Electrum, Testnet, backups criptografados, traduções).

Requisitos (TBD)

Plataformas: Android / iOS / Desktop (especificar).

Mínimos de SO: indicar versões.

Dependências: libs Bitcoin, scanner de QR, armazenamento seguro.

Diferenciais

Tudo-em-um: frio, online e completo, com educação de risco por modo.

“Air-gap first”: pensado para quem prioriza segurança sem abrir mão de praticidade.

Open source: auditável e expansível pela comunidade. 
GitHub

Avisos legais

O Bitcoin envolve risco de perda financeira; você é responsável pela custódia da sua seed e transações.

O Modo Completo reduz segurança por manter chaves em dispositivo conectado. Use preferencialmente o fluxo offline para valores relevantes.

## Stack

- Expo SDK 51 (React Native 0.74)
- React Navigation (stack nativo)
- AsyncStorage para persistencia local
- Bibliotecas @scure para operacoes com Bitcoin (BIP32/BIP39)

## Como executar

```sh
npm install
npm start
```

O comando `npm start` abre o Expo CLI, permitindo rodar no Expo Go (Android/iOS) ou emulador. Tambem estao disponiveis:

```sh
npm run android   # build nativo ou Expo Go (Android)
npm run ios       # build nativo ou Expo Go (iOS)
npm run web       # executa com Expo Web
```

## Estrutura de pastas

- `App.js`: ponto de entrada com React Navigation.
- `src/screens`: telas de Login, SignUp e Home.
- `src/components`: componentes reutilizaveis (WalletCard, SeedPhrase).
- `src/utils/crypto.js`: funcoes para gerar frase semente, derivar endereco e consultar saldo.
- `src/theme`: tokens de estilos compartilhados.

## Observacoes

- Este projeto e totalmente mobile; configuracoes e arquivos do antigo app web foram removidos.
- Antes de liberar em producao, execute `expo prebuild` se precisar gerar projetos nativos para lojas.
