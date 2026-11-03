import { runBot, type Strategy } from './bot';
import { aggregate, lastDays } from '../../src/systems/metrics';
const seed = Number(process.argv[2] ?? 1);
const strategy = (process.argv[3] ?? 'skilled') as Strategy;
const maxDays = Number(process.argv[4] ?? 140);
const res = runBot(seed, strategy, maxDays, {
  onDay: (b) => {
    const s = b.s;
    const d = s.metrics.days[s.metrics.days.length - 1]!;
    const a = aggregate(lastDays(b.w, 1));
    if (d.day % Number(process.env.EVERY ?? 1) !== 0) return;
    console.log(`d${d.day} ch${s.progress.chapter} arr ${d.arrivals} comp ${d.completed} succ ${a.successRate.toFixed(0)}% ref ${d.referrals} ab ${d.abandoned} crit ${d.critical} wait ${a.avgWait.toFixed(0)} sat ${a.avgSatisfaction.toFixed(0)} res ${d.result} cash ${s.economy.cash} rep ${s.metrics.reputation.toFixed(1)} rooms ${s.rooms.length} staff ${s.staff.length} grp ${s.research.grp} id ${s.research.identified.length} m ${s.research.mastered.length} proj ${s.research.projectsDone.length} q ${s.queues.length} crisis ${s.economy.crisis}`);
  },
});
console.log(JSON.stringify(res));
