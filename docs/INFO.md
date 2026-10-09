# iChrysostom — mapa estrutural e guia de manutenção

Este documento descreve a implementação que existe neste repositório. Ele é um mapa para manutenção: mostra onde ficam as rotas, o HTML, os estilos, o banco, os testes e os arquivos necessários para publicar na Cloudflare.

## 1. Visão geral

O iChrisostom é um monólito serverless. O mesmo projeto contém:

- páginas públicas renderizadas no servidor;
- área administrativa protegida por sessão;
- Pages Functions em TypeScript;
- banco Cloudflare D1, com SQLite;
- arquivos estáticos publicados pelo Cloudflare Pages;
- migrações SQL executadas pelo Wrangler.

Não há servidor Node permanente, frontend separado, API pública independente ou framework de interface. O navegador solicita uma URL, a Pages Function consulta o D1 e devolve HTML pronto. CSS e pequenos scripts estáticos são servidos pelo Pages.

## 2. Árvore real do projeto

```text
ichrysostom/
├── functions/
│   ├── [[path]].ts
│   └── _lib/
│       ├── security.ts
│       ├── types.ts
│       ├── util.ts
│       └── views.ts
├── migrations/
│   ├── 0001_initial.sql
│   ├── 0002_seed_categories.sql
│   ├── 0003_book_cover_url.sql
│   └── 0004_login_events.sql
├── public/
│   ├── _routes.json
│   ├── cover-images.js
│   ├── style.css
│   └── .gitkeep
├── scripts/
│   ├── admin-smoke.mjs
│   ├── audit-images.mjs
│   ├── banner-smoke.mjs
│   ├── cover-smoke.mjs
│   ├── init-admin.mjs
│   └── loan-smoke.mjs
├── tests/
│   ├── d1.integration.test.ts
│   ├── deletions.integration.test.ts
│   ├── node-shims.d.ts
│   ├── security.test.ts
│   └── util.test.ts
├── docs/
│   ├── ARCHITECTURE.md 
│   ├── PLAN.md
│   ├── STEPS.MD
│   └── INFO.md
├── backups/
│   └── d1-local-20261008-211313.sql
├── .dev.vars
├── .dev.vars.example
├── .gitignore
├── LICENSE
├── package.json
├── package-lock.json
├── README.md
├── README.en.md
├── tsconfig.json
└── wrangler.jsonc
```

Diretórios gerados e grandes não aparecem nessa árvore: `node_modules/`, `.wrangler/` e `.git/`. Eles existem no ambiente de desenvolvimento, mas não são código da aplicação. `node_modules/` contém dependências instaladas; `.wrangler/` contém o estado local do D1 e do Wrangler; `.git/` contém o histórico do repositório.

### `functions/`

**Finalidade:** contém o código executado no runtime Cloudflare Workers pelas Pages Functions.

**Conteúdo:** a rota coringa `[[path]].ts` e o subdiretório `_lib/` com segurança, tipos, utilitários e geração de HTML.

**Funcionamento:** qualquer requisição que não seja excluída por `public/_routes.json` passa pela função. Ela identifica o caminho, autentica quando necessário, consulta o D1 e devolve HTML, CSV, imagens ou redirecionamentos.

**Dependências:** usa o binding `env.DB` definido em `wrangler.jsonc`, os tipos do pacote `@cloudflare/workers-types` e os módulos de `_lib/`.

**Pode excluir?** Não. Sem essa pasta, o catálogo, o login e a administração deixam de existir no deploy. O nome `[[path]].ts` segue a convenção de rota catch-all das Pages Functions.

#### `functions/[[path]].ts`

É o ponto de entrada HTTP da aplicação e exporta `onRequest`. Também contém a função interna `admin` e os pequenos geradores de formulários administrativos.

As responsabilidades estão agrupadas assim:

- `/`: catálogo público, busca por título/autor e filtro por categoria;
- `/livros/:id`: detalhes públicos de um livro;
- `/imagens/:id`: entrega pública dos BLOBs de banner com MIME correto;
- `/login`, `/logout`: autenticação e encerramento da sessão;
- `/admin`: painel e contadores;
- `/admin/livros`, `/admin/livros/novo`, `/admin/livros/:id/editar`: livros;
- `/admin/livros/:id/exemplares` e `/admin/exemplares/:id/alternar`: exemplares;
- `/admin/categorias`: categorias;
- `/admin/emprestimos`, `/admin/emprestimos/novo`: empréstimos, filtros e devoluções;
- `/admin/configuracao`: identidade visual e upload do banner;
- `/admin/livros.csv`: exportação do catálogo;
- `/admin/acessos`: histórico de login;
- `/admin/seguranca/senha`: alteração de senha.

As operações de escrita usam POST, CSRF e SQL parametrizado. A exclusão de livros remove empréstimos e exemplares relacionados em lote; a exclusão de históricos só aceita empréstimos devolvidos; o banner é limpo quando deixa de ter referência.

#### `functions/_lib/security.ts`

Implementa a segurança que é compartilhada pelas rotas:

- hash e verificação de senha com PBKDF2-SHA-256, salt aleatório e 100.000 iterações;
- geração de IDs de sessão e tokens CSRF;
- leitura do cookie de sessão e busca do usuário no D1;
- cookie `HttpOnly`, `SameSite=Strict`, `Secure` e expiração;
- verificação de origem e token CSRF.

Não deve receber senhas em logs nem ser substituído por uma verificação no navegador.

#### `functions/_lib/types.ts`

Declara os tipos TypeScript usados pelo código: `Env`, `User`, `Settings`, `Book`, `Copy`, `Loan`, `Category`, `LoginEvent`, `ImageRow` e linhas de bibliotecário. Também define o fuso `America/Sao_Paulo`.

#### `functions/_lib/util.ts`

Contém funções pequenas e reutilizadas:

- `esc`: escape de valores inseridos no HTML;
- `redirect`: resposta HTTP 303;
- `today`: data no fuso da biblioteca;
- `isColor` e `isImage`: validações de configuração e upload;
- `httpsUrl`: validação de URLs externas de capas;
- `csvCell`: escape e proteção contra fórmulas em CSV;
- `layout`: documento HTML base, cabeçalho público, rodapé, CSP e carregamento dos estilos.

#### `functions/_lib/views.ts`

É o principal módulo de apresentação. Monta strings HTML com escape dos dados:

- `publicHome`: hero, pesquisa, categorias, catálogo e estado vazio;
- `bookPage`: detalhes públicos de um livro;
- `loginPage`: formulário de login;
- `adminPage`: estrutura da área administrativa;
- `formatAvailability`: regra central de singular/plural da disponibilidade;
- funções internas de placeholder, capas por URL, cartões e disponibilidade.

### `migrations/`

**Finalidade:** histórico versionado do esquema do D1. O Wrangler registra quais migrações foram aplicadas e executa cada arquivo uma vez por banco.

**Pode excluir?** Não se o banco já depender delas. Remover uma migração do repositório não desfaz o que foi aplicado e pode impedir a reconstrução de um banco novo. Migrações aplicadas devem ser preservadas; mudanças futuras devem usar novos arquivos numerados.

#### `0001_initial.sql`

Cria as tabelas principais, índices, chaves estrangeiras, a regra cronológica de que a devolução não pode anteceder a retirada e o índice único parcial `one_active_loan_per_copy`. A migração histórica 0001 possuía também um limite de 14 dias; ele foi removido pela migração [`0006_remove_loan_duration_limit.sql`](../migrations/0006_remove_loan_duration_limit.sql). Também insere a configuração inicial da biblioteca.

Tabelas criadas:

- `images`: BLOBs pequenos, atualmente usados pelo banner;
- `settings`: nome, título, cor e referência do banner;
- `categories`: categorias do acervo;
- `books`: obras, arquivamento e referência legada de imagem;
- `copies`: exemplares físicos;
- `loans`: empréstimos e devoluções;
- `librarians`: contas administrativas;
- `sessions`: sessões e tokens CSRF.

#### `0002_seed_categories.sql`

Insere categorias iniciais com `INSERT OR IGNORE`, sem impedir categorias adicionais.

#### `0003_book_cover_url.sql`

Adiciona `books.cover_url`. Capas novas são URLs HTTPS armazenadas como texto; elas não são baixadas pelo servidor. `cover_image_id` permanece no esquema por compatibilidade com dados legados.

#### `0004_login_events.sql`

Cria `login_events` e seu índice de data. Registra sucesso ou falha de autenticação sem senha, cookie, token ou IP. A aplicação mantém os últimos 180 dias durante novos logins e exibe até 100 registros na administração.

### `public/`

**Finalidade:** arquivos estáticos publicados pelo Pages.

#### `public/style.css`

Folha de estilos única. Contém variáveis visuais, tipografia, layout público, hero, pesquisa, categorias, cartões, detalhes, login e estilos administrativos. As regras de responsividade ficam nas media queries de `680px` e `900px`. A cor `--primary` é sobrescrita pelo `<style>` gerado em `layout` com a cor salva em `settings`.

#### `public/cover-images.js`

Script pequeno do navegador para capas externas. Quando uma imagem URL falha, esconde a imagem e mostra o placeholder já renderizado no HTML. Não é framework e não armazena imagens.

#### `public/_routes.json`

Diz ao Pages para não encaminhar `/style.css` e `/cover-images.js` à função catch-all. Essa exceção é importante: sem ela, os arquivos estáticos poderiam receber HTML da função em vez de CSS ou JavaScript.

#### `public/.gitkeep`

Marcador vazio de diretório. Não participa do runtime quando já existem outros arquivos em `public`; pode ser removido sem afetar a aplicação, embora seja inofensivo mantê-lo.

### `scripts/`

São ferramentas locais, não rotas publicadas.

- `init-admin.mjs`: gera SQL com hash PBKDF2 para criar ou atualizar a primeira conta. Não executa o SQL sozinho.
- `admin-smoke.mjs`: fluxo autenticado de painel, pesquisa, CSV, acessos e alteração de senha.
- `banner-smoke.mjs`: upload, armazenamento, substituição, leitura e remoção do banner.
- `cover-smoke.mjs`: cadastro e edição de capas por URL HTTPS e rejeição de upload antigo.
- `loan-smoke.mjs`: fluxo de livro, exemplar, empréstimo, indisponibilidade e devolução.
- `audit-images.mjs`: auditoria de `images`. Sem argumentos é dry-run; a exclusão exige `--apply --confirm-cleanup --ids=...`.

Scripts de smoke podem criar registros no D1 local. Use uma base isolada ou revise o resultado depois. `audit-images.mjs` pode excluir BLOBs definitivamente; IDs devem ser revisados e um backup deve existir antes de usar `--apply`.

### `tests/`

Testes executados pelo Vitest:

- `d1.integration.test.ts`: fluxo integrado com Wrangler/D1 local;
- `deletions.integration.test.ts`: exclusão de livros, exemplares e históricos;
- `security.test.ts`: hash e verificação de senha;
- `util.test.ts`: escape, CSV e disponibilidade;
- `node-shims.d.ts`: declarações auxiliares para APIs Node usadas nos testes.

Eles são importantes para manutenção, mas não são enviados como site publicado.

### `docs/`

Documentação humana do projeto:

- `ARCHITECTURE.md`: histórico da decisão arquitetural, incluindo a arquitetura Java abandonada;
- `PLAN.md`: plano resumido original;
- `STEPS.MD`: registro de etapas do desenvolvimento;
- `INFO.md`: este mapa estrutural.

### Arquivos da raiz

- `package.json`: scripts npm e dependências de desenvolvimento.
- `package-lock.json`: versões exatas resolvidas pelo npm; deve acompanhar o `package.json`.
- `wrangler.jsonc`: nome Pages, diretório publicado, binding D1 e diretório de migrações. O `database_id` ainda é um placeholder neste repositório e precisa ser preenchido antes do deploy remoto.
- `tsconfig.json`: compilação TypeScript estrita, sem emissão de arquivos. Inclui `functions/**/*.ts`, `src/**/*.ts` e `tests/**/*.ts`; a pasta `src/` não existe atualmente, portanto essa entrada é apenas uma inclusão futura sem conteúdo.
- `.dev.vars.example`: modelo de variáveis locais sem segredos.
- `.dev.vars`: variáveis locais reais, ignoradas pelo Git; nunca publicar seu conteúdo.
- `.gitignore`: exclui dependências, estado local do Wrangler, variáveis sensíveis, `dist` e `.env`.
- `README.md` e `README.en.md`: instruções em português e inglês.
- `LICENSE`: licença do projeto.

## 3. O que é necessário para publicar?

### A. Essenciais para a aplicação

- `functions/`: Pages Functions e regras de negócio;
- `public/style.css`, `public/cover-images.js` e `public/_routes.json`: apresentação e entrega correta dos estáticos;
- `wrangler.jsonc`: configuração de Pages, D1 e migrações;
- `migrations/`: esquema que precisa existir no banco remoto;
- `package.json` e `package-lock.json`: necessários para instalar Wrangler e executar o processo de publicação;
- `functions/_lib/`: dependências internas do backend.

O Pages publica `public/` como `pages_build_output_dir` e reconhece automaticamente `functions/`. O D1 não é criado ou migrado automaticamente pelo simples upload: o banco deve ser criado e as migrações remotas aplicadas separadamente.

### B. Necessários para desenvolvimento

- `tests/`: validação automatizada;
- `scripts/`: smoke tests, geração da conta inicial e auditoria;
- `tsconfig.json`: `typecheck` e compilação de verificação;
- `.dev.vars.example`: orientação para configurar o ambiente local;
- `.dev.vars`: necessário apenas localmente e deve permanecer privado.

Esses arquivos não precisam ser parte do artefato estático, mas não devem ser removidos do repositório sem uma decisão de manutenção.

### C. Documentação e ferramentas auxiliares

- `docs/`, `README.md`, `README.en.md` e `LICENSE` não são consumidos pelo navegador em produção;
- `scripts/` ajuda a operar e validar o sistema;
- `backups/` guarda uma exportação local feita durante a manutenção.

O backup contém dados do banco e BLOBs. Deve ser tratado como arquivo privado, não publicado nem exposto em um repositório público.

### D. Gerados ou temporários

- `node_modules/`: regenerável com `npm install`;
- `.wrangler/`: estado local regenerável, incluindo D1 local;
- `.git/`: histórico local do Git, não faz parte do deploy;
- `dist/`: não é usado pelos scripts atuais e está ignorado;
- `.env`: ignorado e não usado como substituto documentado de `.dev.vars`.

Eles podem ser removidos em um ambiente local quando não houver processo em execução, mas isso apaga estado local ou exige reinstalação/regeneração. Não remova `.wrangler/` sem entender que o D1 local também poderá ser perdido.

### Tabela de decisão

| Arquivo ou pasta | Função | Necessário para deploy? | Pode excluir do projeto? | Consequência |
|---|---|---:|---:|---|
| `functions/` | Rotas e backend | Sim | Não | A aplicação deixa de responder às rotas dinâmicas |
| `functions/_lib/` | Segurança, tipos, HTML e utilitários | Sim | Não | Falha de compilação ou perda de funcionalidades |
| `public/` | Estáticos publicados | Sim | Não | CSS, fallback de capas e arquivos públicos deixam de existir |
| `public/_routes.json` | Libera estáticos da catch-all | Sim | Não | CSS/JS podem ser interceptados pela Function |
| `migrations/` | Histórico do esquema D1 | Operacionalmente sim | Não | Impossível recriar/aplicar corretamente o banco novo |
| `wrangler.jsonc` | Configuração Pages/D1 | Sim para publicar via Wrangler | Não | Binding, diretório e migrações ficam sem configuração |
| `package.json` | Scripts e dependências | Sim para o processo local de deploy | Não | `npm run deploy` e comandos de manutenção deixam de existir |
| `package-lock.json` | Resolução reprodutível | Recomendado | Não | Instalações podem usar versões diferentes |
| `tests/` | Testes automatizados | Não | Tecnicamente sim, mas não recomendado | Perda de verificação de regressões |
| `scripts/` | Operação e smoke tests | Não | Tecnicamente sim, mas não recomendado | Perda de inicialização, auditoria e validações auxiliares |
| `docs/` | Documentação | Não | Sim, com perda de contexto | O site continua, mas a manutenção fica mais difícil |
| `README*.md` | Instruções | Não | Sim, com perda de orientação | O código continua executável |
| `.dev.vars` | Segredos locais | Não | Sim, apenas se não precisar do ambiente local | Perda das credenciais/configurações locais; nunca publicar |
| `.dev.vars.example` | Modelo de configuração | Não | Não recomendado | Novos desenvolvedores ficam sem referência |
| `node_modules/` | Dependências instaladas | Não | Sim, regenerável | É preciso executar `npm install` novamente |
| `.wrangler/` | Estado D1/Workers local | Não | Sim, com cautela | O banco local e caches podem ser perdidos |
| `backups/` | Exportação SQL local | Não | Apenas após política de retenção | Perda da cópia de recuperação local |

## 4. Onde está o HTML?

Não existem arquivos `.html` de páginas. O HTML é montado em strings TypeScript no servidor.

| Quero modificar... | Arquivo | Função ou localização |
|---|---|---|
| Título da página inicial | `functions/_lib/views.ts` | `publicHome`, `h1` com `settings.site_title` |
| Texto de apresentação | `functions/_lib/views.ts` | `publicHome`, parágrafo `.hero-intro` |
| Cabeçalho público | `functions/_lib/util.ts` | `layout`, variável `publicHeader` |
| Rodapé público | `functions/_lib/util.ts` | `layout`, bloco `.site-footer` |
| Pesquisa da home | `functions/_lib/views.ts` | `publicHome`, formulário `.search-bar` |
| Categorias da home | `functions/_lib/views.ts` | `publicHome`, `categoryLinks` |
| Cartões dos livros | `functions/_lib/views.ts` | `catalogCard` e `cover` |
| Página de detalhes | `functions/_lib/views.ts` | `bookPage` |
| Login | `functions/_lib/views.ts` | `loginPage` |
| Painel administrativo | `functions/_lib/views.ts` e `functions/[[path]].ts` | `adminPage` e rota `/admin` |
| Formulário de livro | `functions/[[path]].ts` | `bookForm` |
| Formulário de empréstimo | `functions/[[path]].ts` | `loanForm` |
| Formulário de configuração | `functions/[[path]].ts` | `settingsForm` |
| Mensagens de erro e botões | `functions/[[path]].ts` e `functions/_lib/views.ts` | textos literais nas respostas e views |

Há duas fontes de conteúdo:

- textos fixos, como labels, mensagens e apresentação, estão nas views TypeScript;
- nome da biblioteca, título, cor, categorias, livros, descrições e responsáveis vêm do D1 ou dos formulários administrativos.

Assim, o nome da biblioteca e o título do site devem ser alterados em `/admin/configuracao`, não no código. Uma mensagem fixa ou um texto editorial da home exige alteração em `views.ts`.

## 5. Onde está o CSS?

O arquivo visual principal é `public/style.css`. Ele reúne o tema claro atual e os estilos de todas as áreas.

Atalhos dentro do arquivo:

- início do arquivo: variáveis `:root`, reset, tipografia base e acessibilidade;
- `.site-header`, `.site-brand`, `.site-nav`: cabeçalho público;
- `.hero-section`, `.hero-copy`, `.hero-visual`, `.hero-pattern`: apresentação e placeholder do banner;
- `.hero-banner-image`: imagem do banner real;
- `.search-bar`: pesquisa;
- `.category-strip`, `.category-chip`: categorias;
- `.book-grid`, `.book-card`, `.book-cover`, `.book-card-content`: catálogo;
- `.book-detail`, `.detail-copy`, `.book-meta`: detalhe do livro;
- `.site-footer`: rodapé;
- `.auth-shell`, `.auth-card`: login;
- `.admin-shell`, `.admin-sidebar`, `.admin-content` e classes com prefixo `admin-`: administração;
- media queries `max-width:900px` e `max-width:680px`: responsividade;
- bloco `/* Refinamento editorial da área pública */`: ajustes visuais recentes específicos da área pública.

As variáveis iniciais incluem `--primary`, `--ink`, `--ink-soft`, `--cream`, `--paper`, `--line`, `--gold`, `--success` e `--danger`. A cor principal configurada pelo bibliotecário é inserida dinamicamente por `layout` como `:root{--primary:...}`. Portanto, não substitua esse mecanismo por uma cor fixa se a personalização precisar continuar funcionando.

## 6. Onde está o JavaScript e o TypeScript?

### Código no servidor

Todo o TypeScript de `functions/` é executado nas Pages Functions. Ele recebe `Request`, usa `env.DB`, aplica as regras de segurança e devolve `Response`.

### Código no navegador

O único JavaScript de aplicação é `public/cover-images.js`. Ele roda depois que a página foi entregue e trata falhas de imagens externas de capas. Não há React, Vue, Angular, TypeScript compilado no navegador ou servidor Node permanente.

### Fluxo real

```text
Navegador
   ↓ HTTP
functions/[[path]].ts
   ↓ usa os módulos _lib/ e valida a sessão/CSRF
Cloudflare D1 pelo binding env.DB
   ↓ resultados SQL
views.ts + layout()
   ↓ HTML, redirecionamento, CSV ou imagem
Navegador
   ↓ carrega style.css e cover-images.js
Interface apresentada
```

`security.ts` cuida de senha e sessão; `util.ts` cuida de escape, validações, datas, CSV e documento base; `views.ts` cuida do HTML; `[[path]].ts` coordena rotas, consultas e gravações.

## 7. Onde está o banco de dados?

### Configuração

O binding está em `wrangler.jsonc`:

```json
"d1_databases": [{
  "binding": "DB",
  "database_name": "ichrysostom",
  "database_id": "COLOQUE_O_DATABASE_ID_AQUI",
  "migrations_dir": "migrations"
}]
```

O código acessa o banco como `env.DB`. O identificador remoto ainda precisa ser substituído pelo valor real da conta Cloudflare antes do deploy remoto.

### Tabelas

| Tabela | Uso |
|---|---|
| `settings` | Uma configuração da biblioteca e referência opcional do banner |
| `images` | BLOBs de banner; capas novas não usam esta tabela |
| `categories` | Categorias e descrições |
| `books` | Obras, autor, ISBN, descrição, `cover_url` e arquivamento |
| `copies` | Exemplares físicos e códigos |
| `loans` | Responsável, retirada, prazo e devolução |
| `librarians` | Contas administrativas e hash de senha |
| `sessions` | Sessões ativas e CSRF |
| `login_events` | Sucessos e falhas de login com retenção de 180 dias |

### Operações

- Consultas públicas: rota `/` e `bookPage` em `[[path]].ts`.
- Livros e exemplares: rotas administrativas e `bookForm` em `[[path]].ts`.
- Empréstimos/devoluções: rotas `/admin/emprestimos` e consultas com índice único parcial.
- Exclusões: rotas de livro, histórico e empréstimo em `[[path]].ts`, com CSRF e SQL parametrizado.
- Imagens: upload/substituição do banner em `/admin/configuracao` e leitura em `/imagens/:id`.

O D1 local é mantido pelo Wrangler no estado `.wrangler/`; o D1 remoto vive na conta Cloudflare. `--local` não altera produção. `--remote` exige um banco criado, `database_id` correto e autorização na conta. Migrações são o histórico do esquema, não arquivos descartáveis nem uma cópia automática dos dados.

## 8. Testes, ferramentas e backups

### Testes

`npm test` executa Vitest com um worker para evitar concorrência no SQLite local. Os testes de integração chamam o Wrangler e usam o D1 local; por isso podem ser mais lentos e podem inserir dados de teste.

`npm run typecheck` executa `tsc --noEmit`: verifica tipos sem criar JavaScript.

### Scripts de validação

```bash
npm run test:admin    # painel, pesquisa, CSV, acessos e senha
npm run test:banner   # ciclo do banner no D1 local
npm run test:covers   # capas por URL e rejeição do upload antigo
npm run test:loans    # empréstimo e devolução
npm run audit:images  # auditoria dry-run por padrão
```

`audit:images` não remove nada sem `--apply --confirm-cleanup --ids=...`. Ele verifica referências em `settings.banner_image_id` e no legado `books.cover_image_id`. Não execute a forma destrutiva sem backup e revisão dos IDs.

O diretório `backups/` atualmente contém uma exportação local SQL. Backups podem conter nomes, sessões históricas ou BLOBs; devem ser privados, não publicados e sujeitos a uma política de retenção.

## 9. Como executar e publicar

### Desenvolvimento local

Requisitos: Node.js e npm. O projeto não exige Docker, PostgreSQL ou servidor adicional.

```bash
npm install
cp .dev.vars.example .dev.vars
# edite .dev.vars com SESSION_SECRET e credenciais administrativas locais
npm run db:migrate:local
npx wrangler d1 execute ichrysostom --local --command "$(npm run admin:hash --silent)"
npm run typecheck
npm test
npm run dev
```

O comando `admin:hash` gera SQL usando `ADMIN_USERNAME`, `ADMIN_PASSWORD` e `ADMIN_NAME`; a senha não deve ser colocada no código ou no README. O `dev` usa `wrangler pages dev public` e, pela configuração local, costuma atender em `http://localhost:8788` quando a porta está livre.

Scripts de smoke normalmente esperam um servidor já iniciado e permitem trocar a URL com variáveis como `BANNER_BASE_URL`, `COVER_BASE_URL`, `LOAN_BASE_URL` e `ADMIN_BASE_URL`.

### Publicação na Cloudflare

Os passos documentados pelo projeto são:

```bash
npx wrangler d1 create ichrysostom
# copie o database_id para wrangler.jsonc
npm run db:migrate:remote
npx wrangler pages secret put SESSION_SECRET
# com ADMIN_USERNAME, ADMIN_PASSWORD e ADMIN_NAME configurados:
npx wrangler d1 execute ichrysostom --remote --command "$(npm run admin:hash --silent)"
npm run deploy
```

O deploy usa `public/` como diretório de arquivos estáticos e descobre `functions/` como Pages Functions. O binding `DB` liga as funções ao banco D1. As migrações remotas são uma etapa explícita e não devem ser substituídas por alterações manuais no banco.

Ainda dependem da conta Cloudflare:

- criação do D1 e obtenção de `database_id`;
- definição dos secrets;
- aplicação das migrações remotas;
- autorização para publicar;
- eventual conexão com GitHub/Pages.

O repositório não contém um `database_id` real nem afirma que o deploy foi realizado.

## 10. Onde alterar cada coisa?

| Objetivo | Arquivo ou interface |
|---|---|
| Alterar texto da home | `functions/_lib/views.ts`, função `publicHome` |
| Alterar nome da biblioteca | `/admin/configuracao` |
| Alterar título exibido no site | `/admin/configuracao` |
| Alterar banner | `/admin/configuracao` |
| Alterar URL de capa | `/admin/livros/novo` ou edição do livro |
| Alterar uma cor | `/admin/configuracao` para `primary_color`; `public/style.css` para paleta fixa |
| Alterar uma fonte | `public/style.css`, `body`, títulos `h1/h2/h3` e seletores específicos |
| Alterar o cabeçalho | `functions/_lib/util.ts`, `layout`; aparência em `.site-header` |
| Alterar o rodapé | `functions/_lib/util.ts`, `layout`; aparência em `.site-footer` |
| Alterar apresentação dos livros | `functions/_lib/views.ts`, `catalogCard`/`cover`; aparência em `.book-card` |
| Alterar o formulário de empréstimos | `functions/[[path]].ts`, `loanForm` e rota POST de empréstimo |
| Modificar a administração | `functions/_lib/views.ts`, `adminPage`, e rotas `admin` em `functions/[[path]].ts` |
| Modificar uma consulta ao banco | rota correspondente em `functions/[[path]].ts`; esquema em `migrations/` somente com nova migração |
| Acrescentar uma funcionalidade | rota em `functions/[[path]].ts`, view/util compartilhado se necessário, testes e nova migração se houver dados |
| Executar testes | `npm test`, `npm run typecheck` ou scripts `test:*` |
| Auditar imagens | `npm run audit:images` e `docs/IMAGE-AUDIT.md` |
| Publicar na Cloudflare | `wrangler.jsonc` e `npm run deploy`, após configurar D1/secrets |

### Cuidados antes de modificar

- Não remova migrações já aplicadas.
- Não coloque segredos em `public/`, README, testes ou logs.
- Não use GET para operações de escrita.
- Não altere `public/_routes.json` sem entender que ele controla quais arquivos passam pela catch-all.
- Não exclua `cover_image_id` sem uma estratégia de compatibilidade para dados legados.
- Não remova `one_active_loan_per_copy`: ele protege a regra de um empréstimo ativo por exemplar no banco.
- Ao alterar HTML em `views.ts`, mantenha `esc` para dados vindos do D1 ou de formulários.
- Ao adicionar tabelas, crie uma nova migração numerada e teste localmente antes de aplicar remotamente.
