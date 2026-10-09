export interface Env { DB: D1Database; SESSION_SECRET: string; ADMIN_USERNAME?: string; ADMIN_PASSWORD?: string; ADMIN_NAME?: string }
export interface User { id: number; name: string; username: string; csrf: string }
export interface Settings { library_name: string; site_title: string; primary_color: string; banner_image_id: number | null }
export interface Category { id: number; name: string; description: string | null; book_count?: number }
export interface Book { id: number; title: string; author: string; isbn: string | null; description: string | null; category_id: number; category_name?: string; cover_url: string | null; cover_image_id?: number | null; archived: number; copies?: number; available?: number }
export interface Copy { id: number; book_id: number; code: string; active: number; borrowed?: number; loan_id?: number | null; title?: string }
export interface Loan { id: number; copy_id: number; borrower_name: string; loan_date: string; due_date: string; returned_at: string | null; code: string; title: string }
export interface CountRow { n: number }
export interface LoginEvent { id: number; librarian_id: number | null; username: string; succeeded: number; occurred_at: string; librarian_name?: string | null }
export interface ImageRow { mime_type: string; content: ArrayBuffer | number[] }
export interface LibrarianRow { id: number; name: string; username: string; password_hash: string; active: number }
export const zone = 'America/Sao_Paulo';
