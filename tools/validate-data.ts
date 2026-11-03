import { GAME_DEFINITION } from '../src/data/definition';
import { validateDefinition } from '../src/data/validate';

const issues = validateDefinition(GAME_DEFINITION);
const d = GAME_DEFINITION;
console.log(`GameDefinition ${d.version}: ${d.rooms.length} rooms, ${d.diseases.length} diseases, ${d.roles.length} roles, ${d.skills.length} skills, ${d.trainings.length} trainings, ${d.projects.length} projects, ${d.missions.length} missions, ${d.events.length} events, ${d.chapters.length} chapters`);
if (issues.length) {
  for (const i of issues) console.error(`  ✗ ${i.path}: ${i.message}`);
  process.exit(1);
}
console.log('  ✓ all references valid');
