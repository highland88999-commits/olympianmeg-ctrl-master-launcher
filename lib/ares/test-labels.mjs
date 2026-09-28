// ARES tests: event labeling (threat_class, confidence, agent_source).
import { labelEvent, isThreatClass, THREAT_CLASSES, AGENT_IDS } from './labels.js';
import { FEATURE_VERSION } from './features.js';

let pass = 0;
let fail = 0;
function t(name, cond) {
  if (cond) { pass++; }
  else { fail++; console.error('FAIL:', name); }
}

const honeypot = labelEvent({ eventType: 'honeypot_hit' });
t('honeypot_hit -> intrusion_attempt', honeypot.threat_class === 'intrusion_attempt');
t('honeypot_hit owned by sentinel', honeypot.agent_source === 'sentinel');
t('honeypot_hit high confidence', honeypot.confidence >= 0.85);

t('scanner_path -> scanner', labelEvent({ eventType: 'scanner_path' }).threat_class === 'scanner');
t('bot_blocked -> bot', labelEvent({ eventType: 'bot_blocked' }).threat_class === 'bot');

const flood = labelEvent({ eventType: 'rate_limited' });
t('rate_limited -> flood', flood.threat_class === 'flood');
t('rate_limited owned by phalanx', flood.agent_source === 'phalanx');

const abuse = labelEvent({ eventType: 'blocked_ip_hit' });
t('blocked_ip_hit -> abuse', abuse.threat_class === 'abuse');
t('blocked_ip_hit owned by dreadnought', abuse.agent_source === 'dreadnought');

t('unknown event type falls back to benign', labelEvent({ eventType: 'nope' }).threat_class === 'benign');
t('labels carry the feature version', honeypot.feature_version === FEATURE_VERSION);

const lowScore = labelEvent({ eventType: 'bot_blocked', score: 5 });
t('very low agent score softens confidence', lowScore.confidence < 0.8 && lowScore.confidence >= 0.4);
t('low score never changes the class', lowScore.threat_class === 'bot');

const highScore = labelEvent({ eventType: 'bot_blocked', score: 95 });
t('very high agent score firms confidence', highScore.confidence >= 0.8);

const override = labelEvent({ eventType: 'bot_blocked', agentId: 'hub' });
t('explicit agent override is honored', override.agent_source === 'hub');
const badOverride = labelEvent({ eventType: 'bot_blocked', agentId: 'skynet' });
t('bogus agent id falls back to the default', badOverride.agent_source === 'sentinel');

t('six threat classes in the vocabulary', THREAT_CLASSES.length === 6);
t('four agent ids registered', AGENT_IDS.length === 4);
t('isThreatClass validates', isThreatClass('flood') && !isThreatClass('alien'));
t('confidence is a rounded 0-1 number', honeypot.confidence >= 0 && honeypot.confidence <= 1);

console.log(`labels: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
