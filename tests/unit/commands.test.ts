import { describe, expect, it } from 'vitest';
import { validateCommand } from '../../src/core/commands';
import { newEngine, cmd } from '../helpers';

describe('command dispatcher', () => {
  it('REQ-CMD-01 rejects malformed payloads with structured errors', () => {
    expect(validateCommand(null).length).toBeGreaterThan(0);
    expect(validateCommand({ id: 'x', type: 'BUILD_ROOM', roomType: 'R99', x: 1, y: 1, w: 3, h: 3 })[0]!.code).toBe('INVALID_PAYLOAD');
    expect(validateCommand({ id: 'x', type: 'SET_SPEED', speed: 3 }).length).toBe(1);
    expect(validateCommand({ id: 'x', type: 'NOPE' }).length).toBe(1);
    expect(validateCommand({ id: 'x', type: 'SET_SPEED', speed: 4 })).toEqual([]);
  });
  it('REQ-CMD-02 duplicate command ids do not trigger duplicate actions', () => {
    const eng = newEngine();
    const cash = eng.state.economy.cash;
    const c = { id: 'dup-1', type: 'TAKE_LOAN', kind: 'short' } as const;
    expect(eng.dispatch(c).ok).toBe(true);
    const again = eng.dispatch(c);
    expect(again.ok).toBe(false);
    expect(again.duplicate).toBe(true);
    expect(eng.state.economy.cash).toBe(cash + 10000);
  });
  it('REQ-CMD-03 failed commands are atomic (no money deducted)', () => {
    const eng = newEngine();
    const cash = eng.state.economy.cash;
    const r = cmd(eng, { type: 'BUILD_ROOM', roomType: 'R13', x: 21, y: 41, w: 6, h: 6 });
    expect(r.ok).toBe(false);
    expect(r.errors[0]!.messageSv).toMatch(/kapitel 4/);
    expect(eng.state.economy.cash).toBe(cash);
  });
  it('REQ-CMD-04 speed and pause commands', () => {
    const eng = newEngine();
    expect(cmd(eng, { type: 'SET_SPEED', speed: 4 }).ok).toBe(true);
    expect(eng.state.clock.speed).toBe(4);
    cmd(eng, { type: 'PAUSE_GAME' });
    expect(eng.advance(1000)).toBe(0);
    cmd(eng, { type: 'RESUME_GAME' });
    expect(eng.advance(100)).toBeGreaterThan(0);
  });
  it('REQ-TIME-01 accumulator: 10 ticks per real second at 1×, 40 at 4×, frame rate independent', () => {
    const a = newEngine();
    let n = 0;
    for (let i = 0; i < 60; i++) n += a.advance(1000 / 60);
    expect(n).toBe(10);
    const b = newEngine();
    cmd(b, { type: 'SET_SPEED', speed: 4 });
    let m = 0;
    for (let i = 0; i < 30; i++) m += b.advance(1000 / 30);
    expect(m).toBe(40);
  });
  it('REQ-EVT-01 domain events carry id, type, tick, sequence and causation', () => {
    const eng = newEngine();
    const seen: string[] = [];
    eng.subscribe((e) => seen.push(`${e.type}:${e.causationId}`));
    const r = eng.dispatch({ id: 'caus-1', type: 'TAKE_LOAN', kind: 'short' });
    expect(r.ok).toBe(true);
    expect(seen).toContain('LOAN_TAKEN:null');
    const last = eng.state.log[eng.state.log.length - 1]!;
    expect(last.seq).toBe(eng.state.audit.eventSeq);
    expect(typeof last.tick).toBe('number');
  });
});
