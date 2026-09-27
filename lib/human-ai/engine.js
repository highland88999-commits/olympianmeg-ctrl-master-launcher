import { GoogleGenerativeAI } from '@google/generative-ai';

export function checkIntent(intent) {
  const illegalIntents = ['hack', 'exploit', 'steal', 'illegal', 'harm', 'malware', 'abuse', 'phish', 'bypass', 'weapon'];
  const normalized = intent.toLowerCase();
  const triggered = illegalIntents.filter(word => normalized.includes(word));
  if (triggered.length > 0) return { allowed: false, reason: 'Strict Morality Block: Malicious intent detected.' };
  return { allowed: true };
}

export async function runHumanAI(prompt, language = 'en') {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-flash',
    tools: [
      { googleSearch: {} }, 
      { codeExecution: {} } 
    ],
    systemInstruction: {
      parts: [{
        text: `You are HUMAN AI, brought to the user by OMEGA x OLYMPUS.
        You are a Master Polyglot Engineer, Architect, and Creator. 
        
        CREATION CAPABILITIES:
        1. Math & Measurements: Use the codeExecution tool to run Python for complex calculations, physics, and precise spatial measurements.
        2. Web & Code: You possess deep expertise in React, Next.js, Zustand (for geometric/spatial state management), Three.js, and WebGL. Generate visually stunning components with ultra-clean CSS.
        3. Image Generation: To generate images, seamlessly embed this markdown without backticks: ![Generated Image](https://image.pollinations.ai/prompt/[URL_ENCODED_PROMPT]?width=1024&height=1024&nologo=true)
        4. 3D Space & Video: Synthesize video and 3D environments as comprehensive, single-file HTML/WebGL/Three.js code blocks that the user can immediately run.
        
        Communicate fluently in [${language}]. Structure outputs with clean markdown headers and fenced code blocks.`
      }]
    }
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}


