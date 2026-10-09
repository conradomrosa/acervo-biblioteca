import { esc, layout } from './util';
import type { Book, Category, Copy, Settings, User } from './types';

const icon = (name: string) => ({ search: '⌕', arrow: '↗', back: '←', book: '▱', category: '◌', loan: '↔', settings: '⚙' }[name] ?? '•');

function placeholder(book: Book) {
  const initials = book.title.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  return `<div class="cover-placeholder"><span class="cover-mark">${icon('book')}</span><strong>${esc(initials || 'AB')}</strong><small>${esc(book.category_name || 'Acervo')}</small></div>`;
}

function cover(book: Book, eager = false) {
  if (!book.cover_url) return placeholder(book);
  return `<div class="external-cover"><img data-external-cover src="${esc(book.cover_url)}" alt="Capa de ${esc(book.title)}" width="320" height="460" referrerpolicy="no-referrer"${eager ? '' : ' loading="lazy"'}><div class="cover-fallback" hidden>${placeholder(book)}</div></div>`;
}

export function formatAvailability(count: number) {
  if (count <= 0) return 'Indisponível';
  return count === 1 ? '1 exemplar disponível' : `${count} exemplares disponíveis`;
}

function availability(book: Book) {
  const count = book.available ?? 0;
  return `<span class="availability ${count > 0 ? 'is-available' : 'is-unavailable'}"><span class="status-dot" aria-hidden="true"></span><span>${formatAvailability(count)}</span></span>`;
}

function catalogCard(book: Book, index: number) {
  return `<article class="book-card" style="--card-index:${index}"><a class="book-card-link" href="/livros/${book.id}" aria-label="Ver detalhes de ${esc(book.title)}"><div class="book-cover">${cover(book)}</div><div class="book-card-content"><p class="eyebrow">${esc(book.category_name || 'Livro')}</p><h3>${esc(book.title)}</h3><p class="book-author">${esc(book.author)}</p><div class="book-card-footer">${availability(book)}<span class="card-arrow" aria-hidden="true">${icon('arrow')}</span></div></div></a></article>`;
}

export function publicHome(settings: Settings, categories: Category[], books: Book[], q: string, cat: string) {
  const hasFilters = Boolean(q || cat);
  const heroVisual = settings.banner_image_id
    ? `<img class="hero-banner-image" src="/imagens/${settings.banner_image_id}" alt="" width="1200" height="520">`
    : `<div class="hero-pattern" aria-hidden="true"><span class="pattern-line line-one"></span><span class="pattern-line line-two"></span><span class="pattern-book">${icon('book')}</span></div>`;
  const cards = books.map((book, index) => catalogCard(book, index)).join('');
  const categoryLinks = categories.slice(0, 6).map(category => `<a class="category-chip ${String(category.id) === cat ? 'is-selected' : ''}" href="/?categoria=${category.id}"><span>${icon('category')}</span>${esc(category.name)}</a>`).join('');
  const empty = hasFilters
    ? `<div class="empty-state"><span class="empty-icon">${icon('search')}</span><h3>Nenhum livro encontrado</h3><p>Não encontramos resultados para sua busca. Tente outro título, autor ou categoria.</p><a class="text-link" href="/">Limpar filtros ${icon('arrow')}</a></div>`
    : `<div class="empty-state"><span class="empty-icon">${icon('book')}</span><h3>O acervo está começando</h3><p>Em breve, novos livros estarão disponíveis para consulta.</p></div>`;
  return layout(settings.site_title, `<a class="skip-link" href="#catalogo">Ir para o catálogo</a><section class="hero-section"><div class="hero-copy"><p class="overline">Livros · obras · coleções</p><h1>${esc(settings.site_title)}</h1><p class="hero-intro">Confira o nosso catálogo.</p><form class="search-bar" method="get" role="search"><label class="sr-only" for="search">Pesquisar no acervo</label><span class="search-icon" aria-hidden="true">${icon('search')}</span><input id="search" name="q" value="${esc(q)}" placeholder="Busque por título ou autor" autocomplete="off"><select name="categoria" aria-label="Filtrar por categoria"><option value="">Todas as categorias</option>${categories.map(category => `<option value="${category.id}" ${String(category.id) === cat ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}</select><button type="submit">Pesquisar <span aria-hidden="true">${icon('arrow')}</span></button></form></div><div class="hero-visual">${heroVisual}<span class="hero-caption">Seu próximo livro pode estar aqui.</span></div></section><section class="category-strip" aria-labelledby="categories-title"><div><p class="overline">Explore por assunto</p><h2 id="categories-title">Listas selecionadas</h2></div><div class="category-list">${categoryLinks}</div></section><section id="catalogo" class="catalog-section" aria-labelledby="catalog-title"><div class="section-heading"><div><p class="overline">${hasFilters ? 'Resultado da busca' : 'Coleção da biblioteca'}</p><h2 id="catalog-title">${hasFilters ? `${books.length} ${books.length === 1 ? 'livro encontrado' : 'livros encontrados'}` : 'Do acervo para você'}</h2></div>${!hasFilters ? '<a class="text-link" href="#catalogo">Ver catálogo <span aria-hidden="true">↘</span></a>' : ''}</div>${cards ? `<div class="book-grid">${cards}</div>` : empty}</section>`, settings);
}

export function bookPage(settings: Settings, book: Book, copies: Copy[]) {
  const active = copies.filter(copy => copy.active === 1);
  const available = active.filter(copy => !copy.loan_id).length;
  const availabilityText = available > 0 ? `${available} de ${active.length} exemplares disponíveis` : 'Todos os exemplares estão emprestados';
  return layout(book.title, `<div class="breadcrumbs"><a href="/">Catálogo</a><span>/</span><span>${esc(book.title)}</span></div><article class="book-detail"><div class="detail-cover book-cover">${cover(book, true)}</div><div class="detail-copy"><p class="overline">${esc(book.category_name || 'Livro')}</p><h1>${esc(book.title)}</h1><p class="detail-author">por <strong>${esc(book.author)}</strong></p><div class="detail-rule"></div><div class="detail-availability ${available > 0 ? 'is-available' : 'is-unavailable'}"><span class="status-dot" aria-hidden="true"></span><div><strong>${available > 0 ? 'Disponível para retirada' : 'Indisponível no momento'}</strong><span>${availabilityText}</span></div></div>${book.description ? `<div class="detail-description"><h2>Sobre este livro</h2><p>${esc(book.description)}</p></div>` : ''}<dl class="book-meta">${book.isbn ? `<div><dt>ISBN</dt><dd>${esc(book.isbn)}</dd></div>` : ''}<div><dt>Categoria</dt><dd>${esc(book.category_name || '—')}</dd></div></dl><p class="notice"><span aria-hidden="true">${icon('book')}</span> Os empréstimos são realizados presencialmente na biblioteca.</p><a class="button button-secondary" href="/">${icon('back')} Voltar ao catálogo</a></div></article>`, settings);
}

export function loginPage(settings: Settings, error = false, changed = false) {
  return layout('Entrar', `<section class="auth-shell"><div class="auth-intro"><p class="overline">Área reservada</p><h1>Bem-vindo de volta.</h1><p>Gerencie o acervo, acompanhe empréstimos e mantenha a biblioteca viva.</p></div><div class="auth-card"><div class="auth-symbol">${icon('book')}</div><h2>Entrar na administração</h2><p class="muted">Use suas credenciais de bibliotecário.</p>${changed ? '<p class="form-success" role="status">Senha alterada. Entre novamente com a nova senha.</p>' : ''}<form method="post" action="/login"><label for="username">Usuário<input id="username" name="username" autocomplete="username" required></label><label for="password">Senha<input id="password" type="password" name="password" autocomplete="current-password" required></label>${error ? '<p class="form-error" role="alert">Usuário ou senha inválidos. Tente novamente.</p>' : ''}<button type="submit" class="button button-wide">Entrar <span aria-hidden="true">${icon('arrow')}</span></button></form><a class="back-link" href="/">${icon('back')} Voltar ao catálogo</a></div></section>`, settings);
}

export function adminPage(settings: Settings, user: User, body: string, title = 'Administração') {
  return layout(title, `<div class="admin-shell"><aside class="admin-sidebar"><div class="admin-brand"><span class="brand-mark">${icon('book')}</span><span><strong>${esc(settings.library_name)}</strong><small>Administração</small></span></div><nav class="admin-nav" aria-label="Administração"><a href="/admin" class="nav-dashboard">${icon('category')} Visão geral</a><a href="/admin/livros">${icon('book')} Livros e exemplares</a><a href="/admin/categorias">${icon('category')} Categorias</a><a href="/admin/emprestimos">${icon('loan')} Empréstimos</a><a href="/admin/acessos">↳ Histórico de acessos</a><a href="/admin/seguranca/senha">⌁ Alterar senha</a><a href="/admin/configuracao">${icon('settings')} Configuração</a></nav><a class="sidebar-public" href="/">← Ver catálogo</a></aside><div class="admin-content"><div class="admin-mobile-head"><a href="/" class="brand-mark">${icon('book')}</a><span>${esc(user.name)}</span><a href="/">Ver catálogo ↗</a></div><div class="admin-topbar"><div><p class="overline">Área reservada</p><span>Olá, ${esc(user.name)}</span></div><a class="button button-secondary" href="/admin/seguranca/senha">Alterar senha</a></div>${body}</div></div>`, settings, true);
}
