# Carga Máquina — APS/MES

Sistema de planejamento e controle de produção com Next.js, Supabase e Netlify Functions.

## Desenvolvimento

Instale as dependências e inicie o ambiente integrado:

```bash
npm install
npm run dev
```

Abra [http://localhost:8888](http://localhost:8888). Essa porta passa pelo proxy do Netlify e disponibiliza as funções em `/.netlify/functions/*`. A porta `3000` é interna e não deve ser usada para testar o gerenciamento de usuários.

Para iniciar somente o Next.js, sem Netlify Functions, use `npm run dev:next`.

## Variáveis de ambiente

O frontend usa estas variáveis em `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-publica
```

O gerenciamento de usuários também exige uma chave administrativa, disponível somente para a Netlify Function:

```dotenv
SUPABASE_SECRET_KEY=sua-chave-secreta
```

Como compatibilidade com projetos antigos, também é aceita `SUPABASE_SERVICE_ROLE_KEY`. Nunca use o prefixo `NEXT_PUBLIC_` nessa chave e nunca a envie ao navegador ou versione o arquivo `.env.local`.

Em produção, configure `SUPABASE_SECRET_KEY` e `NEXT_PUBLIC_SUPABASE_URL` nas variáveis de ambiente do site na Netlify antes do deploy.

## Verificação

```bash
npm run lint
npm test
npm run build
```
