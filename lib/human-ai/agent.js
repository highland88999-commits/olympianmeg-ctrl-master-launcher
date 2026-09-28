import { GoogleGenerativeAI } from '@google/generative-ai';
import { checkIntent } from './compass';
import { evaluateHarvest } from './consensus';

export async function agentLoop(query, handshake = 'stranger') {
  const isArchitect = (handshake === process.env.HANDSHAKE || handshake === 'dad');

  if (!isArchitect) {
    const ethics = checkIntent(query);
    if (!ethics.allowed) {
      return { verdict: `Protocol Violation: ${ethics.reason}`, files: [] };
    }
  }

  const tools = [
    {
      name: 'commitOmniForge',
      description: 'Generates optimized code directly to a data URI or virtual file.',
      parameters: { type: 'OBJECT', properties: { filename: { type: 'STRING' }, code: { type: 'STRING' } }, required: ['filename', 'code'] }
    },
    {
      name: 'askCouncil',
      description: 'Consult the multi-agent council for consensus.',
      parameters: { type: 'OBJECT', properties: { task: { type: 'STRING' } }, required: ['task'] }
    }
  ];

  const persona = `[MODE: ${isArchitect ? 'ARCHITECT' : 'GUEST'}]
  You are the Artemis Symbiote, the Universal Architect.
  Solve queries by synthesizing blueprints, optimal user experiences, and economic logic.`;

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ 
    model: 'gemini-1.5-flash',
    systemInstruction: { parts: [{ text: persona }] },
    tools: [{ functionDeclarations: tools }]
  });

  const chat = model.startChat();
  const result = await chat.sendMessage(query);
  const response = result.response;

  const functionCalls = response.functionCalls();
  if (functionCalls && functionCalls.length > 0) {
    for (const call of functionCalls) {
      if (call.name === 'askCouncil') {
        const consensusResult = await evaluateHarvest(call.args.task);
        await chat.sendMessage([{ functionResponse: { name: 'askCouncil', response: consensusResult } }]);
      }
    }
    const finalResult = await chat.sendMessage('Tool execution complete. Synthesize the final output.');
    return { verdict: finalResult.response.text(), files: [] };
  }

  return { verdict: response.text(), files: [] };
}


