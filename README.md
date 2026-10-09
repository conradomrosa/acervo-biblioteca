# iChrysostom

<p align="center">
  <img src="./assets/logo.png"
       alt="Logo do iChrysostom"
       width="350">
</p>

<p align="center">
  <a href="https://www.typescriptlang.org/">
    <img src="https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  </a>
  <a href="https://developers.cloudflare.com/pages/">
    <img src="https://img.shields.io/badge/Cloudflare_Pages-F38020?style=for-the-badge&logo=cloudflarepages&logoColor=white" alt="Cloudflare Pages">
  </a>
  <a href="https://developers.cloudflare.com/workers/">
    <img src="https://img.shields.io/badge/Cloudflare_Workers-F38020?style=for-the-badge&logo=cloudflareworkers&logoColor=white" alt="Cloudflare Workers">
  </a>
  <a href="https://developers.cloudflare.com/d1/">
    <img src="https://img.shields.io/badge/Cloudflare_D1-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Cloudflare D1">
  </a>
  <a href="https://www.sqlite.org/">
    <img src="https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite">
  </a>
  <a href="https://developer.mozilla.org/pt-BR/docs/Web/HTML">
    <img src="https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white" alt="HTML5">
  </a>
  <a href="https://developer.mozilla.org/pt-BR/docs/Web/CSS">
    <img src="https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css&logoColor=white" alt="CSS3">
  </a>
  <a href="https://nodejs.org/">
    <img src="https://img.shields.io/badge/Node.js-5FA04E?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  </a>
  <a href="https://www.npmjs.com/">
    <img src="https://img.shields.io/badge/npm-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="npm">
  </a>
  <a href="https://developers.cloudflare.com/workers/wrangler/">
    <img src="https://img.shields.io/badge/Wrangler-F38020?style=for-the-badge&logo=cloudflare&logoColor=white" alt="Wrangler">
  </a>
  <a href="https://vitest.dev/">
    <img src="https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white" alt="Vitest">
  </a>
</p>

**Uma biblioteca de igreja, acessível pelo navegador.**

O **iChrysostom** é um sistema de gestão de empréstimos de livros físicos, criado para organizar o acervo de uma biblioteca de igreja. 

Qualquer pessoa pode consultar os livros e sua disponibilidade, sem cadastro. O bibliotecário administra o acervo e registra os empréstimos em uma área protegida; a retirada dos livros continua sendo presencial.

> **Status:** aplicação desenvolvida e testada localmente. Publicação na Cloudflare realizada (o link é privado).

## Sumário

- [Objetivo](#objetivo)
- [Funcionalidades](#funcionalidades)
- [Tecnologias e decisões](#tecnologias-e-decisões)
- [Decisões de engenharia](#decisões-de-engenharia)
- [Execução local](#execução-local)
- [Documentação](#documentação)

## Objetivo

Resolver um problema concreto: tornar o acervo de uma biblioteca local **consultável por qualquer dispositivo**, mantendo o controle dos exemplares e de quem está com cada livro.

A arquitetura foi escolhida para ser **simples, leve e de baixo custo operacional**. Em produção, o projeto não precisa de VPS, Docker, PostgreSQL ou servidor Node.js permanente.

## Funcionalidades

- **Catálogo público:** pesquisa por título ou autor, navegação por categorias e consulta à disponibilidade de exemplares.
- **Gestão do acervo:** cadastro, edição e exclusão de livros, categorias e exemplares físicos.
- **Empréstimos presenciais:** registro de responsáveis, datas de retirada e devolução, controle de atrasos e histórico.
- **Prazos flexíveis:** o bibliotecário escolhe a data prevista de devolução, sem limite máximo de 14 dias.
- **Personalização:** título, nome da biblioteca, cor principal e banner.
- **Administração:** autenticação, alteração de senha, histórico de acessos e exportação do catálogo em CSV.

## Tecnologias e decisões

| Tecnologia | Por que foi escolhida |
|---|---|
| **TypeScript** | Tipagem estática para facilitar a manutenção e reduzir erros durante mudanças. |
| **Cloudflare Pages + Functions** | Páginas e rotas executadas sem administrar um servidor permanente. |
| **Cloudflare D1 + SQLite** | Banco relacional integrado à aplicação, com migrações SQL versionadas. |
| **HTML renderizado no servidor + CSS** | Interface rápida e direta, sem framework de frontend nem aplicação cliente separada. |
| **Node.js + npm + Wrangler** | Instalação de dependências, desenvolvimento local, migrações e futura publicação. |
| **Vitest** | Testes automatizados para verificar regras de negócio e evitar regressões. |

**Fluxo da aplicação:** navegador → Pages Functions (TypeScript) → Cloudflare D1 (SQLite) → HTML renderizado no servidor.

## Decisões de engenharia

- **Separação entre consulta e administração:** o catálogo é público, mas alterações exigem autenticação.
- **Segurança no servidor:** senhas com PBKDF2-SHA-256, sessões persistidas no D1, proteção CSRF e limitação de tentativas de login.
- **Consistência dos empréstimos:** um índice único parcial no SQLite impede dois empréstimos ativos para o mesmo exemplar.
- **Armazenamento de imagens:** capas usam URLs HTTPS; o banner é armazenado como BLOB no D1, com limite de 600 KB.
- **Manutenção previsível:** alterações na estrutura do banco são registradas em migrações SQL e verificadas por testes.

## Execução local

**Pré-requisitos:** Node.js 20+ e npm. Não é necessário instalar PostgreSQL, Docker ou Podman.

Na raiz do repositório:

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

Antes de executar as migrações e iniciar a aplicação, configure os valores necessários em `.dev.vars`, especialmente `SESSION_SECRET`. O Wrangler informa o endereço local no terminal, normalmente `http://localhost:8788`.

A criação do administrador inicial e os procedimentos complementares estão em [`docs/INFO.md`](docs/INFO.md). Não publique `.dev.vars`, backups ou o banco local armazenado em `.wrangler/`.

## Documentação

| Documento | Conteúdo |
|---|---|
| **[PLAN.md](docs/PLAN.md)** | O problema original, a motivação e os objetivos do projeto. |
| **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** | Decisões arquiteturais e alternativas consideradas durante o planejamento. |
| **[INFO.md](docs/INFO.md)** | Referência técnica de componentes, banco de dados, segurança, manutenção e publicação. |

---

*iChrysostom — do acervo físico ao catálogo acessível pelo navegador.*