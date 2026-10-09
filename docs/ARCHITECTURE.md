# ARQUITETURA NOVA

É necessário instalar:

- Node.js (para rodar o Typescript fora do navegador)
- Wrangler (para subir na Cloudflare)

Monolito.

Observação 1: O banco de dados será executado via podman no sistema operacional Fedora antes da implementação final.
Observação 2: Eu quero entregar um subdomínio grátis sem pagar por vps e por isso decidi mudar a arquitetura. Será usado o Clouflare Pages apra hospedagem, o Cloudflare D1 (SQLite) para o banco e o Typescript como linguagem principal.

## Comandos

### 1. Instalar o Node.js

> sudo dnf install -y nodejs git

### 2. Instalar compilador Typescript e Wrangler

> npm install -D typescript wrangler

----------------------------------------

# ARQUITETURA ANTIGA (ABANDONADA)

É necessário instalar:

- JDK 21
- Apache Maven
    - Spring Boot
        - Thymeleaf
        - Spring Security
        - Spring Data JPA
        - Flyway
- PostgreSQL

Monolito.

Observação: O banco de dados será executado via podman no sistema operacional Fedora antes da implementação final.

## Comandos

### 1. Instalar JDK 21

> sudo dnf install adoptium-temurin-java-repository
> sudo dnf config-manager setopt adoptium-temurin-java-repository.enabled=1
> sudo dnf install temurin-21-jdk

### 2. Instalar Apache Maven

> sudo dnf install maven

### 3. Instalar Podman

> sudo dnf install podman

Para utilizar o docker-compose, vamos usar também:

> sudo dnf install podman-compose
