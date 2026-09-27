export function checkIntent(intent) {
  const directives = {
    nurture: ['positive', 'growth', 'constructive', 'uplift'],
    violation: ['harm', 'dehumanize', 'exploit', 'destroy']
  };

  const fullContext = intent.toLowerCase();
  let issues = [];

  directives.violation.forEach((v) => {
    if (fullContext.includes(v)) {
      issues.push(`NURTURE VIOLATION: '${v}' detected.`);
    }
  });

  if (issues.length > 0) {
    return { allowed: false, reason: issues.join('; ') };
  }

  return { allowed: true, reason: 'Aligned with Mom Directives' };
}


