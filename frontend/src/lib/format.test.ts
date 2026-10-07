import { describe, expect, it } from 'vitest'
import { daysUntil, formatINR, pct, score100 } from './format'

describe('formatINR', () => {
  it('uses Indian digit grouping in full form', () => {
    expect(formatINR(656991)).toBe('₹6,56,991')
    expect(formatINR(12345678)).toBe('₹1,23,45,678')
  })
  it('uses lakh and crore in compact form', () => {
    expect(formatINR(660000, { compact: true })).toBe('₹6.6 L')
    expect(formatINR(12000000, { compact: true })).toBe('₹1.2 Cr')
    expect(formatINR(45000, { compact: true })).toBe('₹45,000')
    expect(formatINR(10000000, { compact: true })).toBe('₹1 Cr')
  })
  it('shows a dash for missing values instead of zero', () => {
    expect(formatINR(null)).toBe('—')
    expect(formatINR(undefined)).toBe('—')
  })
  it('keeps the sign', () => {
    expect(formatINR(-250000, { compact: true })).toBe('−₹2.5 L')
  })
})

describe('percent helpers', () => {
  it('formats unit values', () => {
    expect(pct(0.7116)).toBe('71%')
    expect(score100(0.7116)).toBe(71)
    expect(pct(null)).toBe('—')
  })
})

describe('daysUntil', () => {
  it('counts calendar days', () => {
    expect(daysUntil('2026-10-17', new Date(2026, 9, 7))).toBe(10)
    expect(daysUntil('2026-10-07', new Date(2026, 9, 7, 23, 0))).toBe(0)
  })
})
