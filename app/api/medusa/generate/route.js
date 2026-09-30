import { NextResponse } from 'next/server';
import { apiGuard } from '@/lib/api-guard';

// Medusa generation proxy: the Gemini API key stays on the server and the
// client only ever sees the generated result.
export const POST = apiGuard(async function POST(req) {
    let body;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Describe what you want Medusa to create.' }, { status: 400 });
    }
    const { fileData, isImagePrompt } = body || {};
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim().slice(0, 4000) : '';
    if (!prompt && !(isImagePrompt && fileData)) {
        return NextResponse.json({ error: 'Describe what you want Medusa to create.' }, { status: 400 });
    }

    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        return NextResponse.json(
            { error: 'The forge is not connected yet. Check back soon.' },
            { status: 503 }
        );
    }

    async function postJson(url, payload) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        let data = null;
        try { data = await res.json(); } catch { /* non-JSON */ }
        if (!res.ok || data?.error) {
            const detail = data?.error?.message || `HTTP ${res.status}`;
            throw new Error(detail);
        }
        return data;
    }

    try {
        // Updated to gemini-3.8-flash
        const geminiUrl = (task) => `https://generativelanguage.googleapis.com/v1/models/gemini-3.8-flash:${task}?key=${API_KEY}`;
        const imagenUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict?key=${API_KEY}`;

        if (isImagePrompt && fileData) {
            const visionData = await postJson(geminiUrl('generateContent'), {
                contents: [{
                    role: 'user',
                    parts: [
                        { text: 'Describe the physical appearance of the main subject in this image in extreme detail (facial features, hair, clothing). Do not describe the background.' },
                        { inline_data: { mime_type: 'image/jpeg', data: fileData } },
                    ],
                }],
            });
            const subjectDescription = visionData?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!subjectDescription) {
                throw new Error('The image reader came back empty.');
            }
            const finalPrompt = `A highly detailed, petrified solid stone statue of a person matching this description: ${subjectDescription}. Realistic weathered granite texture, cinematic dark background, glowing cyan and pink ambient lighting. ${prompt}`;
            const imagenData = await postJson(imagenUrl, {
                instances: [{ prompt: finalPrompt }],
                parameters: { sampleCount: 1, aspectRatio: '1:1' },
            });
            return NextResponse.json(imagenData, { status: 200 });
        }

        if (isImagePrompt) {
            const data = await postJson(imagenUrl, {
                instances: [{ prompt }],
                parameters: { sampleCount: 1, aspectRatio: '1:1' },
            });
            return NextResponse.json(data, { status: 200 });
        }

        const data = await postJson(geminiUrl('generateContent'), {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('Proxy Execution Failed:', error);
        return NextResponse.json(
            { error: `Medusa could not finish that: ${error.message || 'try again.'}` },
            { status: 502 }
        );
    }
});
