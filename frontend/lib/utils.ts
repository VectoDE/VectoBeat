import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function sanitizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^(?:-)|(?:-)$/g, '')
}

export async function resolveParams<T>(params: Promise<T> | T): Promise<T> {
  return await params
}

export function shortNumber(num: number): string {
  if (num === 0) return '0'
  const units = ['', 'K', 'M', 'B', 'T']
  const unit = Math.floor(Math.log10(Math.abs(num)) / 3)
  if (unit <= 0) return Math.floor(num).toString()
  const val = num / Math.pow(10, unit * 3)
  return `${val.toFixed(val < 10 ? 1 : 0).replace(/\.0$/, '')}${units[unit]}`
}