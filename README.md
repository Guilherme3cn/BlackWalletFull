# BlackVault Wallet (Expo)

Aplicativo mobile construido com Expo e React Native para gerenciamento de uma cold wallet Bitcoin diretamente no dispositivo.

## Principais recursos

- Gera frases BIP39 e deriva enderecos SegWit (BIP84) localmente.
- Consulta saldo on-chain pela API da Blockstream e converte para USD utilizando dados da CoinGecko.
- Exibe informacoes da carteira em layout otimizado para dispositivos moveis.
- Permite ocultar ou compartilhar a frase semente e regenerar a carteira com um toque.
- Recupera uma carteira existente a partir da frase semente diretamente pela tela de login.

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
